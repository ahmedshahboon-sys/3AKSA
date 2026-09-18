-- Phase 3 economy foundation.
-- All monetary amounts are exact integer milli-LYD values: 1000 milli = 1 LYD.
-- Floating point is never used for balances or ledger postings.

CREATE TABLE wallet_accounts (
  id uuid PRIMARY KEY,
  owner_user_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  account_kind varchar(24) NOT NULL CHECK (account_kind IN ('user', 'platform_revenue', 'topup_clearing')),
  system_code varchar(64) UNIQUE,
  allow_negative boolean NOT NULL DEFAULT false,
  balance_milli bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (account_kind = 'user' AND owner_user_id IS NOT NULL AND system_code IS NULL AND allow_negative = false)
    OR
    (account_kind <> 'user' AND owner_user_id IS NULL AND system_code IS NOT NULL)
  ),
  CHECK (allow_negative OR balance_milli >= 0)
);

CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY,
  kind varchar(24) NOT NULL CHECK (kind IN ('transfer', 'purchase', 'gift', 'manual_topup', 'refund')),
  initiator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key uuid,
  reference_type varchar(48),
  reference_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiator_user_id, idempotency_key)
);

CREATE TABLE wallet_postings (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  amount_milli bigint NOT NULL CHECK (amount_milli <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_postings_account_created_idx
  ON wallet_postings (account_id, created_at DESC, id DESC);

CREATE INDEX wallet_transactions_initiator_created_idx
  ON wallet_transactions (initiator_user_id, created_at DESC, id DESC);

INSERT INTO wallet_accounts (
  id, owner_user_id, account_kind, system_code, allow_negative, balance_milli
) VALUES
  ('00000000-0000-4000-8000-000000000301', NULL, 'platform_revenue', 'platform_revenue', false, 0),
  ('00000000-0000-4000-8000-000000000302', NULL, 'topup_clearing', 'topup_clearing', true, 0)
ON CONFLICT (system_code) DO NOTHING;
