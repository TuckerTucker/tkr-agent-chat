#!/usr/bin/env python

"""
Script to set the database type for the API Gateway.

This script creates/modifies the .env file to set the DB_TYPE environment variable.
Note: SQLite is no longer supported, only LMDB is available.

Usage:
    python set_database_type.py lmdb

Example:
    python set_database_type.py lmdb  # Use LMDB
"""

import sys
import os
from pathlib import Path

# Define valid database types - SQLite has been removed
VALID_DB_TYPES = ["lmdb"]

def main():
    """Set the database type in the .env file."""
    # Check command line arguments
    if len(sys.argv) != 2 or sys.argv[1].lower() not in VALID_DB_TYPES:
        print(f"Usage: python {sys.argv[0]} [{'|'.join(VALID_DB_TYPES)}]")
        sys.exit(1)
    
    # Get the requested database type
    db_type = sys.argv[1].lower()
    
    # Find the project root directory
    project_root = Path(__file__).resolve().parent.parent.parent
    
    # Path to .env file
    env_file_path = project_root / ".env"
    
    # Read existing .env file if it exists
    env_vars = {}
    if env_file_path.exists():
        with open(env_file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()
    
    # Set DB_TYPE
    env_vars["DB_TYPE"] = db_type
    
    # Remove SQLite related DATABASE_URL if it exists
    if "DATABASE_URL" in env_vars:
        del env_vars["DATABASE_URL"]
    
    # Write the .env file
    with open(env_file_path, "w") as f:
        for key, value in env_vars.items():
            f.write(f"{key}={value}\n")
    
    print(f"Database type set to '{db_type}' in {env_file_path}")
    print(f"Note: SQLite support has been completely removed from the codebase.")
    print(f"Restart the API Gateway for the change to take effect")

if __name__ == "__main__":
    main()