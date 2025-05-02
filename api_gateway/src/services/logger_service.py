"""
Centralized logging configuration service.

Provides standardized logging formats, handlers, and log rotation
for consistent logging across the API Gateway.
"""

import os
import json
import logging
import logging.handlers
from datetime import datetime
from typing import Dict, Any, Optional, Union

# Configure the root logger
root_logger = logging.getLogger()

# Determine base log directory - allow override via environment variable
BASE_LOG_DIR = os.environ.get('TKR_LOG_DIR') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'logs'))
# Convert to absolute path if relative path was provided
if not os.path.isabs(BASE_LOG_DIR):
    BASE_LOG_DIR = os.path.abspath(os.path.join(os.getcwd(), BASE_LOG_DIR))
# Ensure base directory exists
if not os.path.exists(BASE_LOG_DIR):
    os.makedirs(BASE_LOG_DIR, exist_ok=True)

# Create timestamped subdirectory for this server run
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
run_id = os.environ.get('TKR_RUN_ID', timestamp)  # Allow override via env var
LOG_DIR = os.path.join(BASE_LOG_DIR, run_id)
# Ensure run directory exists
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR, exist_ok=True)
    
# Log the directory being used
logging.getLogger('root').info(f"Using timestamped log directory: {LOG_DIR}")

# Configurable log levels
LOG_LEVELS = {
    'debug': logging.DEBUG,
    'info': logging.INFO,
    'warning': logging.WARNING,
    'error': logging.ERROR,
    'critical': logging.CRITICAL
}

# Default log level from environment or fallback to INFO
DEFAULT_LOG_LEVEL = os.environ.get('LOG_LEVEL', 'info').lower()
ROOT_LOG_LEVEL = LOG_LEVELS.get(DEFAULT_LOG_LEVEL, logging.INFO)

# Define custom formatter that handles extra attributes for structured logging
class StructuredLogFormatter(logging.Formatter):
    """Format logs in a structured JSON format with extra attributes."""
    
    def __init__(self, include_timestamp: bool = True, format_json: bool = True, colorize: bool = True):
        super().__init__()
        self.include_timestamp = include_timestamp
        self.format_json = format_json
        self.colorize = colorize
        
        # ANSI color codes
        if self.colorize:
            self.colors = {
                'DEBUG': '\033[36m',  # Cyan
                'INFO': '\033[32m',   # Green
                'WARNING': '\033[33m', # Yellow
                'ERROR': '\033[31m',  # Red
                'CRITICAL': '\033[41m\033[37m',  # White on Red background
                'RESET': '\033[0m'    # Reset
            }
        else:
            self.colors = {level: '' for level in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL', 'RESET']}
    
    def format(self, record):
        # Start with basic log record info
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z' if self.include_timestamp else None, 
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'line': record.lineno
        }
        
        # Remove None values
        log_data = {k: v for k, v in log_data.items() if v is not None}
        
        # Add extra attributes from record
        if hasattr(record, 'extras') and record.extras:
            log_data.update(record.extras)
        
        # Add any keyword arguments passed to the logger
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in ['args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
                              'funcName', 'id', 'levelname', 'levelno', 'lineno', 'module',
                              'msecs', 'message', 'msg', 'name', 'pathname', 'process',
                              'processName', 'relativeCreated', 'stack_info', 'thread',
                              'threadName', 'extras']:
                    log_data[key] = value
        
        # Format exceptions if present
        if record.exc_info:
            formatter = logging.Formatter()
            log_data['exception'] = formatter.formatException(record.exc_info)
            
        # If not formatting as JSON, create a human-readable format for console output
        if not self.format_json:
            # Format timestamp
            timestamp = log_data.get('timestamp', '')
            if timestamp:
                timestamp = timestamp.replace('T', ' ').replace('Z', '')
                
            # Format level with color
            level = log_data.get('level', '')
            level_display = f"{self.colors.get(level, '')}{level.ljust(8)}{self.colors['RESET']}"
            
            # Extract basic info
            module = log_data.get('module', '')
            line = log_data.get('line', '')
            message = log_data.get('message', '')
            
            # Build the log string
            log_parts = []
            if timestamp:
                log_parts.append(f"{timestamp}")
            log_parts.append(f"{level_display}")
            
            if module:
                module_info = f"{module}"
                if line:
                    module_info += f":{line}"
                log_parts.append(f"[{module_info}]")
                
            log_parts.append(f"{message}")
            
            # Add context if present
            extras = {}
            if hasattr(record, 'extras') and record.extras:
                extras.update(record.extras)
            if extras:
                context_str = " ".join([f"{k}={v}" for k, v in extras.items()])
                log_parts.append(f"({context_str})")
                
            # Add exception information if present
            if 'exception' in log_data:
                log_parts.append(f"\n{log_data['exception']}")
                
            return " ".join(log_parts)
        
        # Handle non-serializable objects
        def default_serializer(obj):
            if hasattr(obj, '__class__'):
                return f"<{obj.__class__.__name__}>"
            return str(obj)
            
        # Convert to JSON string
        try:
            return json.dumps(log_data, default=default_serializer)
        except (TypeError, ValueError) as e:
            # Fall back to a simpler format if JSON serialization fails
            timestamp = log_data.get('timestamp', datetime.utcnow().isoformat())
            level = log_data.get('level', 'ERROR')
            message = log_data.get('message', 'Unknown message')
            return f"{timestamp} - {level} - {message} - Error serializing log: {str(e)}"


