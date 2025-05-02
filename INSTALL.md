# TKR Agent Chat Installation Guide

This guide provides step-by-step instructions for setting up the TKR Agent Chat application for local development.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (v7 or higher)
- **Python** (v3.9 or higher)
- **Git**

## Quick Setup

The easiest way to get started is to use our setup script:

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/tuckertucker/tkr-agent-chat.git
cd tkr-agent-chat

# Make the setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

This script will:
1. Create a `.env` file from the template
2. Set up a Python virtual environment
3. Install all required dependencies
4. Initialize the database

## Manual Setup

If you prefer to set up manually, follow these steps:

### 1. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your settings
# IMPORTANT: Update the GOOGLE_API_KEY value
```

### 2. Python Environment Setup

```bash
# Activate the environment setup script
source start_env

# Install Python dependencies
pip install -r api_gateway/requirements.txt
pip install -r agents/chloe/requirements.txt
pip install -r agents/phil_connors/requirements.txt
```

### 3. Node.js Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 4. Database Initialization

```bash
# Initialize the database
npm run db:init
```

## Running the Application

After completing the setup, you can start the application with:

```bash
# Start both frontend and backend
npm run dev

# Or start them separately
npm run dev:client  # Frontend only
npm run dev:server  # Backend only
```

## Configuration Options

The `.env` file contains the following configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | 8000 |
| `HOST` | Backend server host | 0.0.0.0 |
| `LOG_LEVEL` | Logging level | info |
| `TKR_LOG_DIR` | Directory to store log files | ./logs |
| `TKR_LOG_FILENAME` | Base log filename | api_gateway.log |
| `TKR_LOG_MAX_SIZE_MB` | Maximum log file size before rotation | 10 |
| `TKR_LOG_BACKUP_COUNT` | Number of backup files to keep | 5 |
| `TKR_LOG_CONSOLE` | Whether to output logs to console | true |
| `DATABASE_URL` | SQLite database path | sqlite+aiosqlite:///api_gateway/chats/chat_database.db |
| `VITE_WS_URL` | WebSocket server URL | ws://localhost:8000 |
| `VITE_API_URL` | API server URL | http://localhost:8000 |
| `GOOGLE_API_KEY` | Google AI API key | (required) |
| `MAX_CONTEXTS_PER_AGENT` | Maximum number of contexts per agent | 10 |
| `CONTEXT_CLEANUP_INTERVAL_SECONDS` | How often to clean up expired contexts | 300 |

## Logging

The TKR Agent Chat system provides configurable logging. See [LOGGING.md](docs/LOGGING.md) for complete documentation.

To change the log directory:

```bash
# In your .env file
TKR_LOG_DIR=/path/to/custom/logs

# Or when starting the application
TKR_LOG_DIR=/path/to/custom/logs npm run dev
```

## Troubleshooting

### WebSocket Connection Issues

If you're having WebSocket connection issues, make sure:
- The backend server is running
- Your `VITE_WS_URL` is correctly set in `.env`
- No firewalls are blocking the connection

### Database Issues

If you encounter database errors:
- Reset the database with `npm run db:reset`
- Check the database path in your `.env` file

### Agent API Key Issues

If agent responses fail:
- Make sure you've set a valid `GOOGLE_API_KEY` in your `.env` file
- Check that all agent dependencies are installed correctly