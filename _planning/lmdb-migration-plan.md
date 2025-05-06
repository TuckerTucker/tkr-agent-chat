# LMDB Migration Plan for Socket.IO Message Persistence

## Background and Motivation

The current SQLite implementation for message persistence has revealed several limitations:

- Concurrency bottlenecks under moderate to high load
- Race conditions in message retrieval ("Message creation succeeded but retrieval failed")
- Transaction isolation challenges
- Potential database locking issues

LMDB (Lightning Memory-Mapped Database) offers significant advantages for our Socket.IO message persistence system:

- Memory-mapped design for extremely fast reads
- Multiple reader, single writer architecture for better concurrency
- ACID-compliant transaction support
- Optimized for our access patterns (time-series lookups, range scanning)
- Simplified transaction boundaries for cleaner code

## Implementation Plan

This is a clean replacement approach, with no migration of existing data required.

### Phase 1: Design & Planning

#### 1. LMDB Data Model Design
- Create key design for messages (`session_id:timestamp:message_uuid` format)
- Design secondary index schemes for queries (by session, by agent, etc.)
- Define serialization format (MessagePack or JSON for values)
- Plan environment settings (map size, max dbs)

#### 2. API Contract Definition
- Maintain same function signatures as current db.py
- Define value encoding/decoding standards
- Document transaction boundaries

### Phase 2: Core Implementation

#### 1. Setup & Dependencies
```python
# Install dependencies
pip install lmdb
pip install msgpack  # For efficient serialization
```

#### 2. Create LMDB Connection Manager
```python
import lmdb
import msgpack
from contextlib import contextmanager
from pathlib import Path

# Define the project root relative to this file's location
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "api_gateway" / "chats" / "chat_database"

# Ensure the 'chats' directory exists
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

@contextmanager
def get_environment():
    """Context manager for LMDB environment."""
    # 10GB max size, create if doesn't exist
    env = lmdb.Environment(
        path=str(DEFAULT_DB_PATH),
        map_size=10 * 1024 * 1024 * 1024,  # 10GB
        max_dbs=10,  # Separate databases for different collections
        sync=False,  # Better performance, slightly less durability
        readahead=False,  # Better performance for non-sequential reads
        metasync=False,  # Better performance
        writemap=True,  # Better performance on Linux/MacOS
    )
    
    try:
        yield env
    finally:
        env.close()

@contextmanager
def get_transaction(write=False):
    """Get a transaction for database operations."""
    with get_environment() as env:
        with env.begin(write=write) as txn:
            yield txn, env
```

#### 3. Define Database Collections
```python
def open_dbs(env):
    """Open/create all databases in the environment."""
    dbs = {
        'sessions': env.open_db(b'sessions'),
        'messages': env.open_db(b'messages'),
        'message_by_session': env.open_db(b'message_by_session', dupsort=True),
        'message_by_agent': env.open_db(b'message_by_agent', dupsort=True),
        'agent_cards': env.open_db(b'agent_cards'),
        'shared_contexts': env.open_db(b'shared_contexts'),
        'context_by_session': env.open_db(b'context_by_session', dupsort=True),
        'a2a_tasks': env.open_db(b'a2a_tasks'),
    }
    return dbs
```

#### 4. Implement Core Database Utility Functions
```python
def encode_key(key):
    """Convert any key to bytes for LMDB."""
    if isinstance(key, str):
        return key.encode('utf-8')
    elif isinstance(key, bytes):
        return key
    else:
        return str(key).encode('utf-8')

def encode_value(value):
    """Encode a value for storage."""
    return msgpack.packb(value, use_bin_type=True)

def decode_value(value):
    """Decode a value from storage."""
    if value is None:
        return None
    return msgpack.unpackb(value, raw=False)

def create_composite_key(parts):
    """Create a composite key from parts."""
    return b':'.join(encode_key(part) for part in parts)
```

### Phase 3: Message Operations Implementation

#### 1. Message Creation
```python
def create_message(data: Dict) -> Dict:
    """Create a new message with improved validation."""
    # Generate required fields if missing
    if 'message_uuid' not in data:
        data['message_uuid'] = str(uuid.uuid4())
    if 'created_at' not in data:
        data['created_at'] = datetime.now(UTC).isoformat()
    
    session_id = data.get('session_id')
    message_uuid = data.get('message_uuid')
    timestamp = data.get('created_at')
    
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        # Verify session exists
        session_key = encode_key(session_id)
        session_data = txn.get(session_key, db=dbs['sessions'])
        if not session_data:
            logger.error(f"Cannot create message: session {session_id} does not exist")
            raise ValueError(f"Session {session_id} does not exist")
        
        # Create message key (session_id:timestamp:uuid for natural ordering)
        message_key = create_composite_key([session_id, timestamp, message_uuid])
        
        # Store the message
        txn.put(message_key, encode_value(data), db=dbs['messages'])
        
        # Create secondary indexes
        # Session index
        session_idx_key = create_composite_key([session_id, timestamp])
        txn.put(session_idx_key, encode_key(message_uuid), db=dbs['message_by_session'])
        
        # Agent index (if applicable)
        if data.get('agent_id'):
            agent_id = data.get('agent_id')
            agent_idx_key = create_composite_key([agent_id, timestamp])
            txn.put(agent_idx_key, encode_key(message_uuid), db=dbs['message_by_agent'])
        
        return get_message(message_uuid)
```

