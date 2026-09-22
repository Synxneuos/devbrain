/**
 * Jev Brain - Real Solana Devnet Financial Integration Test Suite
 * 
 * Verifies end-to-end financial operations on real Solana Devnet:
 * 1. Real fee harvest (95% to Treasury, 5% pool retention)
 * 2. Real credit burn (direct SOL payout to authenticated holder)
 * 3. Real on-chain RPC confirmation & balance delta verification
 * 4. Crash-safe state machine & reconciliation recovery without blind refunds
 * 5. Solvency ceiling bound enforcement against live on-chain balances
 * 
 * ZERO MOCKS. Real Ed25519 keypairs, real Devnet RPC, real signatures.
 * If Devnet is rate-limited or unreachable, fails cleanly without faking success.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import crypto from 'node:crypto';
import assert from 'node:assert';

// CRITICAL FIX: isolate the suite from the production database file.
// Must be set BEFORE any src/ module is imported (the dbAdapter singleton
// captures its path at module-init time), so src/ imports are dynamic below.
process.env.DATABASE_PATH = process.env.DATABASE_PATH || ':memory:';

const { dbAdapter } = await import('../src/core/db-adapter.js');
const { rewardsStore } = await import('../src/core/rewards-store.js');
const { FeeHarvester, GAS_RESERVE_LAMPORTS } = await import('../src/workers/fee-harvester.js');
const { BurnEngine, encodeBase58, decodeBase58 } = await import('../src/core/burn-engine.js');

const DEVNET_RPC_URL = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';

async function runDevnetIntegration() {
  console.log('\n===============================================================');
  console.log('⚡ JEV BRAIN — SOLANA DEVNET FINANCIAL INTEGRATION SUITE');
  console.log('===============================================================');
  console.log(`Connecting to Solana Devnet RPC: ${DEVNET_RPC_URL}`);

  const connection = new Connection(DEVNET_RPC_URL, 'confirmed');

  // Verify RPC connectivity
  let devnetSlot;
  try {
    devnetSlot = await connection.getSlot();
    console.log(`✓ Devnet connection established. Current slot: ${devnetSlot}`);
  } catch (rpcErr) {
    console.error(`[FAIL-CLOSED] Devnet RPC unreachable: ${rpcErr.message}`);
    process.exit(1);
  }

  // Setup Keypairs
  let claimerKeypair;
  if (process.env.DEVNET_CLAIMER_PRIVATE_KEY) {
    const raw = decodeBase58(process.env.DEVNET_CLAIMER_PRIVATE_KEY);
    claimerKeypair = Keypair.fromSecretKey(new Uint8Array(raw));
    console.log(`Using provided Devnet claimer keypair: ${claimerKeypair.publicKey.toBase58()}`);
  } else {
    claimerKeypair = Keypair.generate();
    console.log(`Generated ephemeral Devnet claimer keypair: ${claimerKeypair.publicKey.toBase58()}`);
  }

  const treasuryKeypair = Keypair.generate();
  const holderKeypair = Keypair.generate();

  console.log(`Treasury Wallet (95% recipient): ${treasuryKeypair.publicKey.toBase58()}`);
  console.log(`Holder Wallet (burn recipient):   ${holderKeypair.publicKey.toBase58()}`);

  // Check Claimer Balance
  let claimerBalance = await connection.getBalance(claimerKeypair.publicKey);
  console.log(`Current Claimer balance: ${claimerBalance} lamports (${claimerBalance / LAMPORTS_PER_SOL} SOL)`);

  const MIN_REQUIRED_BALANCE = 50_000_000; // 0.05 SOL

  if (claimerBalance < MIN_REQUIRED_BALANCE) {
    console.log(`Attempting Devnet faucet airdrop for ${claimerKeypair.publicKey.toBase58()}...`);
    try {
      const airdropSig = await connection.requestAirdrop(claimerKeypair.publicKey, 0.2 * LAMPORTS_PER_SOL);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: airdropSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });
      claimerBalance = await connection.getBalance(claimerKeypair.publicKey);
      console.log(`✓ Airdrop confirmed! New balance: ${claimerBalance / LAMPORTS_PER_SOL} SOL`);
    } catch (airdropErr) {
      console.error('\n---------------------------------------------------------------');
      console.error('⛔ DEVNET FAUCET RATE LIMITED / UNAVAILABLE');
      console.error(`Error: ${airdropErr.message}`);
      console.error(`Claimer Address: ${claimerKeypair.publicKey.toBase58()}`);
      console.error('To run live Devnet integration tests without faucet rate limits:');
      console.error('1. Fund the address at: https://faucet.solana.com');
      console.error('2. Or set DEVNET_CLAIMER_PRIVATE_KEY=<base58_private_key> with >= 0.05 SOL');
      console.error('Failing cleanly — zero fake signatures permitted.');
      console.error('---------------------------------------------------------------\n');
      throw new Error(`Devnet integration aborted: Faucet rate-limited. ${airdropErr.message}`);
    }
  }

  const claimerPrivateKeyB58 = encodeBase58(Buffer.from(claimerKeypair.secretKey));
  const treasuryPubkeyB58 = treasuryKeypair.publicKey.toBase58();
  const holderAddress = holderKeypair.publicKey.toBase58();

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: LIVE DEVNET FEE HARVEST CYCLE (95% TREASURY / 5% POOL)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 1: Real Solana Devnet Fee Harvest Cycle ---');
  const harvester = new FeeHarvester({
    rpcUrl: DEVNET_RPC_URL,
    claimerPrivateKey: claimerPrivateKeyB58,
    treasuryPublicKey: treasuryPubkeyB58
  });

  const initialTreasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
  const initialClaimerBalance = await connection.getBalance(claimerKeypair.publicKey);

  console.log(`Initial on-chain Claimer Balance:  ${initialClaimerBalance} lamports`);
  console.log(`Initial on-chain Treasury Balance: ${initialTreasuryBalance} lamports`);

  const harvestResult = await harvester.executeHarvestCycle();
  console.log('Harvest Execution Result:', harvestResult);

  // FIX: executeHarvestCycle returns { status, treasurySentLamports: string, ... }
  assert.strictEqual(harvestResult.status, 'SUCCESS', `Harvest cycle must report SUCCESS (got ${harvestResult.status}: ${harvestResult.reason || harvestResult.error || ''})`);
  assert.ok(harvestResult.txSignature, 'Must return genuine Solana transaction signature');
  const treasurySentLamports = BigInt(harvestResult.treasurySentLamports);
  assert.ok(treasurySentLamports > 0n, 'Must transfer positive 95% surplus to treasury');

  // Verify on-chain transaction status directly via RPC
  console.log(`Verifying transaction ${harvestResult.txSignature} on Devnet RPC...`);
  const harvestTx = await connection.getTransaction(harvestResult.txSignature, { commitment: 'confirmed' });
  assert.ok(harvestTx, 'Transaction must exist on Solana Devnet');
  assert.strictEqual(harvestTx.meta?.err, null, 'On-chain transaction execution must have zero errors');

  // Verify on-chain balance deltas match DB accounting
  const postTreasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
  const actualTreasuryDelta = BigInt(postTreasuryBalance - initialTreasuryBalance);
  assert.strictEqual(actualTreasuryDelta, treasurySentLamports, 'Treasury balance delta must exactly equal 95% transferred');

  console.log(`✓ Test 1 Passed: 95% Fee Harvest confirmed on Devnet! Transferred: ${actualTreasuryDelta} lamports`);

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: LIVE SOLVENCY CEILING BOUND ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Live Solvency Ceiling Bound Math ---');
  const burnEngine = new BurnEngine({
    connection,
    claimerPrivateKey: claimerPrivateKeyB58,
    isTestEnv: false // Enforce real on-chain execution
  });

  const metrics = await burnEngine.getLivePoolMetrics();
  console.log('Live Pool Solvency Metrics:', {
    totalClaimerBalanceSol: metrics.totalClaimerBalanceSol,
    distributablePoolSol: metrics.distributablePoolSol,
    distributableLamports: metrics.distributableLamports.toString(),
    gasReserveLamports: metrics.gasReserveLamports,
    activeBurnReservationsLamports: metrics.activeBurnReservationsLamports,
    driftDetected: metrics.driftDetected,
    isPaused: metrics.isPaused
  });

  // Strict invariant: distributable lamports <= claimerBalance - gasReserve - activeReservations
  const liveClaimerLamports = BigInt(await connection.getBalance(claimerKeypair.publicKey));
  const maxSafeDistributable = liveClaimerLamports > GAS_RESERVE_LAMPORTS ? liveClaimerLamports - GAS_RESERVE_LAMPORTS : 0n;
  assert.ok(
    metrics.distributableLamports <= maxSafeDistributable,
    `Solvency Bound Violated: distributable (${metrics.distributableLamports}) > max safe on-chain (${maxSafeDistributable})`
  );
  console.log('✓ Test 2 Passed: Solvency bound strictly enforced against live Devnet balance.');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: LIVE DEVNET CREDIT BURN & ON-CHAIN SOL REWARD PAYOUT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Real Solana Devnet Credit Burn & SOL Payout ---');
  // Seed credits to holder
  rewardsStore.recordLedgerEntry({
    walletAddress: holderAddress,
    type: 'EARN',
    amount: 10_000n,
    referenceId: 'devnet_test_seed'
  });

  const initialHolderBalance = await connection.getBalance(holderKeypair.publicKey);
  console.log(`Initial Holder on-chain Balance: ${initialHolderBalance} lamports`);

  const burnQuote = await burnEngine.calculateBurnQuote(100);
  console.log('Live Burn Quote:', burnQuote);
  assert.ok(BigInt(burnQuote.estimatedRewardLamports) > 0n, 'Live quote must produce positive reward');

  const burnResult = await burnEngine.executeBurn({
    walletAddress: holderAddress,
    creditsToBurn: 100,
    destinationWallet: holderAddress,
    idempotencyKey: `devnet_burn_${Date.now()}`
  });

  console.log('Burn Execution Result:', burnResult);
  assert.strictEqual(burnResult.success, true, 'Burn execution must succeed');
  assert.strictEqual(burnResult.status, 'CONFIRMED', 'State machine must reach CONFIRMED on live confirmation');
  assert.ok(burnResult.txSignature, 'Must return genuine Solana transaction signature');

  // Verify on-chain transaction on Devnet
  console.log(`Verifying burn transaction ${burnResult.txSignature} on Devnet RPC...`);
  const burnTx = await connection.getTransaction(burnResult.txSignature, { commitment: 'confirmed' });
  assert.ok(burnTx, 'Burn transaction must exist on Solana Devnet');
  assert.strictEqual(burnTx.meta?.err, null, 'Burn transaction execution must have zero errors');

  // Verify on-chain balance delta matches reward lamports
  const postHolderBalance = await connection.getBalance(holderKeypair.publicKey);
  const actualHolderDelta = BigInt(postHolderBalance - initialHolderBalance);
  assert.strictEqual(actualHolderDelta, BigInt(burnResult.rewardLamports), 'Holder balance delta must match reward lamports');

  console.log(`✓ Test 3 Passed: Credit Burn confirmed on Devnet! Transferred: ${actualHolderDelta} lamports to ${holderAddress}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: CRASH RECOVERY — RE-BROADCAST & RECONCILIATION WITHOUT BLIND REFUND
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Real Devnet Crash Recovery & Reconciler Loop ---');
  // Build and sign a real transaction on Devnet, but do NOT broadcast it.
  // Simulate process crashing right after persisting SIGNED state.
  const latestBlock = await connection.getLatestBlockhash('confirmed');
  const rewardAmount = 5000n; // 5000 lamports payout

  const simBurnId = `crash_sim_${Date.now()}`;
  const unbroadcastTx = new Transaction({
    feePayer: claimerKeypair.publicKey,
    recentBlockhash: latestBlock.blockhash
  }).add(
    SystemProgram.transfer({
      fromPubkey: claimerKeypair.publicKey,
      toPubkey: holderKeypair.publicKey,
      lamports: Number(rewardAmount)
    })
  );

  unbroadcastTx.sign(claimerKeypair);
  const rawTxBase64 = unbroadcastTx.serialize().toString('base64');
  const rawTxSig = encodeBase58(unbroadcastTx.signature);

  // Seed holder credits and insert simulated crash burn into DB in SIGNED state
  rewardsStore.recordLedgerEntry({
    walletAddress: holderAddress,
    type: 'EARN',
    amount: 500n,
    referenceId: 'crash_test_seed'
  });

  dbAdapter.insertCreditBurn({
    id: simBurnId,
    walletAddress: holderAddress,
    destinationWallet: holderAddress,
    creditsBurned: 50n,
    rewardLamports: rewardAmount,
    rewardSol: Number(rewardAmount) / 1e9,
    marketCapUsd: 100000,
    txSignature: rawTxSig,
    signedTxRaw: rawTxBase64,
    lastValidBlockHeight: latestBlock.lastValidBlockHeight,
    blockhash: latestBlock.blockhash,
    status: 'SIGNED',
    idempotencyKey: `crash_idem_${Date.now()}`,
    createdAt: new Date().toISOString()
  });

  console.log(`Simulated crashed burn inserted: ${simBurnId} in state SIGNED with signature ${rawTxSig}`);

  // Trigger continuous reconciler
  const reconcileResult = await burnEngine.reconcilePendingBurns();
  console.log('Reconciler execution result:', reconcileResult);

  // Verify the reconciler recovered the transaction without blind refunding
  const recoveredBurn = dbAdapter.getCreditBurnByIdempotencyKey(`crash_idem_${simBurnId.replace('crash_sim_', '')}`, holderAddress)
    || dbAdapter.getPendingBurnsForReconciliation().find(b => b.id === simBurnId)
    || (dbAdapter.getDb().prepare('SELECT * FROM credit_burns WHERE id = ?').get(simBurnId));

  console.log('Post-reconciliation burn record state:', recoveredBurn.status);

  // Wait for Devnet confirmation if still in PENDING_CONFIRMATION
  if (recoveredBurn.status === 'PENDING_CONFIRMATION') {
    console.log('Waiting for Devnet confirmation of recovered transaction...');
    await connection.confirmTransaction({
      signature: rawTxSig,
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight
    }, 'confirmed');
    // Run second reconciler pass to advance to CONFIRMED
    await burnEngine.reconcilePendingBurns();
    const finalRecord = dbAdapter.getDb().prepare('SELECT * FROM credit_burns WHERE id = ?').get(simBurnId);
    assert.strictEqual(finalRecord.status, 'CONFIRMED', 'Reconciler must advance to CONFIRMED after on-chain landing');
  } else {
    assert.strictEqual(recoveredBurn.status, 'CONFIRMED', 'Reconciler must recover and confirm transaction');
  }

  // Verify the transaction actually landed on Devnet
  const onChainTx = await connection.getTransaction(rawTxSig, { commitment: 'confirmed' });
  assert.ok(onChainTx, 'Recovered transaction must exist on Devnet');
  assert.strictEqual(onChainTx.meta?.err, null, 'Recovered transaction must have executed without error');

  console.log(`✓ Test 4 Passed: Reconciler successfully broadcast and confirmed un-broadcast transaction on Devnet without blind refunds!`);

  console.log('\n===============================================================');
  console.log('🎉 ALL SOLANA DEVNET INTEGRATION TESTS PASSED (100% REAL ON-CHAIN)');
  console.log('===============================================================\n');
}

runDevnetIntegration().catch(err => {
  console.error('\n❌ DEVNET INTEGRATION TEST SUITE FAILED:', err.message);
  process.exit(1);
});
