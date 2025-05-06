#!/usr/bin/env python3
"""
Test script for context sharing between agents.
"""

import os
import sys
import requests
import json
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add project root to Python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

# Import project modules (optional, uncomment if needed)
# from api_gateway.src.services.context_service import context_service
# from api_gateway.src.db import get_shared_contexts, get_session_contexts

class ContextTester:
    def __init__(self, base_url: str = "http://localhost:8000", session_id: str = None):
        self.base_url = base_url
        self.session_id = session_id or self._create_test_session()
        
    def _create_test_session(self) -> str:
        """Create a test session if none provided."""
        try:
            response = requests.post(f"{self.base_url}/api/v1/sessions", json={
                "name": f"Test Session {datetime.now().isoformat()}"
            })
            response.raise_for_status()
            session_id = response.json().get("id")
            logger.info(f"Created test session: {session_id}")
            return session_id
        except Exception as e:
            logger.error(f"Error creating test session: {e}")
            # Return default value if session creation fails
            return "test-session-123"
            
    def _get_agents(self) -> List[Dict[str, Any]]:
        """Get list of available agents."""
        try:
            response = requests.get(f"{self.base_url}/api/v1/agents/")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error getting agents: {e}")
            return []
        
    def check_health(self) -> Dict[str, Any]:
        """Check server health status."""
        try:
            response = requests.get(f"{self.base_url}/api/v1/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error checking health: {e}")
            return {"status": "error", "error": str(e)}
            
    def test_a2a_context_sharing(self) -> Dict[str, Any]:
        """Test agent-to-agent context sharing directly."""
        try:
            # Get agent list
            agents = self._get_agents()
            if len(agents) < 2:
                return {"success": False, "error": "Need at least 2 agents to test context sharing"}
                
            agent1 = agents[0]["id"]
            agent2 = agents[1]["id"]
            
            logger.info(f"Testing context sharing between {agent1} and {agent2}")
            
            # Use the A2A test endpoint
            response = requests.post(
                f"{self.base_url}/a2a/test-context",
                params={
                    "source_agent_id": agent1,
                    "target_agent_id": agent2,
                    "session_id": self.session_id,
                    "content": f"Test context from {agent1} to {agent2} at {datetime.now().isoformat()}"
                }
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Context sharing test result: {'SUCCESS' if result.get('success') else 'FAILURE'}")
            return result
        except Exception as e:
            logger.error(f"Error in context sharing test: {e}")
            return {"success": False, "error": str(e)}
            
    def get_session_contexts(self) -> List[Dict[str, Any]]:
        """Get all contexts for the test session."""
        try:
            # Use the context API to get session contexts
            response = requests.get(
                f"{self.base_url}/api/v1/context/{self.session_id}",
                params={"limit": 100}
            )
            response.raise_for_status()
            contexts = response.json()
            logger.info(f"Found {len(contexts)} contexts in session {self.session_id}")
            return contexts
        except Exception as e:
            logger.error(f"Error getting session contexts: {e}")
            return []
            
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all context-related tests."""
        results = {
            "health": self.check_health(),
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "tests": {}
        }
        
        # Test A2A context sharing
        results["tests"]["a2a_context"] = self.test_a2a_context_sharing()
        
        # Get session contexts
        session_contexts = self.get_session_contexts()
        results["tests"]["session_contexts"] = {
            "count": len(session_contexts),
            "contexts": session_contexts[:5]  # Include just the first 5 for brevity
        }
        
        # Check overall success
        results["success"] = all(
            test_result.get("success", False) 
            for test_result in results["tests"].values()
            if isinstance(test_result, dict) and "success" in test_result
        )
        
        return results

def main():
    parser = argparse.ArgumentParser(description="Test context sharing between agents")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the API gateway")
    parser.add_argument("--session", default=None, help="Optional session ID to use")
    args = parser.parse_args()
    
    tester = ContextTester(base_url=args.url, session_id=args.session)
    results = tester.run_all_tests()
    
    # Print results in a readable format
    print("\n========== CONTEXT SHARING TEST RESULTS ==========")
    print(f"Server: {args.url}")
    print(f"Session: {results['session_id']}")
    print(f"Status: {'SUCCESS' if results.get('success') else 'FAILURE'}")
    print(f"Health: {results['health'].get('status', 'unknown')}")
    print("\nTests:")
    for test_name, test_result in results["tests"].items():
        if isinstance(test_result, dict) and "success" in test_result:
            print(f"  - {test_name}: {'SUCCESS' if test_result['success'] else 'FAILURE'}")
        else:
            print(f"  - {test_name}: {'SUCCESS' if test_result else 'FAILURE'}")
            
    # Save results to file
    with open("context_test_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to context_test_results.json")

if __name__ == "__main__":
    main()