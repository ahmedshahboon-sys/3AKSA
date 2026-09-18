CREATE TABLE prayer_references (
  key varchar(40) PRIMARY KEY,
  name_ar varchar(120) NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone varchar(80) NOT NULL DEFAULT 'Africa/Tripoli',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO prayer_references (key,name_ar,latitude,longitude,timezone,sort_order) VALUES
  ('tripoli','طرابلس',32.8872,13.1913,'Africa/Tripoli',0),
  ('misrata','مصراتة',32.3754,15.0925,'Africa/Tripoli',1),
  ('benghazi','بنغازي',32.1167,20.0667,'Africa/Tripoli',2),
  ('al-bayda','البيضاء',32.7627,21.7551,'Africa/Tripoli',3),
  ('sabha','سبها',27.0377,14.4283,'Africa/Tripoli',4)
ON CONFLICT DO NOTHING;

CREATE TABLE prayer_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  calculation_method varchar(40) NOT NULL DEFAULT 'muslim_world_league',
  fajr_offset_minutes integer NOT NULL DEFAULT 0 CHECK (fajr_offset_minutes BETWEEN -60 AND 60),
  sunrise_offset_minutes integer NOT NULL DEFAULT 0 CHECK (sunrise_offset_minutes BETWEEN -60 AND 60),
  dhuhr_offset_minutes integer NOT NULL DEFAULT 0 CHECK (dhuhr_offset_minutes BETWEEN -60 AND 60),
  asr_offset_minutes integer NOT NULL DEFAULT 0 CHECK (asr_offset_minutes BETWEEN -60 AND 60),
  sunset_offset_minutes integer NOT NULL DEFAULT 0 CHECK (sunset_offset_minutes BETWEEN -60 AND 60),
  maghrib_offset_minutes integer NOT NULL DEFAULT 0 CHECK (maghrib_offset_minutes BETWEEN -60 AND 60),
  isha_offset_minutes integer NOT NULL DEFAULT 0 CHECK (isha_offset_minutes BETWEEN -60 AND 60),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO prayer_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE user_prayer_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reference_key varchar(40) NOT NULL DEFAULT 'tripoli' REFERENCES prayer_references(key) ON DELETE RESTRICT,
  prayer_alerts_enabled boolean NOT NULL DEFAULT true,
  prayer_sound_enabled boolean NOT NULL DEFAULT false,
  gentle_reminders_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prayer_schedule_cache (
  reference_key varchar(40) NOT NULL REFERENCES prayer_references(key) ON DELETE CASCADE,
  prayer_date date NOT NULL,
  settings_revision integer NOT NULL,
  schedule jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reference_key, prayer_date, settings_revision)
);

CREATE INDEX prayer_schedule_cache_date_idx
  ON prayer_schedule_cache (prayer_date, reference_key);

CREATE TABLE prayer_admin_actions (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(40) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prayer_admin_actions_created_idx
  ON prayer_admin_actions (created_at DESC, id DESC);
