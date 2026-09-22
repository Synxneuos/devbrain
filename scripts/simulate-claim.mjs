// SIMULATION ONLY — builds the exact 2-ix claim transaction from fee-harvester.js
// and dry-runs it on mainnet. No transaction is sent, no funds move.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';

const c = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

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
console.log('CLAIMER:', claimer.toBase58());

const PUMP_AMM = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const MINT = new PublicKey('AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump');

const pool = new PublicKey((process.env.PUMPSWAP_POOL_ADDRESS || '4WY8R8fyPyqn7ShU5siJFUMJJfFZVEyF4xRRqtFUrMnA').trim());
const pumpFeeVault = new PublicKey((process.env.PUMP_FEE_VAULT_ADDRESS || 'E6oxJxUhH4ee5PbxVsuFXNi8ebPamt3uA6NcMxs3AVdh').trim());
const pumpFeeConfig = new PublicKey((process.env.PUMP_FEE_CONFIG_ADDRESS || 'GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR').trim());
const pumpCreatorFeeConfig = new PublicKey((process.env.PUMP_CREATOR_FEE_CONFIG_ADDRESS || 'uoJhCfqdLxAx4cNqnoUrCYuBKcRTJdMmFxGa8HqrzYj').trim());
const pumpEventAuthority = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

const [creatorVault] = PublicKey.findProgramAddressSync([Buffer.from('creator_vault'), pool.toBuffer()], PUMP_AMM);
const vaultWsolAta = PublicKey.findProgramAddressSync(
  [creatorVault.toBuffer(), TOKEN.toBuffer(), WSOL.toBuffer()], ATA)[0];

const vaultBal = await c.getBalance(vaultWsolAta).catch(() => 0);
console.log('vault WSOL ATA:', vaultWsolAta.toBase58(), 'balance:', vaultBal / 1e9, 'SOL');

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
const tx = new Transaction().add(ix1).add(ix2);
tx.recentBlockhash = blockhash;
tx.feePayer = claimer;
const sim = await c.simulateTransaction(tx, [kp]);
if (sim.value.err) {
  console.log('SIMULATION FAILED:', JSON.stringify(sim.value.err));
  (sim.value.logs || []).forEach(l => console.log(' ', l));
} else {
  console.log('SIMULATION SUCCESS — claim transaction would execute correctly.');
  (sim.value.logs || []).filter(l => /Instruction|fee|Fee/.test(l)).forEach(l => console.log(' ', l));
}
