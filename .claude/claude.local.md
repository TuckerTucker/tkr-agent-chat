# Project Definition for the Multi-Agent Chat System

app:
  name: "Tucker's Team - Multi-Agent Chat"
  author: "Tucker"
  role: "Developer"
  description: "A web-based chat interface for interacting with multiple specialized AI agents using the Agent Development Kit (ADK) and A2A protocol"
  taskboard:
    info: Taskboard is an mcp server for kanban management
    Board: Socket.IO Implementation Plan
    ID: 9a124ce4-02fb-425b-957e-a4541d1da363
  github:
    user:"tuckertucker"
    repo:"tkr-agent-chat"
  version: "0.1.0"
  metadata:
    project_type: "multi_agent_chat_application"
    framework: "react"
    language: "typescript"
    last_updated: "2025-04-12"
  documentation_links:
    ui_overview: "multiagent_chat_ui.md"
    adk_docs: "adk_overview.md"
    component_library: "https://storybook.js.org/"
    api_docs: "agent_development_kit_documentation.md"
    onboarding: "README.md"
    design_system: "https://ui.shadcn.com"
    architecture: "_planning/tkr-project.yaml"
  venv: 
    location: "/Volumes/tkr-riffic/tucker-home-folder/tkr-agent-chat/tkr_env"
    start: "source start_env" # in project root
  dev server: npm run dev # starts client and server concurrently

database:
  framework: "LMDB"
  language: "Python"
  features:
    - "Fast key-value store"
    - "Memory-mapped files for performance"
    - "ACID transactions"
    - "Multi-process concurrency"
  code_organization:
    structure:
      - "api_gateway/src/db_lmdb.py"      # LMDB implementation 
      - "api_gateway/src/models/"         # Type definitions
      - "api_gateway/src/db_factory.py"   # Database factory pattern
    naming:
      collections: "snake_case"
      keys: "camelCase"
      indices: "snake_case"
  schema_management:
    approach: "Programmatic schema with msgpack serialization"
    migrations: "Key-based evolution with backward compatibility"
    validation:
      - "Type checking in serialization/deserialization"
      - "Secondary indices for relationships"
      - "ISO format for timestamps"
      - "Composite keys for uniqueness constraints"
  performance:
    optimizations:
      - "Memory-mapped files"
      - "Dupsort for index optimization"
      - "Batch operations"
      - "Efficient binary serialization with msgpack"
    settings:
      - "map_size=10GB"
      - "writemap=True"
      - "max_dbs=10"
      - "metasync=False (for performance)"

data_sources:
  rest_endpoints:
    agents: "/api/v1/agents"
    chats: "/api/v1/chats"
    library: "/api/v1/library"
    sessions: "/api/v1/sessions"
    metrics: "/api/v1/metrics"
  socket_io_endpoints:
    chat: "/socket.io/agents"
    status: "/socket.io/status"
  contracts:
    message_send:
      request: 
        - session_id: string
        - agent_id: string
        - content: string
      response:
        - message_id: string
        - status: "sent" | "error"
    agent_list:
      response:
        - id: string
        - name: string
        - color: string
        - capabilities: list
  code_references:
    backend: "api_gateway/src/routes/"
    frontend: "src/services/api.ts, src/services/socket-service.ts"

[Rest of file content remains unchanged...]
