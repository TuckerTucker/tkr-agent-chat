"""
Tests for the message adapter service.

This module contains tests for the message standardization and format
conversion utilities provided by the message_adapter module.
"""

import unittest
import json
from datetime import datetime

# Import message adapter module
from ...services.message_adapter import (
    legacy_to_standard,
    standard_to_legacy,
    is_legacy_format,
    is_standard_format,
    normalize_message
)

class TestMessageAdapter(unittest.TestCase):
    """Test cases for message adapter functions."""

    def test_format_detection(self):
        """Test detection of message formats."""
        # Test legacy format detection
        legacy_message = {
            "id": "msg123",
            "sessionId": "session456",
            "type": "text",
            "text": "Hello world",
            "fromUser": True,
            "toAgent": "chloe"
        }
        
        self.assertTrue(is_legacy_format(legacy_message))
        self.assertFalse(is_standard_format(legacy_message))
        
        # Test standardized format detection
        standard_message = {
            "id": "msg123",
            "session_id": "session456",
            "type": "text",
            "content": "Hello world",
            "from_user": True,
            "to_agent": "chloe"
        }
        
        self.assertTrue(is_standard_format(standard_message))
        self.assertFalse(is_legacy_format(standard_message))
        
        # Test ambiguous message
        ambiguous_message = {
            "id": "msg123",
            "text": "Hello world"
        }
        
        self.assertFalse(is_standard_format(ambiguous_message))
        self.assertFalse(is_legacy_format(ambiguous_message))

    def test_legacy_to_standard_conversion(self):
        """Test conversion from legacy to standardized format."""
        legacy_message = {
            "id": "msg123",
            "sessionId": "session456",
            "type": "text",
            "text": "Hello world",
            "fromUser": True,
            "toAgent": "chloe",
            "timestamp": "2023-05-01T12:00:00Z"
        }
        
        standard_message = legacy_to_standard(legacy_message)
        
        self.assertEqual(standard_message["id"], "msg123")
        self.assertEqual(standard_message["session_id"], "session456")
        self.assertEqual(standard_message["type"], "text")
        self.assertEqual(standard_message["content"], "Hello world")
        self.assertTrue(standard_message["from_user"])
        self.assertEqual(standard_message["to_agent"], "chloe")
        self.assertEqual(standard_message["timestamp"], "2023-05-01T12:00:00Z")

    def test_standard_to_legacy_conversion(self):
        """Test conversion from standardized to legacy format."""
        standard_message = {
            "id": "msg123",
            "session_id": "session456",
            "type": "text",
            "content": "Hello world",
            "from_user": True,
            "to_agent": "chloe",
            "timestamp": "2023-05-01T12:00:00Z"
        }
        
        legacy_message = standard_to_legacy(standard_message)
        
        self.assertEqual(legacy_message["id"], "msg123")
        self.assertEqual(legacy_message["sessionId"], "session456")
        self.assertEqual(legacy_message["type"], "text")
        self.assertEqual(legacy_message["text"], "Hello world")
        self.assertEqual(legacy_message["content"], "Hello world")
        self.assertTrue(legacy_message["fromUser"])
        self.assertEqual(legacy_message["toAgent"], "chloe")
        self.assertEqual(legacy_message["timestamp"], "2023-05-01T12:00:00Z")

    def test_normalize_ambiguous_message(self):
        """Test normalization of ambiguous messages."""
        ambiguous_message = {
            "id": "msg123",
            "text": "Hello world"
        }
        
        normalized = normalize_message(ambiguous_message)
        
        self.assertEqual(normalized["id"], "msg123")
        self.assertEqual(normalized["content"], "Hello world")
        self.assertTrue("session_id" in normalized)
        self.assertTrue("type" in normalized)
        self.assertTrue("timestamp" in normalized)

    def test_context_message_conversion(self):
        """Test conversion of context update messages."""
        legacy_context = {
            "id": "ctx123",
            "sessionId": "session456",
            "type": "context_update",
            "contextId": "ctx1",
            "contextData": {"key": "value"},
            "fromAgent": "chloe",
            "targetAgents": ["phil"]
        }
        
        standardized = legacy_to_standard(legacy_context)
        self.assertEqual(standardized["type"], "context_update")
        self.assertEqual(standardized["context_id"], "ctx1")
        self.assertEqual(standardized["context_data"], {"key": "value"})
        self.assertEqual(standardized["from_agent"], "chloe")
        self.assertEqual(standardized["target_agents"], ["phil"])
        
        back_to_legacy = standard_to_legacy(standardized)
        self.assertEqual(back_to_legacy["type"], "context_update")
        self.assertEqual(back_to_legacy["contextId"], "ctx1")
        self.assertEqual(back_to_legacy["contextData"], {"key": "value"})
        self.assertEqual(back_to_legacy["fromAgent"], "chloe")
        self.assertEqual(back_to_legacy["targetAgents"], ["phil"])

    def test_agent_streaming_message_conversion(self):
        """Test conversion of streaming message flags."""
        legacy_streaming = {
            "id": "msg123",
            "sessionId": "session456",
            "type": "text",
            "fromAgent": "chloe",
            "text": "partial response",
            "streaming": True,
            "turnComplete": False
        }
        
        standardized = legacy_to_standard(legacy_streaming)
        self.assertTrue(standardized["streaming"])
        self.assertFalse(standardized["turn_complete"])
        
        standard_streaming = {
            "id": "msg123",
            "session_id": "session456",
            "type": "text",
            "from_agent": "chloe",
            "content": "partial response",
            "streaming": True,
            "turn_complete": False
        }
        
        legacy = standard_to_legacy(standard_streaming)
        self.assertTrue(legacy["streaming"])
        self.assertFalse(legacy["turnComplete"])


if __name__ == '__main__':
    unittest.main()