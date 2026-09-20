ALTER TABLE room_messages
  DROP CONSTRAINT IF EXISTS room_messages_message_type_check,
  DROP CONSTRAINT IF EXISTS room_messages_text_content_check;

ALTER TABLE room_messages
  ALTER COLUMN text_content DROP NOT NULL,
  ADD COLUMN storage_key text,
  ADD COLUMN media_mime varchar(64),
  ADD COLUMN media_bytes integer,
  ADD COLUMN media_duration_ms integer,
  ADD COLUMN client_message_id uuid,
  ADD CONSTRAINT room_messages_message_type_check
    CHECK (message_type IN ('text', 'voice')),
  ADD CONSTRAINT room_messages_payload_check
    CHECK (
      (
        message_type = 'text'
        AND text_content IS NOT NULL
        AND length(btrim(text_content)) BETWEEN 1 AND 2000
        AND storage_key IS NULL
        AND media_mime IS NULL
        AND media_bytes IS NULL
        AND media_duration_ms IS NULL
      )
      OR
      (
        message_type = 'voice'
        AND text_content IS NULL
        AND storage_key IS NOT NULL
        AND media_mime IN ('audio/webm', 'audio/ogg', 'audio/mp4')
        AND media_bytes BETWEEN 1 AND 3145728
        AND media_duration_ms BETWEEN 250 AND 120000
      )
    );

CREATE UNIQUE INDEX room_messages_sender_client_id_uidx
  ON room_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

ALTER TABLE private_messages
  DROP CONSTRAINT IF EXISTS private_messages_message_type_check,
  DROP CONSTRAINT IF EXISTS private_messages_text_content_check;

ALTER TABLE private_messages
  ALTER COLUMN text_content DROP NOT NULL,
  ADD COLUMN storage_key text,
  ADD COLUMN media_mime varchar(64),
  ADD COLUMN media_bytes integer,
  ADD COLUMN media_duration_ms integer,
  ADD COLUMN client_message_id uuid,
  ADD CONSTRAINT private_messages_message_type_check
    CHECK (message_type IN ('text', 'voice')),
  ADD CONSTRAINT private_messages_payload_check
    CHECK (
      (
        message_type = 'text'
        AND text_content IS NOT NULL
        AND length(btrim(text_content)) BETWEEN 1 AND 2000
        AND storage_key IS NULL
        AND media_mime IS NULL
        AND media_bytes IS NULL
        AND media_duration_ms IS NULL
      )
      OR
      (
        message_type = 'voice'
        AND text_content IS NULL
        AND storage_key IS NOT NULL
        AND media_mime IN ('audio/webm', 'audio/ogg', 'audio/mp4')
        AND media_bytes BETWEEN 1 AND 3145728
        AND media_duration_ms BETWEEN 250 AND 120000
      )
    );

CREATE UNIQUE INDEX private_messages_sender_client_id_uidx
  ON private_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
