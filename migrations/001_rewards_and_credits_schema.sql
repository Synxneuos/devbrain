-- =============================================================================
-- Jev Brain: Production Holder Rewards, LLM Credits & Settlement Schema
-- Version: 001
-- Target: PostgreSQL / Supabase
-- Official Token Mint: AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump
-- =============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. HOLDER ACCOUNTS
-- Tracks verified Solana token holders and their credit accrual state
CREATE TABLE IF NOT EXISTS holder_accounts (
    wallet_address VARCHAR(64) PRIMARY KEY,
    token_balance_raw NUMERIC(38, 0) NOT NULL DEFAULT 0,
    token_balance_ui NUMERIC(24, 6) NOT NULL DEFAULT 0,
    tier VARCHAR(32) NOT NULL DEFAULT 'None',
    tier_level INT NOT NULL DEFAULT 0,
    credit_rate_per_hour INT NOT NULL DEFAULT 0,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accrual_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HOLDER SNAPSHOTS
-- Immutable historical snapshots of holding balances and credit emission
CREATE TABLE IF NOT EXISTS holder_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES holder_accounts(wallet_address) ON DELETE CASCADE,
    balance_raw NUMERIC(38, 0) NOT NULL,
    balance_ui NUMERIC(24, 6) NOT NULL,
    tier VARCHAR(32) NOT NULL,
    credit_rate_per_hour INT NOT NULL,
    credits_accrued INT NOT NULL DEFAULT 0,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_holder_snapshots_wallet ON holder_snapshots(wallet_address, snapshot_at DESC);

-- 3. CREDIT ACCOUNTS
-- Authoritative financial balance store per wallet with strict invariant constraints
CREATE TABLE IF NOT EXISTS credit_accounts (
    wallet_address VARCHAR(64) PRIMARY KEY REFERENCES holder_accounts(wallet_address) ON DELETE CASCADE,
    credit_account_id VARCHAR(64) UNIQUE NOT NULL,
    earned NUMERIC(38, 0) NOT NULL DEFAULT 0,
    used NUMERIC(38, 0) NOT NULL DEFAULT 0,
    available NUMERIC(38, 0) NOT NULL DEFAULT 0,
    transferred NUMERIC(38, 0) NOT NULL DEFAULT 0,
    redeemed NUMERIC(38, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_credit_available_nonneg CHECK (available >= 0),
    CONSTRAINT chk_credit_earned_nonneg CHECK (earned >= 0),
    CONSTRAINT chk_credit_used_nonneg CHECK (used >= 0),
    CONSTRAINT chk_credit_transferred_nonneg CHECK (transferred >= 0),
    CONSTRAINT chk_credit_redeemed_nonneg CHECK (redeemed >= 0),
    CONSTRAINT chk_credit_accounting_sum CHECK (earned = used + transferred + redeemed + available)
);

-- 4. CREDIT LEDGER
-- Immutable double-entry financial audit trail of all credit movements
CREATE TABLE IF NOT EXISTS credit_ledger (
    id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL CHECK (type IN ('EARN', 'USE', 'TRANSFER_OUT', 'TRANSFER_IN', 'REDEEM', 'ADJUSTMENT')),
    amount NUMERIC(38, 0) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(38, 0) NOT NULL CHECK (balance_after >= 0),
    reference_id VARCHAR(128),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_wallet ON credit_ledger(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_ref ON credit_ledger(reference_id);

-- 5. LLM USAGE RECORDS
-- Detailed telemetry of AI model inference token consumption and credit cost
CREATE TABLE IF NOT EXISTS llm_usage (
    id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE,
    model VARCHAR(128) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    credits_deducted NUMERIC(38, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_wallet ON llm_usage(wallet_address, created_at DESC);

-- 6. REWARD CLAIMS
-- SOL redemption claims with strict 5% infrastructure and 95% manual allocations
CREATE TABLE IF NOT EXISTS reward_claims (
    claim_id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE,
    destination_wallet VARCHAR(64) NOT NULL,
    credits_redeemed NUMERIC(38, 0) NOT NULL CHECK (credits_redeemed > 0),
    claim_amount_lamports NUMERIC(38, 0) NOT NULL CHECK (claim_amount_lamports > 0),
    infrastructure_lamports NUMERIC(38, 0) NOT NULL CHECK (infrastructure_lamports >= 0),
    manual_lamports NUMERIC(38, 0) NOT NULL CHECK (manual_lamports >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_MANUAL_TRANSFER'
        CHECK (status IN ('PENDING_MANUAL_TRANSFER', 'MANUAL_TRANSFER_CONFIRMED', 'CANCELLED', 'REJECTED')),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    transaction_signature VARCHAR(128),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_claim_split_sum CHECK (infrastructure_lamports + manual_lamports = claim_amount_lamports)
);
CREATE INDEX IF NOT EXISTS idx_reward_claims_wallet ON reward_claims(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_claims_status ON reward_claims(status);
CREATE INDEX IF NOT EXISTS idx_reward_claims_txsig ON reward_claims(transaction_signature);

-- 7. REWARD ALLOCATIONS
-- Audit log of the 5% / 95% split allocations per claim
CREATE TABLE IF NOT EXISTS reward_allocations (
    id VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL REFERENCES reward_claims(claim_id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL CHECK (type IN ('INFRASTRUCTURE', 'MANUAL')),
    basis_points INT NOT NULL CHECK (basis_points > 0 AND basis_points <= 10000),
    amount_lamports NUMERIC(38, 0) NOT NULL CHECK (amount_lamports > 0),
    target_wallet VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reward_allocations_claim ON reward_allocations(claim_id);

-- 8. MANUAL TRANSFERS
-- Queue for operator external cold-wallet 95% fulfillments
CREATE TABLE IF NOT EXISTS manual_transfers (
    id VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL REFERENCES reward_claims(claim_id) ON DELETE CASCADE,
    recipient_wallet VARCHAR(64) NOT NULL,
    amount_lamports NUMERIC(38, 0) NOT NULL CHECK (amount_lamports > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    operator_wallet VARCHAR(64) NOT NULL,
    transaction_signature VARCHAR(128),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_transfers_claim ON manual_transfers(claim_id);
CREATE INDEX IF NOT EXISTS idx_manual_transfers_status ON manual_transfers(status);

-- 9. INFRASTRUCTURE ALLOCATIONS
-- 5% Operational reserve allocations credited to INFRASTRUCTURE_WALLET_PUBLIC_KEY
CREATE TABLE IF NOT EXISTS infrastructure_allocations (
    id VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL REFERENCES reward_claims(claim_id) ON DELETE CASCADE,
    infrastructure_wallet VARCHAR(64) NOT NULL,
    amount_lamports NUMERIC(38, 0) NOT NULL CHECK (amount_lamports > 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_infra_alloc_claim ON infrastructure_allocations(claim_id);

-- 10. IDEMPOTENCY KEYS
-- Request deduplication protection with cached responses
CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    wallet_address VARCHAR(64) NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 11. AUDIT EVENTS
-- Security and compliance audit log
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    wallet_address VARCHAR(64),
    actor_wallet VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_wallet ON audit_events(wallet_address, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE
-- Ensures that authenticated clients cannot read or write another wallet's data
-- =============================================================================

ALTER TABLE holder_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE infrastructure_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Allow users to view ONLY their own records
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holder_accounts_owner_policy') THEN
        CREATE POLICY holder_accounts_owner_policy ON holder_accounts
            FOR SELECT USING (auth.jwt()->>'sub' = wallet_address OR auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_accounts_owner_policy') THEN
        CREATE POLICY credit_accounts_owner_policy ON credit_accounts
            FOR SELECT USING (auth.jwt()->>'sub' = wallet_address OR auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_ledger_owner_policy') THEN
        CREATE POLICY credit_ledger_owner_policy ON credit_ledger
            FOR SELECT USING (auth.jwt()->>'sub' = wallet_address OR auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reward_claims_owner_policy') THEN
        CREATE POLICY reward_claims_owner_policy ON reward_claims
            FOR SELECT USING (auth.jwt()->>'sub' = wallet_address OR auth.role() = 'service_role');
    END IF;
END $$;
