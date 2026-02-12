# Conitens Sub-agent 관리 계층 설계서

**KST [2026-02-12] | Scale: Structural | 부록: v3 전략 보고서 확장**

---

## 1. Deconstruction: 누락된 계층의 본질

**BLUF:** 현재 Conitens 아키텍처는 **USER → Agent(Claude/Gemini/Codex)** 2-tier 구조인데, 실제 각 모델은 내부적으로 sub-agent를 생성·관리하는 능력이 있음. 이 **Agent → Sub-agent 계층**을 Conitens 프로토콜로 통합 관리하지 않으면, 각 에이전트가 독자적으로 sub-agent를 생성하며 **상태 파편화(state fragmentation)**가 발생함. 핵심 문제는 3개 모델의 sub-agent 메커니즘이 **완전히 비대칭**이라는 것.

### 1.1 현재 아키텍처 vs 목표 아키텍처

```
[현재: 2-tier — Sub-agent 미관리]

USER INPUT
    │
    ├── Claude Code ──── (자체적으로 Task/Teams 생성, Conitens 모름)
    ├── Gemini CLI ───── (자체적으로 codebase_investigator 등 호출, Conitens 모름)
    └── Codex CLI ────── (sub-agent 없음, 단일 스레드)

→ 문제: 에이전트가 내부에서 뭘 하는지 Conitens가 추적 불가


[목표: 3-tier — Sub-agent 통합 관리]

USER INPUT
    │
    ▼
┌─────────────────────────────────────────────┐
│              CONITENS PROTOCOL               │
│  Global Docs + .notes/ + Sub-agent Registry │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
     ┌─────▼────┐ ┌──▼───┐ ┌───▼────┐
     │ Claude   │ │Gemini│ │ Codex  │      ← Agent (L1)
     │ Code     │ │ CLI  │ │  CLI   │
     └──┬──┬──┘ └──┬──┘ └───┬────┘
        │  │       │         │
   ┌────▼┐ ▼──┐  ┌▼───┐    (없음)
   │Task │Teams│  │sub- │               ← Sub-agent (L2)
   │tool │    │  │agent│
   └─────┘────┘  └────┘

→ 핵심: L2 sub-agent의 생성·상태·결과를 L1 Agent가
  .notes/SUBAGENTS/ 에 파일로 기록 → Conitens가 추적 가능
```

### 1.2 파쇄된 가정 3가지

1. **"Sub-agent는 Agent 내부 구현이므로 Conitens가 관여하지 않아도 된다"** → 파쇄. Agent가 sub-agent를 5개 생성해서 병렬로 파일을 수정하면, 다른 Agent와의 충돌 가능성이 기하급수적으로 증가. Conitens가 sub-agent 존재 자체를 모르면 coordination이 불가능.

