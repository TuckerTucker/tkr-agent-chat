"""
Service layer for shared context management.
"""

import json
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional, Dict, Any, List

from ..db import (
    share_context as db_share_context,
    get_shared_contexts,
    update_shared_context,
    extend_context_ttl,
    cleanup_expired_contexts
)

logger = logging.getLogger(__name__)

def calculate_relevance_score(content: Dict[str, Any], query: str) -> float:
    """
    Calculate relevance score between content and query.
    Uses a combination of keyword matching and content analysis.
    Returns a score between 0 and 1.
    """
    # Convert query to lowercase set of words
    query_words = set(query.lower().split())

    # Convert content to searchable text
    content_text = json.dumps(content, ensure_ascii=False).lower()
    # Split on common delimiters and remove punctuation
    content_words = set(''.join(c if c.isalnum() or c.isspace() else ' ' for c in content_text).split())

    # Calculate word overlap
    matching_words = query_words.intersection(content_words)
    if not query_words:
        return 0.0

    # Basic TF-IDF inspired scoring
    word_score = len(matching_words) / len(query_words)

    # Boost score based on content size and structure
    size_factor = min(1.0, len(content_text) / 1000)  # Normalize by typical content size
    depth_factor = 1.0 + (content_text.count('{') * 0.1)  # Boost for structural complexity

    # Combine factors with weights
    final_score = (word_score * 0.6) + (size_factor * 0.2) + (depth_factor * 0.2)

    return min(1.0, final_score)

class ContextService:
    def share_context(
        self,
        source_agent_id: str,
        target_agent_id: str,
        context_data: Dict[str, Any],
        session_id: Optional[str] = None,
        context_type: str = "relevant",
        ttl_minutes: Optional[int] = None
    ) -> Dict:
        """
        Share context between agents.

        Args:
            source_agent_id: ID of the agent sharing context
            target_agent_id: ID of the agent receiving context
            context_data: The context data to share
            session_id: Optional chat session ID
            context_type: Type of context ('full', 'relevant', 'summary')
            ttl_minutes: Optional time-to-live in minutes

        Returns:
            Dict: The created context object
        """
        # Calculate expiration if TTL provided
        expires_at = None
        if ttl_minutes:
            expires_at = (datetime.now(UTC) + timedelta(minutes=ttl_minutes)).isoformat()

        context_metadata = {
            "created_at": datetime.now(UTC).isoformat(),
            "content_size": len(json.dumps(context_data))
        }

        context = db_share_context({
            'session_id': session_id,
            'source_agent_id': source_agent_id,
            'target_agent_id': target_agent_id,
            'context_type': context_type,
            'content': context_data,
            'context_metadata': context_metadata,
            'expires_at': expires_at
        })

        logger.info(f"Created shared context {context['id']} from {source_agent_id} to {target_agent_id}")
        return context

    def get_shared_context(
        self,
        target_agent_id: str,
        session_id: Optional[str] = None,
        source_agent_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Get shared context available to an agent.

        Args:
            target_agent_id: ID of the agent to get context for
            session_id: Optional chat session ID to filter by
            source_agent_id: Optional source agent ID to filter by

        Returns:
            List[Dict]: List of available context objects
        """
        return get_shared_contexts(
            target_agent_id=target_agent_id,
            session_id=session_id,
            source_agent_id=source_agent_id
        )

    def filter_relevant_context(
        self,
        contexts: List[Dict],
        query: str,
        min_score: float = 0.3
    ) -> List[Dict]:
        """
        Filter contexts by relevance.

        Args:
            contexts: List of contexts to filter
            query: The query to filter by
            min_score: Minimum relevance score (0-1) to include

        Returns:
            List[Dict]: List of contexts with relevance scores
        """
        scored_contexts = []
        for context in contexts:
            # Calculate relevance score
            score = calculate_relevance_score(context['content'], query)

            if score >= min_score:
                scored_contexts.append({
                    "context": context,
                    "score": score,
                    "metadata": {
                        **(context.get('context_metadata', {})),
                        "relevance_score": score
                    }
                })

        # Sort by relevance score
        return sorted(scored_contexts, key=lambda x: x["score"], reverse=True)

    def update_context(
        self,
        context_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict]:
        """
        Update an existing shared context.

        Args:
            context_id: ID of the context to update
            updates: Dictionary of fields to update

        Returns:
            Optional[Dict]: Updated context or None if not found
        """
        # Update allowed fields
        allowed_fields = {"content", "context_type", "expires_at", "context_metadata"}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        # Update metadata
        if filtered_updates:
            metadata = filtered_updates.get('context_metadata', {})
            metadata['updated_at'] = datetime.now(UTC).isoformat()
            filtered_updates['context_metadata'] = metadata

            return update_shared_context(context_id, filtered_updates)
        return None

    def extend_context_ttl(
        self,
        context_id: str,
        additional_minutes: int
    ) -> Optional[Dict]:
        """
        Extend the TTL of a context.

        Args:
            context_id: ID of the context to extend
            additional_minutes: Minutes to add to current expiration

        Returns:
            Optional[Dict]: Updated context or None if not found
        """
        return extend_context_ttl(context_id, additional_minutes)

    def batch_cleanup_contexts(
        self,
        batch_size: int = 100
    ) -> int:
        """
        Clean up expired contexts in batches.

        Args:
            batch_size: Number of contexts to process per batch

        Returns:
            int: Total number of contexts removed
        """
        removed_count = cleanup_expired_contexts(batch_size)
        if removed_count > 0:
            logger.info(f"Batch cleanup removed {removed_count} expired contexts")
        return removed_count

    def format_context_for_content(
        self,
        target_agent_id: str,
        session_id: str
    ) -> Optional[str]:
        """
        Format context from the database as a system message.

        Args:
            target_agent_id: ID of the agent to get context for
            session_id: Chat session ID

        Returns:
            Optional[str]: Formatted context string or None if no context
        """
        # Get recent contexts from database
        contexts = self.get_shared_context(
            target_agent_id=target_agent_id,
            session_id=session_id
        )

        if not contexts:
            return None

        # Sort contexts by timestamp
        contexts.sort(key=lambda x: x.get('context_metadata', {}).get('created_at', ''), reverse=True)
        
        # Take only the 5 most recent contexts
        recent_contexts = contexts[:5]

        # Format as system message with clear instructions
        formatted_context = (
            "RECENT CONTEXT FROM OTHER PARTICIPANTS\n"
            "This context is provided to help inform your responses to user messages.\n"
            "Do not respond to this context directly unless the user asks about it.\n\n"
        )
        
        for ctx in recent_contexts:
            source = ctx.get('source_agent_id', 'Unknown')
            content = ctx.get('content', {}).get('content', '')
            formatted_context += f"From {source}: {content}\n\n"

        return formatted_context

# Global instance
context_service = ContextService()
