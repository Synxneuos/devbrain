/**
 * Jev Brain - Automated 15-Minute Fee Harvester & Splitter Worker
 * 
 * Runs continuously every 15 minutes:
 * 1. Checks accumulated trading fees in the Claimer Wallet.
 * 2. Sweeps exact 95% to the Treasury Wallet (83SqfW6gs2jALfvpXnV4sMb1RQnzmiZNwjeunivMSaJ2).
 * 3. Retains exact 5% in the Claimer Wallet as the User Burn Reward Pool + Gas Reserve.
 * 4. Updates authoritative database state with on-chain transaction signatures.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { dbAdapter } from '../core/db-adapter.js';

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
   * Execute a single 15-minute harvest & 95% split cycle
   * Strictly enforces:
   * 1. Multi-instance and restart interval locking via database (exactly-once).
   * 2. Non-decaying 5% pool accumulation: only new fees are split, prior pool is never re-swept.
   * 3. On-chain balance perfectly reconciles with database available_pool_lamports.
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

      // Fail-closed validation: Treasury wallet cannot be identical to Claimer wallet in production
      if (process.env.NODE_ENV !== 'test' && this.treasuryPubkey.toBase58() === claimerPubkey.toBase58()) {
        throw new Error('[FeeHarvester] CRITICAL: TREASURY_WALLET_PUBLIC_KEY cannot be identical to the Claimer Wallet.');
      }

      const currentLamports = BigInt(await this.connection.getBalance(claimerPubkey));

      // F-1 FIX: Read current pool state. The wallet holds: Gas Reserve + Accumulated Pool + New Incoming Fees.
      const currentPoolState = dbAdapter.getRewardPoolState();
      const currentAvailablePool = BigInt(currentPoolState.available_pool_lamports || '0');

      // Total reserved funds in wallet that must NEVER be swept to treasury:
      const totalReservedInWallet = GAS_RESERVE_LAMPORTS + currentAvailablePool;

      // Calculate new fees accumulated since last harvest cycle
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

      // Exact new fees received since last harvest
      const newFeesLamports = currentLamports - totalReservedInWallet;
      const treasuryLamports = (newFeesLamports * 95n) / 100n;
      const poolLamports = newFeesLamports - treasuryLamports; // Exact 5% retained in wallet for pool

      let txSignature = null;

      if (process.env.NODE_ENV !== 'test') {
        // Construct live on-chain Solana transfer to Treasury
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: claimerPubkey,
            toPubkey: this.treasuryPubkey,
            lamports: Number(treasuryLamports)
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

      // F-3 FIX: Record harvest and update reward pool atomically in an ACID transaction
      dbAdapter.transaction(() => {
        // Record harvest in database
        dbAdapter.insertFeeHarvest({
          id: harvestId,
          claimerWallet: claimerPubkey.toBase58(),
          treasuryWallet: this.treasuryPubkey.toBase58(),
          totalClaimedLamports: newFeesLamports,
          treasurySentLamports: treasuryLamports,
          poolRetainedLamports: poolLamports,
          txSignature,
          status: 'CONFIRMED',
          createdAt: nowIso
        });

        // Update reward pool state: pool increases by 5% of new fees
        const poolState = dbAdapter.getRewardPoolState();
        const updatedTotalHarvested = BigInt(poolState.total_harvested_lamports || '0') + newFeesLamports;
        const updatedTotalTreasury = BigInt(poolState.total_treasury_lamports || '0') + treasuryLamports;
        const updatedTotalPool = BigInt(poolState.total_pool_lamports || '0') + poolLamports;
        const updatedAvailablePool = currentAvailablePool + poolLamports;

        dbAdapter.updateRewardPoolState('global_mainnet', {
          totalHarvestedLamports: updatedTotalHarvested,
          totalTreasuryLamports: updatedTotalTreasury,
          totalPoolLamports: updatedTotalPool,
          availablePoolLamports: updatedAvailablePool,
          lastHarvestAt: nowIso
        });

        // Finalize interval lock to CONFIRMED
        dbAdapter.confirmHarvestInterval(intervalId, harvestId, txSignature);
      });

      this.lastHarvestTime = nowIso;
      this.lastHarvestSignature = txSignature;

      return {
        status: 'SUCCESS',
        harvestId,
        newFeesLamports: newFeesLamports.toString(),
        treasurySentLamports: treasuryLamports.toString(),
        poolRetainedLamports: poolLamports.toString(),
        treasurySentSol: Number(treasuryLamports) / 1e9,
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
   * Start recurring 15-minute background harvest daemon
   */
  start(intervalMs = 15 * 60 * 1000) {
    if (this.intervalId) return;
    console.log(`[FeeHarvester] Starting automated fee harvester (interval: ${intervalMs / 1000}s)`);
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
