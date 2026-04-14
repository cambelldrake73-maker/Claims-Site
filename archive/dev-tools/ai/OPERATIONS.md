# Operations

RevCapture now supports local operator-triggered backups, audit export, and basic integrity checks.

## Backup Layout

Backups are written under:

`~/.revcapture/backups/<timestamp>/`

Each backup folder contains:

- `db.sqlite`
- `files/primary/`
- `files/legacy/` when a legacy storage root exists
- `metadata.json`

You can override the default backup root with `REVCAPTURE_BACKUP_ROOT`.

## Backup API

Operator-only endpoints:

- `POST /api/ops/backup`
- `GET /api/ops/integrity`
- `GET /api/audit/export`

`GET /api/audit/export` accepts:

- `date_from`
- `date_to`
- `action`
- `format=json|csv`

## Restore Process

Manual restore only. Stop the server before replacing live data.

1. Stop the RevCapture server.
2. Make a safety copy of the current live database file and file storage directories before changing anything.
3. Restore `db.sqlite` from the chosen backup folder over the live database path.
4. Restore `files/primary/` over the active file storage root.
5. If the backup contains `files/legacy/`, restore it over the legacy storage root as well.
6. Restart the server.
7. Run `GET /api/ops/integrity` and verify the returned checks are healthy before resuming normal use.

## Precautions

- Do not restore while the server is still accepting writes.
- Treat backup folders as sensitive data. They contain the full database and encrypted file blobs.
- A warning in `metadata.json` or `GET /api/ops/integrity` means the backup should be reviewed before relying on it.
