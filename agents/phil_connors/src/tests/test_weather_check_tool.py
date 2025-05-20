"""
Unit tests for the Weather Check Tool in phil_connors Agent.
"""

import unittest
import os
import logging
import requests
from unittest.mock import patch, MagicMock

from ..tools.weather_check import weather_check
from agents.common.tool_errors import ToolErrorCodes

# Store original API key value if it exists
ORIGINAL_API_KEY = os.getenv("OPENWEATHER_API_KEY")

class TestWeatherCheckTool(unittest.TestCase):
    """Test suite for the weather_check tool."""

    def setUp(self):
        """Disable logging and set a dummy API key for tests."""
        logging.disable(logging.CRITICAL)
        # Set a dummy key for testing purposes
        os.environ["OPENWEATHER_API_KEY"] = "test_key_123"

    def tearDown(self):
        """Re-enable logging and restore original API key."""
        logging.disable(logging.NOTSET)
        if ORIGINAL_API_KEY is None:
            # If it wasn't set before, remove the dummy key
            if "OPENWEATHER_API_KEY" in os.environ:
                 del os.environ["OPENWEATHER_API_KEY"]
        else:
            # Otherwise, restore the original value
            os.environ["OPENWEATHER_API_KEY"] = ORIGINAL_API_KEY

    @patch('requests.get')
    def test_weather_check_success(self, mock_get):
        """Test successful weather fetching."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "cod": 200,
            "name": "London",
            "weather": [{"description": "clear sky", "icon": "01d"}],
            "main": {"temp": 15.0, "feels_like": 14.5, "humidity": 60},
            "wind": {"speed": 5.5}
        }
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = weather_check("London")
        
        self.assertNotIn("error", result)
        self.assertEqual(result["location"], "London")
        self.assertEqual(result["temperature_celsius"], 15.0)
        self.assertEqual(result["description"], "clear sky")
        mock_get.assert_called_once()
        call_args = mock_get.call_args[1] # Get keyword args
        self.assertEqual(call_args['params']['q'], "London")
        self.assertEqual(call_args['params']['appid'], "test_key_123")
        self.assertEqual(call_args['params']['units'], "metric")

    @patch('requests.get')
    def test_weather_check_api_error(self, mock_get):
        """Test handling of API error response."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"cod": 401, "message": "Invalid API key"}
        # Assume raise_for_status doesn't raise for 401 in this case (depends on API)
        mock_response.raise_for_status.return_value = None 
        mock_get.return_value = mock_response

        result = weather_check("Paris")
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.API_ERROR)
        self.assertIn("Invalid API key", result["message"])

    @patch('requests.get')
    def test_weather_check_http_error(self, mock_get):
        """Test handling of HTTP request errors."""
        mock_get.side_effect = requests.RequestException("Connection failed")

        result = weather_check("Tokyo")
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.CONNECTION_ERROR)
        self.assertIn("Network error", result["message"])
        self.assertIn("Connection failed", result["message"])

    @patch('requests.get')
    def test_weather_check_timeout(self, mock_get):
        """Test handling of request timeout."""
        mock_get.side_effect = requests.Timeout("Timeout")

        result = weather_check("Sydney")
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.TIMEOUT_ERROR)
        self.assertIn("timed out", result["message"])

    def test_weather_check_no_api_key(self):
        """Test behavior when API key is not configured."""
        del os.environ["OPENWEATHER_API_KEY"] # Temporarily remove key
        result = weather_check("Berlin")
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.MISSING_API_KEY)
        self.assertIn("OPENWEATHER_API_KEY", result["message"])
        os.environ["OPENWEATHER_API_KEY"] = "test_key_123" # Put it back for other tests

    def test_weather_check_invalid_location(self):
        """Test behavior with invalid location input."""
        result = weather_check("")
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.INVALID_PARAMETER)
        self.assertIn("Invalid parameter 'location'", result["message"])

        result = weather_check(None)  # type: ignore
        self.assertTrue(result.get("error"))
        self.assertEqual(result["error_code"], ToolErrorCodes.INVALID_PARAMETER)
        self.assertIn("Invalid parameter 'location'", result["message"])

if __name__ == '__main__':
    unittest.main()
