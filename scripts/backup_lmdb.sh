#!/bin/bash

# LMDB Database Backup Script
# This script creates a backup of the LMDB database

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$PROJECT_ROOT/api_gateway/chats/chat_database"
BACKUP_DIR="$PROJECT_ROOT/backups/lmdb"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="lmdb_backup_$DATE"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "==================================="
echo "LMDB Database Backup"
echo "==================================="
echo "Source: $DB_PATH"
echo "Destination: $BACKUP_DIR/$BACKUP_NAME"

# Check if the database exists
if [ ! -d "$DB_PATH" ]; then
    echo "Error: Database directory not found at $DB_PATH"
    exit 1
fi

# Check if the database files exist
if [ ! -f "$DB_PATH/data.mdb" ]; then
    echo "Error: Database file data.mdb not found"
    exit 1
fi

# Create backup
echo "Creating backup..."
cp -r "$DB_PATH" "$BACKUP_DIR/$BACKUP_NAME"

# Verify backup
if [ -d "$BACKUP_DIR/$BACKUP_NAME" ] && [ -f "$BACKUP_DIR/$BACKUP_NAME/data.mdb" ]; then
    echo "Backup created successfully!"
    
    # Get size information
    ORIGINAL_SIZE=$(du -sh "$DB_PATH" | cut -f1)
    BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
    
    echo "Original database size: $ORIGINAL_SIZE"
    echo "Backup size: $BACKUP_SIZE"
    
    # Cleanup old backups (keep the 5 most recent)
    echo "Cleaning up old backups (keeping 5 most recent)..."
    ls -t "$BACKUP_DIR" | tail -n +6 | xargs -I {} rm -rf "$BACKUP_DIR/{}"
    
    # List remaining backups
    REMAINING=$(ls -t "$BACKUP_DIR" | wc -l)
    echo "Remaining backups: $REMAINING"
else
    echo "Error: Backup failed!"
    exit 1
fi

echo "==================================="
echo "Backup Complete"
echo "==================================="