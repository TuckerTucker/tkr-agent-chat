# LMDB Database Storage

This directory contains the LMDB (Lightning Memory-Mapped Database) files for the Multi-Agent Chat system.

## Directory Structure

- `chat_database/` - The LMDB database directory
  - `data.mdb` - The main database file containing all data
  - `lock.mdb` - Lock file used by LMDB for concurrency control

## Important Notes

1. **DO NOT** modify these files directly. Always use the application or provided scripts to interact with the database.

2. **DO NOT** delete these files unless performing a clean initialization.

3. **ALWAYS** stop the API Gateway server before performing any manual operations on these files.

## Backup Instructions

To backup the database:

```bash
# From the project root
./scripts/backup_lmdb.sh
```

This will create a timestamped backup in the `backups/lmdb/` directory.

## Initialization

If you need to initialize a new database:

```bash
# From the project root
./scripts/init_lmdb.sh
```

This will create a new LMDB database with default settings and initial data.

## Troubleshooting

If you encounter database errors:

1. Stop the API Gateway server
2. Check for lock issues: `lsof | grep chat_database`
3. Verify permissions: `ls -la chat_database/`
4. Consider running initialization: `python api_gateway/scripts/force_init_lmdb.py`

For more details, see the [LMDB Documentation](_planning/lmdb-migration-notes.md) file.