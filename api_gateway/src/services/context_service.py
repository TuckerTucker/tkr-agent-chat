import uuid
import json
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text

from ..models.shared_context import SharedContext
from ..services.chat_service import chat_service

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
    content_text = json.dumps(content).lower()
    content_words = set(content_text.split())
    
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
    async def share_context(
        self,
        db: AsyncSession,
        source_agent_id: str,
        target_agent_id: str,
        context_data: Dict[str, Any],
        session_id: Optional[str] = None,
        context_type: str = "relevant",
        ttl_minutes: Optional[int] = None
    ) -> SharedContext:
        """
        Share context between agents.

        Args:
            db: Database session
            source_agent_id: ID of the agent sharing context
            target_agent_id: ID of the agent receiving context
            context_data: The context data to share
            session_id: Optional chat session ID
            context_type: Type of context ('full', 'relevant', 'summary')
            ttl_minutes: Optional time-to-live in minutes

        Returns:
            SharedContext: The created context object
        """
        context_id = str(uuid.uuid4())
        
        # Calculate expiration if TTL provided
        expires_at = None
        if ttl_minutes:
            expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        
        context = SharedContext(
            id=context_id,
            session_id=session_id,
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            context_type=context_type,
            content=context_data,
            context_metadata={
                "created_at": datetime.now(UTC).isoformat(),
                "content_size": len(json.dumps(context_data))
            },
            expires_at=expires_at
        )
        
        db.add(context)
        await db.commit()
        await db.refresh(context)
        
        logger.info(f"Created shared context {context_id} from {source_agent_id} to {target_agent_id}")
        return context
    
    async def get_shared_context(
        self,
        db: AsyncSession,
        target_agent_id: str,
        session_id: Optional[str] = None,
        source_agent_id: Optional[str] = None
    ) -> List[SharedContext]:
        """
        Get shared context available to an agent.

        Args:
            db: Database session
            target_agent_id: ID of the agent to get context for
            session_id: Optional chat session ID to filter by
            source_agent_id: Optional source agent ID to filter by

        Returns:
            List[SharedContext]: List of available context objects
        """
        current_time = datetime.now(UTC)
        query = select(SharedContext).filter(
            SharedContext.target_agent_id == target_agent_id,
            SharedContext.expires_at.is_(None) | 
            (SharedContext.expires_at > current_time)
        )
        
        if session_id:
            query = query.filter(SharedContext.session_id == session_id)
        if source_agent_id:
            query = query.filter(SharedContext.source_agent_id == source_agent_id)
            
        result = await db.execute(query)
        return result.scalars().all()
    
    async def filter_relevant_context(
        self,
        db: AsyncSession,
        contexts: List[SharedContext],
        query: str,
        min_score: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Filter contexts by relevance using SQLite JSON1 and text similarity.

        Args:
            db: Database session
            contexts: List of contexts to filter
            query: The query to filter by
            min_score: Minimum relevance score (0-1) to include

        Returns:
            List[Dict[str, Any]]: List of contexts with relevance scores
        """
        scored_contexts = []
        for context in contexts:
            # Calculate relevance score
            score = calculate_relevance_score(context.content, query)
            
            if score >= min_score:
                scored_contexts.append({
                    "context": context,
                    "score": score,
                    "metadata": {
                        **context.context_metadata,
                        "relevance_score": score
                    }
                })
        
        # Sort by relevance score
        return sorted(scored_contexts, key=lambda x: x["score"], reverse=True)
    
    async def cleanup_expired_context(
        self,
        db: AsyncSession
    ) -> int:
        """
        Remove expired shared contexts.

        Args:
            db: Database session

        Returns:
            int: Number of contexts removed
        """
        current_time = datetime.now(UTC)
        result = await db.execute(
            select(SharedContext).filter(
                SharedContext.expires_at <= current_time
            )
        )
        expired = result.scalars().all()
        
        for context in expired:
            logger.info(f"Removing expired context {context.id}")
            await db.delete(context)
        
        await db.commit()
        return len(expired)

    async def update_context(
        self,
        db: AsyncSession,
        context_id: str,
        updates: Dict[str, Any]
    ) -> Optional[SharedContext]:
        """
        Update an existing shared context.

        Args:
            db: Database session
            context_id: ID of the context to update
            updates: Dictionary of fields to update

        Returns:
            Optional[SharedContext]: Updated context or None if not found
        """
        result = await db.execute(
            select(SharedContext).filter(SharedContext.id == context_id)
        )
        context = result.scalar_one_or_none()
        
        if context:
            # Update allowed fields
            allowed_fields = {"content", "context_type", "expires_at", "context_metadata"}
            for field, value in updates.items():
                if field in allowed_fields:
                    setattr(context, field, value)
            
            # Update metadata
            context.context_metadata = {
                **context.context_metadata,
                "updated_at": datetime.now(UTC).isoformat()
            }
            
            await db.commit()
            await db.refresh(context)
            logger.info(f"Updated context {context_id}")
            
        return context

    async def extend_context_ttl(
        self,
        db: AsyncSession,
        context_id: str,
        additional_minutes: int
    ) -> Optional[SharedContext]:
        """
        Extend the TTL of a context.

        Args:
            db: Database session
            context_id: ID of the context to extend
            additional_minutes: Minutes to add to current expiration

        Returns:
            Optional[SharedContext]: Updated context or None if not found
        """
        result = await db.execute(
            select(SharedContext).filter(SharedContext.id == context_id)
        )
        context = result.scalar_one_or_none()
        
        if context:
            current_time = datetime.now(UTC)
            # If already expired, start from current time
            base_time = max(current_time, context.expires_at) if context.expires_at else current_time
            new_expiry = base_time + timedelta(minutes=additional_minutes)
            
            context.expires_at = new_expiry
            context.context_metadata = {
                **context.context_metadata,
                "ttl_extended_at": current_time.isoformat(),
                "ttl_extension": additional_minutes
            }
            
            await db.commit()
            await db.refresh(context)
            logger.info(f"Extended TTL for context {context_id} by {additional_minutes} minutes")
            
        return context

    async def batch_cleanup_contexts(
        self,
        db: AsyncSession,
        batch_size: int = 100
    ) -> int:
        """
        Clean up expired contexts in batches.

        Args:
            db: Database session
            batch_size: Number of contexts to process per batch

        Returns:
            int: Total number of contexts removed
        """
        total_removed = 0
        current_time = datetime.now(UTC)
        
        while True:
            # Get batch of expired contexts
            result = await db.execute(
                select(SharedContext)
                .filter(SharedContext.expires_at <= current_time)
                .limit(batch_size)
            )
            batch = result.scalars().all()
            
            if not batch:
                break
                
            # Delete batch
            for context in batch:
                await db.delete(context)
                logger.debug(f"Removing expired context {context.id}")
                total_removed += 1
            
            await db.commit()
            
        if total_removed > 0:
            logger.info(f"Batch cleanup removed {total_removed} expired contexts")
        
        return total_removed

# Global instance
context_service = ContextService()
