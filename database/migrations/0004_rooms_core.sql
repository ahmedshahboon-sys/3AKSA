BEGIN;

CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(60) NOT NULL,
  description varchar(240),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  gender_policy varchar(16) NOT NULL DEFAULT 'everyone' CHECK (gender_policy IN ('everyone', 'boys', 'girls')),
  max_users integer NOT NULL DEFAULT 50 CHECK (max_users BETWEEN 2 AND 500),
  tv_enabled boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'hidden', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rooms_active_list_idx ON rooms (status, visibility, created_at DESC);
CREATE INDEX rooms_name_idx ON rooms (lower(name));

CREATE TABLE room_moderators (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_moderators_user_idx ON room_moderators (user_id, room_id);

CREATE TABLE room_favorites (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_favorites_user_idx ON room_favorites (user_id, created_at DESC);

CREATE TABLE room_bans (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_bans_user_idx ON room_bans (user_id, room_id);

CREATE TABLE room_invites (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

COMMIT;
