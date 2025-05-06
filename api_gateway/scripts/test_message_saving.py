#!/usr/bin/env python3
"""
Test script for database message saving in the API Gateway.

This script directly tests the database operations for saving and retrieving messages,
independent of Socket.IO messaging, to diagnose persistence issues.
"""

import os
import sys
import json
import uuid
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add project root to Python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

# Import project modules
from api_gateway.src.db import (
    create_session as db_create_session,
    get_session as db_get_session,
    create_message as db_create_message,
    get_message as db_get_message,
    get_session_messages as db_get_session_messages,
    init_database
)

class MessageDbTester:
    def __init__(self, init_db: bool = False):
        if init_db:
            logger.info("Initializing database with schema...")
            init_database()
            logger.info("Database initialized")
        
        # Create a test session
        self.session_id = str(uuid.uuid4())
        self.test_session = db_create_session(
            title=f"Test Session {datetime.utcnow().isoformat()}",
            session_id=self.session_id
        )
        logger.info(f"Created test session: {self.session_id}")
        
    def create_test_message(self, msg_type: str = "user", content: str = None) -> Dict[str, Any]:
        """Create a test message in the database."""
        message_uuid = str(uuid.uuid4())
        message_content = content or f"Test message at {datetime.utcnow().isoformat()}"
        
        # Prepare message data
        message_data = {
            'session_id': self.session_id,
            'type': msg_type,  # 'user' or 'agent'
            'agent_id': 'chloe' if msg_type == 'agent' else None,
            'parts': [{"type": "text", "content": message_content}],
            'message_metadata': {
                'timestamp': datetime.utcnow().isoformat(),
                'message_id': message_uuid,
                'test': True
            },
            'message_uuid': message_uuid,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Create message in database
        try:
            saved_message = db_create_message(message_data)
            logger.info(f"Created message with UUID: {saved_message['message_uuid']}")
            return saved_message
        except Exception as e:
            logger.error(f"Error creating message: {e}")
            raise
            
    def fetch_message(self, message_uuid: str) -> Optional[Dict[str, Any]]:
        """Retrieve a message by UUID."""
        try:
            message = db_get_message(message_uuid)
            if message:
                logger.info(f"Retrieved message {message_uuid}")
            else:
                logger.warning(f"Message {message_uuid} not found")
            return message
        except Exception as e:
            logger.error(f"Error retrieving message {message_uuid}: {e}")
            return None
            
    def get_session_messages(self) -> List[Dict[str, Any]]:
        """Get all messages for the test session."""
        try:
            messages = db_get_session_messages(self.session_id)
            if isinstance(messages, dict) and 'items' in messages:
                # Handle pagination format
                message_list = messages['items']
            else:
                # Handle simple list format
                message_list = messages
                
            logger.info(f"Retrieved {len(message_list)} messages for session {self.session_id}")
            return message_list
        except Exception as e:
            logger.error(f"Error retrieving session messages: {e}")
            return []
            
    def run_tests(self, num_messages: int = 5) -> Dict[str, Any]:
        """Run message persistence tests."""
        results = {
            "session_id": self.session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "tests": {}
        }
        
        # Test 1: Create user messages
        user_messages = []
        for i in range(num_messages):
            try:
                message = self.create_test_message(
                    msg_type="user", 
                    content=f"User test message #{i+1} at {datetime.utcnow().isoformat()}"
                )
                user_messages.append(message)
            except Exception as e:
                logger.error(f"Error in test 1 (create user messages), iteration {i+1}: {e}")
                
        results["tests"]["create_user_messages"] = {
            "success": len(user_messages) == num_messages,
            "expected": num_messages,
            "actual": len(user_messages),
            "messages": user_messages[:2]  # Include just first 2 for brevity
        }
        
        # Test 2: Create agent messages
        agent_messages = []
        for i in range(num_messages):
            try:
                message = self.create_test_message(
                    msg_type="agent", 
                    content=f"Agent test message #{i+1} at {datetime.utcnow().isoformat()}"
                )
                agent_messages.append(message)
            except Exception as e:
                logger.error(f"Error in test 2 (create agent messages), iteration {i+1}: {e}")
                
        results["tests"]["create_agent_messages"] = {
            "success": len(agent_messages) == num_messages,
            "expected": num_messages,
            "actual": len(agent_messages),
            "messages": agent_messages[:2]  # Include just first 2 for brevity
        }
        
        # Test 3: Retrieve specific messages
        if user_messages and agent_messages:
            # Try retrieving one user message and one agent message
            user_message_uuid = user_messages[0]["message_uuid"]
            agent_message_uuid = agent_messages[0]["message_uuid"]
            
            retrieved_user_message = self.fetch_message(user_message_uuid)
            retrieved_agent_message = self.fetch_message(agent_message_uuid)
            
            results["tests"]["retrieve_specific_messages"] = {
                "success": retrieved_user_message is not None and retrieved_agent_message is not None,
                "user_message": {
                    "uuid": user_message_uuid,
                    "found": retrieved_user_message is not None,
                    "content": retrieved_user_message["parts"][0]["content"] if retrieved_user_message else None
                },
                "agent_message": {
                    "uuid": agent_message_uuid,
                    "found": retrieved_agent_message is not None,
                    "content": retrieved_agent_message["parts"][0]["content"] if retrieved_agent_message else None
                }
            }
        else:
            results["tests"]["retrieve_specific_messages"] = {
                "success": False,
                "error": "No messages available to retrieve"
            }
            
        # Test 4: Get all session messages
        all_messages = self.get_session_messages()
        expected_count = len(user_messages) + len(agent_messages)
        
        results["tests"]["get_session_messages"] = {
            "success": len(all_messages) == expected_count,
            "expected": expected_count,
            "actual": len(all_messages),
            "message_types": {
                "user": len([m for m in all_messages if m.get("type") == "user"]),
                "agent": len([m for m in all_messages if m.get("type") == "agent"])
            }
        }
        
        # Calculate overall success
        results["success"] = all(
            test_result.get("success", False) 
            for test_result in results["tests"].values()
        )
        
        return results

def main():
    parser = argparse.ArgumentParser(description="Test message database operations")
    parser.add_argument("--init-db", action="store_true", help="Initialize database before testing")
    parser.add_argument("--messages", type=int, default=5, help="Number of test messages to create")
    args = parser.parse_args()
    
    tester = MessageDbTester(init_db=args.init_db)
    results = tester.run_tests(num_messages=args.messages)
    
    # Print results in a readable format
    print("\n========== MESSAGE DATABASE TEST RESULTS ==========")
    print(f"Session: {results['session_id']}")
    print(f"Overall Status: {'SUCCESS' if results['success'] else 'FAILURE'}")
    print("\nTests:")
    for test_name, test_result in results["tests"].items():
        success = test_result.get("success", False)
        print(f"  - {test_name}: {'SUCCESS' if success else 'FAILURE'}")
        
        if test_name == "create_user_messages" or test_name == "create_agent_messages":
            expected = test_result.get("expected", 0)
            actual = test_result.get("actual", 0)
            print(f"    Expected: {expected}, Actual: {actual}")
            
        elif test_name == "get_session_messages":
            expected = test_result.get("expected", 0)
            actual = test_result.get("actual", 0)
            user_count = test_result.get("message_types", {}).get("user", 0)
            agent_count = test_result.get("message_types", {}).get("agent", 0)
            print(f"    Expected: {expected}, Actual: {actual}")
            print(f"    User messages: {user_count}, Agent messages: {agent_count}")
            
    # Save results to file
    filename = f"message_db_test_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {filename}")

if __name__ == "__main__":
    main()