import { Connection, PublicKey } from '@solana/web3.js';

const SIG = '3UgU8mnciCGtVbgyzkokn8U7AapK5afMiBm5wMBfMzYU1JhxdMB6CFQka1dDAJRmoJrwhPFU2yywR4ECv4ujx48C';
const c = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

const tx = await c.getParsedTransaction(SIG, { maxSupportedTransactionVersion: 0 });
if (!tx) { console.log('TX_NOT_FOUND (maybe rate limited, retry later)'); process.exit(0); }

console.log('=== META ===');
console.log('fee:', tx.meta.fee);
console.log('err:', tx.meta.err);
console.log('blockTime:', new Date(tx.blockTime * 1000).toISOString());

console.log('=== ACCOUNTS (order) ===');
const keys = tx.transaction.message.accountKeys;
keys.forEach((k, i) => console.log(` ${i}`, k.pubkey.toBase58?.() || k.pubkey, k.signer ? 'SIGNER' : '', k.writable ? 'WRITABLE' : ''));

console.log('=== TOP-LEVEL INSTRUCTIONS ===');
tx.transaction.message.instructions.forEach((ix, i) => {
  console.log(` ix#${i} program=${ix.programId?.toBase58?.() || ix.program} name=${ix.name || ''}`);
  if (ix.accounts) console.log('   accounts:', JSON.stringify(ix.accounts.map(a => typeof a === 'object' ? (a.toBase58?.() || a.pubkey) : a)));
  if (ix.data) console.log('   data:', typeof ix.data === 'string' ? ix.data.slice(0, 40) : Buffer.from(ix.data).toString('hex').slice(0, 40));
});

console.log('=== INNER INSTRUCTIONS ===');
(tx.meta.innerInstructions || []).forEach(ii => {
  (ii.instructions || []).forEach((ix, j) => {
    const info = ix.parsed ? JSON.stringify(ix.parsed).slice(0, 200) : '';
    console.log(` inner[${ii.index}].${j} program=${ix.program} type=${ix.parsed?.type || ''} ${info}`);
  });
});

console.log('=== LOG MESSAGES ===');
(tx.meta.logMessages || []).forEach(l => console.log(' ', l));

console.log('=== BALANCE DELTAS ===');
const pre = tx.meta.preBalances, post = tx.meta.postBalances;
keys.forEach((k, i) => {
  const d = BigInt(post[i]) - BigInt(pre[i]);
  if (d !== 0n) console.log(` ${k.pubkey?.toBase58?.() || k.pubkey} delta=${Number(d) / 1e9} SOL`);
});

console.log('=== TOKEN BALANCE DELTAS ===');
const preT = tx.meta.preTokenBalances || [], postT = tx.meta.postTokenBalances || [];
for (const pb of postT) {
  const match = preT.find(p => p.accountIndex === pb.accountIndex);
  const d = (pb.uiTokenAmount?.uiAmount || 0) - (match?.uiTokenAmount?.uiAmount || 0);
  if (d !== 0) console.log(` idx=${pb.accountIndex} owner=${pb.owner} mint=${pb.mint} delta=${d}`);
}
