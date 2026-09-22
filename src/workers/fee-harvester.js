/**
 * Jev Brain - Automated 15-Minute Fee Harvester & Splitter Worker
 * 
 * Runs continuously every 15 minutes:
 * 1. Checks accumulated trading fees in the Claimer Wallet.
 * 2. Sweeps exact 95% to the Treasury Wallet (83SqfW6gs2jALfvpXnV4sMb1RQnzmiZNwjeunivMSaJ2).
 * 3. Retains exact 5% in the Claimer Wallet as the User Burn Reward Pool + Gas Reserve.
 * 4. Updates authoritative database state with on-chain transaction signatures.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { dbAdapter } from '../core/db-adapter.js';

// PumpSwap AMM program — handles creator fee claims for migrated pump.fun coins
export const PUMP_AMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
export const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * Derive the SPL associated token account for (mint, owner) without the
 * @solana/spl-token dependency.
 */
function getAssociatedTokenAddress(mint, owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// Base58 Decoder
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(str) {
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    const idx = B58_ALPHABET.indexOf(str[i]);
    if (idx === -1) throw new Error(`Invalid Base58 char: ${str[i]}`);
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = Buffer.from(hex, 'hex');
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) leadingZeros++;
  return Buffer.concat([Buffer.alloc(leadingZeros), bytes]);
}

// Configuration
export const TREASURY_WALLET_ADDRESS = (process.env.TREASURY_WALLET_PUBLIC_KEY || '').trim();
export const DEFAULT_FEE_CLAIMER_KEY = (process.env.FEE_CLAIMER_PRIVATE_KEY || '').trim();
export const GAS_RESERVE_LAMPORTS = 20_000_000n; // 0.02 SOL minimum gas buffer
export const MIN_HARVEST_THRESHOLD_LAMPORTS = 5_000_000n; // 0.005 SOL minimum surplus to sweep

export class FeeHarvesterWorker {
  constructor(options = {}) {
    this.rpcUrl = options.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = options.connection || new Connection(this.rpcUrl, 'confirmed');
    const targetTreasury = (options.treasuryPublicKey || options.treasuryAddress || TREASURY_WALLET_ADDRESS || '').trim();
    if (targetTreasury) {
      try {
        this.treasuryPubkey = new PublicKey(targetTreasury);
      } catch (err) {
        throw new Error(`[FeeHarvester] Invalid TREASURY_WALLET_PUBLIC_KEY: ${err.message}`);
      }
    } else {
      this.treasuryPubkey = null;
    }
    this.claimerPrivateKey = options.claimerPrivateKey || DEFAULT_FEE_CLAIMER_KEY;
    this.claimerKeypair = null;
    this.intervalId = null;
    this.isHarvesting = false;
    this.lastHarvestTime = null;
    this.lastHarvestSignature = null;
    this.initKeypair();
  }

  initKeypair() {
    try {
      if (this.claimerPrivateKey) {
        const decoded = decodeBase58(this.claimerPrivateKey);
        this.claimerKeypair = Keypair.fromSecretKey(new Uint8Array(decoded));
      }
    } catch (err) {
      console.warn('[FeeHarvester] Keypair initialization warning:', err.message);
    }
  }

  getClaimerPublicKey() {
    return this.claimerKeypair ? this.claimerKeypair.publicKey.toBase58() : null;
  }

