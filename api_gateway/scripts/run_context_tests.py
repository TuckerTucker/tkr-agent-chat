#!/usr/bin/env python3
"""
Script to run the context sharing tests directly.
"""

import os
import sys
import asyncio
import pytest
from datetime import datetime

# Ensure project root is in path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

def run_test_module():
    """Run the context sharing tests module directly."""
    # Import the test module
    from api_gateway.src.tests.services import test_end_to_end_context
    
    # Create mock agents
    from api_gateway.src.tests.services.fixtures_context import mock_agents
    mock_agent_fixtures = mock_agents()
    
    # Import chat service and set agents
    from api_gateway.src.services.chat_service import chat_service
    chat_service.set_agents(mock_agent_fixtures)
    
    # Run the tests
    print("\n==== Running Context Sharing Tests ====\n")
    
    print("Testing DB-level context creation...")
    asyncio.run(test_end_to_end_context.test_context_creation_direct())
    
    print("\nTesting context service formatting...")
    asyncio.run(test_end_to_end_context.test_context_service_format(mock_agent_fixtures))
    
    print("\n==== Tests Completed ====\n")

def run_with_pytest():
    """Run the tests using pytest for proper setup/teardown."""
    test_file = os.path.join(PROJECT_ROOT, 'api_gateway', 'src', 'tests', 'services', 'test_end_to_end_context.py')
    
    # Run pytest with the test file
    pytest.main(['-xvs', test_file])

if __name__ == "__main__":
    # First ensure the database module is initialized
    from api_gateway.src.db import init_database
    init_database()
    
    # Choose how to run the tests
    run_method = os.environ.get('RUN_METHOD', 'direct')
    
    if run_method == 'pytest':
        run_with_pytest()
    else:
        run_test_module()