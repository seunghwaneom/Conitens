# Multi-Agent Workspace Planning v1.0

> Reference planning artifact imported from `claude/multi-agent-workspace-planning-VWmjL`.
>
> Current active product-line truth in this repository remains the Python
> `ensemble` control plane plus `.notes/` and `.agent/`. Treat this document as
> planning/reference input, not current runtime semantics.

> **다중 에이전트 워크스페이스 실시간 컨텍스트 공유 기획**
>
> Task ID: TASK-ACTIVE-20260205-001
> Created: 2026-02-05

---

## 1. Executive Summary

### 1.1 목표

```
┌─────────────────────────────────────────────────────────────────────┐
│  MULTI-AGENT WORKSPACE VISION                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🎯 Goal: 여러 AI Agent가 동일 Workspace에서 실시간으로             │
│           Context를 공유하며 협업 코딩 가능한 환경 구축              │
│                                                                     │
│  📌 Key Features:                                                   │
│     1. 단일 모델 다중 터미널 실행 (Horizontal Scaling)              │
│     2. 동일 모델 다중 인스턴스 (Claude Code × N, Codex × N)         │
│     3. 이기종 모델 동시 실행 (Gemini + Claude + Codex)              │
│     4. 실시간 Context 동기화 (Real-time Sync)                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 현재 상태 vs 목표 상태

| 구분 | 현재 (v4.2) | 목표 (v5.0+) |
|------|-------------|--------------|
| 터미널 | 순차 실행 | 병렬 다중 터미널 |
| 모델 | 단일 활성 | 다중 동시 활성 |
| Context | 파일 기반 동기화 | 실시간 메모리 공유 |
| 상태 관리 | task.md 파일 | Shared State Server |
| Lock | 파일 기반 (_locks.json) | 분산 Lock 관리자 |
| 충돌 해결 | 수동 | 자동 병합 + 충돌 감지 |

---

## 2. Architecture Overview

### 2.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-AGENT WORKSPACE ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │ Claude #1   │  │ Claude #2   │  │ Codex #1    │  │ Gemini #1   │       │
│   │ (Terminal 1)│  │ (Terminal 2)│  │ (Terminal 3)│  │ (Antigravity)│      │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│          │                │                │                │               │
│          └────────────────┼────────────────┼────────────────┘               │
│                           ▼                ▼                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    CONTEXT SYNC LAYER (New)                         │   │
│   │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐              │   │
│   │  │ Event Bus     │ │ State Manager │ │ Lock Manager  │              │   │
│   │  │ (WebSocket)   │ │ (In-Memory)   │ │ (Distributed) │              │   │
│   │  └───────────────┘ └───────────────┘ └───────────────┘              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    PERSISTENCE LAYER (Current)                      │   │
│   │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐              │   │
│   │  │ .notes/       │ │ task.md       │ │ _locks.json   │              │   │
│   │  │ (State Files) │ │ (SSOT)        │ │ (File Locks)  │              │   │
│   │  └───────────────┘ └───────────────┘ └───────────────┘              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 컴포넌트 상세

#### 2.2.1 Context Sync Server

```
┌─────────────────────────────────────────────────────────────────────┐
│  CONTEXT SYNC SERVER                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Port: 9999 (default)                                               │
│  Protocol: WebSocket + HTTP REST API                                │
│                                                                     │
│  Components:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Event Bus                                                    │   │
│  │ - file:changed      파일 변경 알림                           │   │
│  │ - task:updated      Task 상태 변경                           │   │
│  │ - agent:joined      Agent 연결                              │   │
│  │ - agent:left        Agent 연결 해제                          │   │
│  │ - lock:acquired     Lock 획득                               │   │
│  │ - lock:released     Lock 해제                               │   │
│  │ - context:sync      Context 전체 동기화                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ State Manager                                                │   │
│  │ - active_agents: Map<agent_id, AgentInfo>                   │   │
│  │ - current_context: SharedContext                            │   │
│  │ - file_watchers: Map<path, WatcherInfo>                     │   │
│  │ - task_state: TaskState (synced with task.md)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Lock Manager                                                 │   │
│  │ - file_locks: Map<path, LockInfo>                           │   │
│  │ - region_locks: Map<path:range, LockInfo>                   │   │
│  │ - deadlock_detector: DeadlockDetector                       │   │
│  │ - ttl_manager: TTLManager (auto-release)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 Agent Client SDK