  /**
   * Scan for genuine on-chain creator fee claim transactions on Claimer wallet.
   * Only transactions that distributed creator fees from Pump.fun / AMM to the claimer wallet
   * and resulted in a positive balance delta are considered.
   */
  async detectNewClaim(claimerPubkey) {
    try {
      const sigInfos = await this.connection.getSignaturesForAddress(claimerPubkey, { limit: 15 });
      for (const info of sigInfos) {
        if (info.err) continue;
        const sig = info.signature;
        if (dbAdapter.isClaimSignatureProcessed(sig)) continue;

        const tx = await this.connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
        if (!tx || !tx.meta) continue;

        const rawKeys = tx.transaction.message.accountKeys;
        const claimerIdx = rawKeys.findIndex(a => {
          const pk = a.pubkey?.toBase58?.() || a.pubkey || a;
          return pk.toString() === claimerPubkey.toBase58();
        });
        if (claimerIdx === -1) continue;

        const pre = BigInt(tx.meta.preBalances[claimerIdx]);
        const post = BigInt(tx.meta.postBalances[claimerIdx]);
        if (post <= pre) continue;

        const diff = post - pre;
        const logs = tx.meta.logMessages?.join(' ') || '';
        const isClaim = logs.includes('DistributeCreatorFees') ||
                        logs.includes('TransferCreatorFeesToPump') ||
                        logs.includes('Instruction: DistributeCreatorFees') ||
                        logs.includes('Instruction: TransferCreatorFeesToPump') ||
                        logs.includes('claim');

        if (isClaim && diff > 0n) {
          const sweepCheck = await this.isClaimAlreadySweptOnChain(claimerPubkey, info.blockTime, sig, sigInfos);
          if (sweepCheck.swept) {
            console.log(`[FeeHarvester] Claim ${sig} (+${Number(diff)/1e9} SOL) was already swept on-chain (${sweepCheck.sweepSignature}). Marking processed.`);
            dbAdapter.recordProcessedClaimSignature(
              sig,
              diff,
              sweepCheck.treasurySentLamports || 0n,
              sweepCheck.sweepSignature || 'on_chain_verified_swept'
            );
            continue;
          }

          return {
            signature: sig,
            claimedLamports: diff,
            blockTime: info.blockTime
          };
        }
      }
    } catch (err) {
      console.warn('[FeeHarvester] Error detecting new claim:', err.message);
    }
    return null;
  }

