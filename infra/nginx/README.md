# Nginx integration

Production Nginx changes are not applied from this repository automatically.

The future integration must add a minimal isolated route for `/3aksa/` without replacing MARBO3A's existing Nginx configuration. API and Socket.IO paths remain configurable and must proxy only to 3AKSA loopback services.

No production Nginx edit is allowed without explicit owner authorization and a backup/reload validation plan.
