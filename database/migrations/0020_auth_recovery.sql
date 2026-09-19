-- Secure account recovery workflow without requiring paid SMS.
-- Public requests are non-enumerating: user_id may be NULL for decoy requests.

CREATE TABLE password_recovery_requests (
  id uuid PRIMARY KEY,
  public_id uuid NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64),
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','used','rejected','expired')),
  expires_at timestamptz NOT NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'approved' AND token_hash IS NOT NULL AND approved_at IS NOT NULL) OR status <> 'approved'),
  CHECK ((status = 'used' AND used_at IS NOT NULL) OR status <> 'used')
);

CREATE INDEX password_recovery_pending_idx
  ON password_recovery_requests (created_at DESC)
  WHERE status='pending' AND user_id IS NOT NULL;

CREATE INDEX password_recovery_expiry_idx
  ON password_recovery_requests (expires_at)
  WHERE status IN ('pending','approved');

CREATE INDEX auth_sessions_device_active_idx
  ON auth_sessions (user_id, device_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
