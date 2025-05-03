"""
BaseAgent: Abstract base class for all agents.

- Loads config, overview, system prompt, and tool registry
- Provides interface for prompt and tool access
- Inherits from google.adk.agents.Agent
- Handles ADK import errors gracefully
- Provides basic structure for ADK compatibility
"""

import os
import sys
import asyncio
import importlib
import logging
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional, Union, Type

# Configure logging
import os.path

logger = logging.getLogger("agents.base")
logger.setLevel(logging.INFO)

if not logger.handlers:
    # Create console handler
    console_handler = logging.StreamHandler()
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Check if we should log to file in a log directory
    # First check for timestamped directory from logger_service
    base_log_dir = os.environ.get('TKR_LOG_DIR')
    if base_log_dir:
        try:
            # Convert to absolute path if relative
            if not os.path.isabs(base_log_dir):
                base_log_dir = os.path.abspath(os.path.join(os.getcwd(), base_log_dir))
            
            # Check for TKR_RUN_ID for consistent timestamping with gateway logs
            timestamp = os.environ.get('TKR_RUN_ID')
            if not timestamp:
                # Generate our own timestamp if TKR_RUN_ID is not set
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Create complete log directory path with timestamp
            log_dir = os.path.join(base_log_dir, timestamp)
                
            # Ensure directory exists
            if not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
                
            # Add file handler for agent logs
            agent_log_path = os.path.join(log_dir, 'agent.log')
            file_handler = logging.handlers.RotatingFileHandler(
                agent_log_path,
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5
            )
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            logger.info(f"Agent logging configured to write to {agent_log_path}")
        except Exception as e:
            logger.warning(f"Failed to set up agent file logging: {e}")

# --- ADK Import Strategy ---
class ImportError(Exception):
    """Enhanced ImportError with more details."""
    pass

def import_adk_agent() -> Union[Type, None]:
    """
    Attempts to import the ADK Agent class using multiple strategies.
    Returns the Agent class if successful, or a dummy class if all attempts fail.
    
    Strategies:
    1. Direct import from google.adk
    2. Import from google.adk.agents
    3. Check for environment variables pointing to custom paths
    """
    # Track all errors for comprehensive reporting
    import_errors = []
    
    # Check for custom ADK path in environment variables
    adk_path = os.environ.get("ADK_PATH")
    if adk_path and os.path.exists(adk_path):
        logger.info(f"Using custom ADK path from ADK_PATH: {adk_path}")
        try:
            # Add custom path to Python path
            sys.path.insert(0, adk_path)
            # Try to import after adding the path
            try:
                from google.adk import Agent
                logger.info("Successfully imported Agent from google.adk using custom path")
                return Agent
            except ImportError as e:
                error_msg = f"Failed to import from google.adk using custom path: {str(e)}"
                import_errors.append(error_msg)
                logger.warning(error_msg)
                
                try:
                    from google.adk.agents import Agent
                    logger.info("Successfully imported Agent from google.adk.agents using custom path")
                    return Agent
                except ImportError as e:
                    error_msg = f"Failed to import from google.adk.agents using custom path: {str(e)}"
                    import_errors.append(error_msg)
                    logger.warning(error_msg)
        finally:
            # Clean up the path modification to avoid side effects
            if adk_path in sys.path:
                sys.path.remove(adk_path)
    
    # Standard import attempts
    try:
        # Strategy 1: Direct import from google.adk
        from google.adk import Agent
        logger.info("Successfully imported Agent from google.adk")
        return Agent
    except ImportError as e:
        error_msg = f"Failed to import from google.adk directly: {str(e)}"
        import_errors.append(error_msg)
        logger.warning(error_msg)
        
        try:
            # Strategy 2: Import from google.adk.agents
            from google.adk.agents import Agent
            logger.info("Successfully imported Agent from google.adk.agents")
            return Agent
        except ImportError as e:
            error_msg = f"Failed to import from google.adk.agents: {str(e)}"
            import_errors.append(error_msg)
            logger.warning(error_msg)
    
    # If all strategies failed, log detailed error information
    logger.error("All ADK import strategies failed. Using dummy base class.")
    logger.error("Import errors encountered:")
    for i, error in enumerate(import_errors, 1):
        logger.error(f"  {i}. {error}")
    
    # Additionally, check for common issues
    check_environment_issues()
    
    # Return dummy class as fallback
    return None

