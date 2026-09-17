# Public repository security model

3AKSA must remain safe if every committed source file becomes publicly readable.

Never commit production secrets, `.env` files, database/Redis credentials, private API tokens, SSH private keys, TLS private keys, VAPID private keys, Firebase service-account keys, APK signing keystores/passwords, database dumps, production logs, backups, or user data.

A secret that reaches Git history is treated as compromised even after deletion and must be rotated/revoked.

Fork pull requests must never receive production secrets. Production deployment workflows must stay separate from untrusted PR execution and require an explicitly trusted/manual path.