```python
# ensemble_client.py - Agent들이 사용하는 클라이언트 SDK

class EnsembleClient:
    """실시간 Context 공유를 위한 Agent 클라이언트"""

    def __init__(self, agent_id: str, agent_type: str):
        self.agent_id = agent_id
        self.agent_type = agent_type  # CLAUDE, CODEX, GEMINI
        self.ws_client = None
        self.context_cache = {}

    async def connect(self, server_url: str = "ws://localhost:9999"):
        """서버에 연결하고 Agent 등록"""

    async def subscribe_file(self, file_path: str):
        """파일 변경 구독"""

    async def acquire_lock(self, file_path: str, region: Optional[Range] = None):
        """파일/영역 Lock 획득"""

    async def release_lock(self, file_path: str):
        """Lock 해제"""

    async def broadcast_change(self, file_path: str, change_type: str, diff: str):
        """변경사항 브로드캐스트"""

    async def get_shared_context(self) -> SharedContext:
        """현재 공유 Context 조회"""

    async def update_task_state(self, task_id: str, updates: dict):
        """Task 상태 업데이트"""
```

---

## 3. Feature Specification

### 3.1 단일 모델 다중 터미널 실행

#### 3.1.1 Use Case

```
┌─────────────────────────────────────────────────────────────────────┐
│  SINGLE MODEL - MULTI TERMINAL                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Scenario: Claude Code를 3개 터미널에서 동시 실행                    │
│                                                                     │
│  Terminal 1         Terminal 2         Terminal 3                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│  │ Claude #1   │   │ Claude #2   │   │ Claude #3   │               │
│  │ (Frontend)  │   │ (Backend)   │   │ (Tests)     │               │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘               │
│         │                 │                 │                       │
│         │    Real-time Context Sync         │                       │
│         └─────────────────┼─────────────────┘                       │
│                           ▼                                         │
│                    Shared Context                                   │
│                                                                     │
│  Benefits:                                                          │
│  - 작업 분할로 속도 향상 (3x throughput)                            │
│  - 각 터미널이 특정 도메인 집중                                      │
│  - 변경사항 실시간 공유로 충돌 방지                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.1.2 구현 요구사항

| 기능 | 설명 | 우선순위 |
|------|------|---------|
| 인스턴스 ID | 각 터미널 인스턴스 고유 식별 | P0 |
| 파일 Lock | 동일 파일 동시 편집 방지 | P0 |
| Context 동기화 | 파일 변경 실시간 브로드캐스트 | P0 |
| Task 분할 | 하나의 Task를 여러 Sub-task로 분할 | P1 |
| 진행률 추적 | 전체 진행 상황 통합 대시보드 | P1 |
| 자동 병합 | 비충돌 변경 자동 병합 | P2 |

#### 3.1.3 워크플로우

```yaml
# 1. 서버 시작
ensemble server start --port 9999

# 2. 터미널 1: Claude #1 연결
ensemble connect --agent CLAUDE --instance frontend --partition src/frontend/

# 3. 터미널 2: Claude #2 연결
ensemble connect --agent CLAUDE --instance backend --partition src/backend/

# 4. 터미널 3: Claude #3 연결
ensemble connect --agent CLAUDE --instance tests --partition tests/

# 5. Task 생성 및 분배
ensemble new --mode PAR-MULTI --title "Feature Implementation"
ensemble assign --instance frontend --subtask "UI Components"
ensemble assign --instance backend --subtask "API Endpoints"
ensemble assign --instance tests --subtask "Test Coverage"

# 6. 실시간 상태 확인
ensemble dashboard  # 웹 대시보드 열기
```

### 3.2 동일 모델 다중 인스턴스

#### 3.2.1 Claude Code 다중 인스턴스

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLAUDE CODE MULTI-INSTANCE ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Load Balancer                             │   │
│  │  - Round-robin 또는 Partition 기반 분배                       │   │
│  │  - Rate limit 고려 자동 전환                                  │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         ▼                    ▼                    ▼                │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐        │
│  │ Claude #1   │      │ Claude #2   │      │ Claude #3   │        │
│  │             │      │             │      │             │        │
│  │ Partition A │      │ Partition B │      │ Partition C │        │
│  │ src/auth/   │      │ src/api/    │      │ src/ui/     │        │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘        │
│         │                    │                    │                │
│         └────────────────────┼────────────────────┘                │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Shared State (Context Sync Server)              │   │
│  │                                                              │   │
│  │  - Task State: ACTIVE                                        │   │
│  │  - Active Agents: [claude-1, claude-2, claude-3]             │   │
│  │  - Partitions: {A: auth, B: api, C: ui}                      │   │
│  │  - Locks: {src/auth/login.py: claude-1, ...}                 │   │
│  │  - Recent Changes: [...]                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Codex 다중 인스턴스

```
┌─────────────────────────────────────────────────────────────────────┐
│  CODEX MULTI-INSTANCE ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Use Case: 대규모 코드 리뷰/검증 병렬화                              │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Codex #1    │  │ Codex #2    │  │ Codex #3    │                 │
│  │ (Security)  │  │ (Perf)      │  │ (Style)     │                 │
│  │             │  │             │  │             │                 │
│  │ - SQLi      │  │ - Algo O(n) │  │ - Naming    │                 │
│  │ - XSS       │  │ - Memory    │  │ - Format    │                 │
│  │ - CSRF      │  │ - Caching   │  │ - Comments  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                          ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Review Aggregator                               │   │
│  │                                                              │   │
│  │  - Merge findings from all instances                         │   │
│  │  - De-duplicate issues                                       │   │
│  │  - Priority scoring                                          │   │
│  │  - Generate unified report                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 이기종 모델 동시 실행

