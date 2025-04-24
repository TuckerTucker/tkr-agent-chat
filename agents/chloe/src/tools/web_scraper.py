"""
Web Scraper Tool for Chloe Agent

Fetches and extracts plain text content from web pages.
"""

import requests
import logging
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup
import re

# Configure logger
logger = logging.getLogger(__name__)

def web_scraper(url: str, selectors: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Scrapes plain text content from a specified URL.

    Args:
        url: The URL to scrape
        selectors: Optional CSS selectors to extract specific content

    Returns:
        A dictionary containing the scraped text content or an error message.
    """
    logger.info(f"Web scraper tool invoked for URL: '{url}'")
    
    if not url or not isinstance(url, str):
        error_msg = "Invalid URL provided. Please provide a valid URL."
        logger.error(error_msg)
        return {"error": error_msg}

    try:
        # Add user agent to avoid being blocked
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract basic page information
        title = soup.title.string if soup.title else None
        
        # Extract main content based on common patterns
        main_content = None
        
        # Try to find main content using selectors if provided
        if selectors and selectors.get('content'):
            main_content = soup.select_one(selectors['content'])
        
        # If no selector provided or selector didn't match, use heuristics
        if not main_content:
            # Try common content containers
            for selector in ['main', 'article', '#content', '.content', '#main', '.main']:
                main_content = soup.select_one(selector)
                if main_content:
                    break
        
        # If still no content found, use body as fallback
        if not main_content:
            main_content = soup.body
        
        # Extract text content
        text_content = main_content.get_text(separator='\n', strip=True) if main_content else None
        
        # Clean up text content
        if text_content:
            # Remove excessive whitespace
            text_content = re.sub(r'\n\s*\n', '\n\n', text_content)
            
            # Remove "What's Hot Now" section and everything after it
            if "What's Hot Now" in text_content:
                text_content = text_content.split("What's Hot Now")[0]
            
            # Remove any remaining advertisement sections
            text_content = re.sub(r'Read More\s*\n\s*', '', text_content)
            
            # Remove duplicate content by splitting into paragraphs and using a set
            paragraphs = text_content.split('\n\n')
            unique_paragraphs = []
            seen = set()
            for p in paragraphs:
                p = p.strip()
                if p and p not in seen:
                    seen.add(p)
                    unique_paragraphs.append(p)
            
            # Rejoin unique paragraphs
            text_content = '\n\n'.join(unique_paragraphs)
            
            # Limit length
            if len(text_content) > 8000:
                text_content = text_content[:8000] + "... (content truncated)"
        
        # Create simplified result object
        result = {
            'title': title,
            'url': url,
            'text': text_content
        }
        
        logger.info(f"Web scraper successful for '{url}'")
        return result

    except requests.Timeout:
        error_msg = f"Request timed out while scraping '{url}'."
        logger.error(error_msg)
        return {"error": error_msg}
    except requests.RequestException as e:
        error_msg = f"Network error scraping '{url}': {e}"
        logger.exception(error_msg)
        return {"error": error_msg}
    except Exception as e:
        error_msg = f"Unexpected error scraping '{url}': {e}"
        logger.exception(error_msg)
        return {"error": error_msg}
