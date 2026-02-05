#!/usr/bin/env python3
"""
Ensemble Agent Client SDK v5.0.0
=================================
Client library for connecting agents to the Context Sync Server

Features:
- WebSocket connection with auto-reconnect
- Lock management (acquire, release, check)
- File change subscriptions
- Event broadcasting and receiving
- Shared context access

Usage:
    from ensemble_client import EnsembleClient

    client = EnsembleClient("CLAUDE", "terminal-1")
    await client.connect()

    # Subscribe to file changes
    await client.subscribe("src/**/*.py")

    # Acquire lock before editing
    if await client.acquire_lock("src/api.py"):
        # Edit file
        await client.release_lock("src/api.py")

    # Broadcast events
    await client.broadcast("code:written", {"file": "src/api.py"})

CLI Usage:
    python ensemble_client.py connect --agent CLAUDE --instance term1 --partition src/
    python ensemble_client.py status
"""

import asyncio
import json
import os
import sys
import time
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Set, Optional, Callable, Any, List
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_SERVER_URL = os.environ.get("ENSEMBLE_SERVER_URL", "ws://localhost:9999")
RECONNECT_DELAY = 2  # seconds
MAX_RECONNECT_ATTEMPTS = 10
HEARTBEAT_INTERVAL = 30  # seconds

# ═══════════════════════════════════════════════════════════════════════════════
# EVENT TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class EventType(str, Enum):
    # Agent lifecycle
    AGENT_REGISTER = "agent:register"
    AGENT_REGISTERED = "agent:registered"
    AGENT_JOINED = "agent:joined"
    AGENT_LEFT = "agent:left"
    AGENT_HEARTBEAT = "agent:heartbeat"

    # File operations
    FILE_SUBSCRIBE = "file:subscribe"
    FILE_UNSUBSCRIBE = "file:unsubscribe"
    FILE_CHANGED = "file:changed"
    FILE_CREATED = "file:created"
    FILE_DELETED = "file:deleted"

    # Lock operations
    LOCK_ACQUIRE = "lock:acquire"
    LOCK_ACQUIRED = "lock:acquired"
    LOCK_FAILED = "lock:failed"
    LOCK_RELEASED = "lock:released"
    LOCK_EXPIRED = "lock:expired"

    # Context operations
    CONTEXT_GET = "context:get"
    CONTEXT_SYNC = "context:sync"

    # Broadcast
    BROADCAST = "broadcast"

    # Collaboration
    PLAN_PROPOSED = "plan:proposed"
    PLAN_APPROVED = "plan:approved"
    PLAN_AMENDMENT = "plan:amendment"
    CODE_WRITING = "code:writing"
    CODE_WRITTEN = "code:written"
    REVIEW_REQUESTED = "review:requested"
    REVIEW_IN_PROGRESS = "review:in_progress"
    REVIEW_COMPLETED = "review:completed"
    FIX_SUGGESTED = "fix:suggested"
    FIX_APPLIED = "fix:applied"

    # System
    ERROR = "error"
    PING = "ping"
    PONG = "pong"


# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class LockStatus:
    """Lock status response"""
    file_path: str
    acquired: bool
    held_by: Optional[str] = None
    lock_type: Optional[str] = None
    expires_at: Optional[str] = None


@dataclass
class SharedContext:
    """Shared workspace context"""
    workspace: str
    task_id: Optional[str] = None
    task_status: Optional[str] = None
    mode: Optional[str] = None
    active_agents: List[Dict] = field(default_factory=list)
    locks: Dict[str, Dict] = field(default_factory=dict)
    recent_changes: List[Dict] = field(default_factory=list)
    partitions: Dict[str, str] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# ENSEMBLE CLIENT
# ═══════════════════════════════════════════════════════════════════════════════

