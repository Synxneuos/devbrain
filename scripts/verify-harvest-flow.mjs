// FULL PIPELINE SIMULATION — claim (2-ix pump.fun flow) + 95% sweep to treasury.
// SIMULATION ONLY: no real transaction is sent, no funds move.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';

const c = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
const TREASURY = new PublicKey('83SqfW6gs2jALfvpXnV4sMb1RQnzmiZNwjeunivMSaJ2');
const GAS_RESERVE = 20_000_000n; // 0.02 SOL gas backup (matches fee-harvester GAS_RESERVE_LAMPORTS)

const line = readFileSync('.env', 'utf8').split(/\r?\n/).find(l => l.startsWith('FEE_CLAIMER_PRIVATE_KEY='));
let v = line.split('=')[1].trim();
let kp;
try { kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(v))); } catch (e) {
  const B = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for (const ch of v) n = n * 58n + BigInt(B.indexOf(ch));
  let h = n.toString(16); if (h.length % 2) h = '0' + h;
  kp = Keypair.fromSecretKey(new Uint8Array(Buffer.from(h, 'hex')));
}
const claimer = kp.publicKey;
const walletBal = BigInt(await c.getBalance(claimer));
console.log('CLAIMER:', claimer.toBase58(), '| wallet balance:', Number(walletBal) / 1e9, 'SOL');
console.log('TREASURY:', TREASURY.toBase58());

const PUMP_AMM = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const MINT = new PublicKey('AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump');
const pool = new PublicKey('4WY8R8fyPyqn7ShU5siJFUMJJfFZVEyF4xRRqtFUrMnA');
const pumpFeeVault = new PublicKey('E6oxJxUhH4ee5PbxVsuFXNi8ebPamt3uA6NcMxs3AVdh');
const pumpFeeConfig = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
const pumpCreatorFeeConfig = new PublicKey('uoJhCfqdLxAx4cNqnoUrCYuBKcRTJdMmFxGa8HqrzYj');
const pumpEventAuthority = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

const [creatorVault] = PublicKey.findProgramAddressSync([Buffer.from('creator_vault'), pool.toBuffer()], PUMP_AMM);
const vaultWsolAta = PublicKey.findProgramAddressSync([creatorVault.toBuffer(), TOKEN.toBuffer(), WSOL.toBuffer()], ATA)[0];
const vaultBal = BigInt(await c.getBalance(vaultWsolAta));
console.log('FEE VAULT (claimable):', Number(vaultBal) / 1e9, 'SOL');

// ── STEP 1: simulate the claim (claim-first invariant) ──
const ix1 = new TransactionInstruction({
  programId: PUMP_AMM,
  keys: [
    { pubkey: WSOL, isSigner: false, isWritable: false },
    { pubkey: TOKEN, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ATA, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: vaultWsolAta, isSigner: false, isWritable: true },
    { pubkey: pumpFeeVault, isSigner: false, isWritable: true },
    { pubkey: pumpFeeConfig, isSigner: false, isWritable: true },
    { pubkey: PUMP_AMM, isSigner: false, isWritable: false }
  ],
  data: Buffer.from('8b348655e4e56cf1', 'hex')
});
const ix2 = new TransactionInstruction({
  programId: PUMP,
  keys: [
    { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: pumpCreatorFeeConfig, isSigner: false, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: pumpFeeVault, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: pumpEventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMP, isSigner: false, isWritable: false },
    { pubkey: claimer, isSigner: true, isWritable: true }
  ],
  data: Buffer.from('a572670079cef751', 'hex')
});

const { blockhash } = await c.getLatestBlockhash('confirmed');
const claimTx = new Transaction().add(ix1).add(ix2);
claimTx.recentBlockhash = blockhash;
claimTx.feePayer = claimer;
const claimSim = await c.simulateTransaction(claimTx, [kp]);
if (claimSim.value.err) {
  console.log('STEP 1 CLAIM SIMULATION: FAILED', JSON.stringify(claimSim.value.err));
  (claimSim.value.logs || []).slice(-8).forEach(l => console.log(' ', l));
  process.exit(0);
}
console.log('STEP 1 CLAIM SIMULATION: ✓ SUCCESS (fees would land in claimer wallet)');

// ── STEP 2: simulate the 95% sweep to treasury with 0.02 SOL gas backup ──
const claimedLamports = vaultBal; // claim delta ~= vault balance
const treasuryLamports = (claimedLamports * 95n) / 100n;
const poolLamports = claimedLamports - treasuryLamports;
const balanceAfterClaim = walletBal + claimedLamports;
const maxSendable = balanceAfterClaim > GAS_RESERVE ? balanceAfterClaim - GAS_RESERVE : 0n;
const actualTreasury = treasuryLamports > maxSendable ? maxSendable : treasuryLamports;

console.log('--- 95% / 5% split (of claim) ---');
console.log('claim amount      :', Number(claimedLamports) / 1e9, 'SOL');
console.log('95% to treasury   :', Number(actualTreasury) / 1e9, 'SOL');
console.log('5% stays for pool :', Number(poolLamports) / 1e9, 'SOL');
console.log('gas backup keeps  :', Number(GAS_RESERVE) / 1e9, 'SOL in claimer wallet');

const sweepTx = new Transaction().add(ix1).add(ix2).add(
  SystemProgram.transfer({ fromPubkey: claimer, toPubkey: TREASURY, lamports: Number(actualTreasury) })
);
sweepTx.recentBlockhash = blockhash;
sweepTx.feePayer = claimer;
const sweepSim = await c.simulateTransaction(sweepTx, [kp]);
if (sweepSim.value.err) {
  console.log('STEP 2 FULL CYCLE SIMULATION (claim + 95% sweep in one tx): FAILED', JSON.stringify(sweepSim.value.err));
  (sweepSim.value.logs || []).slice(-6).forEach(l => console.log(' ', l));
} else {
  console.log('STEP 2 FULL CYCLE SIMULATION (claim + 95% sweep in one tx): ✓ SUCCESS');
  console.log('   →', Number(actualTreasury) / 1e9, 'SOL would arrive at', TREASURY.toBase58());
  console.log('   → gas backup of', Number(GAS_RESERVE) / 1e9, 'SOL stays in claimer wallet');
}
