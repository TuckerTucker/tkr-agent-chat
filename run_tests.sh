#!/bin/bash

set -e  # Exit on any error

echo "==============================================="
echo "Running TKR Agent Chat Test Suite"
echo "==============================================="

# Activate environment if available
if [ -f "start_env" ]; then
  echo "🔧 Activating environment..."
  source start_env
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Not in the project root directory"
  exit 1
fi

# Run frontend tests
echo ""
echo "🧪 Running Frontend Tests with Vitest..."
npm test || {
  echo "❌ Frontend tests failed"
  exit 1
}

# Run backend tests
echo ""
echo "🧪 Running Backend Tests with Pytest..."
cd api_gateway
python -m pytest src/tests/ -v || {
  echo "❌ Backend tests failed"
  exit 1
}

echo ""
echo "✅ All tests passed!"
echo "==============================================="

# Run coverage report if specified
if [ "$1" == "--coverage" ]; then
  echo ""
  echo "📊 Generating Coverage Reports..."
  cd ..
  npm test -- --coverage
  cd api_gateway
  python -m pytest src/tests/ --cov=src --cov-report=term --cov-report=html
  echo "✅ Coverage reports generated"
fi

# Exit with success
exit 0