-- Group 7: privacy preferences, server-driven feature flags and short-lived telemetry.

ALTER TABLE users
  ADD COLUMN language varchar(5) NOT NULL DEFAULT 'ar'
    CHECK (language IN ('ar','en')),
  ADD COLUMN profile_visibility varchar(16) NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('public','friends')),
  ADD COLUMN nearby_consent_at timestamptz;

CREATE TABLE feature_flags (
  key varchar(40) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flags(key,enabled,metadata) VALUES
  ('tv',true,'{"optional":true}'::jsonb),
  ('store',true,'{"optional":true}'::jsonb),
  ('paid_features',true,'{"optional":true}'::jsonb),
  ('telemetry',true,'{"optional":true}'::jsonb),
  ('push',true,'{"optional":true}'::jsonb)
ON CONFLICT(key) DO NOTHING;

CREATE TABLE telemetry_events (
  id uuid PRIMARY KEY,
  event_type varchar(64) NOT NULL,
  route varchar(160) NOT NULL,
  app_version varchar(40) NOT NULL,
  platform varchar(24) NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (expires_at <= created_at + interval '24 hours')
);

CREATE INDEX telemetry_events_expiry_idx
  ON telemetry_events(expires_at);

CREATE INDEX telemetry_events_dashboard_idx
  ON telemetry_events(event_type,app_version,platform,created_at DESC);
