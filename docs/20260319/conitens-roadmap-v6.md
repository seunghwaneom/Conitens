# Conitens Development Roadmap & Feature Implementation Plan

**File-Based Multi-Agent Collaboration Platform**
**v5 → v6 Evolution Blueprint**

Seunghwan Eom · KAIST
2026년 3월 19일
github.com/seunghwaneom/Conitens

---

## 목차

1. [Executive Summary](#1-executive-summary)
2. [현황 분석 (Current State)](#2-현황-분석-current-state)
3. [6대 핵심 기능 구현 계획](#3-6대-핵심-기능-구현-계획)
4. [프로토콜 스택 아키텍처](#4-프로토콜-스택-아키텍처)
5. [구현 로드맵 (20주)](#5-구현-로드맵-20주)
6. [리스크 및 완화 전략](#6-리스크-및-완화-전략)
7. [생성/수정 파일 목록](#7-생성수정-파일-목록)
8. [Next Actions (즉시 실행)](#8-next-actions-즉시-실행)
9. [Meta Insight](#9-meta-insight)

---

## 1. Executive Summary

> **핵심 명제:** Conitens는 '파일이 곧 프로토콜'이라는 차별화된 철학을 가진 멀티 에이전트 협업 플랫폼으로, 2026년 3월 기준 Claude Code Agent Teams, Gemini CLI A2A, Codex MCP Server 등 3대 CLI 에이전트의 급속한 진화를 흡수하여 v6로 도약해야 한다.

Conitens v5는 `.context/` 디렉토리 기반의 문서 중재 시스템으로 안정화되었다. 그러나 2026년 Q1에 발생한 3가지 핵심 변화가 아키텍처 확장을 요구한다:

1. **Claude Code Agent Teams (2026.02):** 복수 Claude 인스턴스가 공유 태스크 리스트와 메일박스를 통해 자율 협업. Opus 4.6 필수, 세션당 ~15x 토큰 소비.
2. **Gemini CLI A2A 네이티브 지원 (v0.34):** 원격 서브에이전트를 A2A 프로토콜로 연결. Agent Card 발견 + OAuth2 인증. 브라우저 에이전트 추가.
3. **Codex CLI MCP Server 모드:** `codex mcp-server` 명령으로 다른 에이전트가 Codex를 도구로 호출 가능. sub-agent는 여전히 미지원.

본 문서는 이 변화를 흡수하는 Conitens v6 발전 방향과 6개 핵심 기능 구현 계획을 제시한다.

---

## 2. 현황 분석 (Current State)

### 2.1 Conitens v5 핵심 자산

| 자산 | 설명 | 평가 |
|------|------|------|
| `.context/` 파일 프로토콜 | task_plan.md, findings.md, progress.md를 SSOT로 사용 | ★ 핵심 차별화 |
| AGENTS.md 통합 지시 | 각 CLI 에이전트별 구조화된 지시 파일 | ★ 탄탄 |
| Sub-agent 프로토콜 | `.notes/SUBAGENTS/` 디렉토리, REGISTRY.md, depth=1 제한 | ⚠ 설계완료/미구현 |
| SSOT 권한 분리 | 정의적 SSOT(Conitens) vs 상태 SSOT(Claw-Empire) | ★ 원칙 확립 |
| Claw-Empire 브리지 | bridge.py 설계 (watchdog 기반) | ⚠ Phase 0 단계 |
| MCP Server 노출 | Conitens 조율 연산을 MCP로 래핑 | ⚠ 방향성만 설정 |
| vibe-kit 통합 | 에이전트용 개발도구상자 (indexer, impact, typecheck) | ✓ 독립 작동 |

### 2.2 에이전트 생태계 현황 (2026.03 기준)

| 에이전트 | 핵심 업데이트 | Conitens 영향 |
|----------|--------------|---------------|
| **Claude Code v2.1.32+** | Agent Teams (research preview): 복수 인스턴스 병렬 협업, 공유 태스크 리스트, 메일박스 통신, git worktree 격리 | Agent Teams의 태스크 리스트를 Conitens task_plan.md와 동기하는 브리지 필요 |
| **Gemini CLI v0.34** | A2A 원격 서브에이전트, 브라우저 에이전트, OAuth2 인증, 스킬 slash 명령어 활성화 | Conitens를 A2A Agent Card로 노출하면 Gemini가 네이티브 서브에이전트로 인식 |
| **Codex CLI (GPT-5.2+)** | MCP Server 모드, Context Compaction, 24h+ 세션 유지 | Claude가 Codex를 MCP server로 호출하는 패턴 가능 |
| **OpenClaw 2026.3.13** | 브라우저 MCP attach, 멀티채널 메시징, GPT-5.4 지원 | 통신 버스(Telegram/Discord 알림)로 활용 |
| **Claw-Empire v1.1.9+** | Workflow Pack 6개, 픽셀아트 오피스, 칸반 6단계 | 시각화 레이어로 활용, 장기적 Conitens 네이티브 대시보드로 대체 |

### 2.3 경쟁 프레임워크 비교

| 프레임워크 | 패턴 | Conitens 대비 강점 | Conitens 대비 약점 |
|-----------|------|-------------------|-------------------|
| **LangGraph** | 그래프 기반 상태 머신 | 타입된 상태 관리, 내구성 실행 | 파일 기반 프로토콜 미지원 |
| **CrewAI** | 역할 기반 오케스트레이션 | 직관적 API, 45K+ 스타 | 코드 기반 API 필수, CLI 에이전트 미지원 |
| **MS Agent Framework** | AutoGen+SK 통합 | 그래프 워크플로우, 텔레메트리 | Azure 중심, 로컬퍼스트 철학 부재 |
| **Google ADK** | 계층적 에이전트 트리 | A2A 네이티브, Vertex AI 통합 | 클라우드 의존성 |
| **Antigravity Swarm** | Plan→Execute→Validate | Manus Protocol(SSOT 파일), 스킬 시스템 | 비공개, Gemini 전용 |

> **Conitens의 핵심 차별화:** 모든 경쟁자가 코드 기반 API를 요구하는 반면, Conitens는 '파일을 읽고 쓸 수 있는 모든 에이전트'가 SDK 없이 참여 가능. 이 제로 배리어 특성이 가장 큰 경쟁 우위임.

---

## 3. 6대 핵심 기능 구현 계획

### 3.1 Agent Teams 브리지 (Claude Code ↔ Conitens)

**목표:** Claude Code의 Agent Teams 태스크 리스트와 Conitens task_plan.md를 양방향 동기하여, Agent Teams의 병렬 실행력과 Conitens의 문서 기반 추적성을 결합한다.

#### 아키텍처

Claude Code Agent Teams는 shared task list와 mailbox를 통해 팀원 간 협업한다. 이 태스크 리스트의 pending/in_progress/completed 상태를 Conitens task_plan.md의 체크박스 패턴과 매핑한다.

| Agent Teams 상태 | task_plan.md 매핑 | 동기 방향 |
|-----------------|-------------------|----------|
| pending | `- [ ] 태스크 이름` | Conitens → Teams |
| in_progress | `- [~] 태스크 이름 (@agent)` | Teams → Conitens |
| completed | `- [x] 태스크 이름 ✓` | Teams → Conitens |
| blocked (blockedBy) | `- [ ] 태스크 (blocked: #N)` | 양방향 |

#### 구현 계획

1. **Phase 1 (3일):** `teams_bridge.py` — `.context/task_plan.md`의 체크박스 변경을 watchdog로 감지하여 Claude Code의 shared task list 형식으로 변환. 역방향으로 teammates의 완료 이벤트를 감지하여 task_plan.md 체크박스 자동 체크.
2. **Phase 2 (5일):** CLAUDE.md에 Teams 활성화 지시 자동 주입. `conitens init` 시 `--teams` 플래그로 Agent Teams 설정 블록 생성. 팀 구성 템플릿(lead+specialist 패턴) 제공.
3. **Phase 3 (7일):** mailbox 메시지를 findings.md에 자동 축적. teammate 간 논쟁(과학적 토론 패턴)의 핵심 결론만 추출하여 progress.md에 기록.

#### 위험 완화

| 위험 | 완화 |
|------|------|
| 토큰 폭발 (~15x) | Agent Teams는 복잡한 작업에만 사용. 단순 작업은 sub-agent로 라우팅 |
| 상태 충돌 | Conitens 문서를 SSOT로 지정, Teams 상태는 읽기 전용 뷰 |
| Opus 4.6 필수 | 비용 예산 단계 설정, 자동 폴백 로직 |

---

### 3.2 Conitens MCP Server

**목표:** Conitens의 핵심 조율 연산(task CRUD, progress 조회, findings 기록)을 MCP 서버로 래핑하여 모든 CLI 에이전트가 네이티브 도구로 호출할 수 있게 한다.

#### MCP Tools 설계

| Tool 이름 | 설명 | 입력 | 출력 |
|-----------|------|------|------|
| `conitens_task_list` | 현재 task_plan.md의 전체 태스크 목록 반환 | 없음 | JSON 태스크 배열 |
| `conitens_task_update` | 특정 태스크의 상태 변경 | task_id, status | 성공/실패 |
| `conitens_finding_add` | findings.md에 새 발견 추가 | category, content | 카테고리+타임스탬프 |
| `conitens_progress_log` | progress.md에 불변 로그 추가 | agent, action, details | log_id |
| `conitens_context_read` | .context/ 디렉토리의 특정 문서 읽기 | filename | Markdown 문자열 |
| `conitens_handoff` | 에이전트 간 핸드오프 문서 생성 | from, to, summary | handoff.md 경로 |
| `conitens_doctor` | 프로젝트 건강 상태 진단 | 없음 | 진단 결과 JSON |

#### 구현 방식

Python FastMCP 라이브러리를 사용하여 STDIO 전송 기반 MCP 서버 구현. 각 에이전트의 MCP 설정 파일(`.claude/settings.json`, `.gemini/settings.json`)에 자동 등록하는 `mcp_inject.py` 확장.

핸드오프 시나리오: Claude Code가 `conitens_task_list`로 현황을 파악하고, 작업 완료 후 `conitens_task_update`로 상태 변경, `conitens_handoff`로 Gemini에게 다음 작업을 인계.

> **MCP Server는 Conitens의 가장 높은 레버리지 구현체임. 한 번 구현하면 3개 CLI 에이전트 모두가 Conitens 프로토콜을 네이티브 도구로 사용 가능.**

---

### 3.3 A2A Agent Card 노출

**목표:** Conitens를 A2A 프로토콜의 Agent Card로 노출하여 Gemini CLI가 Conitens workspace를 원격 서브에이전트로 인식하고, 외부 A2A 에이전트와도 상호운용할 수 있게 한다.

#### Agent Card 스펙

A2A v0.3 스펙에 따라 `/.well-known/agent.json`에 Agent Card를 발행한다. Card에는 Conitens의 skills(task 관리, handoff, 진단), inputModes(text/json), outputModes(text/markdown)를 명시한다.

#### 구현 단계

1. **Step 1:** `conitens_a2a_server.py` — A2A SDK(`@a2a-js/sdk` 또는 `a2a-python`)를 사용하여 HTTP 서버 구현. JSON-RPC 2.0 기반.
2. **Step 2:** Gemini CLI의 `.gemini/agents/conitens.md`에 remoteAgent frontmatter로 Conitens A2A 엔드포인트 등록.
3. **Step 3:** Gemini가 `@conitens` 구문으로 Conitens 태스크 조회/생성/업데이트 가능하게 됨.

#### Agent Card 예시 구조

```json
{
  "name": "Conitens Orchestrator",
  "description": "File-based multi-agent collaboration coordinator",
  "url": "http://localhost:18800/a2a",
  "version": "6.0.0",
  "skills": [
    { "id": "task-management", "name": "Task Management", "description": "CRUD operations on task_plan.md" },
    { "id": "handoff", "name": "Agent Handoff", "description": "Structured handoff document generation" },
    { "id": "diagnostics", "name": "Project Diagnostics", "description": "Health check and doctor report" }
  ],
  "inputModes": ["text", "application/json"],
  "outputModes": ["text", "text/markdown"]
}
```

---

### 3.4 시각적 모니터링 대시보드

**목표:** Claw-Empire 의존성을 점진적으로 제거하고, Conitens 네이티브 React 대시보드를 구축한다.

#### 3단계 전환 전략

| 단계 | 기간 | 내용 | 의존성 |
|------|------|------|--------|
| **Phase 0: Claw-Empire 브리지** | 1~2주 | bridge.py로 .context/ 변경 → Claw-Empire REST API 변환 | Claw-Empire 완전 의존 |
| **Phase 1: 하이브리드** | 3~4주 | React + zustand + Recharts 대시보드. chokidar/WebSocket로 파일 변경 감지. Claw-Empire와 병행 운용 | 부분적 의존 |
| **Phase 2: Conitens 네이티브** | 5~8주 | PixiJS 픽셀아트 오피스 + 칸반 + 에이전트 상태 대시보드 자체 구현 | Claw-Empire 의존성 제거 |

#### 대시보드 핵심 구성요소

- **칸반 보드:** task_plan.md의 체크박스를 6단계 파이프라인(Inbox→Planned→Collaborating→In Progress→Review→Done)으로 시각화
- **에이전트 상태:** 각 CLI 에이전트의 활성/유휴/오류 상태를 실시간 표시. heartbeat 기반 건강 체크
- **활동 타임라인:** progress.md의 불변 로그를 시간순 피드로 렌더링
- **픽셀아트 오피스 (선택적):** 에이전트 스프라이트가 책상에서 작업하는 시각화 (PixiJS + React)

---

### 3.5 통합 메모리 엔진

**목표:** 크로스 에이전트 학습 기록과 프로젝트 패턴 학습을 3계층 메모리로 구조화한다.

| 계층 | 담당 | 저장소 | 내용 |
|------|------|--------|------|
| **L1: Working Memory** | 현재 세션 | `.context/` (Markdown) | task_plan.md, findings.md, activeContext.md |
| **L2: Episodic Memory** | 세션 간 | SQLite + Markdown | 완료된 작업 이력, 핸드오프 기록, 에러 패턴 |
| **L3: Semantic Memory** | 프로젝트 전체 | sqlite-vec + Markdown | 벡터 검색으로 '비슷한 에러를 전에 어떻게 해결했나' 참조 |

#### 메모리 업데이트 플로우

작업 완료 시 progress.md에 append-only 로그 → 주간 리콘실레이션으로 L2에 압축 저장 → 패턴 학습(lessons-learned.md) → L3에 벡터화. 새 작업 시작 시 `conitens_context_read` MCP tool로 관련 과거 기억 검색 후 프롬프트에 주입.

> **핵심 원칙:** 기계 생성 상태가 에이전트 산문을 반드시 오버라이드한다. 메모리 업데이트는 '초안 생성'까지만 자동, 최종 반영은 인간 승인.

---

### 3.6 vibe-kit 통합 + Hook 시스템

**목표:** vibe-kit의 에이전트용 개발도구(indexer, impact_analyzer, typecheck_baseline, check_circular)를 Conitens MCP tool로 래핑하고, Conitens Hook 시스템과 연동한다.

#### Hook 시스템 설계

| Hook 이벤트 | 트리거 | 실행 내용 |
|-------------|--------|----------|
| `pre-task` | 에이전트 작업 시작 전 | LATEST_CONTEXT.md 읽기, impact_analyzer 실행, DONT_DO_THIS.md 읽기 |
| `post-edit` | 파일 수정 후 | indexer --file 실행, summarizer 갱신 |
| `pre-commit` | git commit 전 | typecheck_baseline 게이트, check_circular, check_complexity |
| `post-task` | 에이전트 작업 완료 후 | progress.md 기록, L2 메모리 업데이트 |
| `doctor` | 수동 트리거 | 전체 스캔, dependency hotspots, 선택적 프로파일링 |

Claude Code의 hooks 기능(PreToolUse, PostToolUse)과 연동하여, 에이전트가 Write 도구 사용 후 자동으로 post-edit hook이 발동되는 구조.

#### 추가 MCP Tools (vibe-kit 래핑)

| Tool | 원본 | 용도 |
|------|------|------|
| `conitens_impact` | impact_analyzer.py | 파일 영향도 분석 (역방향 참조 탐색) |
| `conitens_index` | indexer.py | 파일/함수 인덱싱 (SQLite FTS) |
| `conitens_typecheck` | typecheck_baseline.py | 타입 오류 증가 여부 게이트 |
| `conitens_circular` | check_circular.py | 순환 의존성 탐지 |

---

## 4. 프로토콜 스택 아키텍처

Conitens는 3계층 프로토콜 스택에서 애플리케이션 계층을 담당한다:

| 계층 | 프로토콜 | 역할 | Conitens 구현 |
|------|---------|------|--------------|
| **Application Layer** | Conitens Protocol | 문서 기반 멀티에이전트 협업 조율 | `.context/` 파일 + Hook 시스템 |
| **Agent-to-Agent** | A2A v0.3 | 에이전트 간 발견/통신 | Agent Card 발행 + A2A Server |
| **Agent-to-Tool** | MCP | 에이전트 ↔ 도구 연결 | Conitens MCP Server (7개 tools) |
| **Communication** | WebSocket + 선택적 NATS | 실시간 이벤트 | 대시보드 업데이트, 채널 라우팅 |
| **Persistence** | Markdown/JSON + Git | 정합적 상태, 감사 추적 | SSOT 파일 시스템 |

### SSOT 권한 분리 원칙

- **정의적 SSOT (What/수락 기준):** Conitens 문서가 소유. task_plan.md의 체크박스 = 작업 정의의 유일한 진실.
- **상태 SSOT (How/실행 상태):** 에이전트 런타임(Claw-Empire DB 또는 대시보드)이 소유. 충돌 시 항상 정의적 SSOT 기준 복구.

### 프로토콜 스택 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 (Human-in-the-Loop)                 │
├─────────────────────────────────────────────────────────────┤
│  Conitens Protocol (Application Layer)                       │
│  ├── .context/task_plan.md ──── 태스크 정의 + 진행률          │
│  ├── .context/findings.md ──── 발견/제약조건 공유             │
│  ├── .context/progress.md ──── 불변 작업 로그                 │
│  ├── AGENTS.md ──────────────── 통합 에이전트 지시             │
│  └── Hook Engine ────────────── pre-task/post-edit/pre-commit │
├─────────────────────────────────────────────────────────────┤
│  A2A v0.3 (Agent-to-Agent)                                   │
│  └── Agent Card (/.well-known/agent.json) → 외부 에이전트 발견 │
├─────────────────────────────────────────────────────────────┤
│  MCP (Agent-to-Tool)                                         │
│  └── 7개 tools: task_list, task_update, finding_add,         │
│      progress_log, context_read, handoff, doctor             │
├─────────────────────────────────────────────────────────────┤
│  WebSocket + Git (Communication + Persistence)               │
│  ├── ws://localhost:18790 → 대시보드/채널 실시간 업데이트      │
│  └── Git → 모든 .context/ 변경의 버전 관리 + 감사 추적        │
├─────────────────────────────────────────────────────────────┤
│  CLI Agents                                                  │
│  ├── Claude Code (Agent Teams + Sub-agents + MCP)            │
│  ├── Gemini CLI (A2A Remote Sub-agents + Browser Agent)      │
│  └── Codex CLI (MCP Server Mode + Context Compaction)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 구현 로드맵 (20주)

| Phase | 기간 | 핵심 산출물 | 선행 조건 |
|-------|------|-----------|----------|
| **Phase 1: MCP Server + Hook** | W1~W4 | `conitens_mcp_server.py` (7개 tools), `hook_engine.py`, `mcp_inject.py` 확장 | 없음 |
| **Phase 2: Agent Teams 브리지** | W5~W8 | `teams_bridge.py`, CLAUDE.md 템플릿 확장, 태스크 양방향 동기 | Phase 1 |
| **Phase 3: A2A + 메모리** | W9~W12 | `a2a_server.py`, Agent Card, 3계층 메모리 엔진 | Phase 1 |
| **Phase 4: 대시보드** | W13~W16 | React + zustand + WebSocket 대시보드, PixiJS 오피스 선택적 | Phase 1~2 |
| **Phase 5: 생태계 + 프로덕션** | W17~W20 | 멀티채널 어댑터(Telegram/Slack), 플러그인 시스템, 문서화 | Phase 1~4 |

### 5.1 Phase 1 상세 (W1~W4)

#### W1: MCP Server 코어
- FastMCP로 `conitens_task_list`, `conitens_task_update`, `conitens_context_read` 3개 tool 구현
- STDIO 전송 기반, `.context/` 디렉토리의 Markdown 파일을 직접 읽기/쓰기
- **MVE:** Claude Code에서 `conitens_task_list` 호출 → task_plan.md 내용 JSON으로 반환 확인

#### W2: MCP Server 확장 + Hook 엔진
- `conitens_finding_add`, `conitens_progress_log`, `conitens_handoff`, `conitens_doctor` tool 추가
- `hook_engine.py`: pre-task/post-edit/pre-commit/post-task 4개 이벤트 엔진

#### W3: mcp_inject + vibe-kit 연동
- `mcp_inject.py`가 Claude/Gemini/Codex 설정 파일에 Conitens MCP server 자동 등록
- vibe-kit 도구(impact_analyzer, indexer)를 MCP tool로 래핑: `conitens_impact`, `conitens_index`

#### W4: 통합 테스트 + 문서화
- 3개 CLI 에이전트 모두에서 MCP tool 호출 테스트
- SKILL.md 작성: `src/skills/mcp-server/SKILL.md`

### 5.2 Phase 1 MVE (최소 검증 실험)

> **성공 기준:** Claude Code에서 `conitens_task_list` MCP tool을 호출하여 `.context/task_plan.md`의 체크박스 목록이 JSON으로 반환되는 것을 확인. 이어서 `conitens_task_update`로 체크박스 1개를 완료 처리하고, task_plan.md에 반영되는 것을 확인. 소요 시간: 30분.

### 5.3 Phase 2~5 핵심 MVE

| Phase | MVE | 성공 기준 |
|-------|-----|----------|
| Phase 2 | Agent Teams 태스크 동기 | task_plan.md에 체크박스 추가 → Agent Teams shared task list에 pending task 생성 (5초 이내) |
| Phase 3 | A2A 서브에이전트 호출 | Gemini CLI에서 `@conitens task list` → Conitens 태스크 목록 반환 |
| Phase 4 | 대시보드 실시간 반영 | task_plan.md 수정 → 브라우저 칸반 보드에 카드 이동 (2초 이내) |
| Phase 5 | 멀티채널 알림 | 에이전트 작업 완료 → Telegram 알림 수신 |

---

## 6. 리스크 및 완화 전략

| 리스크 | 영향도 | 확률 | 완화 전략 |
|--------|--------|------|----------|
| **토큰 비용 폭발 (Agent Teams ~15x)** | 높음 | 높음 | 복잡도 기반 자동 라우팅: 단순→sub-agent, 복잡→Teams. 토큰 예산 상한 설정 |
| **상태 충돌 (task_plan.md ↔ 에이전트 런타임)** | 높음 | 중간 | Conitens 문서 = SSOT. Write-Ahead 패턴: 파일 먼저 → 이벤트 발송 |
| **MCP/A2A 스펙 변경** | 중간 | 중간 | Tool/Agent 추상화 레이어 분리. 버전 체크 로직 |
| **CLI 에이전트 API 변경** | 중간 | 중간 | 파일 기반 프로토콜은 API 변경에 구조적으로 강건. CLI 래퍼 추상화 |
| **Claw-Empire 의존성 고착** | 낮음 | 중간 | Phase 0→1→2 점진적 전환. 브리지 없이도 Conitens 독립 작동 보장 |
| **WSL2/NFS 파일 시스템 문제** | 낮음 | 낮음 | bridge.py에 polling fallback. 파일 감지 실패 시 전체 스캔 발동 |
| **한글 인코딩 문제 (Codex)** | 낮음 | 중간 | 영어 템플릿 사용 규칙 적용. MCP tool 응답은 영어+한글 병기, 영어 우선 |

---

## 7. 생성/수정 파일 목록

### 7.1 신규 파일

| 파일 | 위치 | 용도 |
|------|------|------|
| `conitens_mcp_server.py` | `src/mcp/` | FastMCP 기반 7개 tool MCP 서버 |
| `a2a_server.py` | `src/a2a/` | A2A 프로토콜 Agent Card + HTTP 서버 |
| `hook_engine.py` | `src/hooks/` | pre-task/post-edit/pre-commit/post-task Hook 엔진 |
| `teams_bridge.py` | `src/bridges/` | Claude Code Agent Teams ↔ task_plan.md 양방향 동기 |
| `memory_engine.py` | `src/memory/` | 3계층 메모리(L1/L2/L3) 관리 엔진 |
| `dashboard/` | `src/dashboard/` | React + zustand + WebSocket 대시보드 |
| `vibe_tools.py` | `src/mcp/tools/` | vibe-kit 도구를 MCP tool로 래핑 |
| `agent.json` | `.well-known/` | A2A Agent Card 정의 파일 |

### 7.2 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `init.py` | `--mcp`, `--teams`, `--a2a` 플래그 추가. MCP 서버 자동 등록 |
| `mcp_inject.py` | Conitens MCP server를 3개 CLI 설정에 자동 주입 |
| `doctor.py` | MCP server 상태, A2A server 상태, Hook 엔진 상태 체크 추가 |
| `AGENTS.md 템플릿` | Agent Teams 규칙 + MCP tool 사용법 주입 영역 추가 |
| `CLAUDE.md 템플릿` | Agent Teams 활성화 지시, MCP tool 사용 규칙 추가 |
| `Makefile` | `mcp-server`, `a2a-server`, `dashboard`, `hook-test` 타겟 추가 |

---

## 8. Next Actions (즉시 실행)

| # | 작업 | 소요 시간 | 선행 조건 |
|---|------|----------|----------|
| 1 | FastMCP 설치 + `conitens_task_list` tool 최소 구현 | 30분 | 없음 |
| 2 | `.context/task_plan.md` 파싱 로직 구현 (체크박스 → JSON) | 20분 | #1 |
| 3 | Claude Code MCP 설정에 Conitens server 등록 + MVE 실행 | 15분 | #2 |

### 8.1 Pre-mortem: 실패 시나리오

| 실패 원인 | 탐지 방법 | 완화 전략 |
|----------|----------|----------|
| FastMCP가 Claude Code에서 인식 실패 | MCP 설정 파일 검증, `claude mcp list` 명령 | STDIO 전송 확인, Python 경로 검증 |
| task_plan.md 파싱 실패 (비표준 포맷) | 단위 테스트로 다양한 포맷 검증 | 정규식 기반 파싱 + fallback 로직 |
| 한글 인코딩 문제 (Codex) | 영어 템플릿 사용 규칙 적용 | MCP tool 응답은 영어+한글 병기, 영어 우선 |

---

## 9. Meta Insight

2026년 3월 기준 에이전트 생태계의 핵심 트렌드는 '프레임워크 범용화'에서 'CLI 에이전트 자체의 멀티에이전트 능력 내재화'로 전환되고 있다. Claude Code는 Agent Teams를, Gemini CLI는 A2A 서브에이전트를, Codex는 MCP Server 모드를 각각 내장했다.

이 변화에서 Conitens의 전략적 위치는 명확하다: 개별 에이전트가 자체적으로 멀티에이전트 능력을 갖춰도, '어떤 에이전트가 무엇을 하고, 결과를 어디에 기록하고, 다음 작업은 누가 할 것인가'를 정의하는 '조율 레이어'는 여전히 필요하다. Conitens는 그 조율 레이어를 파일로 구현한다.

> **핵심 교훈:** CLI 에이전트들이 각각 '뭔처가 되는' 시대에, Conitens는 '뭔처들의 팀워크 프로토콜'이 되어야 한다. MCP로 각 에이전트에게 'Conitens 도구함'을 쥐여주고, A2A로 외부 에이전트와 연결하고, 파일로 모든 기록을 남기는 것 — 이것이 Conitens v6의 본질이다.

---

**[Self-Check]:** PASS ✅ (Scale: Structural)
- 가정 파쇄: 3개 (API 기반 레지스트리 불필요, Auto Memory ≠ 크로스에이전트 메모리, Claw-Empire 완전 의존 불필요)
- 목표 규모: Structural (아키텍처 재설계)
- 유추 제어: 설명 보조만 사용
- Action: 10~30분 단위 3개
- Pre-mortem: 포함
- Epistemic Markers: [확실] Agent Teams/A2A/MCP 스펙, [추정] 토큰 비용 ~15x, [가정] Phase 1 MVE 30분

--- 문서 끝 ---
