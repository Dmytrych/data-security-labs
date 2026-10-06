# Lab 1 — HRU DAC shell

## Install

```sh
npm install
```

Requires Node.js 22+. With npm 11+, approve the native build scripts if prompted (`npm approve-scripts better-sqlite3 esbuild`).

## Run

```sh
npm run dev                 # development, http://localhost:3000
npm run build && npm start  # compiled
```

Environment variables: `PORT` (3000), `DB_PATH` (`data/lab1.db`), `TOKEN_TTL_HOURS` (8), `ADMIN_PASSWORD`.

## Seed

```sh
npm run seed
```

Creates `alice`, `bob`, `mallory` and a few files. Safe to run more than once.

## Trojan demo

```sh
npm run demo:trojan
```

Runs against a temporary database and does not touch `DB_PATH`.

## Default credentials

| Subject | Password |
|---|---|
| `admin` | value of `ADMIN_PASSWORD`, or `admin` if unset |
| `alice`, `bob`, `mallory` (after seeding) | `password` |
