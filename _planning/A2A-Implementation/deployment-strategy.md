# A2A Protocol Deployment Strategy

This document outlines the strategy for deploying and running the A2A protocol implementation in a server/client architecture locally.

## Local Development Environment

### Prerequisites

1. System Requirements
   - Python 3.9+
   - Node.js 18+
   - PostgreSQL 14+
   - Git

2. Development Tools
   - VSCode with extensions:
     * Python
     * TypeScript
     * ESLint
     * Prettier
     * SQLTools
   - PostgreSQL client
   - Postman/Insomnia for API testing

### Repository Structure

```
tkr-agent-chat/
├── api_gateway/               # FastAPI server
│   ├── src/
│   │   ├── models/           # SQLAlchemy models
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   └── main.py          # Server entry point
│   ├── requirements.txt
│   └── README.md
├── src/                      # React client
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── types/
├── agents/                   # Agent implementations
│   ├── base_agent.py
│   ├── chloe/
│   └── phil_connors/
└── package.json
```

## Setup Process

### 1. Database Setup

```bash
# Create database
createdb tkr_agent_chat

# Run migrations
cd api_gateway
alembic upgrade head

# Verify database
psql tkr_agent_chat -c "\dt"
```

### 2. Server Setup

```bash
# Create virtual environment
cd api_gateway
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn src.main:app --reload --port 8000
```

### 3. Client Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Development Workflow

### 1. Local Development

1. Start Services
```bash
# Terminal 1: Database
pg_ctl start

# Terminal 2: API Server
cd api_gateway
source venv/bin/activate
uvicorn src.main:app --reload --port 8000

# Terminal 3: Client
npm run dev
```

2. Development URLs
   - Client: http://localhost:3000
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### 2. Testing

1. Run Tests
```bash
# Server tests
cd api_gateway
pytest

# Client tests
npm test

# E2E tests
npm run test:e2e
```

2. Test Coverage
```bash
# Server coverage
coverage run -m pytest
coverage report

# Client coverage
npm run test:coverage
```

## Monitoring

### 1. Local Monitoring

1. Server Metrics
```bash
# View logs
tail -f api_gateway/logs/server.log

# Monitor database
psql tkr_agent_chat -c "SELECT * FROM system_metrics ORDER BY timestamp DESC LIMIT 10;"
```

2. Client Metrics
   - Redux DevTools for state inspection
   - React DevTools for component debugging
   - Browser DevTools for network monitoring

### 2. Debugging

1. Server Debugging
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
uvicorn src.main:app --reload --port 8000 --log-level debug

# Debug specific module
python -m pdb api_gateway/src/main.py
```

2. Client Debugging
   - Use React DevTools
   - Enable source maps
   - Use browser debugger

## Configuration

### 1. Environment Variables

1. Server (.env)
```env
DATABASE_URL=postgresql://localhost/tkr_agent_chat
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000
```

2. Client (.env.local)
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

### 2. Application Settings

1. Server (config.py)
```python
SETTINGS = {
    'database': {
        'pool_size': 20,
        'max_overflow': 10,
        'pool_timeout': 30
    },
    'websocket': {
        'ping_interval': 30,
        'ping_timeout': 10
    }
}
```

2. Client (config.ts)
```typescript
export const CONFIG = {
  api: {
    timeout: 5000,
    retries: 3
  },
  websocket: {
    reconnectAttempts: 5,
    reconnectInterval: 1000
  }
};
```

## Maintenance

### 1. Database Maintenance

1. Backup
```bash
# Create backup
pg_dump tkr_agent_chat > backup.sql

# Restore from backup
psql tkr_agent_chat < backup.sql
```

2. Cleanup
```sql
-- Remove old metrics
DELETE FROM system_metrics WHERE timestamp < NOW() - INTERVAL '30 days';

-- Vacuum database
VACUUM ANALYZE;
```

### 2. Log Management

1. Log Rotation
```bash
# Configure logrotate
sudo nano /etc/logrotate.d/tkr-agent-chat

# Logrotate config
/var/log/tkr-agent-chat/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
}
```

2. Log Analysis
```bash
# Search errors
grep ERROR api_gateway/logs/server.log

# Monitor real-time
tail -f api_gateway/logs/server.log | grep --line-buffered "ERROR\|WARN"
```

## Troubleshooting

### 1. Common Issues

1. Database Connection
```bash
# Check connection
psql -h localhost -U postgres tkr_agent_chat

# Reset connection pool
curl http://localhost:8000/api/v1/admin/reset-pool
```

2. WebSocket Issues
```bash
# Check active connections
curl http://localhost:8000/api/v1/admin/ws-status

# Reset WebSocket server
curl -X POST http://localhost:8000/api/v1/admin/ws-reset
```

### 2. Recovery Procedures

1. Server Recovery
```bash
# Restart server
pkill -f uvicorn
uvicorn src.main:app --reload --port 8000

# Clear cache
redis-cli FLUSHALL
```

2. Client Recovery
```bash
# Clear cache
npm run clear-cache

# Rebuild
npm run build
```

## Security

### 1. Local Security

1. Database
```bash
# Set secure permissions
chmod 600 ~/.pgpass

# Configure pg_hba.conf
local   tkr_agent_chat    all    md5
```

2. API Security
   - CORS configuration
   - Input validation
   - Rate limiting

## Deployment Checklist

### 1. Pre-deployment

- [ ] Run all tests
- [ ] Check dependencies
- [ ] Update documentation
- [ ] Backup database
- [ ] Review logs

### 2. Deployment

- [ ] Stop services
- [ ] Update code
- [ ] Run migrations
- [ ] Start services
- [ ] Verify functionality

### 3. Post-deployment

- [ ] Monitor logs
- [ ] Check metrics
- [ ] Verify backups
- [ ] Update documentation

## Support

### 1. Documentation

- API Documentation: http://localhost:8000/docs
- Client Documentation: /docs/index.html
- Architecture Documentation: /docs/architecture.md

### 2. Tools

- Database GUI: pgAdmin or DBeaver
- API Testing: Postman or Insomnia
- Monitoring: Grafana dashboards

## Future Considerations

### 1. Optimizations

- Implement Redis caching
- Add database indexing
- Optimize WebSocket connections
- Implement service workers

### 2. Enhancements

- Add metrics dashboards
- Implement alerting
- Add automated backups
- Improve error handling
