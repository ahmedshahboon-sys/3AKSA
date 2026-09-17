# Health checks

Operational health/readiness integration belongs here. `/health` confirms the process is alive. `/ready` will evolve to verify PostgreSQL, Redis and storage readiness before production routing treats an instance as ready.