#### 3.3.1 GCC Mode 실시간 버전

```
┌─────────────────────────────────────────────────────────────────────┐
│  HETEROGENEOUS MULTI-MODEL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Current GCC (Sequential):    Target GCC-RT (Real-Time):           │
│  Gemini → Claude → Codex      Gemini ↔ Claude ↔ Codex              │
│      │       │        │           │       │        │               │
│      ▼       ▼        ▼           └───────┼────────┘               │
│   Plan → Impl → Review                    ▼                        │
│                                    Parallel + Sync                  │
│                                                                     │
│  Real-Time Collaboration:                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │   Gemini (Planner)    Claude (Implementer)    Codex (Reviewer)│  │
│  │   ┌─────────────┐     ┌─────────────────┐    ┌─────────────┐ │   │
│  │   │ Planning    │────▶│ Implementation  │───▶│ Review      │ │   │
│  │   │             │◀────│                 │◀───│             │ │   │
│  │   │ - Spec      │     │ - Code          │    │ - Findings  │ │   │
│  │   │ - Approach  │     │ - Tests         │    │ - Fixes     │ │   │
│  │   │ - Risks     │     │ - Docs          │    │ - Approval  │ │   │
│  │   └─────────────┘     └─────────────────┘    └─────────────┘ │   │
│  │         │                     │                    │         │   │
│  │         └─────────────────────┼────────────────────┘         │   │
│  │                               ▼                              │   │
│  │                    Real-Time Event Bus                       │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Event Types:                                                       │
│  - plan:proposed     Gemini가 계획 제안                             │
│  - plan:approved     Claude/Codex가 계획 승인                       │
│  - code:written      Claude가 코드 작성                             │
│  - review:requested  Claude가 리뷰 요청                             │
│  - review:completed  Codex가 리뷰 완료                              │
│  - fix:suggested     Codex가 수정 제안                              │
│  - fix:applied       Claude가 수정 적용                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 역할별 실시간 상호작용

```yaml
# 실시간 GCC 상호작용 예시

# 1. Gemini가 기능 계획 수립
[Gemini] → broadcast(plan:proposed, {
  feature: "OAuth2 Login",
  approach: "JWT + Refresh Token",
  files: ["src/auth/oauth.py", "src/auth/tokens.py"],
  risks: ["token_expiry_handling"]
})

# 2. Claude가 계획 확인 및 구현 시작
[Claude] → broadcast(plan:acknowledged)
[Claude] → acquire_lock("src/auth/oauth.py")
[Claude] → broadcast(code:writing, {file: "src/auth/oauth.py"})

# 3. Codex가 실시간 모니터링
[Codex] → subscribe("src/auth/**")
# Claude의 변경사항 실시간 수신

# 4. Claude가 초기 구현 완료, 리뷰 요청
[Claude] → broadcast(review:requested, {
  files: ["src/auth/oauth.py"],
  description: "OAuth2 기본 구현"
})
[Claude] → release_lock("src/auth/oauth.py")

# 5. Codex 즉시 리뷰 시작 (기다림 없음)
[Codex] → acquire_lock("src/auth/oauth.py", mode=REVIEW)
[Codex] → broadcast(review:in_progress)

# 6. Gemini가 추가 제안 (병렬로)
[Gemini] → broadcast(plan:amendment, {
  suggestion: "PKCE 지원 추가",
  reason: "보안 강화"
})

# 7. Codex 리뷰 결과 즉시 브로드캐스트
[Codex] → broadcast(review:completed, {
  status: "CHANGES_REQUESTED",
  findings: [{type: "security", line: 45, msg: "token storage 취약"}]
})

