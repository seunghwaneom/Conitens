#!/usr/bin/env python3
"""
Ensemble Context Sync Server v5.0.0
====================================
Multi-Agent Real-time Context Sharing Server

Features:
- WebSocket-based real-time communication
- Agent registration and lifecycle management
- Distributed lock management with TTL
- File system change broadcasting
- Shared context state management

Usage:
    python ensemble_server.py start --port 9999
    python ensemble_server.py stop
    python ensemble_server.py status

Environment Variables:
    ENSEMBLE_SERVER_PORT     Server port (default: 9999)
    ENSEMBLE_SERVER_HOST     Server host (default: localhost)
    ENSEMBLE_LOCK_TTL        Default lock TTL in seconds (default: 300)
"""

import asyncio
import json
import os
import signal
import sys
import time
import hashlib
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Set, Optional, List, Any, Callable
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

DEFAULT_PORT = int(os.environ.get("ENSEMBLE_SERVER_PORT", "9999"))
DEFAULT_HOST = os.environ.get("ENSEMBLE_SERVER_HOST", "localhost")
DEFAULT_LOCK_TTL = int(os.environ.get("ENSEMBLE_LOCK_TTL", "300"))
PID_FILE = ".ensemble_server.pid"
STATE_FILE = ".ensemble_server_state.json"

# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

class AgentType(str, Enum):
    CLAUDE = "CLAUDE"
    CODEX = "CODEX"
    GEMINI = "GEMINI"
    UNKNOWN = "UNKNOWN"


class LockType(str, Enum):
    EXCLUSIVE = "EXCLUSIVE"  # Full write lock
    REVIEW = "REVIEW"        # Read + comment lock
    SHARED = "SHARED"        # Read-only lock


class EventType(str, Enum):
    # Agent lifecycle
    AGENT_REGISTER = "agent:register"
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
    CONTEXT_UPDATE = "context:update"
    CONTEXT_SYNC = "context:sync"

    # Task operations
    TASK_UPDATED = "task:updated"
    TASK_ASSIGNED = "task:assigned"

    # Broadcast
    BROADCAST = "broadcast"

    # Collaboration events
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


@dataclass
class AgentInfo:
    """Connected agent information"""
    agent_id: str
    agent_type: str
    instance_id: str
    partition: Optional[str] = None
    connected_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_heartbeat: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    subscriptions: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "instance_id": self.instance_id,
            "partition": self.partition,
            "connected_at": self.connected_at,
            "last_heartbeat": self.last_heartbeat,
            "subscriptions": list(self.subscriptions),
            "metadata": self.metadata
        }


@dataclass
class LockInfo:
    """File/region lock information"""
    file_path: str
    agent_id: str
    lock_type: str
    acquired_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    ttl_seconds: int = DEFAULT_LOCK_TTL
    region: Optional[tuple] = None  # (start_line, end_line) for region locks

    def to_dict(self) -> dict:
        return {
            "file_path": self.file_path,
            "agent_id": self.agent_id,
            "lock_type": self.lock_type,
            "acquired_at": self.acquired_at,
            "ttl_seconds": self.ttl_seconds,
            "region": self.region,
            "expires_at": self.expires_at
        }

    @property
    def expires_at(self) -> str:
        acquired = datetime.fromisoformat(self.acquired_at.replace('Z', '+00:00'))
        expires = acquired.timestamp() + self.ttl_seconds
        return datetime.fromtimestamp(expires, timezone.utc).isoformat()

    def is_expired(self) -> bool:
        acquired = datetime.fromisoformat(self.acquired_at.replace('Z', '+00:00'))
        return time.time() > (acquired.timestamp() + self.ttl_seconds)


@dataclass
class FileChange:
    """File change event"""
    file_path: str
    change_type: str  # created, modified, deleted
    agent_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    diff: Optional[str] = None
    checksum: Optional[str] = None


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
    partitions: Dict[str, str] = field(default_factory=dict)  # agent_id -> partition
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT SYNC SERVER
# ═══════════════════════════════════════════════════════════════════════════════

