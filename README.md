# TKR Multi-Agent Chat System

A web-based chat interface for interacting with multiple specialized AI agents using the Agent Development Kit (ADK) and A2A protocol.

## Features

- Multi-agent chat interface with real-time WebSocket communication
- Agent-to-Agent (A2A) protocol for inter-agent communication
- Context sharing between agents
- JSON-based structured logging with customizable output
- React/TypeScript frontend with Tailwind CSS
- FastAPI backend with LMDB database

## Installation

See [INSTALL.md](INSTALL.md) for detailed installation instructions.

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure as needed
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Logging

The system includes a comprehensive logging system that writes logs to a local directory with the following features:

- Structured JSON logging format for log files
- Human-readable console output with colored log levels
- Log rotation to manage file sizes
- Configurable log levels
- Separate error log files

### Configuring Logs

You can customize logging behavior through environment variables in your `.env` file:

```bash
# Logging Configuration
TKR_LOG_DIR=./logs                # Custom log directory path (absolute or relative)
TKR_LOG_FILENAME=api_gateway.log  # Base log filename
TKR_LOG_MAX_SIZE_MB=10            # Maximum log file size before rotation
TKR_LOG_BACKUP_COUNT=5            # Number of backup files to keep
TKR_LOG_CONSOLE=true              # Whether to output logs to console
TKR_LOG_COLORIZE=true             # Whether to use colors in console output
TKR_LOG_CONSOLE_JSON=false        # Whether to use JSON format in console (default: human-readable)
LOG_LEVEL=info                    # Minimum log level (debug, info, warning, error, critical)
```

### Log Directory Structure

Logs are organized in timestamped directories for each server run:

```
logs/
  ├── 20250502_134512/   (Server run from May 2, 2025 at 13:45:12)
  │   ├── api_gateway.log
  │   ├── error_api_gateway.log
  │   └── agent.log
```

For more detailed information about logging, see [LOGGING.md](docs/LOGGING.md).

## Testing

See [TESTING.md](TESTING.md) for information on running tests.

## License

This project is proprietary and confidential.

## Acknowledgements

- [Agent Development Kit (ADK)](https://github.com/google/agent-development-kit)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)