"""
Weather Check Tool for phil_connors Agent

Fetches current weather information for a given location using the OpenWeatherMap API.
Uses standardized error handling for consistent error responses.
"""

import os
import requests
import logging
from typing import Dict, Any, Optional

# Import standardized tool error handling
from agents.common.tool_errors import (
    ToolErrorResponse, 
    ToolErrorCategory,
    ToolErrorCodes,
    missing_api_key_error,
    invalid_parameter_error,
    timeout_error,
    network_error
)

# Configure logger
logger = logging.getLogger(__name__)

# Define base URL at module level
BASE_URL = "http://api.openweathermap.org/data/2.5/weather"
# Tool name constant for error handling
TOOL_NAME = "weather_check"

def weather_check(location: str) -> Dict[str, Any]:
    """
    Fetches current weather for a specified location.

    Args:
        location: The city name (e.g., "London", "New York, US").

    Returns:
        A dictionary containing weather data (temp, description, humidity, wind speed)
        or a standardized error response.
    """
    logger.info(f"Weather check tool invoked for location: '{location}'")
    
    # Get API key from environment variable *inside* the function
    API_KEY = os.getenv("OPENWEATHER_API_KEY")

    # Check for API key using standardized error
    if not API_KEY:
        error = missing_api_key_error(
            key_name="OpenWeatherMap API key",
            env_var="OPENWEATHER_API_KEY",
            tool_name=TOOL_NAME
        )
        logger.error(f"Missing API key: {error['message']}")
        return error

    # Validate location parameter
    if not location or not isinstance(location, str):
        error = invalid_parameter_error(
            param_name="location",
            message="Please provide a valid city name as a string",
            tool_name=TOOL_NAME,
            received_value=location
        )
        logger.error(f"Invalid location: {error['message']}")
        return error

    params = {
        "q": location,
        "appid": API_KEY,
        "units": "metric" # Use metric units (Celsius)
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        
        data = response.json()

        if data.get("cod") != 200:
             # OpenWeatherMap specific error handling
             error_msg = data.get("message", "Unknown API error")
             logger.error(f"OpenWeatherMap API error for '{location}': {error_msg}")
             
             # Create standardized API error
             error = ToolErrorResponse.create(
                 error_code=ToolErrorCodes.API_ERROR,
                 message=f"OpenWeatherMap API error: {error_msg}",
                 category=ToolErrorCategory.API,
                 tool_name=TOOL_NAME,
                 details={
                     "location": location,
                     "api_response": data
                 }
             )
             return error

        # Extract relevant information
        main_weather = data.get("weather", [{}])[0]
        weather_info = {
            "location": data.get("name", location),
            "temperature_celsius": data.get("main", {}).get("temp"),
            "feels_like_celsius": data.get("main", {}).get("feels_like"),
            "description": main_weather.get("description"),
            "humidity_percent": data.get("main", {}).get("humidity"),
            "wind_speed_mps": data.get("wind", {}).get("speed"),
            "icon": main_weather.get("icon"), # Icon code
        }
        logger.info(f"Weather check successful for '{location}': {weather_info}")
        return weather_info

    except requests.Timeout:
        # Use standardized timeout error
        error = timeout_error(
            service_name="OpenWeatherMap API",
            timeout_seconds=10,
            tool_name=TOOL_NAME
        )
        logger.error(f"Request timeout: {error['message']}")
        return error
        
    except requests.RequestException as e:
        # Use standardized network error
        error = network_error(
            service_name="OpenWeatherMap API",
            error_details=str(e),
            tool_name=TOOL_NAME
        )
        logger.exception(f"Network error: {error['message']}")
        return error
        
    except Exception as e:
        # Use standardized error from exception
        error = ToolErrorResponse.from_exception(
            exception=e,
            tool_name=TOOL_NAME,
            additional_details={"location": location}
        )
        logger.exception(f"Unexpected error: {error['message']}")
        return error