class EnsembleClient:
    """
    Ensemble Context Sync Client

    Provides agent-side interface to the Context Sync Server for:
    - Real-time event communication
    - Lock management
    - File change subscriptions
    - Shared context access
    """

    def __init__(
        self,
        agent_type: str,
        instance_id: str,
        partition: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        """
        Initialize client

        Args:
            agent_type: Type of agent (CLAUDE, CODEX, GEMINI)
            instance_id: Unique instance identifier
            partition: Optional workspace partition path
            metadata: Additional agent metadata
        """
        self.agent_type = agent_type.upper()
        self.instance_id = instance_id
        self.partition = partition
        self.metadata = metadata or {}

        self.agent_id = f"{self.agent_type}-{self.instance_id}"

        # Connection state
        self.ws = None
        self.connected = False
        self.server_url = DEFAULT_SERVER_URL
        self.workspace: Optional[str] = None

        # Event handlers
        self.event_handlers: Dict[str, List[Callable]] = {}

        # Pending responses (for request-response patterns)
        self._pending_responses: Dict[str, asyncio.Future] = {}
        self._response_counter = 0

        # Local state cache
        self._context_cache: Optional[SharedContext] = None
        self._locks_held: Set[str] = set()
        self._subscriptions: Set[str] = set()

        # Tasks
        self._receive_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

    # ─────────────────────────────────────────────────────────────────────────
    # Connection Management
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(self, server_url: str = None) -> bool:
        """
        Connect to the Context Sync Server

        Args:
            server_url: WebSocket URL (default: ws://localhost:9999)

        Returns:
            True if connected successfully
        """
        if server_url:
            self.server_url = server_url

        try:
            import websockets
        except ImportError:
            logger.error("websockets package not installed. Run: pip install websockets")
            return False

        attempt = 0
        while attempt < MAX_RECONNECT_ATTEMPTS:
            try:
                self.ws = await websockets.connect(
                    self.server_url,
                    ping_interval=30,
                    ping_timeout=10
                )
                self.connected = True
                logger.info(f"Connected to {self.server_url}")

                # Register agent
                await self._register()

                # Start receive loop
                self._receive_task = asyncio.create_task(self._receive_loop())

                # Start heartbeat
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

                return True

            except Exception as e:
                attempt += 1
                logger.warning(f"Connection failed (attempt {attempt}): {e}")
                if attempt < MAX_RECONNECT_ATTEMPTS:
                    await asyncio.sleep(RECONNECT_DELAY * attempt)

        logger.error("Failed to connect after max attempts")
        return False

    async def disconnect(self):
        """Disconnect from server"""
        self.connected = False

        # Cancel tasks
        if self._receive_task:
            self._receive_task.cancel()
        if self._heartbeat_task:
            self._heartbeat_task.cancel()

        # Release all held locks
        for file_path in list(self._locks_held):
            try:
                await self.release_lock(file_path)
            except:
                pass

        # Close connection
        if self.ws:
            try:
                await self.ws.close()
            except:
                pass

        logger.info("Disconnected")

    async def _register(self):
        """Register agent with server"""
        await self._send({
            "type": EventType.AGENT_REGISTER.value,
            "agent_type": self.agent_type,
            "instance_id": self.instance_id,
            "partition": self.partition,
            "metadata": self.metadata
        })

        # Wait for registration confirmation
        try:
            response = await asyncio.wait_for(
                self._wait_for_event(EventType.AGENT_REGISTERED.value),
                timeout=5.0
            )
            self.workspace = response.get("workspace")
            logger.info(f"Registered as {self.agent_id}")
        except asyncio.TimeoutError:
            logger.warning("Registration confirmation not received")

    async def _receive_loop(self):
        """Receive and dispatch messages"""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self._dispatch_event(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")

        except Exception as e:
            if self.connected:
                logger.error(f"Receive loop error: {e}")
                await self._try_reconnect()

    async def _heartbeat_loop(self):
        """Send periodic heartbeats"""
        while self.connected:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            if self.connected:
                try:
                    await self._send({"type": EventType.AGENT_HEARTBEAT.value})
                except:
                    pass

    async def _try_reconnect(self):
        """Attempt to reconnect"""
        if not self.connected:
            return

        logger.info("Attempting to reconnect...")
        self.connected = False

        if await self.connect(self.server_url):
            # Restore subscriptions
            for pattern in self._subscriptions:
                await self._send({
                    "type": EventType.FILE_SUBSCRIBE.value,
                    "pattern": pattern
                })
            logger.info("Reconnected and restored state")

    # ─────────────────────────────────────────────────────────────────────────
    # Event Handling
    # ─────────────────────────────────────────────────────────────────────────

    def on(self, event_type: str, handler: Callable):
        """
        Register event handler

        Args:
            event_type: Event type to handle (e.g., "file:changed")
            handler: Async callback function(data: dict)
        """
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)

    def off(self, event_type: str, handler: Callable = None):
        """
        Unregister event handler

        Args:
            event_type: Event type
            handler: Specific handler to remove (or all if None)
        """
        if event_type in self.event_handlers:
            if handler:
                self.event_handlers[event_type] = [
                    h for h in self.event_handlers[event_type] if h != handler
                ]
            else:
                del self.event_handlers[event_type]

    async def _dispatch_event(self, data: dict):
        """Dispatch event to registered handlers"""
        event_type = data.get("type", "")

        # Handle internal events
        if event_type == EventType.CONTEXT_SYNC.value:
            self._update_context_cache(data.get("context", {}))
        elif event_type == EventType.LOCK_ACQUIRED.value:
            if data.get("file_path"):
                self._locks_held.add(data["file_path"])
        elif event_type == EventType.LOCK_RELEASED.value:
            if data.get("file_path"):
                self._locks_held.discard(data["file_path"])
        elif event_type == EventType.LOCK_EXPIRED.value:
            if data.get("file_path") and data.get("agent_id") == self.agent_id:
                self._locks_held.discard(data["file_path"])
                logger.warning(f"Lock expired: {data['file_path']}")

        # Check for pending response
        request_id = data.get("request_id")
        if request_id and request_id in self._pending_responses:
            self._pending_responses[request_id].set_result(data)
            return

        # Call registered handlers
        if event_type in self.event_handlers:
            for handler in self.event_handlers[event_type]:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(data)
                    else:
                        handler(data)
                except Exception as e:
                    logger.error(f"Handler error for {event_type}: {e}")

        # Call wildcard handlers
        if "*" in self.event_handlers:
            for handler in self.event_handlers["*"]:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(data)
                    else:
                        handler(data)
                except Exception as e:
                    logger.error(f"Wildcard handler error: {e}")

    async def _wait_for_event(self, event_type: str, timeout: float = 5.0) -> dict:
        """Wait for a specific event type"""
        future = asyncio.get_event_loop().create_future()

        async def handler(data):
            if not future.done():
                future.set_result(data)

        self.on(event_type, handler)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self.off(event_type, handler)

    def _update_context_cache(self, context_data: dict):
        """Update local context cache"""
        self._context_cache = SharedContext(
            workspace=context_data.get("workspace", ""),
            task_id=context_data.get("task_id"),
            task_status=context_data.get("task_status"),
            mode=context_data.get("mode"),
            active_agents=context_data.get("active_agents", []),
            locks=context_data.get("locks", {}),
            recent_changes=context_data.get("recent_changes", []),
            partitions=context_data.get("partitions", {})
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Lock Management
    # ─────────────────────────────────────────────────────────────────────────

    async def acquire_lock(
        self,
        file_path: str,
        lock_type: str = "EXCLUSIVE",
        ttl: int = 300,
        region: tuple = None
    ) -> bool:
        """
        Acquire a file lock

        Args:
            file_path: Path to file (relative to workspace)
            lock_type: EXCLUSIVE, REVIEW, or SHARED
            ttl: Time-to-live in seconds
            region: Optional (start_line, end_line) for region lock

        Returns:
            True if lock acquired
        """
        await self._send({
            "type": EventType.LOCK_ACQUIRE.value,
            "file_path": file_path,
            "lock_type": lock_type,
            "ttl": ttl,
            "region": region
        })

        try:
            response = await asyncio.wait_for(
                self._wait_for_lock_response(file_path),
                timeout=5.0
            )
            if response.get("type") == EventType.LOCK_ACQUIRED.value:
                self._locks_held.add(file_path)
                logger.info(f"Lock acquired: {file_path}")
                return True
            else:
                held_by = response.get("held_by", "unknown")
                logger.warning(f"Lock failed: {file_path} (held by {held_by})")
                return False
        except asyncio.TimeoutError:
            logger.error(f"Lock request timeout: {file_path}")
            return False

    async def _wait_for_lock_response(self, file_path: str) -> dict:
        """Wait for lock acquire/failed response"""
        future = asyncio.get_event_loop().create_future()

        async def handler(data):
            if data.get("file_path") == file_path and not future.done():
                future.set_result(data)

        self.on(EventType.LOCK_ACQUIRED.value, handler)
        self.on(EventType.LOCK_FAILED.value, handler)

        try:
            return await future
        finally:
            self.off(EventType.LOCK_ACQUIRED.value, handler)
            self.off(EventType.LOCK_FAILED.value, handler)

    async def release_lock(self, file_path: str):
        """
        Release a file lock

        Args:
            file_path: Path to file
        """
        await self._send({
            "type": EventType.LOCK_RELEASED.value,
            "file_path": file_path
        })
        self._locks_held.discard(file_path)
        logger.info(f"Lock released: {file_path}")

    async def check_lock(self, file_path: str) -> LockStatus:
        """
        Check if a file is locked

        Args:
            file_path: Path to file

        Returns:
            LockStatus with lock information
        """
        # Request fresh context
        await self.refresh_context()

        if self._context_cache and file_path in self._context_cache.locks:
            lock = self._context_cache.locks[file_path]
            return LockStatus(
                file_path=file_path,
                acquired=True,
                held_by=lock.get("agent_id"),
                lock_type=lock.get("lock_type"),
                expires_at=lock.get("expires_at")
            )

        return LockStatus(file_path=file_path, acquired=False)

    def get_held_locks(self) -> Set[str]:
        """Get list of locks held by this agent"""
        return self._locks_held.copy()

    # ─────────────────────────────────────────────────────────────────────────
    # File Subscriptions
    # ─────────────────────────────────────────────────────────────────────────

    async def subscribe(self, pattern: str):
        """
        Subscribe to file changes matching pattern

        Args:
            pattern: Glob pattern (e.g., "src/**/*.py")
        """
        await self._send({
            "type": EventType.FILE_SUBSCRIBE.value,
            "pattern": pattern
        })
        self._subscriptions.add(pattern)
        logger.info(f"Subscribed to: {pattern}")

    async def unsubscribe(self, pattern: str):
        """
        Unsubscribe from file changes

        Args:
            pattern: Glob pattern
        """
        await self._send({
            "type": EventType.FILE_UNSUBSCRIBE.value,
            "pattern": pattern
        })
        self._subscriptions.discard(pattern)
        logger.info(f"Unsubscribed from: {pattern}")

    # ─────────────────────────────────────────────────────────────────────────
    # Broadcasting
    # ─────────────────────────────────────────────────────────────────────────

    async def broadcast(self, event: str, data: dict, target: str = None):
        """
        Broadcast event to other agents

        Args:
            event: Event type (e.g., "code:written")
            data: Event payload
            target: Optional target agent_id or agent_type
        """
        await self._send({
            "type": EventType.BROADCAST.value,
            "event": event,
            "data": data,
            "target": target
        })

    async def send_to(self, agent_id: str, event: str, data: dict):
        """
        Send event to specific agent

        Args:
            agent_id: Target agent ID
            event: Event type
            data: Event payload
        """
        await self.broadcast(event, data, target=agent_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Context Access
    # ─────────────────────────────────────────────────────────────────────────

    async def get_context(self) -> SharedContext:
        """
        Get current shared context

        Returns:
            SharedContext with workspace state
        """
        await self.refresh_context()
        return self._context_cache

    async def refresh_context(self):
        """Refresh context cache from server"""
        await self._send({"type": EventType.CONTEXT_GET.value})

        try:
            await asyncio.wait_for(
                self._wait_for_event(EventType.CONTEXT_SYNC.value),
                timeout=5.0
            )
        except asyncio.TimeoutError:
            logger.warning("Context refresh timeout")

    def get_active_agents(self) -> List[Dict]:
        """Get list of active agents from cached context"""
        if self._context_cache:
            return self._context_cache.active_agents
        return []

    def get_partitions(self) -> Dict[str, str]:
        """Get partition assignments from cached context"""
        if self._context_cache:
            return self._context_cache.partitions
        return {}

    # ─────────────────────────────────────────────────────────────────────────
    # Collaboration Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def propose_plan(self, feature: str, approach: str, files: List[str], risks: List[str] = None):
        """
        Propose a feature plan (Gemini role)

        Args:
            feature: Feature name
            approach: Implementation approach
            files: Files to be modified
            risks: Potential risks
        """
        await self.broadcast(EventType.PLAN_PROPOSED.value, {
            "feature": feature,
            "approach": approach,
            "files": files,
            "risks": risks or []
        })

    async def approve_plan(self, plan_id: str = None, comments: str = None):
        """
        Approve a proposed plan

        Args:
            plan_id: Optional plan identifier
            comments: Optional comments
        """
        await self.broadcast(EventType.PLAN_APPROVED.value, {
            "plan_id": plan_id,
            "comments": comments
        })

    async def request_review(self, files: List[str], description: str = None):
        """
        Request code review (Claude role)

        Args:
            files: Files to review
            description: Description of changes
        """
        await self.broadcast(EventType.REVIEW_REQUESTED.value, {
            "files": files,
            "description": description
        })

    async def submit_review(self, status: str, findings: List[Dict] = None, comments: str = None):
        """
        Submit review results (Codex role)

        Args:
            status: APPROVED, CHANGES_REQUESTED, BLOCKED
            findings: List of issues found
            comments: Overall comments
        """
        await self.broadcast(EventType.REVIEW_COMPLETED.value, {
            "status": status,
            "findings": findings or [],
            "comments": comments
        })

    async def notify_code_written(self, file_path: str, description: str = None):
        """
        Notify that code has been written

        Args:
            file_path: Path to modified file
            description: Description of changes
        """
        await self.broadcast(EventType.CODE_WRITTEN.value, {
            "file": file_path,
            "description": description
        })

    # ─────────────────────────────────────────────────────────────────────────
    # Internal Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _send(self, data: dict):
        """Send message to server"""
        if not self.ws or not self.connected:
            raise ConnectionError("Not connected to server")

        message = json.dumps(data)
        await self.ws.send(message)


# ═══════════════════════════════════════════════════════════════════════════════
# SYNCHRONOUS WRAPPER
# ═══════════════════════════════════════════════════════════════════════════════

class EnsembleClientSync:
    """
    Synchronous wrapper for EnsembleClient

    For use in non-async contexts.
    """

    def __init__(
        self,
        agent_type: str,
        instance_id: str,
        partition: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        self._client = EnsembleClient(agent_type, instance_id, partition, metadata)
        self._loop = None

    def _get_loop(self):
        if self._loop is None or self._loop.is_closed():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
        return self._loop

    def connect(self, server_url: str = None) -> bool:
        return self._get_loop().run_until_complete(self._client.connect(server_url))

    def disconnect(self):
        return self._get_loop().run_until_complete(self._client.disconnect())

    def acquire_lock(self, file_path: str, lock_type: str = "EXCLUSIVE", ttl: int = 300) -> bool:
        return self._get_loop().run_until_complete(
            self._client.acquire_lock(file_path, lock_type, ttl)
        )

    def release_lock(self, file_path: str):
        return self._get_loop().run_until_complete(self._client.release_lock(file_path))

    def subscribe(self, pattern: str):
        return self._get_loop().run_until_complete(self._client.subscribe(pattern))

    def broadcast(self, event: str, data: dict, target: str = None):
        return self._get_loop().run_until_complete(self._client.broadcast(event, data, target))

    def get_context(self) -> SharedContext:
        return self._get_loop().run_until_complete(self._client.get_context())


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

async def interactive_mode(client: EnsembleClient):
    """Run interactive REPL mode"""
    print(f"\nConnected as {client.agent_id}")
    print("Commands: subscribe <pattern>, lock <file>, unlock <file>, broadcast <event> <json>, status, quit\n")

    # Set up event logging
    async def log_event(data):
        event_type = data.get("type", "unknown")
        print(f"\n[EVENT] {event_type}: {json.dumps(data, indent=2)}")
        print("> ", end="", flush=True)

    client.on("*", log_event)

    while True:
        try:
            line = await asyncio.get_event_loop().run_in_executor(None, input, "> ")
            line = line.strip()

            if not line:
                continue

            parts = line.split(maxsplit=2)
            cmd = parts[0].lower()

            if cmd == "quit" or cmd == "exit":
                break

            elif cmd == "subscribe" and len(parts) >= 2:
                await client.subscribe(parts[1])

            elif cmd == "lock" and len(parts) >= 2:
                success = await client.acquire_lock(parts[1])
                print(f"Lock {'acquired' if success else 'failed'}")

            elif cmd == "unlock" and len(parts) >= 2:
                await client.release_lock(parts[1])
                print("Lock released")

            elif cmd == "broadcast" and len(parts) >= 3:
                try:
                    data = json.loads(parts[2])
                    await client.broadcast(parts[1], data)
                    print("Broadcast sent")
                except json.JSONDecodeError:
                    print("Invalid JSON")

            elif cmd == "status":
                ctx = await client.get_context()
                print(f"Workspace: {ctx.workspace}")
                print(f"Task: {ctx.task_id} ({ctx.task_status})")
                print(f"Active Agents: {len(ctx.active_agents)}")
                for agent in ctx.active_agents:
                    print(f"  - {agent['agent_id']} ({agent.get('partition', 'no partition')})")
                print(f"Locks: {len(ctx.locks)}")
                for path, lock in ctx.locks.items():
                    print(f"  - {path}: {lock['agent_id']}")
                print(f"My Locks: {client.get_held_locks()}")

            elif cmd == "help":
                print("Commands:")
                print("  subscribe <pattern>  - Subscribe to file changes")
                print("  lock <file>          - Acquire file lock")
                print("  unlock <file>        - Release file lock")
                print("  broadcast <event> <json> - Broadcast event")
                print("  status               - Show current status")
                print("  quit                 - Exit")

            else:
                print("Unknown command. Type 'help' for available commands.")

        except EOFError:
            break
        except Exception as e:
            print(f"Error: {e}")

    await client.disconnect()


def cmd_connect(args):
    """Connect to server as agent"""
    client = EnsembleClient(
        agent_type=args.agent,
        instance_id=args.instance,
        partition=args.partition
    )

    async def run():
        server_url = f"ws://{args.host}:{args.port}"
        if await client.connect(server_url):
            # Subscribe to partition if specified
            if args.partition:
                await client.subscribe(f"{args.partition}/**/*")

            await interactive_mode(client)
        else:
            print("Failed to connect to server")

    asyncio.run(run())


def cmd_status(args):
    """Check server status via client"""
    client = EnsembleClient("STATUS", "checker")

    async def run():
        server_url = f"ws://{args.host}:{args.port}"
        if await client.connect(server_url):
            ctx = await client.get_context()

            print("=" * 60)
            print("ENSEMBLE SERVER STATUS (via client)")
            print("=" * 60)
            print(f"Connected to: ws://{args.host}:{args.port}")
            print(f"Workspace: {ctx.workspace}")
            print(f"Task: {ctx.task_id or 'none'} ({ctx.task_status or 'N/A'})")
            print(f"Mode: {ctx.mode or 'N/A'}")
            print()
            print(f"Active Agents ({len(ctx.active_agents)}):")
            for agent in ctx.active_agents:
                partition = agent.get('partition', 'no partition')
                print(f"  - {agent['agent_id']} ({partition})")
            print()
            print(f"Active Locks ({len(ctx.locks)}):")
            for path, lock in ctx.locks.items():
                print(f"  - {path}: {lock['agent_id']} ({lock['lock_type']})")
            print("=" * 60)

            await client.disconnect()
        else:
            print(f"Failed to connect to ws://{args.host}:{args.port}")

    asyncio.run(run())


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensemble Agent Client SDK v5.0",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Connect command
    p_connect = subparsers.add_parser("connect", help="Connect to server as agent")
    p_connect.add_argument("--agent", "-a", required=True,
                          choices=["CLAUDE", "CODEX", "GEMINI"],
                          help="Agent type")
    p_connect.add_argument("--instance", "-i", required=True,
                          help="Instance ID (e.g., terminal-1)")
    p_connect.add_argument("--partition", "-p",
                          help="Workspace partition path")
    p_connect.add_argument("--host", "-H", default="localhost",
                          help="Server host (default: localhost)")
    p_connect.add_argument("--port", "-P", type=int, default=9999,
                          help="Server port (default: 9999)")

    # Status command
    p_status = subparsers.add_parser("status", help="Check server status")
    p_status.add_argument("--host", "-H", default="localhost",
                         help="Server host")
    p_status.add_argument("--port", "-P", type=int, default=9999,
                         help="Server port")

    args = parser.parse_args()

    if args.command == "connect":
        cmd_connect(args)
    elif args.command == "status":
        cmd_status(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
