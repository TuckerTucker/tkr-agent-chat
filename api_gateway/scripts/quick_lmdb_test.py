#!/usr/bin/env python

"""
Quick test script for LMDB database
"""

import sys
import os
from pathlib import Path

# Add parent directory to sys.path
parent_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_dir / "src"))

import db_lmdb

print("Testing LMDB database...")

# List agent cards
agents = db_lmdb.list_agent_cards()
print(f"Found {len(agents)} agents:")
for agent in agents:
    print(f"  - {agent.get('name', 'Unknown')} ({agent.get('id', 'Unknown')})")

# Create a test session
import uuid
test_session_id = str(uuid.uuid4())
session = db_lmdb.create_session(title="Quick Test Session", session_id=test_session_id)
print(f"Created test session: {session['id']}")

# List sessions
sessions = db_lmdb.list_sessions(limit=5)
print(f"First 5 sessions: {[s.get('id') for s in sessions]}")

# Delete test session
result = db_lmdb.delete_session(test_session_id)
print(f"Deleted test session: {result}")

print("LMDB test completed successfully!")