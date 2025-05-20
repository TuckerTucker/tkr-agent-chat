import pytest
from unittest.mock import patch, MagicMock
from agents.chloe.src.tools.web_scraper import web_scraper

def test_invalid_url():
    result = web_scraper("not_a_url")
    assert "error" in result

@patch('requests.get')
def test_successful_scrape(mock_get):
    # Mock response with duplicates and unwanted content
    mock_response = MagicMock()
    mock_response.text = """
        <html>
            <head><title>Test Page</title></head>
            <body>
                <main>
                    <p>This is test content.</p>
                    <p>This is test content.</p>
                    <p>Unique content.</p>
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
    
    result = web_scraper("https://example.com")
    
    # Check result structure
    assert "error" not in result
    assert result["title"] == "Test Page"
    assert result["url"] == "https://example.com"
    assert result["metadata"] == {"displayType": "web-scraper"}
    
    # Check content is present
    assert "This is test content." in result["text"]
    assert "Unique content." in result["text"]
    
    # Check duplicates are removed
    assert result["text"].count("This is test content.") == 1
    
    # Check unwanted content is removed
    assert "What's Hot Now" not in result["text"]
    assert "Unwanted content" not in result["text"]
    assert "Read More" not in result["text"]
    assert "More unwanted content" not in result["text"]

@patch('requests.get')
def test_selector_extraction(mock_get, monkeypatch):
    # Mock response
    mock_response = MagicMock()
    mock_response.text = "<html><body><div class='foo'>bar</div></body></html>"
    mock_response.raise_for_status.return_value = None
    mock_get.return_value = mock_response
    
    result = web_scraper("http://fake.com", selector=".foo")
    
    assert "bar" in result["text"]
    assert result["url"] == "http://fake.com"
    assert result["metadata"] == {"displayType": "web-scraper"}
