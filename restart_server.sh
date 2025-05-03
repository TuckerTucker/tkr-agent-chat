#!/bin/bash
# Restart the API gateway server

echo "🔄 Stopping existing server process..."
npm run server:stop

echo "🚀 Starting the API gateway server..."
npm run dev:server