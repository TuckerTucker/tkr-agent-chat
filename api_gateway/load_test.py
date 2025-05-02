#!/usr/bin/env python
"""
Simple load testing script for the WebSocket connections.

This script creates multiple WebSocket connections to test scalability
and performance of the WebSocket server.

Usage:
    python load_test.py [--connections=100] [--duration=60] [--server=ws://localhost:8000]
"""

import os
import sys
import time
import json
import asyncio
import argparse
import logging
import random
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
import websockets
from websockets.exceptions import ConnectionClosed

# Configure logging
logging.basicConfig(
    format='%(asctime)s [%(levelname)s] %(message)s',
    level=logging.INFO,
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("load-test")

# Parse command line arguments
parser = argparse.ArgumentParser(description="WebSocket Load Testing")
parser.add_argument('--connections', type=int, default=20,
                    help='Number of connections to create (default: 20)')
parser.add_argument('--duration', type=int, default=30,
                    help='Test duration in seconds (default: 30)')
parser.add_argument('--server', type=str, default='ws://localhost:8000',
                    help='WebSocket server URL (default: ws://localhost:8000)')
parser.add_argument('--agent-id', type=str, default='chloe',
                    help='Agent ID to use for testing (default: chloe)')
parser.add_argument('--session-prefix', type=str, default='load-test',
                    help='Prefix for session IDs (default: load-test)')
parser.add_argument('--message-interval', type=float, default=5.0,
                    help='Interval between messages in seconds (default: 5.0)')

args = parser.parse_args()

# Global stats
stats = {
    'total_connections': 0,
    'active_connections': 0,
    'connection_failures': 0,
    'messages_sent': 0,
    'messages_received': 0,
    'errors': 0,
    'latencies': [],
    'start_time': None,
    'end_time': None,
}

async def handle_connection(connection_id: int, server_url: str, agent_id: str, session_id: str, message_interval: float):
    """
    Handle a single WebSocket connection for load testing.
    
    Args:
        connection_id: Unique ID for this connection
        server_url: WebSocket server URL
        agent_id: Agent ID to use
        session_id: Session ID to use
        message_interval: Time between messages in seconds
    """
    log_prefix = f"[Conn-{connection_id}]"
    ws_url = f"{server_url}/ws/v1/chat/{session_id}/{agent_id}"
    
    # Create and track metrics for this connection
    metrics = {
        'messages_sent': 0,
        'messages_received': 0,
        'connection_time': None,
        'last_send_time': None,
        'errors': 0,
    }
    
    logger.info(f"{log_prefix} Connecting to {ws_url}")
    
    try:
        # Start timing the connection setup
        conn_start = time.time()
        
        async with websockets.connect(ws_url) as ws:
            conn_time = time.time() - conn_start
            metrics['connection_time'] = conn_time
            logger.info(f"{log_prefix} Connected in {conn_time:.3f}s")
            
            # Track global stats
            stats['total_connections'] += 1
            stats['active_connections'] += 1
            
            # Setup message task and receive loop
            send_task = asyncio.create_task(send_messages(ws, connection_id, metrics, message_interval))
            
            # Receive loop
            try:
                while True:
                    try:
                        # Set a timeout to avoid blocking forever
                        message = await asyncio.wait_for(ws.recv(), timeout=1.0)
                        
                        # Process the message
                        metrics['messages_received'] += 1
                        stats['messages_received'] += 1
                        
                        # Try to parse as JSON to check for errors
                        try:
                            data = json.loads(message)
                            if 'error' in data:
                                logger.warning(f"{log_prefix} Received error: {data['error']}")
                                metrics['errors'] += 1
                                stats['errors'] += 1
                        except json.JSONDecodeError:
                            # Not JSON, just log the message length
                            pass
                            
                    except asyncio.TimeoutError:
                        # Check if test duration has expired
                        if stats['end_time'] and time.time() > stats['end_time']:
                            logger.info(f"{log_prefix} Test duration reached, closing.")
                            break
                        continue
                        
                    except ConnectionClosed:
                        logger.info(f"{log_prefix} WebSocket connection closed.")
                        break
            
            finally:
                send_task.cancel()
                try:
                    await send_task
                except asyncio.CancelledError:
                    pass
    
    except Exception as e:
        logger.error(f"{log_prefix} Connection error: {e}")
        stats['connection_failures'] += 1
        metrics['errors'] += 1
        stats['errors'] += 1
    
    finally:
        # Update active connections count
        stats['active_connections'] -= 1
        
        # Log metrics for this connection
        logger.info(
            f"{log_prefix} Connection metrics: "
            f"sent={metrics['messages_sent']}, "
            f"received={metrics['messages_received']}, "
            f"errors={metrics['errors']}, "
            f"conn_time={metrics['connection_time']:.3f}s"
        )


async def send_messages(ws, connection_id: int, metrics: dict, interval: float):
    """
    Send periodic messages to the WebSocket server.
    
    Args:
        ws: WebSocket connection
        connection_id: Connection ID for logging
        metrics: Dictionary to track metrics
        interval: Time between messages in seconds
    """
    log_prefix = f"[Conn-{connection_id}]"
    message_id = 0
    
    while True:
        try:
            # Check if test duration has expired
            if stats['end_time'] and time.time() > stats['end_time']:
                break
                
            # Create a message with a timestamp for latency measurement
            message_id += 1
            timestamp = time.time()
            message = {
                "type": "text",
                "text": f"Test message {message_id} from connection {connection_id}",
                "_timestamp": timestamp  # for latency tracking
            }
            
            # Send the message
            await ws.send(json.dumps(message))
            metrics['messages_sent'] += 1
            metrics['last_send_time'] = timestamp
            stats['messages_sent'] += 1
            
            logger.debug(f"{log_prefix} Sent message {message_id}")
            
            # Wait for the next interval
            jitter = random.uniform(-0.1, 0.1) * interval  # 10% jitter
            await asyncio.sleep(interval + jitter)
            
        except asyncio.CancelledError:
            logger.debug(f"{log_prefix} Send task cancelled")
            break
        except Exception as e:
            logger.error(f"{log_prefix} Error sending message: {e}")
            metrics['errors'] += 1
            stats['errors'] += 1
            await asyncio.sleep(2)  # Wait a bit after errors


async def run_load_test(args):
    """Run the load test with the provided arguments."""
    logger.info(f"Starting load test with {args.connections} connections for {args.duration} seconds")
    logger.info(f"Server: {args.server}, Agent: {args.agent_id}")
    
    # Initialize stats
    stats['start_time'] = time.time()
    stats['end_time'] = stats['start_time'] + args.duration
    
    # Create unique session IDs
    session_ids = [f"{args.session_prefix}-{uuid.uuid4().hex[:8]}" for _ in range(args.connections)]
    
    # Create and gather all connection tasks
    connection_tasks = []
    for i in range(args.connections):
        # Use one session ID per connection
        session_id = session_ids[i]
        task = asyncio.create_task(
            handle_connection(
                connection_id=i+1,
                server_url=args.server,
                agent_id=args.agent_id,
                session_id=session_id,
                message_interval=args.message_interval
            )
        )
        connection_tasks.append(task)
    
    # Track progress during the test
    progress_task = asyncio.create_task(show_progress(args.duration))
    
    # Wait for all connections to complete
    await asyncio.gather(*connection_tasks, progress_task)
    
    # Print final report
    actual_duration = time.time() - stats['start_time']
    logger.info(f"Load test completed in {actual_duration:.2f} seconds")
    
    # Calculate and print stats
    print("\n=== LOAD TEST RESULTS ===")
    print(f"Duration: {actual_duration:.2f} seconds")
    print(f"Total connections attempted: {args.connections}")
    print(f"Successful connections: {stats['total_connections']}")
    print(f"Failed connections: {stats['connection_failures']}")
    print(f"Messages sent: {stats['messages_sent']}")
    print(f"Messages received: {stats['messages_received']}")
    print(f"Errors: {stats['errors']}")
    
    if stats['messages_sent'] > 0:
        msg_per_sec = stats['messages_sent'] / actual_duration
        print(f"Message rate: {msg_per_sec:.2f} messages/second")
    
    if stats['latencies']:
        avg_latency = sum(stats['latencies']) / len(stats['latencies'])
        max_latency = max(stats['latencies'])
        min_latency = min(stats['latencies'])
        print(f"Latency (avg/min/max): {avg_latency:.3f}s / {min_latency:.3f}s / {max_latency:.3f}s")
    
    print("========================")


async def show_progress(duration: int):
    """Show progress during the load test."""
    start_time = stats['start_time']
    end_time = stats['end_time']
    
    while time.time() < end_time:
        elapsed = time.time() - start_time
        progress = min(elapsed / duration, 1.0)
        
        # Print progress bar and stats
        bar_length = 30
        bar = '#' * int(bar_length * progress) + '-' * (bar_length - int(bar_length * progress))
        print(f"\r[{bar}] {progress*100:.1f}% | "
              f"Conns: {stats['active_connections']}/{stats['total_connections']} | "
              f"Msgs: {stats['messages_sent']}↑ {stats['messages_received']}↓ | "
              f"Errors: {stats['errors']}", end='')
        
        await asyncio.sleep(1)
    
    print()  # Newline after progress bar


if __name__ == "__main__":
    try:
        asyncio.run(run_load_test(args))
    except KeyboardInterrupt:
        logger.info("Load test interrupted by user")
        # Print partial results
        if stats['start_time']:
            actual_duration = time.time() - stats['start_time']
            print(f"\nLoad test interrupted after {actual_duration:.2f} seconds")
            print(f"Connections: {stats['total_connections']}, Failures: {stats['connection_failures']}")
            print(f"Messages: {stats['messages_sent']} sent, {stats['messages_received']} received")
            print(f"Errors: {stats['errors']}")
    except Exception as e:
        logger.error(f"Error running load test: {e}")
        sys.exit(1)