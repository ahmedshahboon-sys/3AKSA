CREATE TABLE app_releases (
  id uuid PRIMARY KEY,
  platform varchar(16) NOT NULL CHECK (platform IN ('android')),
  channel varchar(16) NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable','beta')),
  version_name varchar(40) NOT NULL,
  version_code integer NOT NULL CHECK (version_code > 0),
  min_supported_version_code integer NOT NULL DEFAULT 0 CHECK (min_supported_version_code >= 0),
  storage_key text NOT NULL UNIQUE,
  file_name varchar(160) NOT NULL,
  file_bytes bigint NOT NULL CHECK (file_bytes > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  notes varchar(2000),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  download_token uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, channel, version_code),
  CHECK ((status='published' AND published_at IS NOT NULL) OR status<>'published')
);

CREATE INDEX app_releases_latest_idx
  ON app_releases (platform,channel,version_code DESC)
  WHERE status='published';
