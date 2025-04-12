# Phil_Connors Agent

Phil_Connors is an AI agent for the TKR Multi-Agent Chat system.

## Directory Structure

- `README.md` – Agent documentation and usage
- `pyproject.toml` – Python package metadata
- `src/`
  - `agent.py` – Core agent logic
  - `config.py` – Agent config: id, name, description, color, capabilities, etc.
  - `index.py` – Entry point/factory for agent instantiation
  - `prompt.py` – Modular prompt templates and logic
  - `tools/` – Individual tool implementations
  - `tests/` – Unit tests for agent and tools
  - `assets/` – Static assets (optional)

## Description

Phil Connors is a cynical TV weatherman agent for the TKR Multi-Agent Chat system. He is designed as a modular, self-contained agent following ADK conventions.

## Capabilities

Phil_Connors currently has the following tools available via the ADK:

- **`weather_check`**: Fetches current weather for a specified location using OpenWeatherMap.

*(His primary function is being a cynical weatherman, implemented via prompt.)*

## Communication Protocol

This agent uses the Google Agent Development Kit (ADK) for execution. Communication with the frontend occurs via a direct WebSocket streaming connection established through the API Gateway (`/ws/v1/chat/{session_id}/phil_connors`). The A2A protocol is not currently used for task execution.

## Usage

Interact with Phil_Connors through the TKR Multi-Agent Chat UI:
1. Select an active chat session or create a new one.
2. Click the "Connect to: Phil_Connors" button in the chat header.
3. Once connected (button turns green), type messages in the input area and press Enter or click Send. Responses will stream back in real-time.
4. Click "Disconnect from Phil_Connors" to end the session.
