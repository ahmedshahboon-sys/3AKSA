CREATE TABLE manual_topup_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_milli bigint NOT NULL CHECK (amount_milli > 0),
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  payment_reference varchar(160),
  note varchar(500),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  ledger_transaction_id uuid UNIQUE REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'approved' AND reviewed_at IS NOT NULL AND ledger_transaction_id IS NOT NULL)
    OR
    (status <> 'approved')
  )
);

CREATE INDEX manual_topup_requests_user_created_idx
  ON manual_topup_requests (user_id, created_at DESC);

CREATE INDEX manual_topup_requests_pending_idx
  ON manual_topup_requests (created_at)
  WHERE status = 'pending';

CREATE TABLE store_items (
  id uuid PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  item_type varchar(24) NOT NULL
    CHECK (item_type IN ('frame', 'entry_sound', 'theme', 'sticker_pack', 'badge', 'gift', 'reaction')),
  name varchar(120) NOT NULL,
  description varchar(500),
  price_milli bigint NOT NULL CHECK (price_milli > 0),
  recipient_share_milli bigint NOT NULL DEFAULT 0 CHECK (recipient_share_milli >= 0),
  consumable boolean NOT NULL DEFAULT false,
  asset_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_share_milli <= price_milli),
  CHECK (
    (item_type IN ('gift', 'reaction') AND consumable = true)
    OR
    (item_type NOT IN ('gift', 'reaction') AND consumable = false AND recipient_share_milli = 0)
  )
);

CREATE INDEX store_items_public_idx
  ON store_items (item_type, name, id)
  WHERE status = 'active';

CREATE TABLE user_entitlements (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES store_items(id) ON DELETE RESTRICT,
  acquired_transaction_id uuid NOT NULL UNIQUE REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX user_entitlements_user_idx
  ON user_entitlements (user_id, acquired_at DESC);

CREATE TABLE user_equipment (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot varchar(24) NOT NULL CHECK (slot IN ('frame', 'entry_sound', 'theme', 'badge')),
  item_id uuid NOT NULL REFERENCES store_items(id) ON DELETE RESTRICT,
  equipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE gift_events (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL UNIQUE REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES store_items(id) ON DELETE RESTRICT,
  amount_milli bigint NOT NULL CHECK (amount_milli > 0),
  recipient_share_milli bigint NOT NULL CHECK (recipient_share_milli >= 0),
  platform_share_milli bigint NOT NULL CHECK (platform_share_milli >= 0),
  context_type varchar(24) CHECK (context_type IN ('profile', 'room', 'room_message', 'private_message')),
  context_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_share_milli + platform_share_milli = amount_milli)
);

CREATE INDEX gift_events_recipient_created_idx
  ON gift_events (recipient_user_id, created_at DESC);

INSERT INTO store_items (
  id, code, item_type, name, description, price_milli,
  recipient_share_milli, consumable, status, metadata
) VALUES (
  '00000000-0000-4000-8000-000000000303',
  'rose',
  'gift',
  'ورد',
  'هدية ورد مدفوعة',
  1000,
  500,
  true,
  'active',
  '{"currency":"LYD","platformShareMilli":500}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