class ContextSyncServer:
    """
    Multi-Agent Context Synchronization Server

    Provides:
    - WebSocket server for real-time communication
    - Agent registration and lifecycle management
    - Distributed lock management
    - File change broadcasting
    - Shared context state
    """

    def __init__(self, workspace: str, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
        self.workspace = os.path.abspath(workspace)
        self.host = host
        self.port = port

        # State
        self.agents: Dict[str, AgentInfo] = {}
        self.connections: Dict[str, Any] = {}  # agent_id -> websocket
        self.locks: Dict[str, LockInfo] = {}
        self.file_subscriptions: Dict[str, Set[str]] = {}  # file_path -> set of agent_ids
        self.recent_changes: List[FileChange] = []
        self.partitions: Dict[str, str] = {}  # agent_id -> partition path

        # Task state (synced with task.md)
        self.current_task_id: Optional[str] = None
        self.current_task_status: Optional[str] = None
        self.current_mode: Optional[str] = None

        # File watcher
        self.file_observer = None

        # Server state
        self.running = False
        self.server = None

        # Lock for thread safety
        self._state_lock = asyncio.Lock()

        # Event callbacks
        self.event_callbacks: Dict[str, List[Callable]] = {}

    # ─────────────────────────────────────────────────────────────────────────
    # Server Lifecycle
    # ─────────────────────────────────────────────────────────────────────────

    async def start(self):
        """Start the server"""
        try:
            import websockets
        except ImportError:
            logger.error("websockets package not installed. Run: pip install websockets")
            sys.exit(1)

        self.running = True

        # Write PID file
        pid_path = os.path.join(self.workspace, PID_FILE)
        with open(pid_path, 'w') as f:
            f.write(str(os.getpid()))

        # Start file watcher
        self._start_file_watcher()

        # Start lock cleanup task
        asyncio.create_task(self._lock_cleanup_loop())

        # Start heartbeat checker
        asyncio.create_task(self._heartbeat_check_loop())

        # Load existing state if any
        await self._load_state()

        logger.info(f"Context Sync Server starting on ws://{self.host}:{self.port}")
        logger.info(f"Workspace: {self.workspace}")

        async with websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
            ping_interval=30,
            ping_timeout=10
        ):
            logger.info("Server started successfully")
            await asyncio.Future()  # Run forever

    async def stop(self):
        """Stop the server gracefully"""
        logger.info("Shutting down server...")
        self.running = False

        # Save state
        await self._save_state()

        # Close all connections
        for agent_id, ws in list(self.connections.items()):
            try:
                await ws.close()
            except:
                pass

        # Stop file watcher
        if self.file_observer:
            self.file_observer.stop()
            self.file_observer.join()

        # Remove PID file
        pid_path = os.path.join(self.workspace, PID_FILE)
        if os.path.exists(pid_path):
            os.remove(pid_path)

        logger.info("Server stopped")

    def _start_file_watcher(self):
        """Start file system watcher"""
        try:
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler

            server = self

            class FileChangeHandler(FileSystemEventHandler):
                def on_modified(self, event):
                    if not event.is_directory:
                        asyncio.run_coroutine_threadsafe(
                            server._on_file_changed(event.src_path, "modified"),
                            asyncio.get_event_loop()
                        )

                def on_created(self, event):
                    if not event.is_directory:
                        asyncio.run_coroutine_threadsafe(
                            server._on_file_changed(event.src_path, "created"),
                            asyncio.get_event_loop()
                        )

                def on_deleted(self, event):
                    if not event.is_directory:
                        asyncio.run_coroutine_threadsafe(
                            server._on_file_changed(event.src_path, "deleted"),
                            asyncio.get_event_loop()
                        )

            self.file_observer = Observer()
            self.file_observer.schedule(FileChangeHandler(), self.workspace, recursive=True)
            self.file_observer.start()
            logger.info("File watcher started")

        except ImportError:
            logger.warning("watchdog package not installed. File watching disabled.")
            logger.warning("Run: pip install watchdog")

    async def _on_file_changed(self, file_path: str, change_type: str):
        """Handle file change event"""
        # Skip hidden and temp files
        if '/.git/' in file_path or file_path.endswith('.tmp'):
            return

        # Make path relative to workspace
        try:
            rel_path = os.path.relpath(file_path, self.workspace)
        except ValueError:
            rel_path = file_path

        # Calculate checksum for modified files
        checksum = None
        if change_type in ("created", "modified") and os.path.exists(file_path):
            try:
                with open(file_path, 'rb') as f:
                    checksum = hashlib.sha256(f.read()).hexdigest()[:16]
            except:
                pass

        change = FileChange(
            file_path=rel_path,
            change_type=change_type,
            checksum=checksum
        )

        # Store in recent changes (keep last 100)
        self.recent_changes.append(change)
        if len(self.recent_changes) > 100:
            self.recent_changes = self.recent_changes[-100:]

        # Broadcast to subscribers
        await self._broadcast_file_change(change)

    async def _broadcast_file_change(self, change: FileChange):
        """Broadcast file change to subscribed agents"""
        event_type = {
            "created": EventType.FILE_CREATED,
            "modified": EventType.FILE_CHANGED,
            "deleted": EventType.FILE_DELETED
        }.get(change.change_type, EventType.FILE_CHANGED)

        # Find subscribers
        subscribers = set()
        for pattern, agent_ids in self.file_subscriptions.items():
            if self._matches_pattern(change.file_path, pattern):
                subscribers.update(agent_ids)

        # Broadcast to subscribers
        message = {
            "type": event_type.value,
            "file_path": change.file_path,
            "change_type": change.change_type,
            "timestamp": change.timestamp,
            "checksum": change.checksum
        }

        for agent_id in subscribers:
            await self._send_to_agent(agent_id, message)

    def _matches_pattern(self, path: str, pattern: str) -> bool:
        """Check if path matches glob pattern"""
        import fnmatch
        return fnmatch.fnmatch(path, pattern)

    # ─────────────────────────────────────────────────────────────────────────
    # Connection Handling
    # ─────────────────────────────────────────────────────────────────────────

    async def _handle_connection(self, websocket, path):
        """Handle WebSocket connection"""
        agent_id = None
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    event_type = data.get("type", "")

                    if event_type == EventType.AGENT_REGISTER.value:
                        agent_id = await self._register_agent(websocket, data)
                    elif event_type == EventType.FILE_SUBSCRIBE.value:
                        await self._subscribe_file(agent_id, data.get("pattern", "**/*"))
                    elif event_type == EventType.FILE_UNSUBSCRIBE.value:
                        await self._unsubscribe_file(agent_id, data.get("pattern"))
                    elif event_type == EventType.LOCK_ACQUIRE.value:
                        await self._acquire_lock(agent_id, data)
                    elif event_type == EventType.LOCK_RELEASED.value:
                        await self._release_lock(agent_id, data.get("file_path"))
                    elif event_type == EventType.BROADCAST.value:
                        await self._handle_broadcast(agent_id, data)
                    elif event_type == EventType.CONTEXT_GET.value:
                        await self._send_context(websocket)
                    elif event_type == EventType.AGENT_HEARTBEAT.value:
                        await self._handle_heartbeat(agent_id)
                    elif event_type == EventType.PING.value:
                        await websocket.send(json.dumps({"type": EventType.PONG.value}))
                    else:
                        # Forward as broadcast
                        await self._handle_broadcast(agent_id, data)

                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await websocket.send(json.dumps({
                        "type": EventType.ERROR.value,
                        "message": str(e)
                    }))

        except Exception as e:
            logger.error(f"Connection error: {e}")

        finally:
            if agent_id:
                await self._unregister_agent(agent_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Agent Management
    # ─────────────────────────────────────────────────────────────────────────

    async def _register_agent(self, websocket, data: dict) -> str:
        """Register a new agent"""
        agent_type = data.get("agent_type", "UNKNOWN")
        instance_id = data.get("instance_id", "default")
        partition = data.get("partition")
        metadata = data.get("metadata", {})

        agent_id = f"{agent_type}-{instance_id}"

        # Check for existing connection
        if agent_id in self.connections:
            # Close old connection
            try:
                await self.connections[agent_id].close()
            except:
                pass

        # Register agent
        self.agents[agent_id] = AgentInfo(
            agent_id=agent_id,
            agent_type=agent_type,
            instance_id=instance_id,
            partition=partition,
            metadata=metadata
        )
        self.connections[agent_id] = websocket

        if partition:
            self.partitions[agent_id] = partition

        logger.info(f"Agent registered: {agent_id} (partition: {partition})")

        # Send registration confirmation
        await websocket.send(json.dumps({
            "type": "agent:registered",
            "agent_id": agent_id,
            "workspace": self.workspace
        }))

        # Broadcast to other agents
        await self._broadcast_event(EventType.AGENT_JOINED, {
            "agent_id": agent_id,
            "agent_type": agent_type,
            "partition": partition
        }, exclude=[agent_id])

        return agent_id

    async def _unregister_agent(self, agent_id: str):
        """Unregister an agent"""
        if agent_id not in self.agents:
            return

        logger.info(f"Agent disconnected: {agent_id}")

        # Release all locks held by this agent
        locks_to_release = [
            path for path, lock in self.locks.items()
            if lock.agent_id == agent_id
        ]
        for path in locks_to_release:
            del self.locks[path]
            await self._broadcast_event(EventType.LOCK_RELEASED, {
                "file_path": path,
                "agent_id": agent_id,
                "reason": "agent_disconnected"
            })

        # Remove subscriptions
        for pattern in list(self.file_subscriptions.keys()):
            self.file_subscriptions[pattern].discard(agent_id)
            if not self.file_subscriptions[pattern]:
                del self.file_subscriptions[pattern]

        # Remove from partitions
        if agent_id in self.partitions:
            del self.partitions[agent_id]

        # Remove agent
        del self.agents[agent_id]
        if agent_id in self.connections:
            del self.connections[agent_id]

        # Broadcast to other agents
        await self._broadcast_event(EventType.AGENT_LEFT, {
            "agent_id": agent_id
        })

    async def _handle_heartbeat(self, agent_id: str):
        """Handle agent heartbeat"""
        if agent_id in self.agents:
            self.agents[agent_id].last_heartbeat = datetime.now(timezone.utc).isoformat()

    # ─────────────────────────────────────────────────────────────────────────
    # Lock Management
    # ─────────────────────────────────────────────────────────────────────────

    async def _acquire_lock(self, agent_id: str, data: dict) -> bool:
        """Acquire a file lock"""
        file_path = data.get("file_path")
        lock_type = data.get("lock_type", LockType.EXCLUSIVE.value)
        ttl = data.get("ttl", DEFAULT_LOCK_TTL)
        region = data.get("region")  # (start_line, end_line)

        if not file_path:
            await self._send_to_agent(agent_id, {
                "type": EventType.LOCK_FAILED.value,
                "file_path": file_path,
                "reason": "file_path required"
            })
            return False

        async with self._state_lock:
            # Check existing lock
            if file_path in self.locks:
                existing = self.locks[file_path]

                # Check if expired
                if existing.is_expired():
                    logger.info(f"Lock expired, releasing: {file_path}")
                    del self.locks[file_path]
                elif existing.agent_id != agent_id:
                    # Lock held by another agent
                    await self._send_to_agent(agent_id, {
                        "type": EventType.LOCK_FAILED.value,
                        "file_path": file_path,
                        "held_by": existing.agent_id,
                        "lock_type": existing.lock_type,
                        "expires_at": existing.expires_at
                    })
                    return False

            # Acquire lock
            self.locks[file_path] = LockInfo(
                file_path=file_path,
                agent_id=agent_id,
                lock_type=lock_type,
                ttl_seconds=ttl,
                region=region
            )

        logger.info(f"Lock acquired: {file_path} by {agent_id}")

        # Confirm to requesting agent
        await self._send_to_agent(agent_id, {
            "type": EventType.LOCK_ACQUIRED.value,
            "file_path": file_path,
            "lock_type": lock_type,
            "ttl": ttl
        })

        # Broadcast to others
        await self._broadcast_event(EventType.LOCK_ACQUIRED, {
            "file_path": file_path,
            "agent_id": agent_id,
            "lock_type": lock_type
        }, exclude=[agent_id])

        return True

    async def _release_lock(self, agent_id: str, file_path: str):
        """Release a file lock"""
        async with self._state_lock:
            if file_path not in self.locks:
                return

            lock = self.locks[file_path]
            if lock.agent_id != agent_id:
                logger.warning(f"Agent {agent_id} tried to release lock held by {lock.agent_id}")
                return

            del self.locks[file_path]

        logger.info(f"Lock released: {file_path} by {agent_id}")

        # Broadcast
        await self._broadcast_event(EventType.LOCK_RELEASED, {
            "file_path": file_path,
            "agent_id": agent_id
        })

    async def _lock_cleanup_loop(self):
        """Periodically clean up expired locks"""
        while self.running:
            await asyncio.sleep(30)  # Check every 30 seconds

            expired = []
            async with self._state_lock:
                for path, lock in list(self.locks.items()):
                    if lock.is_expired():
                        expired.append((path, lock))
                        del self.locks[path]

            for path, lock in expired:
                logger.info(f"Lock expired: {path} (held by {lock.agent_id})")
                await self._broadcast_event(EventType.LOCK_EXPIRED, {
                    "file_path": path,
                    "agent_id": lock.agent_id
                })

    # ─────────────────────────────────────────────────────────────────────────
    # File Subscriptions
    # ─────────────────────────────────────────────────────────────────────────

    async def _subscribe_file(self, agent_id: str, pattern: str):
        """Subscribe to file changes"""
        if pattern not in self.file_subscriptions:
            self.file_subscriptions[pattern] = set()
        self.file_subscriptions[pattern].add(agent_id)

        if agent_id in self.agents:
            self.agents[agent_id].subscriptions.add(pattern)

        logger.debug(f"Agent {agent_id} subscribed to: {pattern}")

    async def _unsubscribe_file(self, agent_id: str, pattern: str):
        """Unsubscribe from file changes"""
        if pattern in self.file_subscriptions:
            self.file_subscriptions[pattern].discard(agent_id)
            if not self.file_subscriptions[pattern]:
                del self.file_subscriptions[pattern]

        if agent_id in self.agents:
            self.agents[agent_id].subscriptions.discard(pattern)

    # ─────────────────────────────────────────────────────────────────────────
    # Broadcasting
    # ─────────────────────────────────────────────────────────────────────────

    async def _broadcast_event(self, event_type: EventType, data: dict, exclude: List[str] = None):
        """Broadcast event to all connected agents"""
        exclude = exclude or []
        message = json.dumps({
            "type": event_type.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data
        })

        for agent_id, ws in list(self.connections.items()):
            if agent_id not in exclude:
                try:
                    await ws.send(message)
                except Exception as e:
                    logger.error(f"Failed to send to {agent_id}: {e}")

    async def _handle_broadcast(self, sender_id: str, data: dict):
        """Handle custom broadcast from agent"""
        event = data.get("event", data.get("type", "broadcast"))
        payload = data.get("data", data)
        target = data.get("target")  # Optional: specific agent or agent_type

        message = json.dumps({
            "type": event,
            "from": sender_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": payload
        })

        for agent_id, ws in list(self.connections.items()):
            if agent_id == sender_id:
                continue

            # Check target filter
            if target:
                agent = self.agents.get(agent_id)
                if target != agent_id and (not agent or target != agent.agent_type):
                    continue

            try:
                await ws.send(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to {agent_id}: {e}")

    async def _send_to_agent(self, agent_id: str, data: dict):
        """Send message to specific agent"""
        if agent_id not in self.connections:
            return

        try:
            message = json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **data
            })
            await self.connections[agent_id].send(message)
        except Exception as e:
            logger.error(f"Failed to send to {agent_id}: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Context Management
    # ─────────────────────────────────────────────────────────────────────────

    async def _send_context(self, websocket):
        """Send current shared context"""
        context = SharedContext(
            workspace=self.workspace,
            task_id=self.current_task_id,
            task_status=self.current_task_status,
            mode=self.current_mode,
            active_agents=[a.to_dict() for a in self.agents.values()],
            locks={path: lock.to_dict() for path, lock in self.locks.items()},
            recent_changes=[asdict(c) for c in self.recent_changes[-20:]],
            partitions=self.partitions.copy()
        )

        await websocket.send(json.dumps({
            "type": EventType.CONTEXT_SYNC.value,
            "context": context.to_dict()
        }))

    def get_context(self) -> SharedContext:
        """Get current shared context"""
        return SharedContext(
            workspace=self.workspace,
            task_id=self.current_task_id,
            task_status=self.current_task_status,
            mode=self.current_mode,
            active_agents=[a.to_dict() for a in self.agents.values()],
            locks={path: lock.to_dict() for path, lock in self.locks.items()},
            recent_changes=[asdict(c) for c in self.recent_changes[-20:]],
            partitions=self.partitions.copy()
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Heartbeat Management
    # ─────────────────────────────────────────────────────────────────────────

    async def _heartbeat_check_loop(self):
        """Check for stale agents"""
        stale_threshold = 120  # 2 minutes

        while self.running:
            await asyncio.sleep(60)  # Check every minute

            now = datetime.now(timezone.utc)
            stale_agents = []

            for agent_id, agent in list(self.agents.items()):
                last_hb = datetime.fromisoformat(agent.last_heartbeat.replace('Z', '+00:00'))
                if (now - last_hb).total_seconds() > stale_threshold:
                    stale_agents.append(agent_id)

            for agent_id in stale_agents:
                logger.warning(f"Agent stale, disconnecting: {agent_id}")
                if agent_id in self.connections:
                    try:
                        await self.connections[agent_id].close()
                    except:
                        pass
                await self._unregister_agent(agent_id)

    # ─────────────────────────────────────────────────────────────────────────
    # State Persistence
    # ─────────────────────────────────────────────────────────────────────────

    async def _save_state(self):
        """Save server state to file"""
        state = {
            "locks": {path: lock.to_dict() for path, lock in self.locks.items()},
            "partitions": self.partitions,
            "task_id": self.current_task_id,
            "task_status": self.current_task_status,
            "mode": self.current_mode,
            "saved_at": datetime.now(timezone.utc).isoformat()
        }

        state_path = os.path.join(self.workspace, STATE_FILE)
        try:
            with open(state_path, 'w') as f:
                json.dump(state, f, indent=2)
            logger.info("State saved")
        except Exception as e:
            logger.error(f"Failed to save state: {e}")

    async def _load_state(self):
        """Load server state from file"""
        state_path = os.path.join(self.workspace, STATE_FILE)
        if not os.path.exists(state_path):
            return

        try:
            with open(state_path, 'r') as f:
                state = json.load(f)

            # Restore partitions
            self.partitions = state.get("partitions", {})

            # Restore task info
            self.current_task_id = state.get("task_id")
            self.current_task_status = state.get("task_status")
            self.current_mode = state.get("mode")

            # Restore non-expired locks
            for path, lock_data in state.get("locks", {}).items():
                lock = LockInfo(
                    file_path=lock_data["file_path"],
                    agent_id=lock_data["agent_id"],
                    lock_type=lock_data["lock_type"],
                    acquired_at=lock_data["acquired_at"],
                    ttl_seconds=lock_data["ttl_seconds"],
                    region=lock_data.get("region")
                )
                if not lock.is_expired():
                    self.locks[path] = lock

            logger.info(f"State loaded: {len(self.locks)} locks, {len(self.partitions)} partitions")

        except Exception as e:
            logger.error(f"Failed to load state: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_start(args):
    """Start the server"""
    workspace = os.path.abspath(args.workspace)

    # Check if already running
    pid_path = os.path.join(workspace, PID_FILE)
    if os.path.exists(pid_path):
        with open(pid_path, 'r') as f:
            pid = int(f.read().strip())

        # Check if process is alive
        try:
            os.kill(pid, 0)
            print(f"Server already running (PID: {pid})")
            return
        except OSError:
            # Process not running, remove stale PID file
            os.remove(pid_path)

    server = ContextSyncServer(workspace, args.host, args.port)

    # Handle signals
    def signal_handler(sig, frame):
        asyncio.create_task(server.stop())
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        asyncio.run(server.stop())


def cmd_stop(args):
    """Stop the server"""
    workspace = os.path.abspath(args.workspace)
    pid_path = os.path.join(workspace, PID_FILE)

    if not os.path.exists(pid_path):
        print("Server not running")
        return

    with open(pid_path, 'r') as f:
        pid = int(f.read().strip())

    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Sent stop signal to server (PID: {pid})")

        # Wait for process to exit
        for _ in range(10):
            time.sleep(0.5)
            try:
                os.kill(pid, 0)
            except OSError:
                print("Server stopped")
                return

        print("Server did not stop gracefully, sending SIGKILL")
        os.kill(pid, signal.SIGKILL)

    except OSError as e:
        print(f"Failed to stop server: {e}")
        # Clean up PID file
        if os.path.exists(pid_path):
            os.remove(pid_path)


def cmd_status(args):
    """Show server status"""
    workspace = os.path.abspath(args.workspace)
    pid_path = os.path.join(workspace, PID_FILE)
    state_path = os.path.join(workspace, STATE_FILE)

    # Check if running
    running = False
    pid = None
    if os.path.exists(pid_path):
        with open(pid_path, 'r') as f:
            pid = int(f.read().strip())
        try:
            os.kill(pid, 0)
            running = True
        except OSError:
            pass

    print("=" * 60)
    print("ENSEMBLE CONTEXT SYNC SERVER STATUS")
    print("=" * 60)
    print(f"Workspace: {workspace}")
    print(f"Status: {'RUNNING' if running else 'STOPPED'}")
    if running:
        print(f"PID: {pid}")
        print(f"URL: ws://localhost:{args.port}")

    # Show saved state
    if os.path.exists(state_path):
        try:
            with open(state_path, 'r') as f:
                state = json.load(f)

            print()
            print("Last State:")
            print(f"  Saved: {state.get('saved_at', 'unknown')}")
            print(f"  Task: {state.get('task_id', 'none')}")
            print(f"  Mode: {state.get('mode', 'none')}")
            print(f"  Locks: {len(state.get('locks', {}))}")
            print(f"  Partitions: {len(state.get('partitions', {}))}")

            if state.get('partitions'):
                print()
                print("Partitions:")
                for agent_id, partition in state['partitions'].items():
                    print(f"  {agent_id}: {partition}")

            if state.get('locks'):
                print()
                print("Active Locks:")
                for path, lock in state['locks'].items():
                    print(f"  {path}: {lock['agent_id']} ({lock['lock_type']})")
        except Exception as e:
            print(f"  Error reading state: {e}")

    print("=" * 60)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensemble Context Sync Server v5.0",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--workspace", "-w", default=os.getcwd(),
                       help="Workspace directory")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Start command
    p_start = subparsers.add_parser("start", help="Start the server")
    p_start.add_argument("--port", "-p", type=int, default=DEFAULT_PORT,
                        help=f"Server port (default: {DEFAULT_PORT})")
    p_start.add_argument("--host", "-H", default=DEFAULT_HOST,
                        help=f"Server host (default: {DEFAULT_HOST})")

    # Stop command
    p_stop = subparsers.add_parser("stop", help="Stop the server")

    # Status command
    p_status = subparsers.add_parser("status", help="Show server status")
    p_status.add_argument("--port", "-p", type=int, default=DEFAULT_PORT,
                         help="Server port (for URL display)")

    args = parser.parse_args()

    if args.command == "start":
        cmd_start(args)
    elif args.command == "stop":
        cmd_stop(args)
    elif args.command == "status":
        cmd_status(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
