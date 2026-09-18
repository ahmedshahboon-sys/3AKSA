-- Phase 4 TV core.
-- Catalog management is restricted to staff roles. No role-granting HTTP route is created here.

CREATE TABLE staff_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL CHECK (role IN ('super_admin', 'tv_admin')),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX staff_roles_role_user_idx
  ON staff_roles (role, user_id);

CREATE TABLE tv_import_batches (
  id uuid PRIMARY KEY,
  source_type varchar(16) NOT NULL CHECK (source_type IN ('upload', 'url')),
  source_label varchar(160),
  source_host varchar(255),
  source_fingerprint char(64),
  rights_attested boolean NOT NULL CHECK (rights_attested = true),
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tv_import_batches_created_idx
  ON tv_import_batches (created_at DESC, id DESC);

CREATE TABLE tv_channels (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  group_name varchar(120),
  stream_url text NOT NULL UNIQUE,
  logo_url text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  rights_confirmed boolean NOT NULL DEFAULT false,
  rights_note varchar(500),
  import_batch_id uuid REFERENCES tv_import_batches(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CHECK (status <> 'active' OR rights_confirmed = true)
);

CREATE INDEX tv_channels_active_manual_idx
  ON tv_channels (sort_order, lower(name), id)
  WHERE status = 'active';

CREATE INDEX tv_channels_active_alpha_idx
  ON tv_channels (lower(name), id)
  WHERE status = 'active';

CREATE INDEX tv_channels_group_idx
  ON tv_channels (group_name, lower(name), id)
  WHERE status = 'active';

CREATE TABLE tv_admin_actions (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(40) NOT NULL,
  channel_id uuid REFERENCES tv_channels(id) ON DELETE SET NULL,
  import_batch_id uuid REFERENCES tv_import_batches(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tv_admin_actions_created_idx
  ON tv_admin_actions (created_at DESC, id DESC);

ALTER TABLE rooms
  ADD COLUMN tv_channel_id uuid REFERENCES tv_channels(id) ON DELETE SET NULL,
  ADD COLUMN tv_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN tv_updated_at timestamptz;

-- Phase 2 allowed tv_enabled without a selected channel. Phase 4 makes selection explicit.
UPDATE rooms SET tv_enabled = false WHERE tv_enabled = true;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_tv_enabled_requires_channel
  CHECK (tv_enabled = false OR tv_channel_id IS NOT NULL);

CREATE INDEX rooms_tv_channel_idx
  ON rooms (tv_channel_id)
  WHERE tv_channel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tv_channel_before_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE rooms
     SET tv_enabled = false,
         tv_channel_id = NULL,
         tv_updated_by = NULL,
         tv_updated_at = now()
   WHERE tv_channel_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER tv_channel_disable_rooms_before_delete
BEFORE DELETE ON tv_channels
FOR EACH ROW
EXECUTE FUNCTION tv_channel_before_delete();

CREATE OR REPLACE FUNCTION tv_channel_after_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE rooms
       SET tv_enabled = false,
           tv_updated_by = NULL,
           tv_updated_at = now()
     WHERE tv_channel_id = NEW.id
       AND tv_enabled = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tv_channel_disable_rooms_after_hide
AFTER UPDATE OF status ON tv_channels
FOR EACH ROW
EXECUTE FUNCTION tv_channel_after_update();
