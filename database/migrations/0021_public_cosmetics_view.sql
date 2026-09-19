-- Public projection of equipped cosmetic items.
-- Keeps user_equipment as the single source of truth while allowing hot social
-- queries to expose only the public cosmetic identifiers required by clients.

CREATE OR REPLACE VIEW user_public_cosmetics AS
SELECT
  u.id AS user_id,
  max(i.code) FILTER (WHERE e.slot='frame' AND i.status='active') AS frame_code,
  max(i.code) FILTER (WHERE e.slot='badge' AND i.status='active') AS badge_code,
  max(i.name) FILTER (WHERE e.slot='badge' AND i.status='active') AS badge_name,
  max(i.code) FILTER (WHERE e.slot='entry_sound' AND i.status='active') AS entry_sound_code
FROM users u
LEFT JOIN user_equipment e ON e.user_id=u.id
LEFT JOIN store_items i ON i.id=e.item_id
GROUP BY u.id;