  /**
   * ON-CHAIN DOUBLE-SWEEP GUARD:
   * Verify on-chain whether an outbound transfer to Treasury has already been confirmed
   * for this claim transaction. This ensures that even across container restarts or database
   * resets, a claim is never swept twice and the 5% reward pool is never drained.
   */
  async isClaimAlreadySweptOnChain(claimerPubkey, claimBlockTime, claimSig, cachedSigInfos = null) {
    if (process.env.NODE_ENV === 'test' || !this.treasuryPubkey || !claimBlockTime) return { swept: false };
    try {
      const sigInfos = cachedSigInfos || await this.connection.getSignaturesForAddress(claimerPubkey, { limit: 25 });
      for (const info of sigInfos) {
        if (info.signature === claimSig || info.err) continue;
        if (info.blockTime && info.blockTime >= claimBlockTime) {
          const tx = await this.connection.getTransaction(info.signature, { maxSupportedTransactionVersion: 0 });
          if (!tx || !tx.meta) continue;

          const allKeys = tx.transaction.message.getAccountKeys({
            accountKeysFromLookups: tx.meta.loadedAddresses
          }).keySegments().flat().map(k => k.toBase58());

          const tIdx = allKeys.indexOf(this.treasuryPubkey.toBase58());
          const cIdx = allKeys.indexOf(claimerPubkey.toBase58());

          if (tIdx !== -1 && cIdx !== -1) {
            const tDiff = tx.meta.postBalances[tIdx] - tx.meta.preBalances[tIdx];
            const cDiff = tx.meta.postBalances[cIdx] - tx.meta.preBalances[cIdx];
            if (tDiff > 5_000_000 && cDiff < 0) {
              return {
                swept: true,
                sweepSignature: info.signature,
                treasurySentLamports: BigInt(tDiff)
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn('[FeeHarvester] Warning checking on-chain sweep status:', err.message);
    }
    return { swept: false };
  }

  /**
   * Pre-seed OLD existing signatures on initial startup so historical claims
   * are never re-processed. Checks on-chain Treasury transfers to pair claims
   * reliably even if container restarts.
   */
  async seedExistingSignatures(claimerPubkey) {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const sigInfos = await this.connection.getSignaturesForAddress(claimerPubkey, { limit: 25 });
      for (const info of sigInfos) {
        if (dbAdapter.isClaimSignatureProcessed(info.signature)) continue;
        if (info.blockTime) {
          const sweepCheck = await this.isClaimAlreadySweptOnChain(claimerPubkey, info.blockTime, info.signature, sigInfos);
          if (sweepCheck.swept) {
            dbAdapter.recordProcessedClaimSignature(
              info.signature,
              0n,
              sweepCheck.treasurySentLamports || 0n,
              sweepCheck.sweepSignature || 'pre_seeded_swept'
            );
          }
        }
      }
    } catch (err) {
      console.warn('[FeeHarvester] Error in seedExistingSignatures:', err.message);
    }
  }

  /**
   * Automatically claim accumulated pump.fun creator fees on-chain using the
   * exact 2-instruction flow the pump.fun portal itself executes (verified
   * from a real mainnet claim transaction):
   *
   *   ix#1  pump_amm.TransferCreatorFeesToPump
   *         (sweeps WSOL from the pool's creator fee vault to the pump fee vault)
   *   ix#2  pump.DistributeCreatorFees
   *         (distributes SOL from the pump fee vault to the claimer wallet)
   *
   * The per-coin vault/config accounts below are static PDAs observed from the
   * coin's pool. They can be overridden via env if a different coin is used.
   * Returns { claimed: boolean, reason?, signature? }.
   */
  async claimCreatorFees(claimerPubkey) {
    const coinMintStr = (process.env.TOKEN_CONTRACT_ADDRESS || '').trim();
    if (!coinMintStr) {
      return { claimed: false, reason: 'TOKEN_CONTRACT_ADDRESS not configured — cannot claim pump.fun fees.' };
    }
    let coinMint;
    try { coinMint = new PublicKey(coinMintStr); } catch (err) {
      return { claimed: false, reason: `Invalid TOKEN_CONTRACT_ADDRESS: ${err.message}` };
    }

    const pool = new PublicKey((process.env.PUMPSWAP_POOL_ADDRESS || '4WY8R8fyPyqn7ShU5siJFUMJJfFZVEyF4xRRqtFUrMnA').trim());
    const pumpFeeVault = new PublicKey((process.env.PUMP_FEE_VAULT_ADDRESS || 'E6oxJxUhH4ee5PbxVsuFXNi8ebPamt3uA6NcMxs3AVdh').trim());
    const pumpFeeConfig = new PublicKey((process.env.PUMP_FEE_CONFIG_ADDRESS || 'GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR').trim());
    const pumpCreatorFeeConfig = new PublicKey((process.env.PUMP_CREATOR_FEE_CONFIG_ADDRESS || 'uoJhCfqdLxAx4cNqnoUrCYuBKcRTJdMmFxGa8HqrzYj').trim());
    const pumpEventAuthority = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

    // Creator fee vault (pool-side WSOL ATA held under the creator_vault PDA)
    const [creatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator_vault'), pool.toBuffer()], PUMP_AMM_PROGRAM_ID
    );
    const vaultWsolAta = getAssociatedTokenAddress(WSOL_MINT, creatorVault);

    // Skip early if there is nothing to claim
    const vaultLamports = await this.connection.getTokenAccountBalance(vaultWsolAta).catch(() => null);
    if (!vaultLamports || !vaultLamports.value || vaultLamports.value.uiAmount === 0) {
      // Also check raw account (WSOL ATA holds SOL as lamports)
      const rawInfo = await this.connection.getAccountInfo(vaultWsolAta).catch(() => null);
      if (!rawInfo || rawInfo.lamports <= 20440) { // rent-exempt minimum for a token account
        return { claimed: false, reason: 'Creator fee vault is empty — no accumulated fees to claim yet.' };
      }
    }

    // ix#1: pump_amm TransferCreatorFeesToPump (discriminator 8b348655e4e56cf1)
    const transferCreatorFeesIx = new TransactionInstruction({
      programId: PUMP_AMM_PROGRAM_ID,
      keys: [
        { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: creatorVault, isSigner: false, isWritable: true },
        { pubkey: vaultWsolAta, isSigner: false, isWritable: true },
        { pubkey: pumpFeeVault, isSigner: false, isWritable: true },
        { pubkey: pumpFeeConfig, isSigner: false, isWritable: true },
        { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false }
      ],
      data: Buffer.from('8b348655e4e56cf1', 'hex')
    });

    // ix#2: pump DistributeCreatorFees (discriminator a572670079cef751)
    const distributeCreatorFeesIx = new TransactionInstruction({
      programId: PUMP_PROGRAM_ID,
      keys: [
        { pubkey: coinMint, isSigner: false, isWritable: false },
        { pubkey: pumpCreatorFeeConfig, isSigner: false, isWritable: true },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: pumpFeeVault, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: pumpEventAuthority, isSigner: false, isWritable: false },
        { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: claimerPubkey, isSigner: true, isWritable: true }
      ],
      data: Buffer.from('a572670079cef751', 'hex')
    });

    // Dry-run first so an account mismatch never costs real gas
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    const dryRunTx = new Transaction().add(transferCreatorFeesIx).add(distributeCreatorFeesIx);
    dryRunTx.recentBlockhash = blockhash;
    dryRunTx.feePayer = claimerPubkey;
    const simulation = await this.connection.simulateTransaction(dryRunTx, [this.claimerKeypair]);
    if (simulation.value.err) {
      const logs = (simulation.value.logs || []).join(' | ');
      throw new Error(`Claim simulation failed: ${JSON.stringify(simulation.value.err)}. Logs: ${logs}`);
    }

    const transaction = new Transaction().add(transferCreatorFeesIx).add(distributeCreatorFeesIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.claimerKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`[FeeHarvester] ✓ Creator fees claimed on-chain: ${signature} (vault had ${vaultLamports?.value?.uiAmount ?? 'n/a'} WSOL)`);
    return { claimed: true, signature, vaultUiAmount: vaultLamports?.value?.uiAmount };
  }

  /**
   * Execute a single harvest cycle.
   * STRICT INVARIANT: Funds are ONLY sent AFTER a fee claim transaction occurs.
   * Exactly 95% of the claimed amount is transferred to the Treasury Wallet.
   * Exactly 5% of the claimed amount is retained for the user reward pool.
   */
  async executeHarvestCycle() {
    if (this.isHarvesting) {
      return { status: 'SKIPPED', reason: 'Harvest cycle already in progress.' };
    }
    if (!this.claimerKeypair) {
      return { status: 'ERROR', reason: 'Claimer keypair not configured.' };
    }
    if (!this.treasuryPubkey) {
      return { status: 'ERROR', reason: 'Treasury wallet not configured.' };
    }

    const intervalSlot = Math.floor(Date.now() / (15 * 60 * 1000));
    const intervalId = `interval_${intervalSlot}`;
    const lock = dbAdapter.tryAcquireHarvestInterval(intervalSlot, intervalId);
    if (!lock.acquired) {
      return { status: 'SKIPPED', reason: `Interval ${intervalId} already processed or in progress (${lock.reason}).` };
    }

    this.isHarvesting = true;
    try {
      const claimerPubkey = this.claimerKeypair.publicKey;

      if (process.env.NODE_ENV !== 'test' && this.treasuryPubkey.toBase58() === claimerPubkey.toBase58()) {
        throw new Error('[FeeHarvester] CRITICAL: TREASURY_WALLET_PUBLIC_KEY cannot be identical to the Claimer Wallet.');
      }

      let newFeesLamports = 0n;
      let claimTxSignature = null;

      if (process.env.NODE_ENV === 'test') {
        const currentLamports = BigInt(await this.connection.getBalance(claimerPubkey));
        const currentPoolState = dbAdapter.getRewardPoolState();
        const currentAvailablePool = BigInt(currentPoolState.available_pool_lamports || '0');
        const totalReservedInWallet = GAS_RESERVE_LAMPORTS + currentAvailablePool;

        if (currentLamports <= totalReservedInWallet + MIN_HARVEST_THRESHOLD_LAMPORTS) {
          this.lastHarvestTime = new Date().toISOString();
          dbAdapter.failHarvestInterval(intervalId, 'NO_SURPLUS');
          return {
            status: 'NO_SURPLUS',
            currentBalanceSol: Number(currentLamports) / 1e9,
            gasReserveSol: Number(GAS_RESERVE_LAMPORTS) / 1e9,
            availablePoolSol: Number(currentAvailablePool) / 1e9,
            reason: 'Balance is within normal operating gas reserve and accumulated reward pool.'
          };
        }
        newFeesLamports = currentLamports - totalReservedInWallet;
        claimTxSignature = `test_claim_${Date.now()}`;
      } else {
        // STRICT PRODUCTION INVARIANT: claim FIRST, then sweep 95% of the claim.
        let detectedClaim = await this.detectNewClaim(claimerPubkey);

        // No pending claim found — try to trigger one ourselves on-chain
        // (PumpSwap claim_creator_fee), then re-detect the resulting tx.
        if (!detectedClaim) {
          try {
            const claimResult = await this.claimCreatorFees(claimerPubkey);
            if (claimResult.claimed) {
              detectedClaim = await this.detectNewClaim(claimerPubkey);
              if (!detectedClaim) {
                // Claim landed but produced no SOL delta in the claimer wallet
                // (e.g. fees paid in the coin token rather than SOL).
                console.warn('[FeeHarvester] Claim executed but no SOL delta detected in claimer wallet. Fee proceeds may be in token form — manual conversion to SOL may be required before the 95% sweep.');
                dbAdapter.failHarvestInterval(intervalId, 'CLAIMED_NO_SOL_DELTA');
                return {
                  status: 'CLAIMED_NO_SOL_DELTA',
                  reason: 'Fees were claimed on-chain but no SOL landed in the claimer wallet. Convert claimed tokens to SOL, then the next cycle will sweep 95%.',
                  claimSignature: claimResult.signature
                };
              }
            } else {
              console.log(`[FeeHarvester] Auto-claim skipped: ${claimResult.reason}`);
            }
          } catch (claimErr) {
            console.error('[FeeHarvester] Auto-claim failed:', claimErr.message);
          }
        }

        if (!detectedClaim) {
          this.lastHarvestTime = new Date().toISOString();
          dbAdapter.failHarvestInterval(intervalId, 'NO_NEW_CLAIM');
          return {
            status: 'NO_NEW_CLAIM',
            reason: 'No claimable fees or new claim transaction detected on-chain. Waiting for claim before sending 95%.'
          };
        }

        newFeesLamports = detectedClaim.claimedLamports;
        claimTxSignature = detectedClaim.signature;
        console.log(`[FeeHarvester] ✓ Detected on-chain claim: ${claimTxSignature} (+${Number(newFeesLamports) / 1e9} SOL)`);
      }

      // Exact 95% of the claimed amount to Treasury, exact 5% retained in wallet for pool
      const treasuryLamports = (newFeesLamports * 95n) / 100n;
      const poolLamports = newFeesLamports - treasuryLamports;

      // Ensure wallet has enough balance to send treasuryLamports + gas
      const currentLamports = BigInt(await this.connection.getBalance(claimerPubkey));
      const minKeepGas = GAS_RESERVE_LAMPORTS; // 0.02 SOL kept back as gas backup
      const maxSendable = currentLamports > minKeepGas ? currentLamports - minKeepGas : 0n;
      
      // STRICT POOL PROTECTION GUARD:
      // Sweep to Treasury must never exceed exact 95% of the claimed amount, and must leave
      // the 0.02 SOL gas reserve untouched.
      if (maxSendable < treasuryLamports) {
        console.warn(`[FeeHarvester] Available balance (${maxSendable}) is less than expected 95% sweep (${treasuryLamports}). Clamping to protect remaining pool.`);
      }
      const actualTreasuryLamports = treasuryLamports > maxSendable ? maxSendable : treasuryLamports;

      if (actualTreasuryLamports < MIN_HARVEST_THRESHOLD_LAMPORTS) {
        dbAdapter.failHarvestInterval(intervalId, 'INSUFFICIENT_FUNDS');
        return { status: 'INSUFFICIENT_FUNDS_FOR_SWEEP', reason: 'Claimer balance insufficient to cover sweep while protecting gas reserve.' };
      }

      let txSignature = null;

      if (process.env.NODE_ENV !== 'test') {
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: claimerPubkey,
            toPubkey: this.treasuryPubkey,
            lamports: Number(actualTreasuryLamports)
          })
        );

        txSignature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [this.claimerKeypair],
          { commitment: 'confirmed' }
        );
      } else {
        txSignature = `test_harvest_${Date.now()}`;
      }

      const harvestId = `harvest_${Date.now()}`;
      const nowIso = new Date().toISOString();

      dbAdapter.transaction(() => {
        if (claimTxSignature) {
          dbAdapter.recordProcessedClaimSignature(claimTxSignature, newFeesLamports, actualTreasuryLamports, txSignature);
        }

        dbAdapter.insertFeeHarvest({
          id: harvestId,
          claimerWallet: claimerPubkey.toBase58(),
          treasuryWallet: this.treasuryPubkey.toBase58(),
          totalClaimedLamports: newFeesLamports,
          treasurySentLamports: actualTreasuryLamports,
          poolRetainedLamports: poolLamports,
          txSignature,
          status: 'CONFIRMED',
          createdAt: nowIso
        });

        const poolState = dbAdapter.getRewardPoolState();
        const currentAvailablePool = BigInt(poolState.available_pool_lamports || '0');
        const updatedTotalHarvested = BigInt(poolState.total_harvested_lamports || '0') + newFeesLamports;
        const updatedTotalTreasury = BigInt(poolState.total_treasury_lamports || '0') + actualTreasuryLamports;
        const updatedTotalPool = BigInt(poolState.total_pool_lamports || '0') + poolLamports;
        const updatedAvailablePool = currentAvailablePool + poolLamports;

        dbAdapter.updateRewardPoolState('global_mainnet', {
          totalHarvestedLamports: updatedTotalHarvested,
          totalTreasuryLamports: updatedTotalTreasury,
          totalPoolLamports: updatedTotalPool,
          availablePoolLamports: updatedAvailablePool,
          lastHarvestAt: nowIso
        });

        dbAdapter.confirmHarvestInterval(intervalId, harvestId, txSignature);
      });

      this.lastHarvestTime = nowIso;
      this.lastHarvestSignature = txSignature;

      return {
        status: 'SUCCESS',
        harvestId,
        claimTxSignature,
        newFeesLamports: newFeesLamports.toString(),
        treasurySentLamports: actualTreasuryLamports.toString(),
        poolRetainedLamports: poolLamports.toString(),
        treasurySentSol: Number(actualTreasuryLamports) / 1e9,
        poolRetainedSol: Number(poolLamports) / 1e9,
        txSignature,
        claimerWallet: claimerPubkey.toBase58(),
        treasuryWallet: this.treasuryPubkey.toBase58()
      };
    } catch (err) {
      console.error('[FeeHarvester] Error in harvest cycle:', err.message);
      try { dbAdapter.failHarvestInterval(intervalId, err.message); } catch {}
      return { status: 'ERROR', error: err.message };
    } finally {
      this.isHarvesting = false;
    }
  }

  /**
   * Start recurring background harvest daemon (checks for new on-chain claims).
   * Default cycle: every 15 minutes.
   */
  start(intervalMs = 15 * 60 * 1000) {
    if (this.intervalId) return;
    console.log(`[FeeHarvester] Starting automated fee harvester (interval: ${intervalMs / 1000}s, mode: claim-first)`);

    const claimerPub = this.getClaimerPublicKey();
    if (claimerPub && process.env.NODE_ENV !== 'test') {
      this.seedExistingSignatures(new PublicKey(claimerPub)).catch(() => {});
    }

    const initTimer = setTimeout(() => this.executeHarvestCycle().catch(() => {}), 5000);
    if (initTimer.unref) initTimer.unref();

    this.intervalId = setInterval(() => {
      this.executeHarvestCycle().catch(e => console.error('[FeeHarvester] Recurring error:', e.message));
    }, intervalMs);
    if (this.intervalId.unref) this.intervalId.unref();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStatus() {
    return {
      claimerPublicKey: this.getClaimerPublicKey(),
      treasuryPublicKey: this.treasuryPubkey ? this.treasuryPubkey.toBase58() : null,
      isHarvesting: this.isHarvesting,
      lastHarvestTime: this.lastHarvestTime,
      lastHarvestSignature: this.lastHarvestSignature
    };
  }
}

// Global Singleton Instance
export const feeHarvester = new FeeHarvesterWorker();
export { FeeHarvesterWorker as FeeHarvester };