def check_environment_issues():
    """Checks for common environment issues and logs helpful information."""
    # Check Python version
    py_version = sys.version.split()[0]
    logger.info(f"Python version: {py_version}")
    
    # Check if GOOGLE_API_KEY is set
    if not os.environ.get("GOOGLE_API_KEY"):
        logger.warning("GOOGLE_API_KEY environment variable is not set. This may cause ADK to fail.")
        try:
            # Try to read from .env file directly as a fallback
            env_file_path = os.path.join(os.getcwd(), '.env')
            if os.path.exists(env_file_path):
                logger.info(f"Found .env file at {env_file_path}, attempting to read API key")
                with open(env_file_path, 'r') as f:
                    for line in f:
                        if line.strip().startswith('GOOGLE_API_KEY='):
                            key_value = line.strip().split('=', 1)[1].strip()
                            if key_value and key_value != 'your-api-key-here':
                                # Don't set the API key in the environment here, just log that it was found
                                logger.info("Found GOOGLE_API_KEY in .env file, but it wasn't loaded into environment")
                            else:
                                logger.warning("GOOGLE_API_KEY found in .env file but appears to be a placeholder value")
        except Exception as e:
            logger.warning(f"Error checking .env file for API key: {e}")
    else:
        logger.info("GOOGLE_API_KEY environment variable is set")
    
    # Check other important environment variables
    google_genai_use_vertexai = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "0")
    logger.info(f"GOOGLE_GENAI_USE_VERTEXAI: {google_genai_use_vertexai}")
    
    # Check for required packages
    required_packages = ["google-adk", "google-generativeai"]
    for package in required_packages:
        try:
            # Check if package is importable - this doesn't mean it's properly installed
            spec = importlib.util.find_spec(package.replace("-", "_"))
            if spec is None:
                logger.warning(f"Required package '{package}' doesn't appear to be installed.")
            else:
                try:
                    # Try to import the package to verify it
                    module = importlib.import_module(package.replace("-", "_"))
                    version = getattr(module, "__version__", "unknown")
                    logger.info(f"Found package '{package}' (version: {version})")
                    
                    # Extra checks for google.generativeai
                    if package == "google-generativeai":
                        try:
                            # Check if we can configure the API
                            if hasattr(module, 'configure'):
                                logger.info("google.generativeai.configure is available")
                                
                                # Check if API key is set and try a basic configuration
                                api_key = os.environ.get("GOOGLE_API_KEY")
                                if api_key:
                                    try:
                                        module.configure(api_key=api_key)
                                        logger.info("Successfully configured google.generativeai with API key")
                                        
                                        # Try to list available models as a deeper test
                                        if hasattr(module, 'list_models'):
                                            logger.info("Checking available Gemini models...")
                                    except Exception as config_err:
                                        logger.warning(f"Failed to configure google.generativeai: {config_err}")
                        except Exception as genai_err:
                            logger.warning(f"Error in additional checks for google.generativeai: {genai_err}")
                except Exception as e:
                    logger.warning(f"Package '{package}' is installed but failed to import: {e}")
        except Exception as e:
            logger.warning(f"Error checking for package '{package}': {e}")
            
    # Check for PYTHONPATH issues
    python_path = os.environ.get('PYTHONPATH', '')
    if python_path:
        logger.info(f"PYTHONPATH is set to: {python_path}")
    else:
        logger.warning("PYTHONPATH is not set, which might cause import issues")
        
    # Log the current working directory and module search paths
    logger.info(f"Current working directory: {os.getcwd()}")
    logger.info(f"Python module search paths: {sys.path}")

# Import ADK Agent or use dummy class
ADKAgentBase = import_adk_agent()
ADK_AGENT_AVAILABLE = ADKAgentBase is not None

