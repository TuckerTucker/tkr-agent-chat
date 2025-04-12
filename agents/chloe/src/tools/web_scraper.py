"""
Web Scraper Tool for Chloe Agent

Fetches and extracts content from web pages, optionally using a CSS selector.
Includes structured error handling and logging.
"""

import re
import time
import logging
from typing import Optional, Dict, Any # Add imports
from datetime import datetime
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# Configure logger
logger = logging.getLogger("chloe.web_scraper")
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

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

# Add explicit type hints
def web_scraper(url: str, selector: Optional[str] = None, timeout: int = 8, skip_rate_limit: bool = False) -> Dict[str, Any]:
    logger.info(f"web_scraper called with url={url}, selector={selector}, timeout={timeout}, skip_rate_limit={skip_rate_limit}")
    start_time = time.time()
    try:
        # Normalize URL
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "https://" + url

        domain = _extract_domain(url)
        if domain == "example.com":
            logger.info("Returning mock response for example.com")
            return {
                "content": "This is a mocked response for example.com for testing purposes.",
                "url": url,
                "mocked": True
            }
        if not skip_rate_limit and _should_rate_limit(domain):
            logger.warning(f"Rate limit exceeded for domain: {domain}")
            return {
                "error": f"Rate limit exceeded for domain: {domain}",
                "url": url,
                "timestamp": datetime.utcnow().isoformat()
            }

        headers = {
            "User-Agent": "Chloe-Agent/1.0"
        }
        try:
            resp = requests.get(url, headers=headers, timeout=timeout)
            resp.raise_for_status()
            html = resp.text
        except requests.Timeout:
            logger.error(f"Request timeout after {timeout}s for {url}")
            return {
                "error": f"Request timeout after {timeout}s",
                "url": url,
                "timestamp": datetime.utcnow().isoformat()
            }
        except requests.RequestException as e:
            logger.error(f"HTTP error for {url}: {e}")
            return {
                "error": f"HTTP error: {e}",
                "url": url,
                "timestamp": datetime.utcnow().isoformat()
            }

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

        if selector:
            elements = soup.select(selector)
            if not elements:
                logger.info(f"No elements found matching selector: {selector}")
                return {
                    "content": None,
                    "message": "No elements found matching selector",
                    "selector": selector,
                    "url": url
                }
            content = [el.get_text(strip=True) for el in elements]
            logger.info(f"Extracted {len(content)} elements for selector: {selector}")
            return {"content": content, "selector": selector, "url": url}

        # Try to get main content area
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
        return {"content": content, "url": url}
    except Exception as e:
        logger.exception(f"Unexpected error in web_scraper: {e}")
        return {
            "error": str(e),
            "url": url,
            "timestamp": datetime.utcnow().isoformat()
        }
