"""
Database compatibility module - redirects to LMDB implementation.

This module exists for backwards compatibility and simply re-exports all
functions from the db_lmdb module. New code should import directly from
db_factory.
"""

import logging
from .db_lmdb import *

logger = logging.getLogger(__name__)
logger.info("SQLite has been removed - db.py now redirects to LMDB implementation")