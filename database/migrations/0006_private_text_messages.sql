CREATE TABLE private_conversations (
  id uuid PRIMARY KEY,
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL CHECK (status IN ('pending', 'active', 'rejected')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id::text < user_high_id::text),
  CHECK (requested_by = user_low_id OR requested_by = user_high_id)
);

CREATE INDEX private_conversations_low_status_idx
  ON private_conversations (user_low_id, status, updated_at DESC);
CREATE INDEX private_conversations_high_status_idx
  ON private_conversations (user_high_id, status, updated_at DESC);

CREATE TABLE private_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES private_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type varchar(16) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text')),
  text_content varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (length(btrim(text_content)) BETWEEN 1 AND 2000),
  CHECK (expires_at > created_at)
);

CREATE INDEX private_messages_live_history_idx
  ON private_messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX private_messages_expiry_idx
  ON private_messages (expires_at)
  WHERE deleted_at IS NULL;
