CREATE TABLE message_reactions (
  id uuid PRIMARY KEY,
  reactor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_code varchar(24) NOT NULL CHECK (reaction_code = 'like'),
  room_message_id uuid REFERENCES room_messages(id) ON DELETE CASCADE,
  private_message_id uuid REFERENCES private_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (room_message_id IS NOT NULL AND private_message_id IS NULL)
    OR
    (room_message_id IS NULL AND private_message_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX message_reactions_room_user_code_uidx
  ON message_reactions (room_message_id, reactor_user_id, reaction_code)
  WHERE room_message_id IS NOT NULL;

CREATE UNIQUE INDEX message_reactions_private_user_code_uidx
  ON message_reactions (private_message_id, reactor_user_id, reaction_code)
  WHERE private_message_id IS NOT NULL;

CREATE INDEX message_reactions_room_count_idx
  ON message_reactions (room_message_id, reaction_code)
  WHERE room_message_id IS NOT NULL;

CREATE INDEX message_reactions_private_count_idx
  ON message_reactions (private_message_id, reaction_code)
  WHERE private_message_id IS NOT NULL;