2. **"3개 모델 모두 비슷한 sub-agent 메커니즘을 가진다"** → 파쇄. [확실] Claude Code는 3중 네이티브 시스템(Task tool + Agent Teams + Custom subagents), Gemini CLI는 v0.26.0부터 초기 네이티브(codebase_investigator + generalist + custom .md agents + A2A remote), Codex CLI는 네이티브 sub-agent **없음**(issue #2604, 219+ 투표, 미구현). 완전한 비대칭.

3. **"Sub-agent 관리는 API 코드가 필요하다"** → 파쇄. Conitens의 핵심 원칙("파일이 곧 프로토콜")을 그대로 적용 가능. Sub-agent 생성 요청, 상태 추적, 결과 수집 모두 `.notes/SUBAGENTS/` 파일로 관리. 각 Agent의 instruction 파일에 "sub-agent 생성 시 이 파일에 기록하라" 규칙만 추가하면 됨.

---

## 2. 3대 모델 Sub-agent 역량 정밀 비교

### 2.1 Claude Code — 가장 성숙한 3중 생태계

[확실] Claude Code는 **세 가지 계층의 delegation**을 네이티브 지원:

**① Task Tool (Sub-agent 기본형)**
- 각 sub-agent가 **독립 context window** + custom system prompt + 도구 제한
- 최대 ~10개 병렬 생성
- sub-agent는 다른 sub-agent 생성 불가 (depth = 1)
- `permissionMode` 제어: `default` / `plan` / `bypassPermissions`
- `skills` 필드로 startup 시 도구 지식 주입
- 완료 시 결과가 parent에게 반환 (context 소비 주의)
- **Built-in**: Explore(읽기 전용 탐색), Plan(계획 수립), general-purpose

```yaml
# Claude Code custom subagent 정의 예시
---
name: security-reviewer
description: Review code changes for security vulnerabilities
model: claude-sonnet-4-5-20250929   # 비용 최적화
tools: [Read, Grep, Glob]           # 쓰기 도구 제외
permissionMode: plan                # 계획 승인 필요
skills:
  - security-patterns
  - owasp-top-10
---
Review code for security issues. Focus on:
- SQL injection, XSS, auth bypass
- Report findings, never modify files
```

**② Agent Teams (Swarm형 협업 — research preview)**
- Lead agent + 다수 Teammate, 각각 **독립 context window + 독립 세션**
- teammate 간 **직접 메시징** 가능 (Task tool과의 핵심 차이)
- 공유 task list + dependency tracking + file-lock claiming
- tmux/iTerm2 split pane 또는 in-process 모드
- Delegate Mode: lead가 코드 작성 금지, coordination만 수행
- 환경변수: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Task 파일 위치: `~/.claude/tasks/{team-name}/`

```
# Agent Teams 내부 통신 구조
Lead ←→ Teammate A ←→ Teammate B
  ↓         ↓              ↓
Shared Task List (파일 기반, ~/.claude/tasks/)
```

**③ Custom Subagents (.md 정의)**
- `.claude/agents/*.md` 파일로 정의
- project-level과 user-level 분리
- description 기반 자동 delegation (Claude가 판단)

**Conitens 통합 시 활용 전략:**
Claude Code의 sub-agent 시스템은 가장 정교하므로, **Conitens의 sub-agent 프로토콜 표준을 Claude Code 기준으로 설계**하고, Gemini/Codex는 이에 매핑하는 방식이 효율적.

### 2.2 Gemini CLI — 초기 네이티브 지원 시작

[확실] Gemini CLI v0.26.0(2026-01-27) 기준 sub-agent 현황:

**① Built-in Sub-agents**
- `codebase_investigator`: 읽기 전용, 코드베이스 분석/역공학 특화
- `cli_help`: Gemini CLI 자체 문서/설정 질문 처리
- `generalist`: v0.26.0에서 추가, 범용 task routing

**② Custom Sub-agents (.md 파일 정의)**
- 위치: `.gemini/agents/*.md` (프로젝트) 또는 `~/.gemini/agents/*.md` (유저)
- YAML frontmatter + Markdown body
- `/agents refresh` 명령으로 레지스트리 리로드

**③ Remote Sub-agents (A2A Protocol — experimental)**
- A2A(Agent-to-Agent) 프로토콜로 원격 에이전트 연결
- `.md` 파일에 `remoteAgent` frontmatter로 정의
- 복수 remote agent를 단일 파일에 정의 가능

**④ 제한사항**
- [확실] Agent Teams에 해당하는 기능 없음 (teammate 간 직접 통신 불가)
- Sub-agent는 main agent에게만 결과 반환 (hub-and-spoke)
- Shell workaround: `gemini -e <agent> -p "..."` 명령으로 수동 sub-process 생성 가능하나 불안정
- PR #4883(Sub-Agent architecture)이 stable 브랜치에 완전히 머지되지 않은 상태
- 보안 우려: SubagentInvocation 정책이 아직 과도하게 광범위

**Conitens 통합 시 활용 전략:**
Gemini의 sub-agent는 주로 **분석/탐색(읽기 전용)** 용도에 적합. `codebase_investigator`를 Conitens의 `impact_analyzer`/`indexer` 등과 연동하여 대규모 코드 분석을 위임.

### 2.3 GPT-5.2-Codex — Sub-agent 부재, 대안 경로

[확실] Codex CLI는 네이티브 sub-agent를 **지원하지 않음**.

**현재 상태:**
- GitHub Issue #2604 (219+ 투표): Sub-agent 지원 요청 — 미구현
- GitHub Issue #8664: Native Subagent System 구현 PR — #2604와 중복으로 닫힘
- Issue #9846 (2026-01-25): "oh-my-opencode" 스타일 협업 요청 — 미구현

**대안 경로:**
1. **MCP Server 모드**: `codex mcp-server` — 다른 에이전트(Claude)가 Codex를 "도구"로 호출
2. **Headless 모드**: `codex exec -p "..."` — 스크립트로 Codex를 sub-process 실행
3. **OpenAI Agents SDK 연동**: Codex를 MCP server로 등록하여 SDK의 handoff 패턴 활용
4. **Context Compaction**: sub-agent 없이도 24시간+ 연속 세션 유지 가능

**Conitens 통합 시 활용 전략:**
Codex는 sub-agent를 **생성하지 못하지만**, 다른 Agent의 sub-agent로 **소비**될 수 있음. Claude Code가 Codex를 MCP server 또는 bash sub-process로 호출하는 패턴이 가장 현실적. Conitens 프로토콜에서는 Codex에 대해 sub-agent 생성을 요청하지 않고, 대신 Codex 자체가 단일 심층 작업(보안 감사, 장시간 리팩토링)을 수행하도록 배치.

### 2.4 역량 비교 매트릭스

| 역량 | Claude Code | Gemini CLI | Codex CLI |
|------|------------|-----------|-----------|
| **Native Sub-agent** | ✅ 3중 (Task/Teams/Custom) | ⚠️ 초기 (Built-in/Custom/A2A) | ❌ 없음 |
| **병렬 Sub-agent** | ✅ ~10개 (Task), 무제한(Teams) | ❌ 순차적 | ❌ |
| **Sub-agent 간 통신** | ✅ Agent Teams 메시징 | ❌ hub-and-spoke만 | ❌ |
| **Sub-agent 도구 제한** | ✅ tools 필드 | ⚠️ 정책 기반(불안정) | ❌ |
| **Sub-agent 모델 선택** | ✅ Haiku로 비용 절감 | ⚠️ 설정 가능 | ❌ |
| **정의 파일 위치** | `.claude/agents/*.md` | `.gemini/agents/*.md` | ❌ |
| **MCP Server로 소비** | ✅ | ✅ A2A | ✅ `codex mcp-server` |
| **최대 depth** | 1 (sub-agent → sub-agent ❌) | 1 | 0 |
| **팀 coordination** | ✅ shared task list + mailbox | ❌ | ❌ |

---

## 3. Conitens Sub-agent 프로토콜 설계

### 3.1 설계 원칙

1. **파일이 곧 프로토콜** (v3 원칙 유지): Sub-agent 레지스트리, 상태, 결과 모두 `.notes/SUBAGENTS/` 파일로 관리
2. **선언적 정의**: 각 Agent의 instruction 파일에 "어떤 sub-agent를 생성할 수 있는지" 사전 정의
3. **비대칭 수용**: Claude/Gemini/Codex의 sub-agent 능력 차이를 **숨기지 않고 명시적으로 관리**
4. **깊이 제한**: Sub-agent는 depth=1만 허용 (sub-sub-agent 금지 = 복잡도 폭발 방지)
5. **가시성 우선**: 어떤 sub-agent가 살아 있고, 뭘 하고 있으며, 어떤 파일을 건드리는지 항상 추적 가능

### 3.2 파일 구조

```
.notes/
├── SUBAGENTS/                          # Sub-agent 관리 디렉토리
│   ├── REGISTRY.md                     # 전체 sub-agent 카탈로그 (선언적)
│   ├── ACTIVE/                         # 현재 실행 중인 sub-agent 상태
│   │   ├── claude_task_security-review.status.md
│   │   ├── claude_team_refactor-auth.status.md
│   │   └── gemini_sub_codebase-scan.status.md
│   ├── COMPLETED/                      # 완료된 sub-agent 결과 (append-only)
│   │   └── 2026-02-12_claude_task_security-review.result.md
│   └── TEMPLATES/                      # 재사용 가능한 sub-agent 정의
│       ├── security-reviewer.md
│       ├── code-analyzer.md
│       └── test-runner.md
│
├── ... (기존 .notes/ 구조 유지)
```

### 3.3 REGISTRY.md — Sub-agent 카탈로그

```markdown
# Sub-agent Registry
<!-- Conitens가 관리하는 모든 sub-agent의 카탈로그 -->
<!-- Agent는 여기 등록된 sub-agent만 생성할 수 있음 -->

## Claude Code Sub-agents

### Task Tool Sub-agents
| ID | 이름 | 용도 | 모델 | 도구 제한 | 비용 등급 |
|----|------|------|------|----------|----------|
| CST-01 | security-reviewer | 코드 보안 취약점 검토 | sonnet-4.5 | Read,Grep,Glob | 💰 |
| CST-02 | test-writer | 테스트 케이스 작성 | haiku-4.5 | Read,Write,Bash | 💰 |
| CST-03 | doc-generator | JSDoc/문서 생성 | haiku-4.5 | Read,Write | 💵 |
| CST-04 | code-explorer | 코드베이스 탐색/분석 | haiku-4.5 | Read,Grep | 💵 |

### Agent Teams Configurations
| ID | 팀 이름 | 구성 | 트리거 조건 | 비용 등급 |
|----|---------|------|------------|----------|
| CAT-01 | full-feature | architect+implementer+tester | 대규모 기능 구현 | 💰💰💰 |
| CAT-02 | code-review | security+performance+coverage | PR 리뷰 | 💰💰 |
| CAT-03 | refactor-squad | analyzer+implementer+validator | 리팩토링 | 💰💰 |

## Gemini CLI Sub-agents

| ID | 이름 | 용도 | 모드 | 비용 등급 |
|----|------|------|------|----------|
| GSA-01 | codebase_investigator | 코드베이스 역공학/분석 | built-in | 💵 |
| GSA-02 | generalist | 범용 task routing | built-in | 💰 |
| GSA-03 | deep-analyzer | 1M context 전체 분석 | custom | 💰💰 |

## Codex CLI Sub-agents

| ID | 이름 | 용도 | 구현 방식 | 비용 등급 |
|----|------|------|----------|----------|
| XSA-01 | (없음) | Codex는 sub-agent 미지원 | — | — |

### Codex 대안: 외부 소비 패턴
| 소비자 | 방식 | 용도 |
|--------|------|------|
| Claude Code | `codex exec -p "..."` via Bash | 보안 감사 위임 |
| Claude Code | MCP server (`codex mcp-server`) | 도구로 Codex 호출 |
| Gemini CLI | A2A remote agent | 원격 작업 위임 |

## 비용 등급 기준
- 💵: < 0.1 USD/호출 (탐색, 분석)
- 💰: 0.1–1.0 USD/호출 (코드 생성, 리뷰)
- 💰💰: 1.0–5.0 USD/호출 (팀 작업)
- 💰💰💰: > 5.0 USD/호출 (대규모 팀 병렬)
```

### 3.4 Sub-agent Status 파일 스키마

```markdown
# Sub-agent Status: {agent}_{type}_{name}
<!-- 이 파일은 sub-agent가 ACTIVE 상태일 때 자동 생성/갱신됨 -->

## Identity
- **Registry ID**: CST-01
- **Parent Agent**: Claude Code (Orchestrator)
- **Type**: Task Tool Sub-agent
- **Model**: claude-sonnet-4-5-20250929
- **Created**: 2026-02-12T14:30:00+09:00

## Scope
- **Task**: src/auth/ 디렉토리 보안 취약점 검토
- **File Access**: READ-ONLY [src/auth/**]
- **Tool Access**: [Read, Grep, Glob]
- **Timeout**: 10분

## Status
- **State**: RUNNING | COMPLETED | FAILED | TIMEOUT
- **Progress**: 3/7 파일 검토 완료
- **Findings So Far**:
  - [HIGH] src/auth/login.js:42 — SQL injection 가능성
  - [MED] src/auth/token.js:18 — 하드코딩된 시크릿

## File Lock
- **Files Being Accessed**: src/auth/login.js, src/auth/token.js
- **Write Lock**: 없음 (READ-ONLY sub-agent)
```

### 3.5 Sub-agent 결과 파일 스키마

```markdown
# Sub-agent Result: 2026-02-12_claude_task_security-review

## Summary
- **Registry ID**: CST-01
- **Duration**: 4분 32초
- **Status**: COMPLETED
- **Files Reviewed**: 7/7

## Findings
### HIGH
1. `src/auth/login.js:42` — SQL injection: 사용자 입력이 직접 쿼리에 삽입됨
   - 권장: parameterized query 사용

### MEDIUM
2. `src/auth/token.js:18` — 하드코딩된 JWT 시크릿
   - 권장: 환경변수로 분리

### LOW
3. `src/auth/session.js:95` — 세션 타임아웃 미설정
   - 권장: 30분 기본 타임아웃 추가

## Handoff
- **다음 작업 추천**: Codex에게 HIGH/MEDIUM 패치 위임
- **관련 파일**: `.notes/SUBAGENTS/TEMPLATES/security-patch.md`
```

---

## 4. 모드별 Sub-agent 관리 전략

### 4.1 모드별 Sub-agent 허용 범위

```
┌──────────────────────────────────────────────────────────────────┐
│                    SUB-AGENT PERMISSION MATRIX                   │
├──────────┬──────────────────┬──────────────┬────────────────────┤
│ 모드      │ Claude Code      │ Gemini CLI   │ Codex CLI          │
├──────────┼──────────────────┼──────────────┼────────────────────┤
│          │ Task tool: ✅     │ Built-in: ✅  │                    │
│ Full     │ Agent Teams: ✅   │ Custom: ✅    │ (sub-agent 없음)   │
│ (3-agent)│ Custom: ✅        │ A2A: ✅       │ MCP로 소비됨       │
│          │ 최대 5개 병렬     │ 최대 2개 순차 │                    │
├──────────┼──────────────────┼──────────────┼────────────────────┤
│          │ Task tool: ✅     │ Built-in: ✅  │                    │
│ Duo      │ Agent Teams: ⚠️   │ Custom: ✅    │ (sub-agent 없음)   │
│ (2-agent)│ (비용 주의)       │              │ Headless로 소비됨  │
│          │ 최대 3개 병렬     │ 최대 1개     │                    │
├──────────┼──────────────────┼──────────────┼────────────────────┤
│          │ Task tool: ✅     │ Built-in: ✅  │                    │
│ Solo     │ Agent Teams: ❌   │ Custom: ❌    │ (sub-agent 없음)   │
│ (1-agent)│ (오버헤드 과다)   │ (오버헤드)   │ 단일 세션 유지     │
│          │ 최대 3개 병렬     │ 최대 1개     │                    │
└──────────┴──────────────────┴──────────────┴────────────────────┘

범례: ✅ 허용  ⚠️ 조건부 허용  ❌ 금지
```

### 4.2 Full Mode — Sub-agent 완전 활용

```
USER: "인증 모듈을 OAuth2로 마이그레이션하고 보안 점검해줘"

┌─────────────────────────────────────────────────────┐
│ Claude Code (Orchestrator)                          │
│                                                     │
│  ┌─────────────────────────────────────────┐        │
│  │ Agent Team: "auth-migration"            │        │
│  │                                         │        │
│  │  Teammate A: OAuth2 구현               │        │
│  │  (tools: Read,Write,Bash)              │        │
│  │                                         │        │
│  │  Teammate B: 테스트 작성               │        │
│  │  (tools: Read,Write,Bash)              │        │
│  │                                         │        │
│  │  [직접 메시징으로 API 계약 합의]        │        │
│  └─────────────────────────────────────────┘        │
│                                                     │
│  Task Sub-agent: explorer                           │
│  (기존 코드 분석, 읽기 전용)                         │
└──────────┬──────────────────────────────────────────┘
           │ 구현 완료 → handoff
           ▼
┌─────────────────────────────────────────────────────┐
│ Gemini 3 Pro (Architect)                            │
│                                                     │
│  Sub-agent: codebase_investigator                   │
│  (1M context로 전체 코드베이스 영향도 분석)          │
│                                                     │
│  Sub-agent: deep-analyzer                           │
│  (마이그레이션이 기존 API 소비자에 미치는 영향)      │
└──────────┬──────────────────────────────────────────┘
           │ 분석 완료 → handoff
           ▼
┌─────────────────────────────────────────────────────┐
│ Codex CLI (Sentinel)                                │
│                                                     │
│  (sub-agent 없음 — 단일 세션으로 심층 보안 감사)     │
│  Context compaction으로 전체 변경사항 리뷰           │
│  OS-level sandbox에서 취약점 재현 테스트             │
└─────────────────────────────────────────────────────┘
```

**.notes/SUBAGENTS/ACTIVE/ 에 생성되는 파일들:**
```
ACTIVE/
├── claude_team_auth-migration.status.md     # Team 상태
├── claude_task_explorer.status.md           # Explorer 상태
├── gemini_sub_codebase-scan.status.md       # Gemini 분석 상태
└── gemini_sub_deep-analyzer.status.md       # Gemini 심층 분석
```

### 4.3 Duo Mode — 축소된 Sub-agent 운용

Duo Mode에서는 **Agent Teams를 지양**하고 Task tool 위주로 운영. 이유: 2-agent 간 coordination + 내부 team coordination이 겹치면 복잡도 폭발.

```
[Claude + Codex Duo]

Claude Code (Orchestrator + Executor)
├── Task sub-agent: security-reviewer (읽기 전용)
├── Task sub-agent: test-writer (테스트 생성)
└── Bash: codex exec -p "보안 감사..." (Codex를 sub-process로 호출)
    └── Codex: 단일 세션 보안 감사 수행

[Claude + Gemini Duo]

Claude Code (Orchestrator + Executor)
├── Task sub-agent: code-explorer (탐색)
└── handoff → Gemini

Gemini CLI (Architect + Analyst)
├── codebase_investigator (내장 분석)
└── deep-analyzer (custom, 1M context 활용)
```

### 4.4 Solo Mode — 내부 병렬화 최대 활용

Solo Mode에서 sub-agent의 가치가 **가장 높음**. 단일 에이전트가 모든 역할을 수행하므로, sub-agent로 작업을 분할해야 context 오염을 방지할 수 있음.

```
[Claude Code Solo — 최적]

Claude Code
├── Task: Explore (읽기 전용 코드 탐색)
├── Task: security-reviewer (보안 검토)
├── Task: test-writer (테스트 작성)
└── Main session: 구현에만 집중

→ 핵심: main session의 context를 깨끗하게 유지
  sub-agent가 분석/검토를 분담하고 요약만 반환


[Gemini CLI Solo — 제한적]

Gemini CLI
├── codebase_investigator (코드 분석)
└── Main session: 계획 + 구현 + 검증

→ 주의: sub-agent 간 통신 불가, 순차 실행만 가능
  main session의 1M context에 의존하여 맥락 유지


[Codex CLI Solo — sub-agent 없음]

Codex CLI
└── Main session: 모든 작업을 단일 스레드로 수행
    └── Context compaction으로 장시간 세션 유지

→ 주의: 병렬화 불가, 복잡한 작업에서 bottleneck 발생
  .notes/SUBAGENTS/ 비어 있음 (상태 추적 불필요)
```

---

## 5. Cross-Agent Sub-agent 소비 패턴

가장 강력한 패턴은 **Agent A가 Agent B를 sub-agent처럼 소비**하는 것. Conitens의 파일 프로토콜이 이를 조율.

### 5.1 Claude → Codex 소비 (보안 위임)

```python
# Claude Code의 custom subagent 정의
# .claude/agents/codex-sentinel.md

"""
---
name: codex-sentinel
description: Delegate security audit to Codex CLI for OS-level sandboxed review
tools: [Bash]
permissionMode: plan
---
You invoke Codex CLI for deep security audits.

## Workflow
1. Read the task from .notes/SUBAGENTS/ACTIVE/codex-sentinel.status.md
2. Execute: codex exec -p "{task_prompt}" --sandbox workspace-write
3. Capture output and write to .notes/SUBAGENTS/COMPLETED/
4. Update status file to COMPLETED
"""
```

**.notes/ 프로토콜 흐름:**
```
1. Claude가 .notes/SUBAGENTS/ACTIVE/codex-sentinel.status.md 생성
   → State: REQUESTED, Task: "src/auth/ 보안 감사"

2. Claude의 codex-sentinel subagent가 Bash로 Codex 실행
   → codex exec -p "src/auth/ 디렉토리 보안 감사..." --sandbox workspace-write

3. Codex 실행 완료, subagent가 결과 캡처
   → .notes/SUBAGENTS/COMPLETED/2026-02-12_codex-sentinel.result.md 생성

4. Claude main session이 결과 파일 읽고 다음 작업 결정
```

### 5.2 Claude → Gemini 소비 (대규모 분석 위임)

```yaml
# .claude/agents/gemini-analyzer.md
---
name: gemini-analyzer
description: Delegate large codebase analysis to Gemini CLI's 1M context window
tools: [Bash, Read, Write]
permissionMode: plan
---
You manage Gemini CLI for large-scale code analysis.

1. Receive analysis request from Claude
2. Execute: gemini -p "{analysis_prompt}" --all-files
3. Capture and save results to .notes/SUBAGENTS/COMPLETED/
```

### 5.3 Gemini → Claude 소비 (구현 위임)

Gemini가 orchestrator일 때 (research-heavy 작업), Claude를 구현 sub-agent로 소비:

```markdown
<!-- .gemini/agents/claude-implementer.md -->
---
name: claude-implementer
description: Delegate code implementation to Claude Code
model: gemini-3-pro
tools: [shell]
---
You invoke Claude Code for precise code implementation.

1. Read task from .notes/SUBAGENTS/ACTIVE/
2. Execute: claude -p "{implementation_prompt}" --allowedTools Edit,Write,Bash
3. Save results to .notes/SUBAGENTS/COMPLETED/
```

---

## 6. 안전장치 및 제약조건

### 6.1 Sub-agent 동시성 제어

```markdown
<!-- .notes/SUBAGENTS/LOCKS.md — 파일 잠금 레지스트리 -->

## Active File Locks
| Sub-agent ID | Lock Type | Files | Acquired | Expires |
|-------------|-----------|-------|----------|---------|
| CST-01 | READ | src/auth/* | 14:30:00 | 14:40:00 |
| CAT-01-A | WRITE | src/auth/login.js | 14:31:00 | 14:41:00 |

## Rules
1. 동일 파일에 WRITE lock은 1개만 허용
2. READ lock은 WRITE lock과 공존 불가
3. Lock 만료 시 자동 해제 (stale lock 방지)
4. Agent 간 lock 충돌 시 → Orchestrator에게 escalation
```

### 6.2 Sub-agent 비용 제어

```markdown
<!-- CONITENS.md 또는 Global 문서에 추가할 규칙 -->

## Sub-agent Budget Rules
1. Agent Teams는 BUDGET.md의 예산 확인 후에만 생성
2. Solo Mode에서 Agent Teams 금지 (비용 3-5배)
3. Task sub-agent는 Haiku 모델 우선 (비용 1/10)
4. Sub-agent 총 개수 제한:
   - Full Mode: 최대 8개 동시
   - Duo Mode: 최대 4개 동시
   - Solo Mode: 최대 3개 동시
5. Sub-agent 실행 시간 제한: 기본 10분, 최대 30분
```

### 6.3 Sub-agent depth 제한

```
✅ 허용: Agent → Sub-agent (depth 1)
❌ 금지: Agent → Sub-agent → Sub-sub-agent (depth 2+)

이유:
- depth 2 이상에서 상태 추적 복잡도 O(n²) 증가
- 파일 기반 프로토콜로는 다중 depth coordination이 비효율적
- Claude Code도 "Subagents cannot spawn other subagents" 제한
```

---

## 7. Global 문서 수정사항

### 7.1 CONITENS.md에 추가할 섹션

```markdown
## Sub-agent Protocol

### 원칙
- Sub-agent 생성 시 반드시 `.notes/SUBAGENTS/ACTIVE/` 에 status 파일 생성
- Sub-agent 완료 시 반드시 `.notes/SUBAGENTS/COMPLETED/` 에 result 파일 이동
- Sub-agent는 REGISTRY.md에 등록된 정의만 사용 가능
- 미등록 sub-agent 생성은 REGISTRY.md에 먼저 추가 후 사용
- Sub-agent depth = 1 (sub-sub-agent 금지)
- Sub-agent의 파일 접근은 반드시 LOCKS.md에 기록

### Status 파일 lifecycle
REQUESTED → RUNNING → COMPLETED | FAILED | TIMEOUT
                ↓ (3-Strike)
              ESCALATED → Orchestrator 개입
```

### 7.2 각 Agent Instruction 파일에 추가할 내용

**CLAUDE.md 추가:**
```markdown
## Sub-agent Management
- Task tool sub-agent 생성 시 → .notes/SUBAGENTS/ACTIVE/{id}.status.md 생성
- Agent Teams 생성 시 → .notes/SUBAGENTS/ACTIVE/{team_id}.status.md 생성
- sub-agent 완료 시 → status 파일을 COMPLETED/로 이동하고 result 파일 생성
- LOCKS.md에 파일 접근 범위 기록
- 타 Agent를 sub-process로 호출 시에도 동일 프로토콜 적용
```

**GEMINI.md 추가:**
```markdown
## Sub-agent Management
- Built-in sub-agent(codebase_investigator 등) 호출 시 → .notes/SUBAGENTS/ACTIVE/ 기록
- Custom sub-agent(.gemini/agents/) 사용 시 → 동일 프로토콜
- 분석 결과는 반드시 .notes/SUBAGENTS/COMPLETED/ 에 기록 후 findings.md에 요약 반영
```

**CODEX.md 추가:**
```markdown
## Sub-agent Management
- Codex는 sub-agent를 생성하지 않음
- 다른 Agent가 Codex를 sub-agent로 호출할 때, 결과는 호출 Agent가 기록
- 단일 세션으로 심층 작업 수행 시, 작업 진행률을 .notes/ 상태 파일에 주기적 갱신
```

---

## 8. 구현 로드맵

### Phase 1: 프로토콜 정의 (즉시 실행 가능)
- [ ] `.notes/SUBAGENTS/` 디렉토리 구조 + REGISTRY.md 템플릿 작성
- [ ] Status/Result 파일 스키마 확정
- [ ] CONITENS.md에 Sub-agent Protocol 섹션 추가
- [ ] CLAUDE.md, GEMINI.md, CODEX.md 에 sub-agent 규칙 추가

### Phase 2: Claude Code 통합 (1주차)
- [ ] `.claude/agents/` 에 Conitens 표준 sub-agent 정의 파일 배치
- [ ] codex-sentinel, gemini-analyzer cross-agent 소비 패턴 구현
- [ ] LOCKS.md 기반 파일 충돌 방지 테스트

### Phase 3: Gemini CLI 통합 (2주차)
- [ ] `.gemini/agents/` 에 Conitens 표준 sub-agent 정의 파일 배치
- [ ] claude-implementer cross-agent 소비 패턴 구현
- [ ] A2A remote agent로 Codex MCP server 연결 테스트

### Phase 4: MVE 검증 (2주차)
- [ ] **MVE**: "Claude가 Task sub-agent로 보안 리뷰 → Codex에게 패치 위임 → 전 과정 .notes/SUBAGENTS/ 추적"
- [ ] 성공 기준: status 파일 lifecycle(REQUESTED→RUNNING→COMPLETED) 정상 동작 + result 파일 생성 + LOCKS.md 충돌 없음

---

## 9. Pre-mortem

| 실패 원인 | 확률 | 탐지 | 완화 |
|-----------|------|------|------|
| Sub-agent가 status 파일 갱신을 잊음 | 높음 | ACTIVE/ 파일의 timestamp 모니터링 | Agent instruction에 "매 2-action마다 status 갱신" 규칙 삽입 |
| Cross-agent 소비 시 CLI 버전 비호환 | 중간 | Bash 호출 실패 시 에러 로그 | REGISTRY.md에 최소 버전 요구사항 명시 |
| Sub-agent 비용 폭발 (Agent Teams 남용) | 중간 | BUDGET.md 자동 집계 | 모드별 동시 sub-agent 상한 강제 |
| File lock 데드락 | 낮음 | LOCKS.md timeout 미해제 탐지 | 10분 자동 만료 + Orchestrator escalation |
| Codex native sub-agent 추가 시 설계 변경 필요 | 중간 | Codex CLI 릴리스 노트 모니터링 | REGISTRY.md + CODEX.md만 갱신하면 프로토콜 적응 가능 |

---

## 10. Meta Insight

**핵심 교훈:** Sub-agent 관리는 "API 통합"이 아니라 **"가시성(visibility) 확보"** 문제. 각 Agent가 내부적으로 어떤 sub-agent를 돌리든, 그 존재와 상태가 `.notes/SUBAGENTS/` 에 파일로 기록되면 Conitens는 추적할 수 있음. 이것은 v3의 핵심 원칙("파일이 곧 프로토콜")의 자연스러운 수직 확장.

**비대칭 수용의 가치:** Claude의 3중 생태계, Gemini의 초기 지원, Codex의 부재를 하나의 API로 추상화하려 하면 실패. 대신 각 모델의 네이티브 메커니즘을 그대로 활용하되, **결과를 기록하는 파일 형식만 통일**하는 것이 Conitens의 접근법. 이것은 "결합도를 낮추면서 가시성을 높이는" 최적 전략.

**기회비용 경고:** Agent Teams는 비용이 3-5배 증가하므로, 대부분의 작업에서 Task tool sub-agent(비용 1/10 Haiku 모델)로 충분한지 먼저 검증하라. "Sub-agent가 많을수록 좋다"는 함정에 빠지지 말 것.

---

**[Self-Check]:** PASS ✅ (Scale: Structural)
- 가정 파쇄: 3개 (내부 구현→가시성 필요, 대칭→비대칭, API→파일)
- 유추 제어: 없음
- Action: Phase 1 즉시/Phase 2 1주/Phase 3-4 2주
- Pre-mortem: 5개
- Epistemic: [확실] Claude 3중 생태계, [확실] Codex sub-agent 부재, [확실] Gemini 초기 지원, [추정] cross-agent 소비 안정성, [가정] 비용 등급 추정치