#### 2. Message Retrieval
```python
def get_message(message_uuid: str) -> Optional[Dict]:
    """Get a message by UUID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['messages'])
        
        # We need to scan to find by UUID since it's in a composite key
        for key, value in cursor:
            key_parts = key.split(b':')
            if len(key_parts) >= 3 and key_parts[2] == encode_key(message_uuid):
                return decode_value(value)
        
        return None

def get_session_messages(
    session_id: str, 
    skip: int = 0, 
    limit: int = 100,
    cursor: Optional[str] = None,
    direction: str = "desc",
    include_total: bool = False
) -> Union[List[Dict], Dict[str, Any]]:
    """Get messages for a specific session with improved pagination options."""
    results = []
    total_count = 0
    
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        
        # Get cursor for session messages
        db_cursor = txn.cursor(db=dbs['message_by_session'])
        
        # Position cursor based on parameters
        if cursor:
            # Position at the cursor value
            cursor_key = create_composite_key([session_id, cursor])
            if not db_cursor.set_key(cursor_key):
                # If cursor not found, position at beginning or end based on direction
                if direction.lower() == "asc":
                    db_cursor.first()
                else:
                    db_cursor.last()
        else:
            # No cursor, position at beginning or end based on direction
            if direction.lower() == "asc":
                db_cursor.set_range(encode_key(session_id))
            else:
                # For descending order, we need to position at the last message for this session
                prefix = encode_key(session_id) + b':'
                if not db_cursor.set_range(prefix):
                    db_cursor.last()
                else:
                    # Find last key with this session prefix
                    while db_cursor.key().startswith(prefix) and db_cursor.next():
                        pass
                    db_cursor.prev()  # Step back to last match
        
        # Skip records if needed
        if skip > 0:
            for _ in range(skip):
                if direction.lower() == "asc":
                    if not db_cursor.next():
                        break
                else:
                    if not db_cursor.prev():
                        break
        
        # Count total if requested
        if include_total:
            prefix = encode_key(session_id) + b':'
            count_cursor = txn.cursor(db=dbs['message_by_session'])
            if count_cursor.set_range(prefix):
                while count_cursor.key().startswith(prefix):
                    total_count += 1
                    if not count_cursor.next():
                        break
        
        # Collect messages up to limit
        i = 0
        next_cursor = None
        prev_cursor = None
        while i < limit:
            if direction.lower() == "asc":
                if not db_cursor.key().startswith(encode_key(session_id)):
                    break
                message_uuid = decode_value(db_cursor.value())
                # Store cursor for next page
                if i == limit - 1:
                    next_cursor = db_cursor.key().split(b':')[1].decode('utf-8')
                # Get full message data
                message_data = get_message(message_uuid)
                if message_data:
                    results.append(message_data)
                # Move to next
                if not db_cursor.next():
                    break
            else:  # descending
                if not db_cursor.key().startswith(encode_key(session_id)):
                    break
                message_uuid = decode_value(db_cursor.value())
                # Store cursor for next page
                if i == limit - 1:
                    next_cursor = db_cursor.key().split(b':')[1].decode('utf-8')
                # Get full message data
                message_data = get_message(message_uuid)
                if message_data:
                    results.append(message_data)
                # Move to previous
                if not db_cursor.prev():
                    break
            i += 1
        
        # Format results
        if include_total:
            pagination = {
                "total": total_count,
                "limit": limit,
                "direction": direction
            }
            if next_cursor:
                pagination["next_cursor"] = next_cursor
            if skip > 0:
                pagination["skip"] = skip
                
            return {
                "items": results,
                "pagination": pagination
            }
        else:
            return results
```

### Phase 4: Session & Other Entity Operations

#### 1. Session Operations
```python
def create_session(title: Optional[str] = None, session_id: Optional[str] = None) -> Dict:
    """Create a new chat session."""
    now = datetime.now(UTC).isoformat()
    session_id = session_id or str(uuid.uuid4())
    data = {
        'id': session_id,
        'title': title or f"Chat Session {now}",
        'created_at': now,
        'session_metadata': {}
    }
    
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        session_key = encode_key(session_id)
        txn.put(session_key, encode_value(data), db=dbs['sessions'])
        return data

def get_session(session_id: str) -> Optional[Dict]:
    """Get a chat session by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        session_key = encode_key(session_id)
        session_data = txn.get(session_key, db=dbs['sessions'])
        if session_data:
            return decode_value(session_data)
        return None
```

