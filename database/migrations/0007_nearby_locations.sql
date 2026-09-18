CREATE TABLE user_locations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m integer CHECK (accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 50000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_locations_fresh_idx
  ON user_locations (updated_at DESC);
