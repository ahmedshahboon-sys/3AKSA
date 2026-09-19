-- Phase 8 Super Admin, moderation, MFA and audit foundation.

ALTER TABLE staff_roles
  DROP CONSTRAINT IF EXISTS staff_roles_role_check;

ALTER TABLE staff_roles
  ADD CONSTRAINT staff_roles_role_check
  CHECK (role IN ('super_admin','tv_admin','moderation_admin','finance_admin','release_admin'));

INSERT INTO reserved_usernames (username_key, reason) VALUES
  ('superadmin', 'system reserved'),
  ('superadministrator', 'system reserved'),
  ('helpdesk', 'system reserved'),
  ('staff', 'system reserved')
ON CONFLICT DO NOTHING;

ALTER TABLE users
  ADD COLUMN moderation_reason varchar(500),
  ADD COLUMN moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN moderated_at timestamptz;

ALTER TABLE room_bans
  ADD COLUMN expires_at timestamptz;

CREATE INDEX room_bans_expiry_idx
  ON room_bans (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE user_reports
  ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN review_note varchar(500),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE admin_mfa_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_mfa_pending (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_mfa_pending_expiry_idx
  ON admin_mfa_pending (expires_at);

CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(80) NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_actor_created_idx
  ON admin_audit_log (actor_user_id, created_at DESC, id DESC);

CREATE INDEX admin_audit_target_created_idx
  ON admin_audit_log (target_user_id, created_at DESC, id DESC)
  WHERE target_user_id IS NOT NULL;
