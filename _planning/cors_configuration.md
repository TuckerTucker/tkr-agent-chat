# CORS Configuration for TKR Agent Chat

## Overview

This document explains the CORS (Cross-Origin Resource Sharing) configuration for the TKR Agent Chat application.

## Problem Addressed

When using both FastAPI CORS middleware and Socket.IO's built-in CORS handling, duplicate CORS headers can be sent in responses:

```
The 'Access-Control-Allow-Origin' header contains multiple values 'http://localhost:5173, http://localhost:5173', but only one is allowed.
```

This causes browser CORS errors and prevents Socket.IO connections from being established.

## Solution

To address this issue, we've implemented a custom CORS middleware strategy:

1. **Socket.IO handles its own CORS**: The Socket.IO server is configured with explicit CORS settings.
2. **Custom CORS Middleware**: We use a custom middleware that bypasses CORS handling for Socket.IO routes.

### Implementation

```python
# Custom CORS middleware that excludes Socket.IO routes
class CustomCORSMiddleware(CORSMiddleware):
    async def __call__(self, scope, receive, send):
        # Skip CORS handling for Socket.IO routes to prevent duplicate headers
        path = scope.get("path", "")
        if path.startswith("/socket.io"):
            return await self.app(scope, receive, send)
            
        # For all other routes, apply normal CORS handling
        return await super().__call__(scope, receive, send)
```

### Key Components

- `/socket.io` routes: CORS handled by Socket.IO's built-in mechanism
- All other API routes: CORS handled by FastAPI's middleware

## Development Notes

- In development, both the frontend and backend should use consistent origins
- The default frontend origin is `http://localhost:5173`
- The backend origin is `http://localhost:8000`

## Troubleshooting

If CORS issues occur again, check:

1. Ensure the origins match between frontend and backend
2. Verify that Socket.IO routes are being excluded from FastAPI CORS handling
3. Check browser console for specific CORS error messages