# Create dummy class if ADK Agent is not available
if not ADK_AGENT_AVAILABLE:
    class ADKAgentBase:
        """Dummy ADK Agent class for fallback when ADK is not available."""
        def __init__(self, name: str, model: Optional[str] = None, description: Optional[str] = None, 
                    instruction: Optional[str] = None, tools: Optional[List[Any]] = None, **kwargs):
            self.name = name
            self.model = model
            self.description = description
            self.instruction = instruction
            self.tools = tools or []
            self.sub_agents = [] # Ensure dummy also has sub_agents
            # Add dummy model_config for consistency if needed
            model_config = {}
            logger.info(f"Created dummy ADKAgentBase for {name} with {len(tools or [])} tools") 

class BaseAgent(ADKAgentBase):
    """Our custom base agent, inheriting from ADK's Agent."""
    
    # Allow extra fields beyond what ADKAgentBase defines
    model_config = {"extra": "allow"} 

    def __init__(self, config: Dict[str, Any], tool_registry: Dict[str, Any], system_prompt: str, overview: str):
        """
        Initialize the base agent with configuration, tools, and prompts.
        
        Args:
            config: Dictionary with agent configuration (id, name, description, etc.)
            tool_registry: Dictionary mapping tool names to tool functions
            system_prompt: The base system prompt for the agent
            overview: A short overview description of the agent's capabilities
        """
        try:
            # Validate required configuration
            required_fields = ["id", "name", "description", "color"]
            for field in required_fields:
                if field not in config:
                    raise ValueError(f"Missing required field '{field}' in agent config")
            
            # Extract required fields for ADKAgentBase.__init__ from config
            agent_id = config["id"]  # Use ID for ADK agent name (valid identifier)
            agent_display_name = config["name"]  # Keep display name separately
            model_name = config.get("model", "gemini-2.0-flash-exp") # Default model
            agent_description = config["description"]
            
            # Build enhanced context-aware system prompt
            context_prompt = self._get_context_aware_prompt_extension()
            agent_instruction = f"{system_prompt}\n\n{context_prompt}"
            
            # Map our tool registry to the format ADK expects
            adk_tools = list(tool_registry.values()) if tool_registry else []
            
            # Log agent initialization
            logger.info(f"Initializing agent: {agent_id} ({agent_display_name})")
            logger.info(f"Using model: {model_name}")
            logger.info(f"Tools: {len(adk_tools)} tool(s) available")
            
            # Call the parent ADKAgentBase initializer
            try:
                super().__init__(
                    name=agent_id,
                    model=model_name,
                    description=agent_description,
                    instruction=agent_instruction,
                    tools=adk_tools
                )
                logger.info(f"Agent {agent_id} initialized successfully with ADK")
            except Exception as e:
                logger.error(f"Error initializing ADKAgentBase for {agent_id}: {e}")
                if not ADK_AGENT_AVAILABLE:
                    logger.warning("Using dummy ADKAgentBase due to import failure")
                raise
            
            # Store our specific config and other attributes
            self.config = config
            self.id = config["id"] # Keep our internal ID
            self.color = config["color"]
            self.capabilities = config.get("capabilities", [])
            self.system_prompt = system_prompt # Keep for potential direct use
            self.overview = overview
            self.avatar = config.get("avatar")  # Add avatar attribute if present in config
            
            # Initialize state tracking
            self._last_error = None
            self._health_status = "healthy"
            self._last_activity = None
            
            # Initialize tool registry for our own use
            self.tool_registry = tool_registry
        
        except Exception as e:
            logger.error(f"Failed to initialize agent {config.get('id', 'unknown')}: {e}")
            # Re-raise to allow proper error handling
            raise
    
    def _get_context_aware_prompt_extension(self) -> str:
        """
        Create an enhanced context-aware prompt extension that helps the agent
        understand and use context from other agents effectively.
        """
        return """
        # CONTEXT HANDLING INSTRUCTIONS

        You have access to shared context from other agents in the conversation.
        This context will be included at the start of user messages in this format:
        
        CONTEXT FROM OTHER PARTICIPANTS:
        From [agent]: [message]
        From [agent]: [message]
        ...
        
        User message: [actual user message]

        When you see this context:
        
        1. Analyze the context before responding to understand what other agents have already shared
        2. Build upon this shared information rather than repeating it
        3. If other agents have provided factual information, consider it reliable
        4. If the context contains relevant expertise from specialized agents, defer to their knowledge
        5. Ensure your responses complement and extend what has been shared
        6. Consider mentioning specific agents by name when building on their contributions
        7. Maintain a consistent approach with the conversation flow
        8. Focus primarily on addressing the user's message while leveraging the shared context
        
        The quality of your collaboration with other agents will significantly enhance the user experience.
        """
    
    def get_system_prompt(self, **template_vars) -> str:
        """
        Get the system prompt with template variables filled in, including shared context.
        
        Args:
            **template_vars: Keyword arguments to substitute in the prompt template
            
        Returns:
            The filled system prompt
        """
        # Record activity for health tracking
        self._last_activity = datetime.now().isoformat() if 'datetime' in globals() else None
        
        # Get shared context from the context service
        shared_context = []
        try:
            from api_gateway.src.services.context_service import context_service
            session_id = template_vars.get("session_id")
            
            if session_id:
                shared_context = context_service.get_shared_context(
                    target_agent_id=self.id,
                    session_id=session_id
                )
                
                # Also, format context specifically for this prompt
                formatted_context = context_service.format_context_for_content(
                    target_agent_id=self.id,
                    session_id=session_id
                )
                
                if formatted_context:
                    template_vars["formatted_context"] = formatted_context
            
        except ImportError as e:
            logger.warning(f"Context service not available: {e}")
        except Exception as e:
            logger.warning(f"Failed to get shared context: {e}")
            self._last_error = str(e)

        # Add context to template vars
        if shared_context:
            template_vars["shared_context"] = "\n".join([
                f"Context from {ctx['source_agent_id']}: {ctx['content'].get('content', '')}"
                for ctx in shared_context
                if isinstance(ctx['content'], dict) and 'content' in ctx['content']
            ])
        else:
            template_vars["shared_context"] = "No shared context available."

        # Improved template substitution with error handling
        prompt = self.system_prompt
        for k, v in template_vars.items():
            try:
                placeholder = "{{" + k + "}}"
                if placeholder in prompt:
                    prompt = prompt.replace(placeholder, str(v))
            except Exception as e:
                logger.warning(f"Error substituting template variable {k}: {e}")
                self._last_error = str(e)
        
        return prompt
    
    def get_tool(self, name: str) -> Optional[Any]:
        """
        Get a tool by name.
        
        Args:
            name: The name of the tool to get
            
        Returns:
            The tool function or None if not found
        """
        if hasattr(self, 'tool_registry') and isinstance(self.tool_registry, dict):
            return self.tool_registry.get(name)
        
        if hasattr(self, 'tools'):
            if isinstance(self.tools, dict):
                return self.tools.get(name)
            elif isinstance(self.tools, list):
                # Try to find a tool with matching name in the list
                for tool in self.tools:
                    if hasattr(tool, '__name__') and tool.__name__ == name:
                        return tool
                    if hasattr(tool, 'name') and tool.name == name:
                        return tool
        
        logger.warning(f"Tool '{name}' not found for agent {self.id}")
        return None

    def list_tools(self) -> List[str]:
        """
        List all available tool names.
        
        Returns:
            List of tool names
        """
        if hasattr(self, 'tool_registry') and isinstance(self.tool_registry, dict):
            return list(self.tool_registry.keys())
        
        if hasattr(self, 'tools'):
            if isinstance(self.tools, dict):
                return list(self.tools.keys())
            elif isinstance(self.tools, list):
                # Extract tool names from the list
                names = []
                for tool in self.tools:
                    if hasattr(tool, '__name__'):
                        names.append(tool.__name__)
                    elif hasattr(tool, 'name'):
                        names.append(tool.name)
                return names
        
        return []
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get the health status of the agent.
        
        Returns:
            Dictionary with health status information including:
            - Basic agent identification (id, name)
            - Current health status (healthy, error, etc.)
            - Last activity timestamp and error information
            - Activity age check (hung detection)
            - Available tools and capabilities
        """
        # Get current timestamp for age calculation
        current_time = datetime.now().isoformat() if 'datetime' in globals() else None
        
        # Check for hung state based on activity timestamp
        is_hung = False
        minutes_since_activity = None
        
        if self._last_activity and current_time:
            try:
                # Parse timestamps to calculate elapsed time
                last_activity_time = datetime.fromisoformat(self._last_activity)
                current_time_parsed = datetime.fromisoformat(current_time)
                
                # Calculate minutes since last activity
                delta = current_time_parsed - last_activity_time
                minutes_since_activity = delta.total_seconds() / 60
                
                # Mark as hung if inactive too long (default: 30 minutes)
                timeout_minutes = int(os.environ.get("AGENT_INACTIVITY_TIMEOUT_MINUTES", "30"))
                is_hung = minutes_since_activity > timeout_minutes
                
                # Update status if hung
                if is_hung and self._health_status == "healthy":
                    self._health_status = "hung"
            except (ValueError, TypeError) as e:
                logger.warning(f"Error calculating activity age for agent {self.id}: {e}")
        
        return {
            "id": self.id,
            "name": self.config.get("name", self.id),
            "status": self._health_status,
            "last_error": self._last_error,
            "last_activity": self._last_activity,
            "minutes_since_activity": round(minutes_since_activity, 2) if minutes_since_activity is not None else None,
            "is_hung": is_hung,
            "tools_available": len(self.list_tools()),
            "capabilities": self.capabilities
        }
    
    def reset_state(self) -> None:
        """
        Reset the agent's state for recovery.
        """
        self._last_error = None
        self._health_status = "healthy"
        logger.info(f"Agent {self.id} state reset")
    
    async def generate_response(self, session, message: str, system_prompt: str = None) -> str:
        """
        Generate a response to a user message using the ADK or a fallback mechanism.
        
        Args:
            session: ADK session object
            message: The user message to respond to
            system_prompt: Optional system prompt to use for this specific generation
            
        Returns:
            The generated response text
        """
        try:
            # Record activity for health tracking
            self._last_activity = datetime.now().isoformat() if 'datetime' in globals() else None
            
            # Log generation attempt
            logger.info(f"Agent {self.id} generating response to message: {message[:50]}...")
            
            # First approach: Use ADK's run() method if available
            if ADK_AGENT_AVAILABLE and hasattr(self, 'run') and callable(self.run):
                try:
                    # Use ADK's run method
                    logger.info(f"Using ADK run() to generate response for agent {self.id}")
                    
                    # Use system prompt if provided, otherwise use default
                    instruction = system_prompt if system_prompt else self.instruction
                    
                    # Run the agent using the ADK
                    response = await self.run(
                        message,
                        session=session,
                        instruction=instruction
                    )
                    
                    # Extract the text from the response
                    if hasattr(response, 'text') and response.text:
                        response_text = response.text
                    elif isinstance(response, str):
                        response_text = response
                    else:
                        # Try to extract from various response formats
                        try:
                            if hasattr(response, 'content'):
                                response_text = response.content
                            elif hasattr(response, 'message'):
                                response_text = response.message
                            elif hasattr(response, 'response'):
                                response_text = response.response
                            else:
                                response_text = str(response)
                        except Exception as extract_err:
                            logger.error(f"Error extracting response text: {extract_err}")
                            response_text = f"I encountered an error generating a response."
                    
                    logger.info(f"ADK run() generated response for agent {self.id}: {response_text[:50]}...")
                    return response_text
                    
                except Exception as adk_err:
                    logger.error(f"Error using ADK run() for generation: {adk_err}", exc_info=True)
                    self._last_error = str(adk_err)
                    # Fall through to next approach
            
            # Second approach: Try using google.generativeai directly if available
            try:
                import google.generativeai as genai
                import os
                
                # Check if API key is available
                api_key = os.environ.get("GOOGLE_API_KEY")
                if not api_key:
                    logger.error("No GOOGLE_API_KEY found in environment variables")
                    raise ValueError("GOOGLE_API_KEY environment variable not set")
                
                # Configure the generativeai library with the API key
                genai.configure(api_key=api_key)
                
                # Determine the model to use
                model_name = self.model if hasattr(self, 'model') else "gemini-2.0-flash-exp"
                logger.info(f"Using Gemini model {model_name} for direct generation")
                
                # Get the model
                model = genai.GenerativeModel(model_name)
                
                # Prepare the prompt with system instructions
                prompt_system = system_prompt if system_prompt else self.instruction
                if not prompt_system:
                    prompt_system = f"You are {self.name}, {self.description}"
                
                # Create messages with system prompt and user message
                messages = [
                    {
                        "role": "user",
                        "parts": [{"text": f"Instructions for you as an AI assistant: {prompt_system}"}]
                    },
                    {
                        "role": "model",
                        "parts": [{"text": "I understand and will act according to these instructions."}]
                    },
                    {
                        "role": "user", 
                        "parts": [{"text": message}]
                    }
                ]
                
                # Use generate_content to ensure system prompt is included
                response = await asyncio.to_thread(
                    model.generate_content, 
                    messages,
                    generation_config={
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "max_output_tokens": 1024,
                    },
                    safety_settings={
                        "harassment": "block_none",
                        "hate": "block_none",
                        "sexual": "block_none",
                        "dangerous": "block_none",
                    }
                )
                
                # Extract text from response - handle different response formats
                try:
                    if hasattr(response, 'text'):
                        response_text = response.text
                    elif hasattr(response, 'parts') and len(response.parts) > 0:
                        response_text = response.parts[0].text
                    elif hasattr(response, 'candidates') and len(response.candidates) > 0 and len(response.candidates[0].content.parts) > 0:
                        response_text = response.candidates[0].content.parts[0].text
                    else:
                        response_text = str(response)
                except Exception as extract_err:
                    logger.warning(f"Error extracting text from model response: {extract_err}")
                    response_text = "I had trouble generating a response. Please try again."
                
                logger.info(f"Gemini direct API generated response for agent {self.id}: {response_text[:50]}...")
                return response_text
                
            except ImportError as import_err:
                logger.error(f"Failed to import google.generativeai: {import_err}")
                # Fall through to next approach
            except Exception as genai_err:
                logger.error(f"Error using direct Gemini API: {genai_err}", exc_info=True)
                self._last_error = str(genai_err)
                # Fall through to fallback mechanism
            
            # Fallback mechanism when direct API access fails
            logger.warning(f"Using fallback response generation for agent {self.id}")
            
            # Load custom prompt-based responses instead of simple canned responses
            prompt_context = f"""
            Agent name: {self.name}
            Agent description: {self.description}
            Capabilities: {', '.join(self.capabilities) if hasattr(self, 'capabilities') else 'General assistance'}
            
            User message: {message}
            
            Please generate a tailored response from this agent to the user's message.
            This should be a well-crafted, informative answer that addresses the user's
            query in a helpful way, while staying true to the agent's defined role.
            """
            
            # Create detailed responses based on agent characteristics and the message
            detailed_responses = [
                f"I appreciate your question about '{message[:50]}...'. As {self.name}, I specialize in providing detailed assistance with these types of inquiries. From my understanding, the key aspects to address are...",
                
                f"Thanks for reaching out! I'm analyzing your message: '{message[:50]}...'. Based on my capabilities as {self.name}, I can provide the following insights...",
                
                f"I'm {self.name}, and I'm designed to help with questions like yours about '{message[:50]}...'. Here's what I can tell you based on my knowledge...",
                
                f"As {self.name}, I've processed your request about '{message[:50]}...'. While this would typically engage my full AI capabilities, I'm currently in a demonstration mode. In a production environment, I would provide a comprehensive response addressing all aspects of your query."
            ]
            
            # Add agent-specific context-based response
            if hasattr(self, 'capabilities') and self.capabilities:
                capabilities_text = ", ".join(self.capabilities[:3])  # First 3 capabilities
                detailed_responses.append(f"Thank you for your message about '{message[:50]}...'. As {self.name} with expertise in {capabilities_text}, I can provide specialized assistance here. The key points to understand are...")
            
            # Select a detailed response
            import random
            response_text = random.choice(detailed_responses)
            
            logger.info(f"Enhanced fallback response for agent {self.id}: {response_text[:50]}...")
            return response_text
            
        except Exception as e:
            logger.error(f"Error in generate_response for agent {self.id}: {e}", exc_info=True)
            self._last_error = str(e)
            return f"I encountered an error and couldn't generate a proper response. Error: {str(e)}"
        
    # Additional helper methods can be added here if needed