class LoggerService:
    """
    Service for standardized logging configuration and management.
    
    Provides methods for:
    - Configuring global logging settings
    - Creating loggers with consistent formatting
    - Adding standard log handlers
    """
    
    @staticmethod
    def configure_root_logger(log_level: str = DEFAULT_LOG_LEVEL, 
                              console_output: bool = True,
                              file_output: bool = True,
                              log_filename: str = 'api_gateway.log',
                              log_dir: str = None,
                              max_file_size_mb: int = 10,
                              backup_count: int = 5):
        """
        Configure the root logger with standardized settings.
        
        Args:
            log_level: The minimum log level to record
            console_output: Whether to output logs to console
            file_output: Whether to output logs to a file
            log_filename: Base filename for log files
            log_dir: Directory to store log files (overrides LOG_DIR if provided)
            max_file_size_mb: Maximum size of log file in MB before rotation
            backup_count: Number of backup files to keep
        """
        level = LOG_LEVELS.get(log_level.lower(), logging.INFO)
        root_logger.setLevel(level)
        
        # Determine log directory - either use provided or default
        output_dir = log_dir or LOG_DIR
        
        # Convert to absolute path if relative path was provided
        if log_dir and not os.path.isabs(output_dir):
            output_dir = os.path.abspath(os.path.join(os.getcwd(), output_dir))
            
        # Ensure directory exists
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # Remove existing handlers to avoid duplicates
        for handler in list(root_logger.handlers):
            root_logger.removeHandler(handler)
        
        # Get environment variables for formatting options
        use_console_colors = os.environ.get('TKR_LOG_COLORIZE', 'true').lower() == 'true'
        console_format_json = os.environ.get('TKR_LOG_CONSOLE_JSON', 'false').lower() == 'true'
        
        # Console handler for standard output
        if console_output:
            console_handler = logging.StreamHandler()
            console_formatter = StructuredLogFormatter(
                include_timestamp=False,
                format_json=console_format_json,
                colorize=use_console_colors
            )
            console_handler.setFormatter(console_formatter)
            console_handler.setLevel(level)
            root_logger.addHandler(console_handler)
        
        # File handler with rotation
        if file_output:
            log_file_path = os.path.join(output_dir, log_filename)
            file_handler = logging.handlers.RotatingFileHandler(
                log_file_path,
                maxBytes=max_file_size_mb * 1024 * 1024,  # Convert MB to bytes
                backupCount=backup_count
            )
            # File logs are always JSON for structured logging
            file_formatter = StructuredLogFormatter(include_timestamp=True, format_json=True, colorize=False)
            file_handler.setFormatter(file_formatter)
            file_handler.setLevel(level)
            root_logger.addHandler(file_handler)
            
        # Add error log file for error/critical messages
        if file_output:
            error_log_path = os.path.join(output_dir, f'error_{log_filename}')
            error_handler = logging.handlers.RotatingFileHandler(
                error_log_path,
                maxBytes=max_file_size_mb * 1024 * 1024,
                backupCount=backup_count
            )
            # Error logs are always JSON for structured logging
            error_formatter = StructuredLogFormatter(include_timestamp=True, format_json=True, colorize=False)
            error_handler.setFormatter(error_formatter)
            error_handler.setLevel(logging.ERROR)  # Only ERROR and CRITICAL
            root_logger.addHandler(error_handler)
            
        root_logger.info(f"Logging configured with level: {log_level} in directory: {output_dir}")
    
    @staticmethod
    def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
        """
        Get a logger with the specified name and optional level.
        
        Args:
            name: The name for the logger
            level: Optional log level override
            
        Returns:
            A configured logger instance
        """
        logger = logging.getLogger(name)
        
        if level:
            logger.setLevel(LOG_LEVELS.get(level.lower(), logging.INFO))
            
        return logger
    
    @staticmethod
    def log_with_context(logger: logging.Logger, 
                         level: str, 
                         message: str, 
                         context: Dict[str, Any],
                         exc_info: Union[bool, Exception] = None):
        """
        Log a message with additional contextual information.
        
        Args:
            logger: The logger to use
            level: Log level (debug, info, warning, error, critical)
            message: The log message
            context: Dictionary of contextual information
            exc_info: Exception information to include
        """
        level_method = getattr(logger, level.lower(), logger.info)
        level_method(message, extra={'extras': context}, exc_info=exc_info)


# Configure the root logger immediately on module import
LoggerService.configure_root_logger()

# Create a singleton instance
logger_service = LoggerService()