# 8. Claude 즉시 수정 (Gemini 제안도 반영)
[Claude] → acknowledge(review:completed)
[Claude] → acknowledge(plan:amendment)
[Claude] → acquire_lock("src/auth/oauth.py")
[Claude] → broadcast(fix:in_progress)
```

---

## 4. Technical Implementation

### 4.1 Context Sync Server 구현

#### 4.1.1 서버 핵심 코드

```python
# scripts/ensemble_server.py

import asyncio
import json
from typing import Dict, Set, Optional
from dataclasses import dataclass, field
from datetime import datetime
import websockets
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

@dataclass
class AgentInfo:
    agent_id: str
    agent_type: str  # CLAUDE, CODEX, GEMINI
    instance_id: str
    partition: Optional[str] = None
    connected_at: datetime = field(default_factory=datetime.now)
    subscriptions: Set[str] = field(default_factory=set)

@dataclass
class LockInfo:
    file_path: str
    agent_id: str
    lock_type: str  # EXCLUSIVE, REVIEW, SHARED
    acquired_at: datetime
    ttl_seconds: int = 300
    region: Optional[tuple] = None  # (start_line, end_line)

class ContextSyncServer:
    def __init__(self, workspace_path: str, port: int = 9999):
        self.workspace = workspace_path
        self.port = port
        self.agents: Dict[str, AgentInfo] = {}
        self.locks: Dict[str, LockInfo] = {}
        self.connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.file_watchers: Dict[str, Set[str]] = {}  # path -> agent_ids

    async def start(self):
        """서버 시작"""
        # WebSocket 서버
        async with websockets.serve(self.handle_connection, "localhost", self.port):
            print(f"Context Sync Server started on ws://localhost:{self.port}")
            # 파일 시스템 감시 시작
            self.start_file_watcher()
            await asyncio.Future()  # 무한 대기

    async def handle_connection(self, websocket, path):
        """클라이언트 연결 처리"""
        agent_id = None
        try:
            async for message in websocket:
                data = json.loads(message)
                event_type = data.get("type")

                if event_type == "agent:register":
                    agent_id = await self.register_agent(websocket, data)
                elif event_type == "file:subscribe":
                    await self.subscribe_file(agent_id, data["path"])
                elif event_type == "lock:acquire":
                    await self.acquire_lock(agent_id, data)
                elif event_type == "lock:release":
                    await self.release_lock(agent_id, data["path"])
                elif event_type == "broadcast":
                    await self.broadcast(agent_id, data)
                elif event_type == "context:get":
                    await self.send_context(websocket)

        finally:
            if agent_id:
                await self.unregister_agent(agent_id)

    async def register_agent(self, websocket, data) -> str:
        """Agent 등록"""
        agent_id = f"{data['agent_type']}-{data['instance_id']}"
        self.agents[agent_id] = AgentInfo(
            agent_id=agent_id,
            agent_type=data["agent_type"],
            instance_id=data["instance_id"],
            partition=data.get("partition")
        )
        self.connections[agent_id] = websocket

        # 다른 Agent들에게 알림
        await self.broadcast_event("agent:joined", {
            "agent_id": agent_id,
            "agent_type": data["agent_type"],
            "partition": data.get("partition")
        }, exclude=[agent_id])

        return agent_id

    async def acquire_lock(self, agent_id: str, data: dict) -> bool:
        """Lock 획득"""
        file_path = data["path"]
        lock_type = data.get("lock_type", "EXCLUSIVE")

        # 기존 Lock 확인
        if file_path in self.locks:
            existing = self.locks[file_path]
            if existing.agent_id != agent_id:
                # Lock 실패
                await self.send_to_agent(agent_id, {
                    "type": "lock:failed",
                    "path": file_path,
                    "held_by": existing.agent_id
                })
                return False

        # Lock 획득
        self.locks[file_path] = LockInfo(
            file_path=file_path,
            agent_id=agent_id,
            lock_type=lock_type,
            acquired_at=datetime.now(),
            region=data.get("region")
        )

        # 브로드캐스트
        await self.broadcast_event("lock:acquired", {
            "path": file_path,
            "agent_id": agent_id,
            "lock_type": lock_type
        })

        return True

    async def broadcast_event(self, event_type: str, data: dict, exclude: list = None):
        """모든 Agent에게 이벤트 브로드캐스트"""
        exclude = exclude or []
        message = json.dumps({"type": event_type, **data})

        for agent_id, ws in self.connections.items():
            if agent_id not in exclude:
                await ws.send(message)

    def start_file_watcher(self):
        """파일 시스템 변경 감시 시작"""
        event_handler = FileChangeHandler(self)
        observer = Observer()
        observer.schedule(event_handler, self.workspace, recursive=True)
        observer.start()

