-- =============================================================================
-- Jev Brain: Burn-to-Boost Lifetime Reward Multiplier (2x / 3x / 5x)
-- Version: 002
-- Target: PostgreSQL / Supabase
-- Official Token Mint: AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump
--
-- One-time verified on-chain $JEVBRAIN burn permanently unlocks a lifetime
-- credit accrual multiplier for the wallet:
--   Level 1 (Base Holder)              → 1.0x (default)
--   Level 2 (Titan Boost)             → 2.0x (Phase 1, LIVE)
--   Level 3 (Apex Supercharge)        → 3.0x (Phase 2, future burn event)
--   Level 4 (Dynasty Overdrive)       → 5.0x (Phase 3, future whale burn event)
-- Only Level 2 is currently unlockable (MAX_ACTIVE_BOOST_LEVEL = 2).
-- =========================================================================

-- 1. HOLDER ACCOUNTS: permanent boost state columns
ALTER TABLE holder_accounts ADD COLUMN IF NOT EXISTS boost_level INT NOT NULL DEFAULT 1;
ALTER TABLE holder_accounts ADD COLUMN IF NOT EXISTS boost_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.0;
ALTER TABLE holder_accounts ADD COLUMN IF NOT EXISTS total_tokens_burned NUMERIC(38, 0) NOT NULL DEFAULT 0;
ALTER TABLE holder_accounts ADD COLUMN IF NOT EXISTS boost_activated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE holder_accounts ADD COLUMN IF NOT EXISTS last_burn_tx_hash VARCHAR(128) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_holder_accounts_boost ON holder_accounts(boost_level);

-- 2. TOKEN BURN RECEIPTS: immutable audit trail of verified burn claims
--    tx_signature is globally UNIQUE — each on-chain burn backs exactly one claim.
CREATE TABLE IF NOT EXISTS token_burn_receipts (
    id VARCHAR(64) PRIMARY KEY,
    wallet_address VARCHAR(64) NOT NULL REFERENCES holder_accounts(wallet_address) ON DELETE CASCADE,
    tier_at_burn INT NOT NULL,
    boost_level_unlocked INT NOT NULL,
    multiplier_awarded NUMERIC(4, 2) NOT NULL,
    tokens_burned_raw NUMERIC(38, 0) NOT NULL,
    tokens_burned_ui NUMERIC(24, 6) NOT NULL,
    tx_signature VARCHAR(128) UNIQUE NOT NULL,
    block_time BIGINT NOT NULL,
    burn_method VARCHAR(48) NOT NULL DEFAULT 'token_burn',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_burn_tokens_positive CHECK (tokens_burned_raw > 0),
    CONSTRAINT chk_burn_level_valid CHECK (boost_level_unlocked >= 2)
);
CREATE INDEX IF NOT EXISTS idx_burn_receipts_wallet ON token_burn_receipts(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_burn_receipts_sig ON token_burn_receipts(tx_signature);
