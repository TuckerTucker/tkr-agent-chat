#!/usr/bin/env python

"""
Very basic LMDB test script to verify the library is working properly
"""

import os
import sys
import lmdb
import msgpack
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("basic_lmdb_test")

def main():
    """Run a basic LMDB test."""
    try:
        # Create a test database path
        test_db_path = Path("./test_lmdb_db")
        test_db_path.mkdir(exist_ok=True)

        logger.info(f"Creating test LMDB environment at {test_db_path.absolute()}")

        # Open a test environment
        env = lmdb.Environment(
            path=str(test_db_path),
            map_size=10 * 1024 * 1024,  # 10MB
            max_dbs=2,
            create=True
        )

        logger.info("LMDB environment created successfully")

        # Create a test database
        with env:
            # Open/create a database
            logger.info("Opening test database")
            test_db = env.open_db(b'test_db')
            
            # Start a transaction
            logger.info("Starting transaction")
            with env.begin(write=True) as txn:
                # Put some data
                logger.info("Writing test data")
                txn.put(b'key1', msgpack.packb("value1"), db=test_db)
                txn.put(b'key2', msgpack.packb("value2"), db=test_db)
            
            # Read the data back
            logger.info("Reading test data")
            with env.begin() as txn:
                cursor = txn.cursor(db=test_db)
                for key, value in cursor:
                    logger.info(f"  {key.decode()}: {msgpack.unpackb(value)}")

        logger.info("LMDB basic test completed successfully!")
        logger.info(f"Cleaning up test database at {test_db_path.absolute()}")

        # Clean up
        env.close()
        import shutil
        shutil.rmtree(test_db_path)
        
        # Now try to use the db_factory
        logger.info("Testing database factory...")
        try:
            # Add parent directory to sys.path
            parent_dir = Path(__file__).resolve().parent.parent
            sys.path.append(str(parent_dir / "src"))
            
            # Set environment variable to use LMDB
            os.environ["DB_TYPE"] = "lmdb"
            
            # Import database factory
            import db_factory
            
            # Print database info
            db_info = db_factory.get_database_info()
            logger.info(f"Database factory info: {db_info}")
            
            # Try to list agents
            agents = db_factory.list_agent_cards()
            logger.info(f"Found {len(agents)} agents")
            
            logger.info("Database factory test completed successfully!")
            return True
        except Exception as e:
            logger.error(f"Error in database factory test: {e}", exc_info=True)
            return False
    except Exception as e:
        logger.error(f"Error in basic LMDB test: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)