class FileChangeHandler(FileSystemEventHandler):
    def __init__(self, server: ContextSyncServer):
        self.server = server

    def on_modified(self, event):
        if not event.is_directory:
            asyncio.run(self.server.broadcast_event("file:changed", {
                "path": event.src_path,
                "change_type": "modified"
            }))
```

#### 4.1.2 CLI 통합

```python
# ensemble.py에 추가할 명령어들

@click.group()
def server():
    """Context Sync Server 관리"""
    pass

@server.command()
@click.option('--port', default=9999, help='서버 포트')
def start(port):
    """서버 시작"""
    server = ContextSyncServer(os.getcwd(), port)
    asyncio.run(server.start())

@server.command()
def stop():
    """서버 중지"""
    # PID 파일을 통한 서버 종료
    pass

@server.command()
def status():
    """서버 상태 확인"""
    # 연결된 Agent 목록, Lock 상태 등 출력
    pass

@click.command()
@click.option('--agent', required=True, type=click.Choice(['CLAUDE', 'CODEX', 'GEMINI']))
@click.option('--instance', required=True, help='인스턴스 ID')
@click.option('--partition', help='담당 디렉토리')
def connect(agent, instance, partition):
    """서버에 Agent로 연결"""
    client = EnsembleClient(f"{agent}-{instance}", agent)
    asyncio.run(client.connect())
    # REPL 모드로 진입
```

### 4.2 Agent Client SDK

```python
# scripts/ensemble_client.py

import asyncio
import json
from typing import Optional, Callable, Dict, Any
import websockets

class EnsembleClient:
    """Ensemble Context Sync Client SDK"""

    def __init__(self, agent_id: str, agent_type: str):
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.ws = None
        self.event_handlers: Dict[str, Callable] = {}
        self.context_cache = {}

    async def connect(self, server_url: str = "ws://localhost:9999"):
        """서버에 연결"""
        self.ws = await websockets.connect(server_url)

        # Agent 등록
        await self.send({
            "type": "agent:register",
            "agent_type": self.agent_type,
            "instance_id": self.agent_id.split("-")[-1]
        })

        # 메시지 수신 루프 시작
        asyncio.create_task(self._receive_loop())

    async def _receive_loop(self):
        """메시지 수신 루프"""
        async for message in self.ws:
            data = json.loads(message)
            event_type = data.get("type")

            # 이벤트 핸들러 호출
            if event_type in self.event_handlers:
                await self.event_handlers[event_type](data)

    def on(self, event_type: str, handler: Callable):
        """이벤트 핸들러 등록"""
        self.event_handlers[event_type] = handler

    async def send(self, data: dict):
        """메시지 전송"""
        await self.ws.send(json.dumps(data))

    async def acquire_lock(self, file_path: str,
                           lock_type: str = "EXCLUSIVE",
                           region: Optional[tuple] = None) -> bool:
        """파일/영역 Lock 획득"""
        await self.send({
            "type": "lock:acquire",
            "path": file_path,
            "lock_type": lock_type,
            "region": region
        })
        # 응답 대기 (실제 구현에서는 Promise 패턴 사용)
        return True

    async def release_lock(self, file_path: str):
        """Lock 해제"""
        await self.send({
            "type": "lock:release",
            "path": file_path
        })

    async def subscribe(self, path_pattern: str):
        """파일 변경 구독"""
        await self.send({
            "type": "file:subscribe",
            "path": path_pattern
        })

    async def broadcast(self, event_type: str, data: dict):
        """이벤트 브로드캐스트"""
        await self.send({
            "type": "broadcast",
            "event": event_type,
            "data": data
        })

    async def get_context(self) -> dict:
        """현재 공유 Context 조회"""
        await self.send({"type": "context:get"})
        # 응답 대기
        return self.context_cache
```

### 4.3 Agent별 통합 방법

#### 4.3.1 Claude Code 통합

```markdown
# CLAUDE.md 추가 섹션

## 🔗 Multi-Agent Mode

### 서버 연결

Task 시작 시 자동으로 Context Sync Server에 연결합니다:

```bash
# 서버가 실행 중인지 확인
ensemble server status

# 서버가 없으면 시작
ensemble server start --background

# Agent로 연결
ensemble connect --agent CLAUDE --instance $(hostname)-$(tty | tr '/' '-')
```

### 실시간 이벤트 처리

