#!/usr/bin/env python3
"""
Test script for Socket.IO message persistence in the API Gateway.

This script simulates the Socket.IO message flow to diagnose message persistence issues,
by:
1. Creating a session
2. Sending messages via Socket.IO
3. Checking database directly to verify persistence
4. Fetching messages via API to verify retrieval
"""

import os
import sys
import json
import uuid
import logging
import asyncio
import argparse
import socketio
import requests
from datetime import datetime
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add project root to Python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

# Import project modules only after adjusting path
def import_project_modules():
    """Import project modules after adjusting sys.path"""
    global db_get_session, db_get_session_messages
    
    try:
        from api_gateway.src.db import (
            get_session as db_get_session,
            get_session_messages as db_get_session_messages,
        )
        logger.info("Successfully imported project modules")
        return True
    except ImportError as e:
        logger.error(f"Failed to import project modules: {e}")
        return False

class SocketIOMessageTester:
    def __init__(self, base_url: str, session_id: Optional[str] = None):
        self.base_url = base_url
        self.api_url = f"{base_url}/api/v1"
        self.socket_url = base_url
        self.session_id = session_id or self._create_test_session()
        self.sio = None
        self.received_messages = []
        self.connection_status = "disconnected"
        self.message_success_counts = {"sent": 0, "received": 0, "ack": 0}
        
    def _create_test_session(self) -> str:
        """Create a test session if none provided."""
        try:
            response = requests.post(f"{self.api_url}/sessions", json={
                "title": f"Socket.IO Message Test {datetime.now().isoformat()}"
            })
            response.raise_for_status()
            session_id = response.json().get("id")
            logger.info(f"Created test session: {session_id}")
            return session_id
        except Exception as e:
            logger.error(f"Error creating test session: {e}")
            # Generate a fallback UUID
            session_id = str(uuid.uuid4())
            logger.info(f"Using fallback test session ID: {session_id}")
            return session_id
    
    def _get_session_messages_via_api(self) -> List[Dict[str, Any]]:
        """Get session messages using the API."""
        try:
            response = requests.get(
                f"{self.api_url}/sessions/{self.session_id}/messages",
                params={"limit": 100, "direction": "desc"}
            )
            response.raise_for_status()
            data = response.json()
            
            # Handle both paginated and non-paginated responses
            if isinstance(data, dict) and "items" in data:
                messages = data["items"]
            else:
                messages = data
                
            logger.info(f"Retrieved {len(messages)} messages via API for session {self.session_id}")
            return messages
        except Exception as e:
            logger.error(f"Error retrieving messages via API: {e}")
            return []
    
    def _get_session_messages_via_db(self) -> List[Dict[str, Any]]:
        """Get session messages directly from the database."""
        try:
            # Check if db modules are available
            if not 'db_get_session_messages' in globals():
                logger.warning("Direct database access unavailable - import failed")
                return []
                
            messages = db_get_session_messages(self.session_id)
            
            # Handle both paginated and non-paginated responses
            if isinstance(messages, dict) and "items" in messages:
                message_list = messages["items"]
            else:
                message_list = messages
                
            logger.info(f"Retrieved {len(message_list)} messages via DB for session {self.session_id}")
            return message_list
        except Exception as e:
            logger.error(f"Error retrieving messages via DB: {e}")
            return []
    
    async def connect_socket_io(self):
        """Connect to Socket.IO server."""
        logger.info(f"Connecting to Socket.IO server at {self.socket_url}")
        
        # Create new Socket.IO client
        self.sio = socketio.AsyncClient(logger=True, engineio_logger=True)
        
        # Set up event handlers
        @self.sio.event
        async def connect():
            logger.info("Connected to Socket.IO server")
            self.connection_status = "connected"
            
            # Join session room after connecting
            await self.sio.emit('join', {"type": "session", "id": self.session_id})
            logger.info(f"Joined session room: {self.session_id}")
        
        @self.sio.event
        async def disconnect():
            logger.info("Disconnected from Socket.IO server")
            self.connection_status = "disconnected"
        
        @self.sio.event
        async def connect_error(data):
            logger.error(f"Connection error: {data}")
            self.connection_status = "error"
        
        @self.sio.event
        async def message(data):
            logger.info(f"Received message: {data}")
            self.received_messages.append(data)
            self.message_success_counts["received"] += 1
            
        # Additional Socket.IO event handlers
        @self.sio.event
        async def joined(data):
            logger.info(f"Joined room: {data}")
            
        # Connect to server
        try:
            await self.sio.connect(
                self.socket_url,
                transports=['polling', 'websocket'],
                socketio_path='/socket.io',
                wait_timeout=10,
                namespaces=['/'],
                auth={"session_id": self.session_id},
                query={"session_id": self.session_id}
            )
            logger.info("Socket.IO connection established")
            return True
        except Exception as e:
            logger.error(f"Error connecting to Socket.IO server: {e}")
            self.connection_status = "error"
            return False
    
    async def disconnect_socket_io(self):
        """Disconnect from Socket.IO server."""
        if self.sio and self.sio.connected:
            await self.sio.disconnect()
            logger.info("Socket.IO client disconnected")
    
    async def send_test_messages(self, num_messages: int = 5, agent_id: str = "chloe"):
        """Send test messages via Socket.IO."""
        if not self.sio or not self.sio.connected:
            logger.error("Cannot send messages: not connected to Socket.IO server")
            return False
        
        sent_messages = []
        
        for i in range(num_messages):
            message_id = str(uuid.uuid4())
            message_content = f"Test message #{i+1} sent at {datetime.now().isoformat()}"
            
            # Create message in standardized format
            message = {
                "id": message_id,
                "type": "text",
                "session_id": self.session_id,
                "from_user": "test_client",
                "to_agent": agent_id,  # Direct to specific agent
                "content": message_content,
                "timestamp": datetime.now().isoformat(),
                
                # Legacy fields for backwards compatibility
                "sessionId": self.session_id,
                "text": message_content,
                "toAgent": agent_id
            }
            
            try:
                logger.info(f"Sending message #{i+1}: {message_id}")
                
                # Send with acknowledgment
                ack = await self.sio.call('message', message, timeout=5)
                
                logger.info(f"Message #{i+1} acknowledgment: {ack}")
                
                # Track the message and its acknowledgment
                sent_messages.append({
                    "id": message_id,
                    "ack": ack,
                    "content": message_content,
                    "timestamp": message["timestamp"]
                })
                
                # Update success counts
                self.message_success_counts["sent"] += 1
                if ack and ack.get("status") in ["delivered", "sent"]:
                    self.message_success_counts["ack"] += 1
                
                # Small delay between messages
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"Error sending message #{i+1}: {e}")
        
        return sent_messages
    
    async def run_message_test(self, num_messages: int = 5, agent_id: str = "chloe") -> Dict[str, Any]:
        """Run the full message persistence test."""
        results = {
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "socket_url": self.socket_url,
            "api_url": self.api_url,
            "tests": {}
        }
        
        # Start fresh - verify no existing messages
        initial_db_messages = self._get_session_messages_via_db()
        initial_api_messages = self._get_session_messages_via_api()
        
        results["initial_state"] = {
            "db_message_count": len(initial_db_messages),
            "api_message_count": len(initial_api_messages)
        }
        
        # Test 1: Connect to Socket.IO
        try:
            connected = await self.connect_socket_io()
            results["tests"]["socket_connection"] = {
                "success": connected,
                "status": self.connection_status
            }
            
            if not connected:
                logger.error("Socket.IO connection failed, aborting remaining tests")
                results["success"] = False
                return results
        except Exception as e:
            logger.error(f"Error in Socket.IO connection test: {e}")
            results["tests"]["socket_connection"] = {
                "success": False,
                "error": str(e)
            }
            results["success"] = False
            return results
        
        # Test 2: Send messages
        try:
            sent_messages = await self.send_test_messages(num_messages, agent_id)
            results["tests"]["send_messages"] = {
                "success": len(sent_messages) == num_messages,
                "expected": num_messages,
                "actual": len(sent_messages),
                "messages": sent_messages
            }
        except Exception as e:
            logger.error(f"Error in message sending test: {e}")
            results["tests"]["send_messages"] = {
                "success": False,
                "error": str(e)
            }
        
        # Give time for messages to be processed and stored
        logger.info("Waiting for message processing...")
        await asyncio.sleep(3)
        
        # Test 3: Check message persistence in database
        if 'db_get_session_messages' in globals():
            try:
                db_messages = self._get_session_messages_via_db()
                
                # Count just user messages (our test messages, not including agent responses)
                user_messages = [m for m in db_messages if m.get("type") == "user"]
                
                results["tests"]["database_persistence"] = {
                    "success": len(user_messages) >= len(initial_db_messages) + num_messages,
                    "expected_new": num_messages,
                    "total_messages": len(db_messages),
                    "user_messages": len(user_messages),
                    "initial_messages": len(initial_db_messages)
                }
            except Exception as e:
                logger.error(f"Error in database persistence test: {e}")
                results["tests"]["database_persistence"] = {
                    "success": False,
                    "error": str(e)
                }
        else:
            results["tests"]["database_persistence"] = {
                "success": None,
                "skipped": True,
                "reason": "Direct database access unavailable"
            }
        
        # Test 4: Check message retrieval via API
        try:
            api_messages = self._get_session_messages_via_api()
            
            # Count just user messages (our test messages, not agent responses)
            user_messages = [m for m in api_messages if m.get("role") == "user"]
            
            results["tests"]["api_retrieval"] = {
                "success": len(user_messages) >= len(initial_api_messages) + num_messages,
                "expected_new": num_messages,
                "total_messages": len(api_messages),
                "user_messages": len(user_messages),
                "initial_messages": len(initial_api_messages)
            }
        except Exception as e:
            logger.error(f"Error in API retrieval test: {e}")
            results["tests"]["api_retrieval"] = {
                "success": False,
                "error": str(e)
            }
        
        # Test 5: Check received messages (agent responses)
        try:
            # Wait a bit more for agent responses
            logger.info("Waiting for agent responses...")
            await asyncio.sleep(2)
            
            results["tests"]["agent_responses"] = {
                "success": len(self.received_messages) > 0,
                "count": len(self.received_messages),
                "messages": self.received_messages[:2] if self.received_messages else []
            }
        except Exception as e:
            logger.error(f"Error in agent response test: {e}")
            results["tests"]["agent_responses"] = {
                "success": False,
                "error": str(e)
            }
        
        # Disconnect from Socket.IO
        try:
            await self.disconnect_socket_io()
        except Exception as e:
            logger.warning(f"Error disconnecting from Socket.IO server: {e}")
        
        # Add message success counts
        results["message_counts"] = self.message_success_counts
        
        # Calculate overall success
        test_success_values = [
            test_result.get("success")
            for test_result in results["tests"].values()
            if test_result.get("success") is not None
        ]
        
        if test_success_values:
            results["success"] = all(test_success_values)
        else:
            results["success"] = False
        
        return results

