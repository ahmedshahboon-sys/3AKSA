BEGIN;

ALTER TABLE users
  ADD COLUMN bio varchar(240),
  ADD COLUMN nearby_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN mutual_suggestions_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE friend_requests (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX friend_requests_pending_pair_idx
  ON friend_requests (
    LEAST(sender_id::text, receiver_id::text),
    GREATEST(sender_id::text, receiver_id::text)
  )
  WHERE status = 'pending';

CREATE INDEX friend_requests_receiver_pending_idx
  ON friend_requests (receiver_id, created_at DESC)
  WHERE status = 'pending';

CREATE TABLE friendships (
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low_id, user_high_id),
  CHECK (user_low_id::text < user_high_id::text)
);

CREATE INDEX friendships_high_idx ON friendships (user_high_id, created_at DESC);

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id, created_at DESC);

CREATE TABLE user_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason varchar(32) NOT NULL CHECK (reason IN ('spam', 'harassment', 'impersonation', 'inappropriate', 'other')),
  details varchar(500),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> target_user_id)
);

CREATE INDEX user_reports_target_open_idx
  ON user_reports (target_user_id, created_at DESC)
  WHERE status IN ('open', 'reviewing');

COMMIT;