| 수신 이벤트 | 처리 |
|------------|------|
| `file:changed` | Context 갱신, 영향 분석 |
| `lock:acquired` | 해당 파일 편집 회피 |
| `review:requested` | (Codex 역할 시) 리뷰 시작 |
| `plan:proposed` | (계획 검토) 확인/제안 |

### Lock 프로토콜

파일 수정 전:
1. `ensemble lock acquire --file {path}`
2. 수정 작업
3. `ensemble lock release --file {path}`

실패 시:
- 다른 Agent가 Lock 보유 → 대기 또는 다른 파일 작업
- 충돌 위험 알림 표시
```

#### 4.3.2 Codex 통합

```markdown
# AGENTS.md 추가 섹션

## 🔗 Multi-Agent Mode

### 리뷰 모드 연결

```bash
ensemble connect --agent CODEX --instance reviewer-1
```

### 자동 리뷰 트리거

`review:requested` 이벤트 수신 시 자동 리뷰 시작:

1. 대상 파일 Lock (REVIEW 모드)
2. 보안/성능/스타일 검사
3. findings 브로드캐스트
4. Lock 해제
```

#### 4.3.3 Gemini 통합 (Antigravity)

```markdown
# .agent/rules/ensemble-multi-agent.md

## Multi-Agent Planning

### 계획 브로드캐스트

기능 계획 수립 시 즉시 브로드캐스트:

```
/ensemble broadcast plan:proposed --data '{
  "feature": "기능 이름",
  "approach": "접근 방법",
  "files": ["file1.py", "file2.py"],
  "risks": ["risk1", "risk2"]
}'
```

### 실시간 피드백 수신

Claude/Codex의 피드백을 실시간으로 수신하여 계획 조정
```

---

## 5. Data Structures

### 5.1 Shared Context Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SharedContext",
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace 경로"
    },
    "task": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "status": {"type": "string", "enum": ["ACTIVE", "HALTED", "COMPLETED"]},
        "mode": {"type": "string"},
        "agents": {"type": "array", "items": {"type": "string"}}
      }
    },
    "active_agents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "agent_id": {"type": "string"},
          "agent_type": {"type": "string"},
          "partition": {"type": "string"},
          "connected_at": {"type": "string", "format": "date-time"}
        }
      }
    },
    "locks": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "agent_id": {"type": "string"},
          "lock_type": {"type": "string"},
          "acquired_at": {"type": "string", "format": "date-time"}
        }
      }
    },
    "recent_changes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": {"type": "string"},
          "agent_id": {"type": "string"},
          "change_type": {"type": "string"},
          "timestamp": {"type": "string", "format": "date-time"}
        }
      }
    }
  }
}
```

### 5.2 Event Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SyncEvent",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "agent:register", "agent:joined", "agent:left",
        "file:subscribe", "file:changed",
        "lock:acquire", "lock:acquired", "lock:failed", "lock:released",
        "broadcast", "context:get", "context:update",
        "plan:proposed", "plan:approved", "plan:amendment",
        "code:writing", "code:written",
        "review:requested", "review:in_progress", "review:completed",
        "fix:suggested", "fix:applied"
      ]
    },
    "agent_id": {"type": "string"},
    "timestamp": {"type": "string", "format": "date-time"},
    "data": {"type": "object"}
  },
  "required": ["type", "timestamp"]
}
```

---

## 6. Implementation Roadmap

### 6.1 Phase 1: Foundation (v5.0)

```
Duration: 4주

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: FOUNDATION                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Week 1-2: Context Sync Server                                      │
│  - [ ] WebSocket 서버 기본 구현                                      │
│  - [ ] Agent 등록/해제 처리                                          │
│  - [ ] 파일 시스템 감시 (watchdog)                                   │
│  - [ ] 기본 이벤트 브로드캐스트                                       │
│                                                                     │
│  Week 3: Lock Manager                                               │
│  - [ ] 파일 Lock 획득/해제                                           │
│  - [ ] TTL 기반 자동 해제                                            │
│  - [ ] 기존 _locks.json 마이그레이션                                  │
│                                                                     │
│  Week 4: CLI Integration                                            │
│  - [ ] ensemble server 명령어                                        │
│  - [ ] ensemble connect 명령어                                       │
│  - [ ] CLAUDE.md/AGENTS.md 업데이트                                  │
│                                                                     │
│  Deliverables:                                                      │
│  ✅ 다중 터미널에서 동일 모델 실행 가능                               │
│  ✅ 파일 변경 실시간 알림                                            │
│  ✅ 충돌 방지 Lock 시스템                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Phase 2: Multi-Instance (v5.1)

