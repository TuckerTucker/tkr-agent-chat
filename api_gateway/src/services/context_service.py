import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.shared_context import SharedContext
from ..services.chat_service import chat_service

logger = logging.getLogger(__name__)

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
        """Share context between agents."""
        context_id = str(uuid.uuid4())
        
        # Calculate expiration if TTL provided
        expires_at = None
        if ttl_minutes:
            expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        
        context = SharedContext(
            id=context_id,
            session_id=session_id,
            source_agent_id=source_agent_id,
            target_agent_id=target_agent_id,
            context_type=context_type,
            content=context_data,
            context_metadata={},
            expires_at=expires_at
        )
        
        db.add(context)
        await db.commit()
        await db.refresh(context)
        
        logger.info(f"Created shared context {context_id}")
        return context
    
    async def get_shared_context(
        self,
        db: AsyncSession,
        target_agent_id: str,
        session_id: Optional[str] = None,
        source_agent_id: Optional[str] = None
    ) -> List[SharedContext]:
        """Get shared context available to an agent."""
        query = select(SharedContext).filter(
            SharedContext.target_agent_id == target_agent_id,
            SharedContext.expires_at.is_(None) | 
            (SharedContext.expires_at > datetime.utcnow())
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
        query: str
    ) -> List[SharedContext]:
        """Filter contexts by relevance using text similarity."""
        # Simple keyword matching for now
        # Could be enhanced with more sophisticated relevance scoring
        keywords = set(query.lower().split())
        relevant = []
        
        for context in contexts:
            content_text = str(context.content).lower()
            if any(keyword in content_text for keyword in keywords):
                relevant.append(context)
        
        return relevant
    
    async def cleanup_expired_context(
        self,
        db: AsyncSession
    ) -> int:
        """Remove expired shared contexts."""
        result = await db.execute(
            select(SharedContext).filter(
                SharedContext.expires_at <= datetime.utcnow()
            )
        )
        expired = result.scalars().all()
        
        for context in expired:
            await db.delete(context)
        
        await db.commit()
        return len(expired)

# Global instance
context_service = ContextService()
