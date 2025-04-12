# Removed echo import
from .weather_check import weather_check # Import the new tool

# Register weather_check tool
TOOL_REGISTRY = {
    "weather_check": weather_check,
}
