#!/bin/bash

# Script to test all implemented fixes

echo "===== Testing TKR Multi-Agent Chat Fixes ====="

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Directory setup
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project root: $ROOT_DIR"
cd "$ROOT_DIR" || { echo "Failed to change to project directory"; exit 1; }

# Activate the environment
if [[ -f "$ROOT_DIR/start_env" ]]; then
  echo "Activating environment..."
  source "$ROOT_DIR/start_env"
else
  echo "Warning: start_env not found, assuming environment is already activated"
fi

# Check if server is running - kill it if it is
SERVER_PID=$(lsof -t -i:8000 2>/dev/null)
if [[ ! -z "$SERVER_PID" ]]; then
  echo "Server already running on PID $SERVER_PID, stopping it..."
  kill -9 "$SERVER_PID" 2>/dev/null
  sleep 2
fi

# Start the server in the background
echo "Starting server..."
cd "$ROOT_DIR/api_gateway" || { echo "Failed to change to api_gateway directory"; exit 1; }
python -m src.main > /tmp/tkr_server.log 2>&1 &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

# Wait for server to start
echo "Waiting for server to start..."
sleep 5

# Check if server is still running
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Server is running!"
else
  echo "Error: Server failed to start"
  echo "Server log:"
  cat /tmp/tkr_server.log
  exit 1
fi

# Function to run a test
run_test() {
  TEST_NAME="$1"
  TEST_SCRIPT="$2"
  
  echo "===== Testing $TEST_NAME ====="
  python "$ROOT_DIR/api_gateway/scripts/$TEST_SCRIPT"
  if [[ $? -ne 0 ]]; then
    echo "❌ $TEST_NAME test failed!"
    # Stop the server
    kill -9 "$SERVER_PID" 2>/dev/null
    exit 1
  else
    echo "✅ $TEST_NAME test passed!"
  fi
  echo
}

# Run all tests
run_test "Message Retrieval" "test_lmdb.py"
run_test "Socket.IO Connection" "test_socketio_messages.py"
run_test "Context Sharing" "test_context.py"
run_test "Message Schema Validation" "test_message_schema.py"

# Stop the server
echo "Stopping server..."
kill -9 "$SERVER_PID" 2>/dev/null

echo "===== All tests passed! ====="
echo "The fixes have been successfully implemented and verified."
exit 0