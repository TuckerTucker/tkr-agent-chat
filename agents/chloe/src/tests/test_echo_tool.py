"""
Unit tests for the Echo Tool in Chloe Agent.
"""

import unittest
import logging
from ..tools.echo import echo

class TestEchoTool(unittest.TestCase):
    """Test suite for the echo tool."""

    def setUp(self):
        """Disable logging during tests."""
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        """Re-enable logging after tests."""
        logging.disable(logging.NOTSET)

    def test_echo_success(self):
        """Test successful echoing of a string."""
        input_text = "Hello, world!"
        result = echo(input_text)
        self.assertEqual(result, input_text)

    def test_echo_empty_string(self):
        """Test echoing an empty string."""
        input_text = ""
        result = echo(input_text)
        self.assertEqual(result, input_text)

    def test_echo_non_string_input(self):
        """Test echoing non-string input raises TypeError."""
        with self.assertRaises(TypeError):
            echo(123)
        with self.assertRaises(TypeError):
            echo(None)
        with self.assertRaises(TypeError):
            echo(["list"])

if __name__ == '__main__':
    unittest.main()
