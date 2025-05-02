#!/bin/bash

# TKR Agent Chat Setup Script
# This script helps set up the development environment for the TKR Agent Chat application

# Set up color outputs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print a header
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  TKR Agent Chat - Environment Setup Tool  ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
  cp .env.example .env
  echo -e "${GREEN}Created .env file. Please edit with your settings.${NC}"
  echo -e "${YELLOW}Specifically, update the GOOGLE_API_KEY value.${NC}"
else
  echo -e "${GREEN}Found existing .env file.${NC}"
fi

# Setting up Python environment
echo ""
echo -e "${BLUE}Setting up Python environment...${NC}"

# Activate the virtual environment if it exists, or create it
if [ -d "tkr_env/project_env" ]; then
  echo -e "${GREEN}Found existing Python virtual environment.${NC}"
else
  echo -e "${YELLOW}Creating Python virtual environment...${NC}"
  source tkr_env/tkr_env.sh
fi

# Make sure we're inside the virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
  echo -e "${YELLOW}Activating virtual environment...${NC}"
  source tkr_env/tkr_env.sh
fi

# Install Python dependencies
echo ""
echo -e "${BLUE}Installing Python dependencies...${NC}"
pip install -r api_gateway/requirements.txt

# Install Agent requirements
echo ""
echo -e "${BLUE}Installing agent dependencies...${NC}"
pip install -r agents/chloe/requirements.txt
pip install -r agents/phil_connors/requirements.txt

# Install npm packages
echo ""
echo -e "${BLUE}Installing Node dependencies...${NC}"
npm install

# Create logs directory
echo ""
echo -e "${BLUE}Creating logs directory...${NC}"
mkdir -p logs
mkdir -p api_gateway/logs
chmod -R 775 logs
chmod -R 775 api_gateway/logs
echo -e "${GREEN}Log directories created.${NC}"

# Initialize the database
echo ""
echo -e "${BLUE}Initializing database...${NC}"
python -m api_gateway.scripts.init_db

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "To start the development server:${NC}"
echo -e "  ${YELLOW}npm run dev${NC}"
echo ""
echo -e "Individual commands:${NC}"
echo -e "  ${YELLOW}npm run dev:client${NC} - Start the frontend only"
echo -e "  ${YELLOW}npm run dev:server${NC} - Start the API server only"
echo -e "  ${YELLOW}npm run db:reset${NC}   - Reset the database"
echo ""