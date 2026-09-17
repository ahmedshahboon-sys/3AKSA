# Database migrations

3AKSA owns a dedicated PostgreSQL database and dedicated database user. No migration in this directory may target MARBO3A tables or databases.

Rules:

- Migrations are append-only after release.
- Every destructive migration requires an explicit rollback/data-safety plan.
- Monetary values use PostgreSQL `numeric`/decimal semantics; never floating point.
- Constraints and indexes are part of the migration, not optional follow-up work.
- Production credentials and database dumps never belong in this repository.