```
Duration: 3주

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: MULTI-INSTANCE                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Week 1: Partition System                                           │
│  - [ ] Partition 정의 및 할당                                        │
│  - [ ] 자동 파티션 추천                                              │
│  - [ ] 파티션 경계 검증                                              │
│                                                                     │
│  Week 2: Load Balancer                                              │
│  - [ ] Round-robin 분배                                             │
│  - [ ] Rate limit 감지 및 전환                                       │
│  - [ ] 인스턴스 상태 모니터링                                         │
│                                                                     │
│  Week 3: Dashboard                                                  │
│  - [ ] 웹 대시보드 UI                                               │
│  - [ ] 실시간 상태 표시                                              │
│  - [ ] 진행률 추적                                                   │
│                                                                     │
│  Deliverables:                                                      │
│  ✅ Claude Code 다중 인스턴스 지원                                   │
│  ✅ Codex 병렬 리뷰 지원                                             │
│  ✅ 실시간 모니터링 대시보드                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Phase 3: Heterogeneous (v5.2)

```
Duration: 4주

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: HETEROGENEOUS MULTI-MODEL                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Week 1-2: GCC-RT Mode                                              │
│  - [ ] 실시간 GCC 워크플로우 정의                                     │
│  - [ ] 역할별 이벤트 타입 구현                                        │
│  - [ ] 상태 전이 규칙 업데이트                                        │
│                                                                     │
│  Week 3: Cross-Model Communication                                  │
│  - [ ] Gemini ↔ Claude 실시간 통신                                  │
│  - [ ] Claude ↔ Codex 실시간 통신                                   │
│  - [ ] 3자 동시 통신                                                 │
│                                                                     │
│  Week 4: Conflict Resolution                                        │
│  - [ ] 자동 병합 엔진                                                │
│  - [ ] 충돌 감지 및 알림                                             │
│  - [ ] 수동 해결 워크플로우                                           │
│                                                                     │
│  Deliverables:                                                      │
│  ✅ Gemini + Claude + Codex 동시 실행                                │
│  ✅ 실시간 협업 워크플로우                                            │
│  ✅ 자동 충돌 해결                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.4 Phase 4: Advanced Features (v5.3+)

