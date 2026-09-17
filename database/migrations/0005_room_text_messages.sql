BEGIN;

CREATE TABLE room_messages (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type varchar(16) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text')),
  text_content varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  delete_reason varchar(120),
  CHECK (length(btrim(text_content)) BETWEEN 1 AND 2000),
  CHECK (expires_at > created_at)
);

CREATE INDEX room_messages_live_history_idx
  ON room_messages (room_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX room_messages_expiry_idx
  ON room_messages (expires_at)
  WHERE deleted_at IS NULL;

COMMIT;
