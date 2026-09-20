-- Reserve the project owner username. The API only allows this name to be claimed
-- when the server-side one-time owner secret is supplied during registration.

INSERT INTO reserved_usernames (username_key, reason)
VALUES ('ahmed', 'project owner reserved')
ON CONFLICT (username_key) DO UPDATE SET reason = EXCLUDED.reason;
