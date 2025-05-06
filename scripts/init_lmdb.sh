#!/bin/bash

# LMDB Database Initialization Script
# This script initializes the LMDB database for the API Gateway

echo "====================================="
echo "LMDB Database Initialization Script"
echo "====================================="

# Change to project root directory
cd "$(dirname "$0")/.." || { echo "Error: Could not change to project root"; exit 1; }
PROJECT_ROOT=$(pwd)
echo "Project root: $PROJECT_ROOT"

# Ensure we have the correct DB_TYPE in .env
echo "Checking .env file..."
if [ -f ".env" ]; then
    if grep -q "DB_TYPE=" ".env"; then
        echo "Updating DB_TYPE to lmdb in .env"
        sed -i '' -e 's/DB_TYPE=.*/DB_TYPE=lmdb  # Only LMDB is supported now/' .env
    else
        echo "Adding DB_TYPE=lmdb to .env"
        echo "DB_TYPE=lmdb  # Only LMDB is supported now" >> .env
    fi
    
    # Remove any SQLite references
    echo "Removing any SQLite DATABASE_URL entries..."
    sed -i '' -e '/DATABASE_URL/d' .env
else
    echo "Creating .env file with DB_TYPE=lmdb"
    echo "DB_TYPE=lmdb  # Only LMDB is supported now" > .env
fi

# Force initialize the LMDB database
echo "Initializing LMDB database..."
python api_gateway/scripts/force_init_lmdb.py

# Run tests
echo "Running tests to verify LMDB implementation..."
python api_gateway/scripts/test_lmdb.py

echo ""
echo "====================================="
echo "LMDB Database Initialization Complete!"
echo "====================================="
echo ""
echo "To start using the database, restart the API Gateway server."
echo ""
echo "Note: SQLite has been completely removed from the codebase."
echo "Only LMDB is supported now."
echo ""