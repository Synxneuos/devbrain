/**
 * Jev Brain - Operator & Manual Treasury Service
 * 
 * Manages the manual 95% SOL reward transfer queue.
 * Allows the human project operator to inspect pending manual payouts, execute them from their
 * separate cold wallet, and record the Solana transaction signature.
 * 
 * IMPORTANT:
 * The application backend and database NEVER hold private keys or seed phrases.
 * All 95% transfers are executed externally by the human operator.
 */

import { rewardsStore, OPERATOR_WALLET_PUBLIC_KEY, INFRASTRUCTURE_WALLET_PUBLIC_KEY } from './rewards-store.js';
import { querySolanaRpcWithFailover, DEFAULT_SOLANA_RPCS } from './holder-eligibility.js';
import { dbAdapter } from './db-adapter.js';

/**
 * Validate Solana transaction signature (Base58 string, 64-120 chars)
 */
export function isValidSolanaSignature(signature) {
  return typeof signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(signature.trim());
}

/**
 * Verify Solana transaction on-chain via JSON-RPC
 * Strictly validates:
 * 1. Transaction exists and was successful (meta.err === null).
 * 2. Sender matches operator wallet.
 * 3. Recipient matches claimant destination wallet.
 * 4. Transferred lamports equals exact 95% manual amount.
 */
export async function verifySolanaTransactionOnChain({
  signature,
  expectedSender = OPERATOR_WALLET_PUBLIC_KEY,
  expectedRecipient,
  expectedLamports,
  rpcEndpoints = DEFAULT_SOLANA_RPCS
}) {
  const sig = (signature || '').trim();
  if (!isValidSolanaSignature(sig)) {
    throw new Error('Invalid Solana transaction signature format.');
  }

  const { result: tx } = await querySolanaRpcWithFailover(
    'getTransaction',
    [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    rpcEndpoints
  );

  if (!tx) {
    throw new Error('Transaction signature not found on Solana network.');
  }

  return parseAndValidateSolanaTransaction({
    tx,
    expectedSender,
    expectedRecipient,
    expectedLamports
  });
}

/**
 * Parse and validate transaction payload
 */
export function parseAndValidateSolanaTransaction(arg1, arg2, arg3) {
  let tx, expectedSender, expectedRecipient, expectedLamports;
  if (arg1 && typeof arg1 === 'object' && arg1.tx !== undefined) {
    ({ tx, expectedSender, expectedRecipient, expectedLamports } = arg1);
  } else {
    tx = arg1;
    expectedRecipient = arg2;
    expectedLamports = arg3;
  }
  if (!tx) throw new Error('Transaction object is required for validation.');
  if (tx.meta && tx.meta.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }

  let matchedTransfer = null;
  let matchedRecipient = null;

  // Inspect instructions
  const instructions = [
    ...(tx.transaction?.message?.instructions || []),
    ...((tx.meta?.innerInstructions || []).flatMap(ii => ii.instructions || []))
  ];

  for (const ix of instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info || {};
      const source = info.source;
      const destination = info.destination;
      const lamports = BigInt(info.lamports || 0);

      if (destination === expectedRecipient) {
        matchedRecipient = { source, destination, lamports };
        const senderMatch = !expectedSender || source === expectedSender;
        const amountMatch = !expectedLamports || lamports === BigInt(expectedLamports);
        if (senderMatch && amountMatch) {
          matchedTransfer = matchedRecipient;
          break;
        }
      }
    }
  }

  // Fallback: check balance changes
  if (!matchedTransfer && !matchedRecipient && expectedRecipient && expectedLamports) {
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const recipientIdx = accountKeys.findIndex(k => (typeof k === 'string' ? k : k.pubkey) === expectedRecipient);
    if (recipientIdx >= 0 && tx.meta?.preBalances && tx.meta?.postBalances) {
      const delta = BigInt(tx.meta.postBalances[recipientIdx] || 0) - BigInt(tx.meta.preBalances[recipientIdx] || 0);
      matchedRecipient = { destination: expectedRecipient, lamports: delta };
      if (delta >= BigInt(expectedLamports)) {
        matchedTransfer = matchedRecipient;
      }
    }
  }

  if (expectedRecipient && !matchedRecipient && !matchedTransfer) {
    throw new Error(`Transaction does not contain a transfer to destination wallet: ${expectedRecipient}`);
  }

  if (expectedSender && matchedRecipient && matchedRecipient.source && matchedRecipient.source !== expectedSender) {
    throw new Error(`Transaction sender does not match required operator wallet: expected ${expectedSender}, got ${matchedRecipient.source}`);
  }

  if (expectedLamports && matchedRecipient && matchedRecipient.lamports !== BigInt(expectedLamports)) {
    throw new Error(`Transaction amount does not match expected 95% payout: expected ${expectedLamports} lamports, got ${matchedRecipient.lamports}`);
  }

  return {
    valid: true,
    verified: true,
    slot: tx.slot,
    matchedTransfer
  };
}

/**
 * List pending burns waiting for confirmation or processing
 */
export function getPendingTransfers() {
  const pending = dbAdapter.getPendingBurnsForReconciliation();
  return {
    operatorWallet: OPERATOR_WALLET_PUBLIC_KEY,
    infrastructureWallet: INFRASTRUCTURE_WALLET_PUBLIC_KEY,
    pendingCount: pending.length,
    pendingTransfers: pending,
    pendingBurns: pending
  };
}

/**
 * List complete credit burns history
 */
export function getAllClaimsHistory(limit = 100) {
  const burns = dbAdapter.getAllCreditBurns(limit);
  return {
    operatorWallet: OPERATOR_WALLET_PUBLIC_KEY,
    infrastructureWallet: INFRASTRUCTURE_WALLET_PUBLIC_KEY,
    claims: burns,
    burns
  };
}
