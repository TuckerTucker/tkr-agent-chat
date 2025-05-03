"""
Unit tests for the Web Scraper Tool in Chloe Agent.
"""

import unittest
import logging
import requests
from unittest.mock import patch, MagicMock
from ..tools.web_scraper import web_scraper

class TestWebScraperTool(unittest.TestCase):
    """Test suite for the web_scraper tool."""

    def setUp(self):
        """Disable logging during tests."""
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        """Re-enable logging after tests."""
        logging.disable(logging.NOTSET)

    @patch('requests.get')
    def test_web_scraper_success(self, mock_get):
        """Test successful scraping."""
        mock_response = MagicMock()
        mock_response.text = """
            <html>
                <head><title>Test Title</title></head>
                <body>
                    <main>
                        <p>First paragraph.</p>
                        <p>Second paragraph.</p>
                        <p>First paragraph.</p>
                        <div>What's Hot Now</div>
                        <p>Unwanted content</p>
                        <p>Read More</p>
                        <p>More unwanted content</p>
                    </main>
                </body>
            </html>
        """
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = web_scraper("https://test.com")
        self.assertNotIn("error", result)
        self.assertEqual(result["title"], "Test Title")
        self.assertEqual(result["url"], "https://test.com")
        
        # Check that content is present
        self.assertIn("First paragraph.", result["text"])
        self.assertIn("Second paragraph.", result["text"])
        
        # Check that duplicates are removed
        self.assertEqual(result["text"].count("First paragraph."), 1)
        
        # Check that unwanted content is removed
        self.assertNotIn("What's Hot Now", result["text"])
        self.assertNotIn("Unwanted content", result["text"])
        self.assertNotIn("Read More", result["text"])
        self.assertNotIn("More unwanted content", result["text"])
        
        mock_get.assert_called_once_with(
            "https://test.com",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"},
            timeout=15
        )

    @patch('requests.get')
    def test_web_scraper_with_selector(self, mock_get):
        """Test scraping with a CSS selector."""
        mock_response = MagicMock()
        mock_response.text = """
            <html>
                <head><title>Test Title</title></head>
                <body>
                    <div class="content"><p>Target content</p></div>
                    <div class="other"><p>Ignore this</p></div>
                </body>
            </html>
        """
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = web_scraper("https://test.com", selectors={"content": ".content"})
        self.assertNotIn("error", result)
        self.assertEqual(result["title"], "Test Title")
        self.assertEqual(result["url"], "https://test.com")
        self.assertIn("Target content", result["text"])
        self.assertNotIn("Ignore this", result["text"])

    @patch('requests.get')
    def test_web_scraper_http_error(self, mock_get):
        """Test handling of HTTP errors."""
        mock_get.side_effect = requests.RequestException("HTTP Error")

        result = web_scraper("https://test.com")
        self.assertIn("error", result)
        self.assertEqual(result["error"], "Network error scraping 'https://test.com': HTTP Error")

    @patch('requests.get')
    def test_web_scraper_timeout(self, mock_get):
        """Test handling of request timeouts."""
        mock_get.side_effect = requests.Timeout("Timeout")

        result = web_scraper("https://test.com")
        self.assertIn("error", result)
        self.assertEqual(result["error"], "Request timed out while scraping 'https://test.com'.")

    def test_invalid_url(self):
        """Test handling of invalid URLs."""
        result = web_scraper("")
        self.assertIn("error", result)
        self.assertEqual(result["error"], "Invalid URL provided. Please provide a valid URL.")

if __name__ == '__main__':
    unittest.main()
