CREATE TABLE users (
  id uuid PRIMARY KEY,
  username varchar(24) NOT NULL,
  username_normalized varchar(24) NOT NULL UNIQUE,
  display_name varchar(80) NOT NULL,
  phone_e164 varchar(20) NOT NULL UNIQUE,
  gender varchar(8) NOT NULL CHECK (gender IN ('boy', 'girl')),
  password_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reserved_usernames (
  username_key varchar(64) PRIMARY KEY,
  reason varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO reserved_usernames (username_key, reason) VALUES
  ('admin', 'system reserved'),
  ('administrator', 'system reserved'),
  ('system', 'system reserved'),
  ('support', 'system reserved'),
  ('moderator', 'system reserved'),
  ('mod', 'system reserved'),
  ('3aksa', 'brand reserved'),
  ('aksa', 'brand reserved'),
  ('عكسة', 'brand reserved')
ON CONFLICT DO NOTHING;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  device_id varchar(128),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE user_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id varchar(128) NOT NULL,
  platform varchar(24),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  blocked_at timestamptz,
  UNIQUE (user_id, installation_id)
);
