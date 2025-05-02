"""
Service layer for shared context management.
"""

import json
import logging
import os
from datetime import datetime, timedelta, UTC
from typing import Optional, Dict, Any, List, Tuple

from ..db import (
    share_context as db_share_context,
    get_shared_contexts,
    update_shared_context,
    extend_context_ttl,
    cleanup_expired_contexts
)

from ..models.error_responses import (
    ErrorCodes, 
    ErrorCategory, 
    ErrorSeverity,
    StandardErrorResponse
)

logger = logging.getLogger(__name__)

# Configuration constants (can be overridden by environment variables)
DEFAULT_MAX_CONTEXTS = int(os.environ.get("MAX_CONTEXTS_PER_AGENT", "10"))
DEFAULT_CONTEXT_TTL_MINUTES = int(os.environ.get("DEFAULT_CONTEXT_TTL_MINUTES", "30"))
DEFAULT_MIN_RELEVANCE_SCORE = float(os.environ.get("MIN_RELEVANCE_SCORE", "0.3"))
DEFAULT_CONTEXT_LIMIT_BYTES = int(os.environ.get("CONTEXT_LIMIT_BYTES", "8192"))  # 8KB by default

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

    # Boost for recency (if timestamp exists in content)
    recency_boost = 0.0
    if 'timestamp' in content:
        try:
            content_time = datetime.fromisoformat(content['timestamp'].replace('Z', '+00:00'))
            now = datetime.now(UTC)
            age_minutes = (now - content_time).total_seconds() / 60
            # Higher score for more recent content
            recency_boost = max(0.0, 0.3 * (1 - min(1, age_minutes / 120)))  # Decay over 2 hours
        except (ValueError, TypeError):
            pass

    # Combine factors with weights
    final_score = (word_score * 0.5) + (size_factor * 0.15) + (depth_factor * 0.15) + (recency_boost * 0.2)

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
        # Use default TTL if not provided
        if ttl_minutes is None:
            ttl_minutes = DEFAULT_CONTEXT_TTL_MINUTES
            
        # Calculate expiration
        expires_at = (datetime.now(UTC) + timedelta(minutes=ttl_minutes)).isoformat()

        # Add metadata
        context_metadata = {
            "created_at": datetime.now(UTC).isoformat(),
            "content_size": len(json.dumps(context_data)),
            "ttl_minutes": ttl_minutes
        }

        # Create the new context
        context = db_share_context({
            'session_id': session_id,
            'source_agent_id': source_agent_id,
            'target_agent_id': target_agent_id,
            'context_type': context_type,
            'content': context_data,
            'context_metadata': context_metadata,
            'expires_at': expires_at
        })

        # After adding new context, prune if needed
        self._prune_contexts_if_needed(target_agent_id, session_id)
        
        logger.info(f"Created shared context {context['id']} from {source_agent_id} to {target_agent_id}")
        return context

    def get_shared_context(
        self,
        target_agent_id: str,
        session_id: Optional[str] = None,
        source_agent_id: Optional[str] = None,
        limit: int = DEFAULT_MAX_CONTEXTS
    ) -> List[Dict]:
        """
        Get shared context available to an agent.

        Args:
            target_agent_id: ID of the agent to get context for
            session_id: Optional chat session ID to filter by
            source_agent_id: Optional source agent ID to filter by
            limit: Maximum number of contexts to return (defaults to DEFAULT_MAX_CONTEXTS)

        Returns:
            List[Dict]: List of available context objects
        """
        contexts = get_shared_contexts(
            target_agent_id=target_agent_id,
            session_id=session_id,
            source_agent_id=source_agent_id
        )
        
        # Sort by creation time (descending)
        contexts.sort(
            key=lambda ctx: ctx.get('context_metadata', {}).get('created_at', ''),
            reverse=True
        )
        
        # Apply limit
        if limit and limit > 0:
            contexts = contexts[:limit]
            
        return contexts

    def filter_relevant_context(
        self,
        contexts: List[Dict],
        query: str,
        min_score: float = DEFAULT_MIN_RELEVANCE_SCORE,
        max_contexts: int = DEFAULT_MAX_CONTEXTS
    ) -> List[Dict]:
        """
        Filter contexts by relevance.

        Args:
            contexts: List of contexts to filter
            query: The query to filter by
            min_score: Minimum relevance score (0-1) to include
            max_contexts: Maximum number of contexts to return

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

        # Sort by relevance score and apply limit
        scored_contexts.sort(key=lambda x: x["score"], reverse=True)
        return scored_contexts[:max_contexts]

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
        session_id: str,
        max_contexts: int = DEFAULT_MAX_CONTEXTS,
        max_size: int = DEFAULT_CONTEXT_LIMIT_BYTES
    ) -> Optional[str]:
        """
        Format context from the database as a system message.

        Args:
            target_agent_id: ID of the agent to get context for
            session_id: Chat session ID
            max_contexts: Maximum number of contexts to include
            max_size: Maximum size in bytes for the formatted context

        Returns:
            Optional[str]: Formatted context string or None if no context
        """
        # Get recent contexts from database
        contexts = self.get_shared_context(
            target_agent_id=target_agent_id,
            session_id=session_id,
            limit=max_contexts
        )

        if not contexts:
            return None

        # Sort contexts by timestamp (newest first)
        contexts.sort(key=lambda x: x.get('context_metadata', {}).get('created_at', ''), reverse=True)
        
        # Format as system message
        formatted_context = "CONTEXT FROM OTHER PARTICIPANTS:\n\n"
        
        # Track total size to respect max_size
        current_size = len(formatted_context.encode('utf-8'))
        
        # Add contexts until we hit the size limit
        included_contexts = []
        
        for ctx in contexts:
            source = ctx.get('source_agent_id', 'Unknown')
            content = ctx.get('content', {}).get('content', '')
            
            # Format this context entry
            context_entry = f"From {source}: {content}\n\n"
            entry_size = len(context_entry.encode('utf-8'))
            
            # Check if adding this would exceed our size limit
            if current_size + entry_size > max_size:
                # If we have no contexts yet, include a truncated version
                if not included_contexts:
                    truncation_message = "... (truncated due to size constraints)"
                    truncated_size = max_size - current_size - len(truncation_message.encode('utf-8'))
                    if truncated_size > 0:
                        truncated_content = content.encode('utf-8')[:truncated_size].decode('utf-8', errors='ignore')
                        included_contexts.append(f"From {source}: {truncated_content}{truncation_message}")
                break
            
            # Add this context
            included_contexts.append(context_entry)
            current_size += entry_size
        
        if not included_contexts:
            return None
            
        formatted_context += "".join(included_contexts)
        return formatted_context
        
    def _prune_contexts_if_needed(
        self, 
        target_agent_id: str, 
        session_id: Optional[str] = None,
        max_contexts: int = DEFAULT_MAX_CONTEXTS
    ) -> Tuple[int, int]:
        """
        Remove older contexts if we exceed the maximum number allowed.
        
        Args:
            target_agent_id: The agent to prune contexts for
            session_id: Optional session ID to limit pruning scope
            max_contexts: Maximum number of contexts to keep
            
        Returns:
            Tuple[int, int]: (contexts before pruning, contexts removed)
        """
        # Get all contexts for this agent (and session if specified)
        contexts = get_shared_contexts(
            target_agent_id=target_agent_id,
            session_id=session_id
        )
        
        # If we're under the limit, no pruning needed
        if len(contexts) <= max_contexts:
            return len(contexts), 0
            
        # Sort contexts by creation time (newest first)
        contexts.sort(
            key=lambda ctx: ctx.get('context_metadata', {}).get('created_at', ''),
            reverse=True
        )
        
        # Keep the newest max_contexts, remove the rest
        contexts_to_remove = contexts[max_contexts:]
        removed_count = 0
        
        for ctx in contexts_to_remove:
            try:
                # Mark as expired now
                update_shared_context(ctx['id'], {'expires_at': datetime.now(UTC).isoformat()})
                removed_count += 1
            except Exception as e:
                logger.error(f"Error pruning context {ctx['id']}: {str(e)}")
                
        if removed_count > 0:
            logger.info(f"Pruned {removed_count} old contexts for agent {target_agent_id}")
            
        return len(contexts), removed_count
        
    def get_agent_context_stats(
        self,
        target_agent_id: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get statistics about an agent's contexts.
        
        Args:
            target_agent_id: The agent to get stats for
            session_id: Optional session ID to filter contexts
            
        Returns:
            Dict with stats about contexts (count, size, etc.)
        """
        contexts = get_shared_contexts(
            target_agent_id=target_agent_id,
            session_id=session_id
        )
        
        if not contexts:
            return {
                "count": 0,
                "total_size_bytes": 0,
                "avg_size_bytes": 0,
                "oldest_context": None,
                "newest_context": None
            }
            
        # Calculate stats
        total_size = sum(ctx.get('context_metadata', {}).get('content_size', 0) for ctx in contexts)
        
        # Sort by timestamp for oldest/newest
        contexts.sort(key=lambda x: x.get('context_metadata', {}).get('created_at', ''))
        
        return {
            "count": len(contexts),
            "total_size_bytes": total_size,
            "avg_size_bytes": total_size / len(contexts) if contexts else 0,
            "oldest_context": {
                "id": contexts[0]['id'],
                "created_at": contexts[0].get('context_metadata', {}).get('created_at'),
                "source_agent": contexts[0]['source_agent_id']
            } if contexts else None,
            "newest_context": {
                "id": contexts[-1]['id'],
                "created_at": contexts[-1].get('context_metadata', {}).get('created_at'),
                "source_agent": contexts[-1]['source_agent_id']
            } if contexts else None,
            "by_source_agent": self._count_contexts_by_source(contexts)
        }
        
    def _count_contexts_by_source(self, contexts: List[Dict]) -> Dict[str, int]:
        """Helper to count contexts by source agent"""
        counts = {}
        for ctx in contexts:
            source = ctx.get('source_agent_id', 'unknown')
            counts[source] = counts.get(source, 0) + 1
        return counts

# Global instance
context_service = ContextService()