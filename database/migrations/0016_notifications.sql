CREATE TABLE user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  private_messages boolean NOT NULL DEFAULT true,
  message_requests boolean NOT NULL DEFAULT true,
  friend_requests boolean NOT NULL DEFAULT true,
  friend_accepts boolean NOT NULL DEFAULT true,
  room_alerts boolean NOT NULL DEFAULT true,
  wallet_events boolean NOT NULL DEFAULT true,
  admin_alerts boolean NOT NULL DEFAULT true,
  app_updates boolean NOT NULL DEFAULT true,
  message_sounds boolean NOT NULL DEFAULT true,
  ui_sounds boolean NOT NULL DEFAULT true,
  room_sounds boolean NOT NULL DEFAULT true,
  vibration_enabled boolean NOT NULL DEFAULT true,
  mute_all boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  title varchar(120) NOT NULL,
  body varchar(500) NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sound_key varchar(40),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX notifications_user_created_idx
  ON notifications (user_id, created_at DESC, id DESC);
CREATE INDEX notifications_expiry_idx
  ON notifications (expires_at);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id varchar(128) NOT NULL,
  platform varchar(16) NOT NULL CHECK (platform IN ('web','android')),
  endpoint_hash char(64) NOT NULL,
  encrypted_payload text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_error varchar(160),
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id, platform),
  UNIQUE (endpoint_hash)
);

CREATE INDEX push_subscriptions_user_enabled_idx
  ON push_subscriptions (user_id, enabled)
  WHERE enabled=true;

CREATE TABLE notification_deliveries (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL CHECK (status IN ('pending','sent','failed','expired')),
  error_code varchar(120),
  attempted_at timestamptz,
  PRIMARY KEY (notification_id, subscription_id)
);

CREATE INDEX notification_deliveries_pending_idx
  ON notification_deliveries (status, attempted_at)
  WHERE status IN ('pending','failed');
