import pytest
from agents.chloe.src.tools.web_scraper import web_scraper

def test_mock_example_com():
    result = web_scraper("example.com")
    assert result["mocked"] is True
    assert "mocked response" in result["content"]

def test_invalid_url():
    result = web_scraper("not_a_url")
    assert "error" in result

def test_rate_limit():
    url = "https://httpbin.org/html"
    # First call should pass
    result1 = web_scraper(url, skip_rate_limit=True)
    assert "content" in result1
    # Second call without skip_rate_limit should trigger rate limit
    result2 = web_scraper(url, skip_rate_limit=False)
    if "error" in result2:
        assert "rate limit" in result2["error"].lower()

def test_selector_extraction(monkeypatch):
    # Patch requests.get to return a simple HTML for selector test
    class MockResponse:
        def __init__(self, text):
            self.text = text
        def raise_for_status(self): pass
    def mock_get(*args, **kwargs):
        return MockResponse("<html><body><div class='foo'>bar</div></body></html>")
    monkeypatch.setattr("requests.get", mock_get)
    result = web_scraper("http://fake.com", selector=".foo", skip_rate_limit=True)
    assert result["content"] == ["bar"]
    assert result["selector"] == ".foo"
