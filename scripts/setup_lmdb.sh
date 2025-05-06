#!/bin/bash

# LMDB Setup Script
# This script sets up and tests the LMDB database

echo "Setting up LMDB database..."

# Activate the virtual environment if it exists
if [ -f "start_env" ]; then
    echo "Activating virtual environment..."
    source start_env
fi

# Set database type to LMDB
echo "Setting database type to LMDB..."
python api_gateway/scripts/set_database_type.py lmdb

# Force initialize the LMDB database
echo "Initializing LMDB database..."
python api_gateway/scripts/force_init_lmdb.py

# Run basic test
echo "Running basic test..."
cd api_gateway/scripts
python basic_lmdb_test.py
cd ../..

echo "LMDB setup completed."
echo ""
echo "Next steps:"
echo "1. Run 'python api_gateway/scripts/test_lmdb.py' to run comprehensive tests"
echo "2. Restart the API Gateway server"
echo ""
echo "Note: SQLite support has been completely removed from the codebase."