```
Duration: 지속적

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4: ADVANCED FEATURES                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Region-Level Locking:                                              │
│  - [ ] 함수/클래스 단위 Lock                                         │
│  - [ ] 라인 범위 Lock                                               │
│  - [ ] 동시 편집 (다른 영역)                                         │
│                                                                     │
│  Smart Partitioning:                                                │
│  - [ ] 의존성 기반 자동 파티션                                        │
│  - [ ] 변경 빈도 기반 최적화                                         │
│  - [ ] 동적 재파티션                                                 │
│                                                                     │
│  Orchestration AI:                                                  │
│  - [ ] 작업 자동 분배                                                │
│  - [ ] 병목 감지 및 재분배                                           │
│  - [ ] 예상 완료 시간 추정                                            │
│                                                                     │
│  Analytics:                                                         │
│  - [ ] 협업 효율성 메트릭                                            │
│  - [ ] Agent별 기여도 분석                                           │
│  - [ ] 최적 팀 구성 추천                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Use Case Scenarios

### 7.1 Scenario 1: 대규모 리팩토링

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCENARIO: Legacy Code Refactoring                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Task: 10,000줄 레거시 코드를 현대적 패턴으로 리팩토링               │
│                                                                     │
│  Team:                                                              │
│  - Gemini #1: 아키텍처 분석 및 리팩토링 계획                         │
│  - Claude #1: src/core/ 리팩토링                                    │
│  - Claude #2: src/api/ 리팩토링                                     │
│  - Claude #3: src/utils/ 리팩토링                                   │
│  - Codex #1: 보안 검토                                              │
│  - Codex #2: 성능 검토                                              │
│                                                                     │
│  Flow:                                                              │
│  1. Gemini가 전체 계획 수립 및 파티션 정의                           │
│  2. 3개 Claude가 각자 파티션 동시 작업                               │
│  3. 2개 Codex가 완료된 부분부터 실시간 리뷰                          │
│  4. 이슈 발견 시 즉시 해당 Claude에게 알림                           │
│  5. 모든 파티션 완료 후 통합 테스트                                  │
│                                                                     │
│  Expected Outcome:                                                  │
│  - 기존 대비 3배 빠른 완료                                          │
│  - 실시간 리뷰로 품질 향상                                          │
│  - 충돌 없는 병렬 작업                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Scenario 2: 긴급 버그 수정

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCENARIO: Critical Bug Hotfix                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Task: 프로덕션 버그 긴급 수정                                       │
│                                                                     │
│  Team:                                                              │
│  - Claude #1: 버그 원인 분석 및 수정                                 │
│  - Codex #1: 수정 코드 즉시 보안 검토                                │
│                                                                     │
│  Flow:                                                              │
│  1. Claude가 버그 원인 파악                                         │
│  2. Claude가 수정 코드 작성 (실시간 브로드캐스트)                     │
│  3. Codex가 작성 중인 코드 실시간 모니터링                           │
│  4. Claude 완료 → Codex 즉시 리뷰 (대기 시간 0)                      │
│  5. Codex 승인 → 즉시 배포 가능                                     │
│                                                                     │
│  Expected Outcome:                                                  │
│  - 순차 방식 대비 50% 시간 단축                                     │
│  - 리뷰 대기 시간 제거                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Scenario 3: 신규 기능 개발

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCENARIO: New Feature Development                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Task: 결제 시스템 통합                                              │
│                                                                     │
│  Team:                                                              │
│  - Gemini: 아키텍처 설계, API 스펙 정의                              │
│  - Claude #1: Backend API 구현                                      │
│  - Claude #2: Frontend 연동                                         │
│  - Codex: 보안 검토 (PCI-DSS 준수)                                  │
│                                                                     │
│  Real-time Collaboration:                                           │
│                                                                     │
│  [T+0m] Gemini: API 스펙 v1 브로드캐스트                            │
│  [T+1m] Claude#1: 스펙 확인, 구현 시작                               │
│  [T+2m] Claude#2: 스펙 확인, 프론트 구조 설계                        │
│  [T+10m] Claude#1: POST /payment 완료, 리뷰 요청                    │
│  [T+10m] Codex: 즉시 리뷰 시작                                      │
│  [T+12m] Codex: PCI-DSS 이슈 발견, 알림                             │
│  [T+12m] Gemini: 스펙 수정 제안                                     │
│  [T+13m] Claude#1: 수정 적용                                        │
│  [T+15m] Claude#2: 프론트 연동 완료                                 │
│  [T+20m] 전체 통합 테스트 → 완료                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Risk Analysis

### 8.1 기술적 리스크

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| WebSocket 연결 불안정 | 높음 | 자동 재연결, 오프라인 큐 |
| 동시성 버그 | 높음 | 철저한 Lock 프로토콜, 테스트 |
| 파일 시스템 이벤트 누락 | 중간 | 폴링 백업, 체크섬 검증 |
| 메모리 누수 | 중간 | 이벤트 정리, 연결 타임아웃 |
| 네트워크 지연 | 낮음 | 로컬 캐시, 낙관적 업데이트 |

### 8.2 운영 리스크

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 학습 곡선 | 중간 | 상세 문서, 자동화 |
| 복잡성 증가 | 중간 | 점진적 도입, 단순 모드 유지 |
| 디버깅 어려움 | 중간 | 상세 로깅, 이벤트 추적 |

---

## 9. Success Metrics

### 9.1 정량적 지표

| 지표 | 현재 | 목표 (v5.0) | 목표 (v5.2) |
|------|------|-------------|-------------|
| 동시 Agent 수 | 1 | 5 | 10+ |
| 평균 작업 완료 시간 | 100% | 50% | 30% |
| Lock 충돌 발생률 | N/A | <5% | <1% |
| Context 동기화 지연 | N/A | <500ms | <100ms |
| 리뷰 대기 시간 | 100% | 10% | 0% |

### 9.2 정성적 지표

- Agent 간 협업 자연스러움
- 사용자 개입 필요성 감소
- 코드 품질 향상
- 개발 경험 만족도

---

## 10. Appendix

### 10.1 관련 문서

- [CONITENS.md](../CONITENS.md) - 프로토콜 명세
- [CLAUDE.md](../CLAUDE.md) - Claude Code 지침
- [AGENTS.md](../AGENTS.md) - Codex 지침
- [USAGE_GUIDE.md](../USAGE_GUIDE.md) - 사용 가이드

### 10.2 참고 기술

- WebSocket: 실시간 양방향 통신
- watchdog: Python 파일 시스템 감시
- asyncio: Python 비동기 프로그래밍
- Redis (선택): 분산 상태 관리 (스케일링 시)

### 10.3 버전 히스토리

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | 2026-02-05 | 초기 기획 문서 작성 |

---

*Multi-Agent Workspace Planning v1.0 — Conitens Evolution*
