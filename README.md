# 3AKSA | عكسة

3AKSA is an independent lightweight social chat platform.

## Repository status

This repository is the official source repository for 3AKSA. The project is technically independent from MARBO3A. The initial web release is designed to run under `/3aksa/` through reverse-proxy path routing, while remaining portable to a standalone domain later.

## Core principles

- TypeScript + pnpm monorepo.
- React/Vite web and PWA.
- Capacitor Android application sharing the React UI where practical.
- Fastify API and Socket.IO realtime layer.
- PostgreSQL and Redis with strict isolation from MARBO3A.
- Modular monolith for V1.
- Configuration-driven base path and public URLs.
- No production secrets, credentials, signing keys, user data, dumps, or backups in Git.
- No production deployment without explicit authorization.
- No MARBO3A production changes without explicit authorization.

## Branches

- `main`: stable releases only.
- `develop`: integration/development branch.
- `feature/*`, `fix/*`, `chore/*`, `release/*`: short-lived work branches.

> Bootstrap note: the repository was initially empty, so the first commit initializes `main`; implementation work starts on `develop`.