#### 2. Agent Card Operations
```python
def get_agent_card(agent_id: str) -> Optional[Dict]:
    """Get an agent card by ID."""
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        agent_key = encode_key(agent_id)
        agent_data = txn.get(agent_key, db=dbs['agent_cards'])
        if agent_data:
            return decode_value(agent_data)
        return None

def list_agent_cards() -> List[Dict]:
    """List all agent cards."""
    agents = []
    with get_transaction() as (txn, env):
        dbs = open_dbs(env)
        cursor = txn.cursor(db=dbs['agent_cards'])
        for _, value in cursor:
            agents.append(decode_value(value))
    return agents
```

### Phase 5: Database Initialization & Schema Migration

#### 1. Initialize Database
```python
def init_database():
    """Initialize the LMDB database."""
    with get_transaction(write=True) as (txn, env):
        dbs = open_dbs(env)
        
        # Create default agents
        default_agents = [
            {
                "id": "chloe",
                "name": "Chloe",
                "description": "Git operations and general help",
                "color": "rgb(34, 197, 94)",
                "icon_path": "agents/chloe/src/assets/chloe.svg",
                "capabilities": ["git", "search", "explain"],
                "is_active": True,
                "created_at": datetime.now(UTC).isoformat()
            },
            {
                "id": "phil_connors",
                "name": "Phil Connors",
                "description": "Task management and coordination",
                "color": "rgb(249, 115, 22)",
                "icon_path": "agents/phil_connors/src/assets/phil.svg",
                "capabilities": ["task", "coordinate", "plan"],
                "is_active": True,
                "created_at": datetime.now(UTC).isoformat()
            }
        ]
        
        for agent in default_agents:
            agent_key = encode_key(agent["id"])
            txn.put(agent_key, encode_value(agent), db=dbs['agent_cards'])
        
        # Create default session
        session_id = str(uuid.uuid4())
        session_data = {
            'id': session_id,
            'title': f"Default Session",
            'created_at': datetime.now(UTC).isoformat(),
            'session_metadata': {}
        }
        session_key = encode_key(session_id)
        txn.put(session_key, encode_value(session_data), db=dbs['sessions'])
        
        logger.info("LMDB database initialized successfully")
```

### Phase 6: Testing & Validation

1. Update test scripts to work with LMDB
2. Run concurrency tests to verify improved performance
3. Create load tests for LMDB vs SQLite comparison
4. Verify seamless operation with Socket.IO flow

### Phase 7: Integration

1. Replace SQLite imports with LMDB in Socket.IO message handler
2. Update message persistence tests
3. Modify any direct SQL query references to new LMDB functions
4. Deploy and monitor performance

## Benefits of this Approach

1. **Better Concurrency**: LMDB allows multiple readers concurrent with a single writer
2. **Improved Performance**: Memory-mapped files provide extremely fast reads
3. **Simplicity**: No SQL parser overhead
4. **Durability**: ACID-compliant with crash resistance
5. **Zero Migration**: Clean swap-out of data store without needing complex migration

## Key LMDB Advantages for Socket.IO Messaging

1. **Read Performance**: Ideal for message history retrieval
2. **No Locking Bottleneck**: Eliminates issues during high-volume message traffic
3. **Time-Series Friendly**: Ordered key-value store fits message timeline access pattern
4. **Simplified Transactions**: Cleaner transaction boundaries reduce concurrency bugs
5. **High Throughput**: Memory-mapped design reduces persistence overhead

## Implementation Timeline

| Week | Tasks |
|------|-------|
| 1    | Implement core LMDB layer and basic operations |
| 1    | Develop and test message operations (create, retrieve) |
| 2    | Implement session, agent, and other entity operations |
| 2    | Create and run unit tests for all database functions |
| 3    | Update socket handler to use new LMDB functions |
| 3    | Run integration tests with Socket.IO message flow |
| 4    | Performance testing and optimization |
| 4    | Deploy to staging/production |

## Risk Mitigation

1. **Backup Strategy**: Implement regular backups of LMDB data files
2. **Monitoring**: Add metrics for transaction times, read/write throughput
3. **Fallback Option**: Maintain SQLite implementation in codebase temporarily
4. **Memory Management**: Monitor memory usage and adjust map size as needed

## Success Criteria

1. Elimination of "Message creation succeeded but retrieval failed" warnings
2. Improved message throughput (3x or better vs SQLite)
3. Reduced latency for message retrieval operations (under 10ms)
4. No message loss during high-load scenarios
5. Simplified codebase with cleaner transaction boundaries