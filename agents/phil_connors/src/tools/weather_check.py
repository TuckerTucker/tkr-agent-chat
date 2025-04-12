"""
Weather Check Tool for phil_connors Agent

Fetches current weather information for a given location using the OpenWeatherMap API.
"""

import os
import requests
import logging
from typing import Dict, Any, Optional
# Removed dotenv import

# Configure logger
logger = logging.getLogger(__name__)

# Define base URL at module level
BASE_URL = "http://api.openweathermap.org/data/2.5/weather"
# API Key will be fetched inside the function

def weather_check(location: str) -> Dict[str, Any]:
    """
    Fetches current weather for a specified location.

    Args:
        location: The city name (e.g., "London", "New York, US").

    Returns:
        A dictionary containing weather data (temp, description, humidity, wind speed)
        or an error message.
    """
    logger.info(f"Weather check tool invoked for location: '{location}'")
    
    # Get API key from environment variable *inside* the function
    API_KEY = os.getenv("OPENWEATHER_API_KEY")

    if not API_KEY:
        error_msg = "OpenWeatherMap API key (OPENWEATHER_API_KEY) not configured or not loaded correctly."
        logger.error(error_msg)
        return {"error": error_msg}

    if not location or not isinstance(location, str):
        error_msg = "Invalid location provided. Please provide a city name."
        logger.error(error_msg)
        return {"error": error_msg}

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
             return {"error": f"API Error: {error_msg}"}

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
        error_msg = f"Request timed out while fetching weather for '{location}'."
        logger.error(error_msg)
        return {"error": error_msg}
    except requests.RequestException as e:
        error_msg = f"Network error fetching weather for '{location}': {e}"
        logger.exception(error_msg) # Log full traceback for network errors
        return {"error": error_msg}
    except Exception as e:
        error_msg = f"Unexpected error fetching weather for '{location}': {e}"
        logger.exception(error_msg) # Log full traceback for unexpected errors
        return {"error": error_msg}