async def main():
    # Import project modules
    import_success = import_project_modules()
    
    parser = argparse.ArgumentParser(description="Test Socket.IO message persistence")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the API gateway")
    parser.add_argument("--session", default=None, help="Optional session ID to use")
    parser.add_argument("--messages", type=int, default=5, help="Number of test messages to send")
    parser.add_argument("--agent", default="chloe", help="Agent ID to send messages to")
    args = parser.parse_args()
    
    # Create tester and run tests
    tester = SocketIOMessageTester(base_url=args.url, session_id=args.session)
    results = await tester.run_message_test(num_messages=args.messages, agent_id=args.agent)
    
    # Print results in a readable format
    print("\n========== SOCKET.IO MESSAGE TEST RESULTS ==========")
    print(f"Server: {args.url}")
    print(f"Session: {results['session_id']}")
    print(f"Status: {'SUCCESS' if results.get('success') else 'FAILURE'}")
    
    print("\nInitial State:")
    print(f"  DB Messages: {results['initial_state']['db_message_count']}")
    print(f"  API Messages: {results['initial_state']['api_message_count']}")
    
    print("\nTests:")
    for test_name, test_result in results["tests"].items():
        if test_result.get("skipped"):
            print(f"  - {test_name}: SKIPPED - {test_result.get('reason')}")
            continue
            
        success = test_result.get("success")
        if success is None:
            status = "UNKNOWN"
        else:
            status = "SUCCESS" if success else "FAILURE"
            
        print(f"  - {test_name}: {status}")
        
        if test_name == "socket_connection":
            print(f"    Connection status: {test_result.get('status')}")
            
        elif test_name == "send_messages":
            expected = test_result.get("expected", 0)
            actual = test_result.get("actual", 0)
            print(f"    Expected to send: {expected}, Actually sent: {actual}")
            
        elif test_name == "database_persistence":
            expected = test_result.get("expected_new", 0)
            total = test_result.get("total_messages", 0)
            user = test_result.get("user_messages", 0)
            initial = test_result.get("initial_messages", 0)
            print(f"    Expected new: {expected}, Total: {total}, User: {user}, Initial: {initial}")
            
        elif test_name == "api_retrieval":
            expected = test_result.get("expected_new", 0)
            total = test_result.get("total_messages", 0)
            user = test_result.get("user_messages", 0)
            initial = test_result.get("initial_messages", 0)
            print(f"    Expected new: {expected}, Total: {total}, User: {user}, Initial: {initial}")
            
        elif test_name == "agent_responses":
            count = test_result.get("count", 0)
            print(f"    Received {count} agent response messages")
    
    print("\nMessage Counts:")
    sent = results["message_counts"].get("sent", 0)
    ack = results["message_counts"].get("ack", 0)
    received = results["message_counts"].get("received", 0)
    print(f"  Sent: {sent}")
    print(f"  Acknowledged: {ack}")
    print(f"  Received: {received}")
    
    # Save results to file
    filename = f"socketio_message_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w") as f:
        # Convert to JSON-serializable format
        serializable_results = results.copy()
        
        # Handle any non-serializable objects
        if "received_messages" in serializable_results:
            serializable_results["received_messages"] = [
                {k: str(v) if not isinstance(v, (str, int, float, bool, list, dict, type(None))) else v
                for k, v in msg.items()}
                for msg in serializable_results["received_messages"]
            ]
            
        json.dump(serializable_results, f, indent=2, default=str)
    print(f"\nResults saved to {filename}")

if __name__ == "__main__":
    asyncio.run(main())