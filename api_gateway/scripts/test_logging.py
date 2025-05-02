#!/usr/bin/env python3
"""
Test script to verify logging to a local directory works correctly.
This script initializes the logger and generates test logs at different levels.
"""

import os
import sys
import time
from datetime import datetime

# Add the parent directory to the Python path so we can import from api_gateway
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the logger service
from src.services.logger_service import logger_service, LoggerService

def main():
    """Generate test logs to verify logging configuration."""
    # Set a custom log directory for this test
    test_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    test_log_dir = os.path.abspath(os.path.join(os.getcwd(), 'logs', f'test_{test_timestamp}'))
    
    print(f"Testing logging to directory: {test_log_dir}")
    
    # Configure the logger with our test settings
    LoggerService.configure_root_logger(
        log_level='debug',
        console_output=True,
        file_output=True,
        log_filename='test_logging.log',
        log_dir=test_log_dir,
        max_file_size_mb=1,
        backup_count=3
    )
    
    # Get a logger for this module
    logger = logger_service.get_logger(__name__)
    
    # Log messages at different levels
    logger.debug("This is a DEBUG test message")
    logger.info("This is an INFO test message")
    logger.warning("This is a WARNING test message")
    logger.error("This is an ERROR test message")
    
    # Log with context
    logger_service.log_with_context(
        logger=logger,
        level="info",
        message="This is a test message with context",
        context={
            "test_id": "test123",
            "timestamp": datetime.now().isoformat(),
            "test_name": "logging_test"
        }
    )
    
    # Log an exception
    try:
        # Intentionally cause an exception
        result = 1 / 0
    except Exception as e:
        logger.exception("This is a test exception")
    
    # Generate enough logs to test rotation
    print("Generating logs for rotation testing...")
    for i in range(1000):
        logger.info(f"Test log message #{i} for rotation testing")
        if i % 100 == 0:
            print(f"  Generated {i} log messages...")
    
    # Check that log files were created
    log_file_path = os.path.join(test_log_dir, 'test_logging.log')
    error_log_path = os.path.join(test_log_dir, 'error_test_logging.log')
    
    print("\nTest completed.")
    print(f"Main log file should be at: {log_file_path}")
    print(f"Error log file should be at: {error_log_path}")
    
    # Verify file exists
    if os.path.exists(log_file_path):
        print(f"SUCCESS: Log file exists at {log_file_path}")
        print(f"Log file size: {os.path.getsize(log_file_path) / 1024:.2f} KB")
    else:
        print(f"ERROR: Log file not found at {log_file_path}")
    
    if os.path.exists(error_log_path):
        print(f"SUCCESS: Error log file exists at {error_log_path}")
        print(f"Error log file size: {os.path.getsize(error_log_path) / 1024:.2f} KB")
    else:
        print(f"ERROR: Error log file not found at {error_log_path}")
    
    # Check for rotated files
    rotated_files = [f for f in os.listdir(test_log_dir) if f.startswith('test_logging.log.') or f.startswith('error_test_logging.log.')]
    if rotated_files:
        print(f"SUCCESS: Found {len(rotated_files)} rotated log files")
        for f in rotated_files:
            print(f"  - {f}")
    else:
        print("NOTE: No rotated log files found. File may not have reached rotation threshold.")

if __name__ == "__main__":
    main()