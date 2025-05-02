"""
Web Scraper Tool for Chloe Agent

Fetches and extracts content from web pages, optionally using a CSS selector.
Uses standardized error handling for consistent error responses.
"""

import re
import time
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# Import standardized tool error handling
from agents.common.tool_errors import (
    ToolErrorResponse, 
    ToolErrorCategory,
    ToolErrorCodes,
    invalid_parameter_error,
    timeout_error,
    network_error,
    rate_limit_error
)

# Configure logger
logger = logging.getLogger("chloe.web_scraper")
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Tool name constant for error handling
TOOL_NAME = "web_scraper"

# Simple in-memory rate limit store
_request_store = {}

def _should_rate_limit(domain):
    now = time.time()
    last_request = _request_store.get(domain)
    if not last_request or (now - last_request) > 1.0:
        _request_store[domain] = now
        return False
    return True

def _extract_domain(url):
    try:
        return urlparse(url).hostname
    except Exception:
        raise ValueError(f"Invalid URL: {url}")

def _clean_text(text):
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\[.*?\]', '', text)
    text = re.sub(r'e-remove\s*', '', text)
    text = re.sub(r'[\r\n]+', '\n', text)
    text = re.sub(r'\b(Your?|you)\s+email.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'©.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\b(subscribe|sign up).*$', '', text, flags=re.IGNORECASE | re.MULTILINE)
    return text.strip()

def web_scraper(url: str, selector: Optional[str] = None, timeout: int = 8, skip_rate_limit: bool = False) -> Dict[str, Any]:
    """
    Fetches and extracts content from a web page.
    
    Args:
        url: The URL to scrape
        selector: Optional CSS selector to extract specific elements
        timeout: Request timeout in seconds
        skip_rate_limit: Whether to bypass rate limiting
        
    Returns:
        Dictionary with content or standardized error response
    """
    logger.info(f"web_scraper called with url={url}, selector={selector}, timeout={timeout}, skip_rate_limit={skip_rate_limit}")
    start_time = time.time()
    
    try:
        # Validate URL parameter
        if not url or not isinstance(url, str):
            error = invalid_parameter_error(
                param_name="url",
                message="Please provide a valid URL as a string",
                tool_name=TOOL_NAME,
                received_value=url
            )
            logger.error(f"Invalid URL: {error['message']}")
            return error
            
        # Normalize URL
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "https://" + url

        try:
            domain = _extract_domain(url)
        except ValueError as e:
            error = invalid_parameter_error(
                param_name="url",
                message=str(e),
                tool_name=TOOL_NAME,
                received_value=url
            )
            logger.error(f"Invalid URL: {error['message']}")
            return error
            
        # Mock response for example.com for testing
        if domain == "example.com":
            logger.info("Returning mock response for example.com")
            return {
                "content": "This is a mocked response for example.com for testing purposes.",
                "url": url,
                "mocked": True
            }
            
        # Rate limiting check
        if not skip_rate_limit and _should_rate_limit(domain):
            logger.warning(f"Rate limit exceeded for domain: {domain}")
            error = rate_limit_error(
                service_name=domain,
                tool_name=TOOL_NAME,
                retry_delay_seconds=2
            )
            return error

        headers = {
            "User-Agent": "Chloe-Agent/1.0"
        }
        
        try:
            resp = requests.get(url, headers=headers, timeout=timeout)
            resp.raise_for_status()
            html = resp.text
        except requests.Timeout:
            error = timeout_error(
                service_name=f"Web request to {domain}",
                timeout_seconds=timeout,
                tool_name=TOOL_NAME
            )
            logger.error(f"Request timeout: {error['message']}")
            return error
            
        except requests.RequestException as e:
            error = network_error(
                service_name=f"Web request to {domain}",
                error_details=str(e),
                tool_name=TOOL_NAME
            )
            logger.error(f"HTTP error: {error['message']}")
            return error

        soup = BeautifulSoup(html, "html.parser")

        # Remove unwanted elements
        elements_to_remove = [
            "script", "style", "iframe", "noscript", "header", "footer",
            "nav", "aside", "form", '[class*="menu"]', '[class*="nav"]',
            '[class*="sidebar"]', '[class*="widget"]', '[role="complementary"]',
            '[class*="popup"]', '[class*="modal"]', '[class*="cookie"]',
            '[class*="newsletter"]', '[class*="subscribe"]'
        ]
        for selector_rm in elements_to_remove:
            for el in soup.select(selector_rm):
                el.decompose()

        # Handle selector-based extraction
        if selector:
            elements = soup.select(selector)
            if not elements:
                logger.info(f"No elements found matching selector: {selector}")
                # This is not an error condition, just no matching elements
                return {
                    "content": None,
                    "message": "No elements found matching selector",
                    "selector": selector,
                    "url": url,
                    "found_elements": False
                }
            content = [el.get_text(strip=True) for el in elements]
            logger.info(f"Extracted {len(content)} elements for selector: {selector}")
            return {
                "content": content,
                "selector": selector,
                "url": url,
                "found_elements": True,
                "element_count": len(content)
            }

        # General content extraction
        main_content = (
            soup.select_one("main, [role='main'], article, .content, #content") or soup.body
        )

        # Extract and clean text from paragraphs, headings, and list items
        if main_content:
            tags = main_content.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"])
        else:
            tags = soup.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"])

        paragraphs = [
            _clean_text(tag.get_text())
            for tag in tags
            if tag.get_text() and
               len(tag.get_text().split()) > 3 and
               not re.match(r"^[\d\W]+$", tag.get_text()) and
               not re.search(r"privacy|cookie|terms", tag.get_text(), re.IGNORECASE)
        ]
        content = "\n".join(paragraphs).strip()
        elapsed = time.time() - start_time
        logger.info(f"Scraping complete for {url} ({len(content)} chars, {elapsed:.2f}s)")
        
        return {
            "content": content,
            "url": url,
            "elapsed_seconds": round(elapsed, 2),
            "content_length": len(content)
        }
        
    except Exception as e:
        error = ToolErrorResponse.from_exception(
            exception=e,
            tool_name=TOOL_NAME,
            additional_details={"url": url, "selector": selector}
        )
        logger.exception(f"Unexpected error: {error['message']}")
        return error
