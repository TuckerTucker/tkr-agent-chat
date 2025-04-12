"""
Unit tests for the Web Scraper Tool in Chloe Agent.
"""

import unittest
import logging
from unittest.mock import patch, MagicMock
from ..tools.web_scraper import web_scraper, _extract_domain, _clean_text

class TestWebScraperTool(unittest.TestCase):
    """Test suite for the web_scraper tool."""

    def setUp(self):
        """Disable logging during tests."""
        logging.disable(logging.CRITICAL)

    def tearDown(self):
        """Re-enable logging after tests."""
        logging.disable(logging.NOTSET)

    def test_extract_domain(self):
        """Test domain extraction from URL."""
        self.assertEqual(_extract_domain("https://www.example.com/path"), "www.example.com")
        self.assertEqual(_extract_domain("http://example.com"), "example.com")
        with self.assertRaises(ValueError):
            _extract_domain("invalid-url")

    def test_clean_text(self):
        """Test text cleaning function."""
        text = "  Extra   spaces\n\nNewlines\r\n[Remove this] e-remove  © 2025 Subscribe now!  "
        expected = "Extra spaces Newlines"
        self.assertEqual(_clean_text(text), expected)

    @patch('requests.get')
    def test_web_scraper_success(self, mock_get):
        """Test successful scraping."""
        mock_response = MagicMock()
        mock_response.text = """
            <html><body>
                <header>Ignore</header>
                <main>
                    <h1>Title</h1>
                    <p>First paragraph.</p>
                    <p>Second paragraph with <a href="#">link</a>.</p>
                    <ul><li>Item 1</li><li>Item 2</li></ul>
                </main>
                <footer>Ignore</footer>
            </body></html>
        """
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = web_scraper("https://test.com")
        self.assertIn("content", result)
        self.assertIn("Title", result["content"])
        self.assertIn("First paragraph.", result["content"])
        self.assertIn("Second paragraph with link.", result["content"])
        self.assertIn("Item 1", result["content"])
        self.assertNotIn("Ignore", result["content"])
        self.assertEqual(result["url"], "https://test.com")
        mock_get.assert_called_once_with(
            "https://test.com", headers={"User-Agent": "Chloe-Agent/1.0"}, timeout=8
        )

    @patch('requests.get')
    def test_web_scraper_with_selector(self, mock_get):
        """Test scraping with a CSS selector."""
        mock_response = MagicMock()
        mock_response.text = """
            <html><body>
                <div class="content"><p>Target 1</p></div>
                <div class="other"><p>Ignore</p></div>
                <div class="content"><p>Target 2</p></div>
            </body></html>
        """
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = web_scraper("https://test.com", selector=".content p")
        self.assertEqual(result["content"], ["Target 1", "Target 2"])
        self.assertEqual(result["selector"], ".content p")
        self.assertEqual(result["url"], "https://test.com")

    @patch('requests.get')
    def test_web_scraper_selector_not_found(self, mock_get):
        """Test scraping when selector finds no elements."""
        mock_response = MagicMock()
        mock_response.text = "<html><body><p>Content</p></body></html>"
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        result = web_scraper("https://test.com", selector=".nonexistent")
        self.assertIsNone(result["content"])
        self.assertEqual(result["message"], "No elements found matching selector")
        self.assertEqual(result["selector"], ".nonexistent")

    @patch('requests.get')
    def test_web_scraper_http_error(self, mock_get):
        """Test handling of HTTP errors."""
        mock_get.side_effect = requests.RequestException("HTTP Error")

        result = web_scraper("https://test.com")
        self.assertIn("error", result)
        self.assertIn("HTTP error: HTTP Error", result["error"])
        self.assertEqual(result["url"], "https://test.com")

    @patch('requests.get')
    def test_web_scraper_timeout(self, mock_get):
        """Test handling of request timeouts."""
        mock_get.side_effect = requests.Timeout("Timeout")

        result = web_scraper("https://test.com", timeout=1)
        self.assertIn("error", result)
        self.assertIn("Request timeout after 1s", result["error"])
        self.assertEqual(result["url"], "https://test.com")

    @patch('agents.chloe.src.tools.web_scraper._should_rate_limit', return_value=True)
    def test_web_scraper_rate_limit(self, mock_rate_limit):
        """Test rate limiting behavior."""
        result = web_scraper("https://ratelimited.com")
        self.assertIn("error", result)
        self.assertIn("Rate limit exceeded for domain: ratelimited.com", result["error"])
        self.assertEqual(result["url"], "https://ratelimited.com")
        mock_rate_limit.assert_called_once_with("ratelimited.com")

if __name__ == '__main__':
    unittest.main()
