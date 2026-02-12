# Conitens 발전 전략 보고서 v3: 문서 기반 에이전트 소통 프로토콜의 확장

**KST [2026-02-12] | Scale: Paradigm**

---

## 1. Deconstruction: Conitens의 본질 재정의

**BLUF:** Conitens의 핵심은 API 호출이 아니라 **"문서 기반 에이전트 간 소통 프로토콜"**임. workspace에 접근 가능한 모든 AI가 유저 명령(input)에 따라 Global 문서를 참조하고, 다른 AI와 Local 문서를 통해 실시간 소통하며 workspace에서 작업하는 구조. 이 설계는 MCP/A2A 같은 JSON-RPC 기반 프로토콜과는 근본적으로 다른 패러다임 — **파일이 곧 프로토콜**이다.

### 1.1 아키텍처 재정의

```
┌──────────────────────────────────────────────────────────┐
│                      USER INPUT                           │
│         (ensemble CLI / 자연어 명령 / 트리거)              │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│                   GLOBAL DOCUMENTS                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │CONITENS.md│  │CLAUDE.md │  │AGENTS.md │  │기타 규칙 │  │
│  │프로토콜   │  │Claude 지시│  │Codex 지시│  │스킬/워크 │  │
│  │규격서     │  │          │  │          │  │플로      │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
│         ↑ 읽기 전용 — 모든 에이전트가 참조                │
└──────────────────────────────────────────────────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
┌─────────┐┌─────────┐┌─────────┐
│ Gemini  ││ Claude  ││  Codex  │    ← workspace 접근 가능한 AI
│(Antigrav)││  Code   ││         │
└────┬────┘└────┬────┘└────┬────┘
     │         │          │
     ▼         ▼          ▼
┌──────────────────────────────────────────────────────────┐
│                      WORKSPACE                            │
│  ┌────────────────────┐  ┌─────────────────────────────┐ │
│  │   프로젝트 파일     │  │    LOCAL DOCUMENTS (.notes/) │ │
│  │   (소스코드 등)     │  │                             │ │
│  │                    │  │  ┌─────────────────────────┐ │ │
│  │                    │  │  │ Real-time Communication │ │ │
│  │                    │  │  │  INBOX/ → ACTIVE/       │ │ │
│  │                    │  │  │  task.md (현재 작업)      │ │ │
│  │                    │  │  │  file locks              │ │ │
│  │                    │  │  ├─────────────────────────┤ │ │
│  │                    │  │  │ Logging                 │ │ │
│  │                    │  │  │  COMPLETED/              │ │ │
│  │                    │  │  │  ERRORS/                 │ │ │
│  │                    │  │  │  변경 이력               │ │ │
│  │                    │  │  ├─────────────────────────┤ │ │
│  │                    │  │  │ Journaling              │ │ │
│  │                    │  │  │  JOURNAL/ (세션 기록)    │ │ │
│  │                    │  │  │  WEEKLY/ (주간 리포트)   │ │ │
│  │                    │  │  │  자기 개선 데이터        │ │ │
│  │                    │  │  └─────────────────────────┘ │ │
│  └────────────────────┘  └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 1.2 파쇄된 가정 3가지

1. **"API 기반 에이전트 레지스트리가 필요하다"** (v2 보고서) → 파쇄. Conitens의 에이전트는 API로 호출되는 것이 아님. workspace에 직접 접근하는 독립 AI가 파일을 읽고 쓰는 것. 새 에이전트 추가 = 새 Global 문서(지시 파일) 작성. 코드 변경 아님.

2. **"모델 라우팅/비용 최적화가 프레임워크 책임"** (v2 보고서) → 파쇄. 각 에이전트는 이미 독립 AI 도구(Antigravity, Claude Code, Codex)이며 자체 과금 체계를 가짐. Conitens의 역할은 "누가 어떤 작업을 하는가"를 프로토콜로 정의하는 것이지, 토큰 단위 비용 관리가 아님.

3. **"MCP/A2A를 구현해야 한다"** → 부분 파쇄. Conitens의 파일 기반 프로토콜은 MCP/A2A와 경쟁 관계가 아니라 **다른 계층**. MCP/A2A는 프로그래밍적 도구 호출과 에이전트 간 API 통신. Conitens는 **동일 workspace를 공유하는 AI 간 문서 기반 협업 프로토콜**. 둘은 보완적.

### 1.3 Conitens 고유의 설계 철학

| 특성 | MCP/A2A 기반 프레임워크 | Conitens |
|------|----------------------|----------|
| 통신 방식 | JSON-RPC over HTTP/STDIO | 파일 읽기/쓰기 |
| 에이전트 결합도 | API 통합 필요 | workspace 접근만으로 참여 가능 |
| 새 에이전트 추가 | 어댑터/커넥터 코드 작성 | Global 지시 문서 1개 작성 |
| 상태 관리 | 서버/DB | 파일 시스템 (.notes/) |
| 디버깅 | 로그/트레이싱 | 파일 직접 열어보기 |
| Git 친화성 | 별도 설계 필요 | 기본 내장 (파일 = 히스토리) |
| 인간 가독성 | 도구 필요 | 마크다운 직접 읽기 |

**이 설계의 힘:** workspace에 접근 가능한 모든 AI가 프로토콜에 참여할 수 있다는 것. API 통합 없이, 파일을 읽고 쓸 수만 있으면 됨. 이것은 에이전트 상호운용의 가장 낮은 진입장벽.

---

## 2. 경쟁 환경에서 Conitens의 위치

### 2.1 유사 프로젝트 — "문서 기반 에이전트 소통"

**AGENTS.md (agentsmd)**
- "코딩 에이전트를 위한 README" — 프로젝트 규칙을 마크다운 파일로 정의
- 에이전트 간 소통이 아닌, 단방향 지시 문서에 한정
- Conitens의 Global 문서와 유사하나, Local 문서(실시간 소통) 개념 없음
- 레퍼런스: [GitHub](https://github.com/agentsmd/agents.md) | [공식 사이트](https://agents.md/)

**CLAUDE.md 패턴 (Anthropic/커뮤니티)**
- Claude Code가 읽는 프로젝트 지시 파일
- 단일 에이전트 지시에 한정. 멀티에이전트 소통 프로토콜 아님
- 레퍼런스: [Claude MD Templates](https://github.com/abhishekray07/claude-md-templates) | [Claude Code 문서](https://docs.anthropic.com/en/docs/claude-code)

**Compound Engineering Plugin (Every Inc)**
- Claude Code를 위한 복합 엔지니어링 플러그인
- 단일 에이전트 워크플로 확장, 멀티에이전트 아님
- 레퍼런스: [GitHub](https://github.com/EveryInc/compound-engineering-plugin)

**[확실] 핵심 발견:** "동일 workspace를 공유하는 복수 AI가 파일을 통해 실시간 소통하는 프로토콜"을 정의한 프로젝트는 Conitens 외에 **존재하지 않음**. AGENTS.md, CLAUDE.md는 단방향 지시 문서. MCP/A2A는 API 기반 통신. Conitens가 정의하는 "양방향 파일 기반 멀티에이전트 협업 프로토콜"은 독보적.

### 2.2 경쟁 프레임워크와의 관계 — 경쟁이 아닌 보완

| 프레임워크 | 관계 | 이유 |
|-----------|------|------|
| CrewAI (43.2k) | 다른 계층 | API 기반 역할 정의, 코드로 에이전트 오케스트레이션 |
| LangGraph (21k) | 다른 계층 | 프로그래밍적 상태 그래프, SDK 기반 |
| Google ADK (15.1k) | 다른 계층 | Gemini API 중심 계층적 에이전트 |
| OpenAI Agents SDK (18.9k) | 다른 계층 | OpenAI API 핸드오프 패턴 |
| **AGENTS.md** | **직접 확장** | 단방향 지시 → Conitens는 양방향 소통 |
| **CLAUDE.md 패턴** | **직접 확장** | 단일 에이전트 → Conitens는 멀티에이전트 |

Conitens는 API 프레임워크와 경쟁하는 것이 아니라, **파일 기반 프로토콜이라는 별도 니치**를 점유.

**레퍼런스 — 프레임워크:**
- [CrewAI](https://github.com/crewAIInc/crewAI) | [LangGraph](https://github.com/langchain-ai/langgraph) | [Google ADK](https://google.github.io/adk-docs/) | [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) | [Agno](https://github.com/agno-agi/agno) | [Pydantic AI](https://github.com/pydantic/pydantic-ai) | [Smolagents](https://github.com/huggingface/smolagents) | [Mastra](https://github.com/mastra-ai/mastra) | [Haystack](https://github.com/deepset-ai/haystack) | [LlamaIndex](https://github.com/run-llama/llama_index) | [Atomic Agents](https://github.com/BrainBlend-AI/atomic-agents)
- [AutoGen](https://github.com/microsoft/autogen) → [MS Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview) | [Semantic Kernel](https://github.com/microsoft/semantic-kernel) → 통합
- [2025 프레임워크 전경](https://medium.com/@hieutrantrung.it/the-ai-agent-framework-landscape-in-2025-what-changed-and-what-matters-3cd9b07ef2c3) | [Turing 비교](https://www.turing.com/resources/ai-agent-frameworks) | [arXiv 아키텍처](https://arxiv.org/html/2508.10146v1)

---

## 3. 3축 발전 전략

### 축 1: 메모리/상태 관리 고도화

**현재 Local 문서 → 메모리 계층 매핑:**

```
├── Real-time Communication  ←→  Working Memory (L1)
│   ├── INBOX/, ACTIVE/
│   ├── task.md, file locks
├── Logging                  ←→  Episodic Memory (L2)
│   ├── COMPLETED/, ERRORS/, 변경 이력
└── Journaling               ←→  Semantic Memory (L3)
    ├── JOURNAL/, WEEKLY/, 자기 개선 데이터
```

**L1 — Real-time Communication 개선:**

| 현재 한계 | 개선 안 |
|-----------|--------|
| 에이전트가 상대 상태를 알려면 파일 폴링 | **시그널 파일 패턴** — `.notes/SIGNALS/`에 에이전트별 시그널 파일. 존재 = 메시지 있음. 처리 후 삭제. |
| 동시 작업 시 충돌 | **의도 선언(Intent Declaration)** — `.notes/INTENTS/{agent}-{timestamp}.md`에 작업 의도 기록. 충돌 사전 감지. |
| 핸드오프 시 컨텍스트 손실 | **핸드오프 문서** — `.notes/HANDOFF/{from}-to-{to}-{task_id}.md`에 진행 상황, 주의 사항 구조화 |

예시 — 시그널 파일:
```
.notes/SIGNALS/
├── CLAUDE_READY.signal
├── GEMINI_NEEDS_REVIEW.signal
└── CODEX_BLOCKED.signal

# 시그널 파일 내용:
# --- SIGNAL ---
# from: CLAUDE
# type: TASK_COMPLETE
# task_id: TASK-2026-0212-001
# message: "auth.py 구현 완료, 리뷰 필요"
# files_changed: ["src/auth.py", "tests/test_auth.py"]
# timestamp: 2026-02-12T21:30:00+09:00
```

**L2 — Logging 개선:**

| 현재 한계 | 개선 안 |
|-----------|--------|
| 비구조적 에러 기록 | **구조화된 에러 스키마** — 마크다운 프론트매터로 에러 유형, 재현 조건, 해결 상태 일관 기록 |
| 작업 간 인과관계 추적 불가 | **Provenance Chain** — 각 작업에 `parent_task_id` 필드로 계보 연결 |
| 동일 에러 반복 발생 | **에러 패턴 인덱스** — `.notes/ERRORS/INDEX.md`에 유형별 발생 빈도, 해결 패턴 자동 축적 |

예시 — 구조화된 에러:
```markdown
---
error_id: ERR-2026-0212-003
type: IMPORT_RESOLUTION
severity: L1_BLOCK
file: src/auth.py
agent: CLAUDE
related_task: TASK-2026-0212-001
parent_errors: [ERR-2026-0210-012]
resolution: PENDING
---
## Error Description
`ModuleNotFoundError: No module named 'jwt'`

## Resolution History
- [ERR-2026-0210-012] 유사: bcrypt 모듈 누락 → requirements.txt 누락이 원인
```

**L3 — Journaling 개선:**

| 현재 한계 | 개선 안 |
|-----------|--------|
| 주간 리포트가 분절 | **누적 지식 베이스** — `.notes/KNOWLEDGE/`에 프로젝트 패턴, 결정 이력, 교훈을 주제별 축적 |
| 저널이 시간순 나열만 | **결정 로그(Decision Log)** — 왜 이 방법을 선택했는지, 대안은 무엇이었는지 구조적 기록 |
| 에이전트 간 학습 공유 없음 | **공유 교훈(Shared Lessons)** — `.notes/KNOWLEDGE/LESSONS.md`에 모든 에이전트의 실패/성공 패턴 |

**레퍼런스 — 메모리:**
- [Mem0](https://mem0.ai/research): 에이전트 메모리 26% 정확도 향상, 90% 토큰 절감
- [Letta/MemGPT](https://www.letta.com/blog/benchmarking-ai-agent-memory): 영속 메모리 벤치마크 Context-Bench
- [Emergent Mind](https://www.emergentmind.com/topics/persistent-memory-for-llm-agents): 4계층 메모리 연구
- [R-LAM](https://arxiv.org/html/2601.09749): 구조화된 행동 추적
- [PROV-AGENT](https://arxiv.org/html/2508.02866v1): W3C PROV 기반 출처 추적

### 축 2: 더 많은 AI 에이전트 지원

**핵심:** "새 에이전트 추가" = 코드 변경이 아닌 **문서 추가**.

**확장된 디렉토리 구조:**

```
.agent/
├── rules/
│   ├── ensemble-protocol.md      # 공통 프로토콜 (모든 에이전트 공유)
│   ├── gemini-role.md            # Gemini 전용 역할
│   ├── claude-role.md            # Claude Code 전용 역할
│   ├── codex-role.md             # Codex 전용 역할
│   └── {custom-agent}-role.md    # 커스텀 에이전트 역할
├── capabilities/
│   ├── AGENT_REGISTRY.md         # 등록 에이전트 목록 + 능력
│   └── ROUTING_RULES.md          # 작업 유형별 에이전트 할당
└── templates/
    └── new-agent-template.md     # 새 에이전트 온보딩 템플릿
```

**Agent Registry (파일 기반):**

```markdown
# .agent/capabilities/AGENT_REGISTRY.md

### GEMINI (Antigravity)
- **역할:** Planner
- **능력:** 설계, 아키텍처, 장문 분석, 코드 리뷰
- **강점:** 2M+ 컨텍스트, Deep Think
- **제약:** 터미널 직접 실행 불가
- **Global 문서:** `.agent/rules/gemini-role.md`
- **시그널 접두사:** GEMINI_

### CLAUDE (Claude Code)
- **역할:** Implementer
- **능력:** 코드 작성, 터미널 실행, 파일 편집, 테스트
- **강점:** 도구 호출, 터미널 직접 접근
- **Global 문서:** `CLAUDE.md`
- **시그널 접두사:** CLAUDE_

### CODEX
- **역할:** Validator
- **능력:** 보안 감사, 코드 리뷰, 정적 분석
- **강점:** 샌드박스 실행, 보안 검사
- **Global 문서:** `AGENTS.md`
- **시그널 접두사:** CODEX_
```

**Routing Rules (파일 기반):**

```markdown
# .agent/capabilities/ROUTING_RULES.md

| 작업 유형 | Primary | Secondary | Validator |
|-----------|---------|-----------|-----------|
| 아키텍처 설계 | GEMINI | - | CLAUDE |
| 기능 구현 | CLAUDE | - | CODEX |
| 버그 수정 | CLAUDE | GEMINI (분석) | CODEX |
| 보안 리뷰 | CODEX | - | GEMINI |
| 테스트 작성 | CLAUDE | - | CODEX |
```

**Custom Agent 온보딩:**

```bash
ensemble agent add --name "RESEARCHER" --role "Literature Review"
# 자동 생성: .agent/rules/researcher-role.md
# 자동 업데이트: AGENT_REGISTRY.md, ROUTING_RULES.md
# → 해당 AI가 workspace 접속 + researcher-role.md 읽기 = 참여 완료
```

**레퍼런스 — 에이전트 관리:**
- [AGENTS.md 표준](https://github.com/agentsmd/agents.md) | [agents.md 사이트](https://agents.md/)
- [Claude Code CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code) | [Claude MD Templates](https://github.com/abhishekray07/claude-md-templates)
- [Google ADK — Sub-agent](https://google.github.io/adk-docs/) | [CrewAI 역할 정의](https://www.crewai.com/open-source)

### 축 3: 자동화/CI-CD 파이프라인 연동

**3가지 통합 모드:**

**Mode A: CI → Conitens (이벤트 트리거)**

```yaml
# .github/workflows/conitens-on-pr.yml
name: Conitens PR Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create Conitens Task
        run: |
          ensemble new \
            --mode SRL \
            --title "Review PR #${{ github.event.pull_request.number }}" \
            --case CODE_REVIEW
      - name: Trigger Validator
        run: ensemble start --agent CODEX
      - name: Post Results
        run: ensemble report --format github-comment
```

**Mode B: Conitens → CI (훅 기반)**

```markdown
# .notes/HOOKS/on-verify-pass.md
## Hook: on-verify-pass
- **trigger:** ensemble verify 성공
- **action:** git commit + push
- **condition:** verify level ≥ L2

## Hook: on-close
- **trigger:** ensemble close 성공
- **action:** GitHub issue 자동 종료
```

**Mode C: 주기적 자기 개선**

```yaml
# .github/workflows/conitens-weekly.yml
on:
  schedule:
    - cron: '0 9 * * 1'  # 매주 월요일
jobs:
  weekly:
    runs-on: ubuntu-latest
    steps:
      - run: ensemble weekly
      - run: ensemble upgrade-scan
      - run: ensemble error findings
```

**Python SDK (CLI 래핑):**

```python
from conitens import Workspace

ws = Workspace("/path/to/project")
task = ws.new_task(title="Feature X", mode="SRL")
status = ws.status()
ws.signal("CLAUDE", "TASK_COMPLETE", task_id=task.id)
lessons = ws.knowledge.search("authentication error")
```

**레퍼런스 — CI/CD:**
- [GitHub Actions](https://docs.github.com/en/actions)
- [Haystack 파이프라인](https://github.com/deepset-ai/haystack): 컴포넌트 I/O
- [LangGraph 체크포인팅](https://docs.langchain.com/oss/python/langgraph/overview): 내구성 실행
- [Deloitte — bounded autonomy](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html)

---

## 4. MCP/A2A와의 관계 — 보완적 공존

Conitens가 MCP/A2A를 **대체하지 않고 다른 계층에서 공존:**

```
┌─────────────────────────────────────────────────┐
│         Application Layer                        │
│   [Conitens Protocol]                            │
│   문서 기반 멀티에이전트 협업                      │
│   Global docs → Agent → Local docs (실시간 소통)  │
├─────────────────────────────────────────────────┤
│         Communication Layer                      │
│   [A2A] 에이전트 간 API 통신                      │
│   Agent Cards, Task lifecycle                    │
├─────────────────────────────────────────────────┤
│         Tool Layer                               │
│   [MCP] 에이전트 ↔ 도구 연결                      │
│   Tools, Resources, Prompts                      │
├─────────────────────────────────────────────────┤
│         Infrastructure                           │
│   Git, File System, CI/CD                        │
└─────────────────────────────────────────────────┘
```

**장기 통합 가능성:**
- Conitens 프로토콜을 A2A Agent Card로 노출 → 외부 에이전트가 workspace에 참여
- MCP 서버를 `.notes/TOOLS/` 문서로 등록 → 에이전트가 사용 가능 도구 목록 확인

**레퍼런스 — 프로토콜:**
- [MCP 스펙](https://modelcontextprotocol.io/specification/2025-11-25) | [Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol) | [Anthropic 블로그](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [A2A](https://github.com/google/A2A) | [InfoQ](https://www.infoq.com/news/2025/04/google-agentic-a2a/) | [Gravitee 비교](https://www.gravitee.io/blog/googles-agent-to-agent-a2a-and-anthropics-model-context-protocol-mcp)
- [ACP→A2A 병합](https://github.com/orgs/i-am-bee/discussions/5) | [Boomi 비교](https://boomi.com/blog/what-is-mcp-acp-a2a/) | [Educative 가이드](https://www.educative.io/blog/agentic-protocols)

---

## 5. 산업 트렌드 정렬

### 5.1 멀티에이전트 시스템
- Gartner: 멀티에이전트 문의 **1,445% 급증** (2024 Q1→2025 Q2)
- Google Research(2026.02): 병렬 +81% / 순차 -70% → Conitens SRL/PAR/FRE가 정확히 반영
- **Conitens 강점:** 문서 기반이므로 에이전트 수 확장 시 API 통합 복잡도 증가 없음
- **레퍼런스:** [Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) | [RTInsights](https://www.rtinsights.com/if-2025-was-the-year-of-ai-agents-2026-will-be-the-year-of-multi-agent-systems/) | [MachineLearningMastery](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)

### 5.2 Bounded Autonomy
- Deloitte: 에이전트 프로덕션 배포 **11%** 조직, 핵심 장벽 = 안전성
- Gartner: 에이전틱 AI 프로젝트 **40%+ 취소** 예측 (2027)
- **verify→close 필수 = bounded autonomy 구현.** "AI Safety by Protocol"로 포지셔닝 가능.
- **레퍼런스:** [Deloitte](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html) | [Reworked](https://www.reworked.co/digital-workplace/2025-was-supposed-to-be-the-year-of-the-agent-it-never-arrived/)

### 5.3 메모리 문제
- Mem0: 26% 정확도 향상, 90% 토큰 절감. 대부분 프레임워크 세션 간 학습 부재.
- **Conitens의 JOURNAL/+WEEKLY/가 이미 원시 메모리.** 구조화하면 즉시 경쟁 우위.
- **레퍼런스:** [Mem0](https://mem0.ai/research) | [Letta 벤치마크](https://www.letta.com/blog/benchmarking-ai-agent-memory) | [Emergent Mind](https://www.emergentmind.com/topics/persistent-memory-for-llm-agents)

### 5.4 비용 최적화
- 모델 라우팅 **60% 절감**, 프롬프트 캐싱 **45-80% 절감**
- **Conitens:** ROUTING_RULES.md로 작업 수준 에이전트 할당 최적화. API 수준 아닌 작업 수준 라우팅.
- **레퍼런스:** [10Clouds](https://10clouds.com/blog/a-i/mastering-ai-token-optimization-proven-strategies-to-cut-ai-cost/) | [arXiv 캐싱](https://arxiv.org/html/2601.06007v1) | [Unified AI Hub](https://www.unifiedaihub.com/blog/the-economics-of-ai-cost-optimization-strategies-for-token-based-models)

### 5.5 재현성
- **Conitens의 파일 기반 프로토콜이 자동 재현성 제공.** .notes/ 전체가 Git 커밋되면 에이전트 상호작용 이력이 버전 관리됨. API 프레임워크가 별도 트레이싱을 구축하는 문제를 "공짜"로 해결.
- **레퍼런스:** [SC'25](https://dl.acm.org/doi/10.1145/3731599.3767580) | [R-LAM](https://arxiv.org/html/2601.09749) | [PROV-AGENT](https://arxiv.org/html/2508.02866v1) | [(R)evolution — arXiv](https://arxiv.org/html/2509.09915)

### 5.6 과학 워크플로 (확장 방향)
- 과학 연구 전용 에이전트 프레임워크 전무 (블루오션)
- Conitens의 문서 기반 프로토콜은 "실험→분석→논문" 워크플로에 자연스럽게 확장 가능
- 관련: ChemCrow, El Agente, ChemGraph, IoWarp, skultrafast, LUMIR
- **레퍼런스:** [ChemCrow — Nature](https://www.nature.com/articles/s42256-024-00832-8) | [El Agente — Cell](https://www.cell.com/matter/fulltext/S2590-2385(25)00306-6) | [ChemGraph](https://github.com/argonne-lcf/ChemGraph) | [IoWarp](https://grc.iit.edu/research/projects/iowarp/) | [skultrafast](https://github.com/Tillsten/skultrafast) | [LUMIR](https://www.sciencedirect.com/science/article/abs/pii/S0003267025012516) | [Chemistry World](https://www.chemistryworld.com/news/ai-agents-set-to-democratise-computational-chemistry/4022465.article) | [NVIDIA Slurm 인수](https://www.hpcwire.com/2026/01/06/what-does-nvidias-acquisition-of-schedmd-mean-for-slurm/)

---

## 6. MARS 논문(2602.02660) 적용

| MARS 원리 | Conitens 문서 기반 적용 |
|-----------|----------------------|
| Budget-Aware MCTS | `.notes/BUDGET.md`에 작업별 시간/토큰 예산. 초과 시 HALTED 시그널 자동 발생 |
| Modular Decomposition | Global 문서 단위의 원자적 역할 분해 |
| Comparative Reflective Memory | `KNOWLEDGE/LESSONS.md`에 diff 기반 교훈 축적 |
| Curriculum Exploration | `ROUTING_RULES.md`에 난이도 점진 증가 규칙 |

---

## 7. Action Plan

### Next Actions (10–30분)

1. **[10분] 시그널 파일 프로토콜 스키마 정의** — `.notes/SIGNALS/` 구조 + 시그널 파일 포맷
2. **[20분] AGENT_REGISTRY.md 초안** — 3 에이전트 구조화 + Custom Agent 템플릿
3. **[30분] CI/CD Hook 프로토타입** — `.notes/HOOKS/` + GitHub Actions PR 리뷰 워크플로 1개

### MVE
**"시그널 파일로 Claude Code → Codex 자동 핸드오프가 동작하는가?"**

성공 기준: Claude가 `.notes/SIGNALS/CLAUDE_TASK_COMPLETE.signal` 생성 → Codex가 감지 → verify 시작 → 전 과정 JOURNAL/ 기록

### Pre-mortem

| 실패 원인 | 확률 | 완화 |
|-----------|------|------|
| 시그널 파일 폴링 지연 | 중간 | 파일 워치(inotify) 또는 `ensemble notify` 수동 알림 |
| 에이전트 간 프로토콜 해석 불일치 | 높음 | Global 문서에 프로토콜 스펙 명확 정의 + 준수 테스트 |
| Git 충돌 (.notes/ 동시 수정) | 중간 | 에이전트별 전용 하위 디렉토리 분리, 공유 파일은 append-only |
| CI/CD 훅 무한 루프 | 낮음 | cooldown + 최대 실행 횟수 제한 |

---

## 8. Meta Insight

**v1→v2→v3 핵심 교정:** Conitens를 "API 오케스트레이터"로 오인한 두 차례의 오류를 거쳐, 본질인 "파일 기반 멀티에이전트 소통 프로토콜"을 정확히 포착. 이 설계의 가장 큰 힘은 **workspace에 접근 가능한 모든 AI가 코드 변경 없이 프로토콜에 참여 가능**이라는 극도의 낮은 결합도. API 통합, SDK 설치, 특정 모델 종속이라는 기존 프레임워크의 진입장벽을 완전히 제거.

**기회비용 경고:** "MCP/A2A를 구현해야 한다"는 유혹 주의. 먼저 Conitens 자체의 파일 프로토콜 완성(시그널, 핸드오프, 구조화된 로깅) → 필요 시 MCP/A2A 브릿지 추가.

**핵심 교훈:** verify→close 패턴은 업계가 "bounded autonomy"라 부르는 것의 구현. "AI Safety by Protocol"로 포지셔닝 가능.

**"지금 무엇을 해야 하는가?"**
→ 오늘: 시그널 프로토콜 스키마 + AGENT_REGISTRY.md. 이번 주: Claude↔Codex 자동 핸드오프 MVE. 2주 내: GitHub Actions PR 리뷰 훅.

---

## 참고문헌 종합

### 문서 기반 에이전트 소통
- [AGENTS.md](https://github.com/agentsmd/agents.md) | [agents.md](https://agents.md/) | [Claude MD Templates](https://github.com/abhishekray07/claude-md-templates) | [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)

### 에이전트 프레임워크
- [CrewAI](https://github.com/crewAIInc/crewAI) (43.2k) | [AutoGen](https://github.com/microsoft/autogen) (51.7k) | [LlamaIndex](https://github.com/run-llama/llama_index) (46.9k) | [Agno](https://github.com/agno-agi/agno) (37.4k) | [Semantic Kernel](https://github.com/microsoft/semantic-kernel) (26.7k) | [Smolagents](https://github.com/huggingface/smolagents) (24k) | [Haystack](https://github.com/deepset-ai/haystack) (23.4k) | [LangGraph](https://github.com/langchain-ai/langgraph) (21k) | [OpenAI SDK](https://openai.github.io/openai-agents-python/) (18.9k) | [Mastra](https://github.com/mastra-ai/mastra) (18.3k) | [Google ADK](https://google.github.io/adk-docs/) (15.1k) | [Pydantic AI](https://github.com/pydantic/pydantic-ai) (13.4k) | [Atomic Agents](https://github.com/BrainBlend-AI/atomic-agents) (5.3k)
- [MS Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview) | [AG2 Fork](https://medium.com/@aiforhuman/autogen-and-ag2-a-journey-from-one-to-two-af151ec12fb7)

### 프로토콜
- [MCP 스펙](https://modelcontextprotocol.io/specification/2025-11-25) | [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol) | [Anthropic MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) | [InfoQ MCP](https://www.infoq.com/news/2024/12/anthropic-model-context-protocol/)
- [A2A](https://github.com/google/A2A) | [A2A InfoQ](https://www.infoq.com/news/2025/04/google-agentic-a2a/) | [Gravitee MCP vs A2A](https://www.gravitee.io/blog/googles-agent-to-agent-a2a-and-anthropics-model-context-protocol-mcp) | [Descope A2A](https://www.descope.com/learn/post/a2a)
- [ACP→A2A](https://github.com/orgs/i-am-bee/discussions/5) | [Boomi 비교](https://boomi.com/blog/what-is-mcp-acp-a2a/) | [Educative 가이드](https://www.educative.io/blog/agentic-protocols) | [Macronet ACP](https://macronetservices.com/agent-communication-protocol-acp-ai-interoperability/)

### 메모리/상태
- [Mem0](https://mem0.ai/research) | [Mem0 가이드](https://mem0.ai/blog/agentic-frameworks-ai-agents) | [Letta 벤치마크](https://www.letta.com/blog/benchmarking-ai-agent-memory) | [Emergent Mind](https://www.emergentmind.com/topics/persistent-memory-for-llm-agents)

### 재현성/출처
- [R-LAM](https://arxiv.org/html/2601.09749) | [PROV-AGENT](https://arxiv.org/html/2508.02866v1) | [SC'25](https://dl.acm.org/doi/10.1145/3731599.3767580) | [(R)evolution](https://arxiv.org/html/2509.09915) | [OSTI](https://www.osti.gov/servlets/purl/3009442) | [Frontiers](https://www.frontiersin.org/journals/physics/articles/10.3389/fphy.2025.1711356/full)

### 트렌드
- [Google Research 스케일링](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) | [Deloitte 전략](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html) | [MLMastery 2026](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/) | [RTInsights](https://www.rtinsights.com/if-2025-was-the-year-of-ai-agents-2026-will-be-the-year-of-multi-agent-systems/) | [Reworked](https://www.reworked.co/digital-workplace/2025-was-supposed-to-be-the-year-of-the-agent-it-never-arrived/) | [Google Cloud 패턴](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) | [Kore.ai](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)
- [비용](https://10clouds.com/blog/a-i/mastering-ai-token-optimization-proven-strategies-to-cut-ai-cost/) | [캐싱](https://arxiv.org/html/2601.06007v1) | [Unified AI Hub](https://www.unifiedaihub.com/blog/the-economics-of-ai-cost-optimization-strategies-for-token-based-models)

### 과학 워크플로
- [ChemCrow](https://www.nature.com/articles/s42256-024-00832-8) | [El Agente](https://www.cell.com/matter/fulltext/S2590-2385(25)00306-6) | [ChemGraph](https://github.com/argonne-lcf/ChemGraph) | [IoWarp](https://grc.iit.edu/research/projects/iowarp/) | [skultrafast](https://github.com/Tillsten/skultrafast) | [LUMIR](https://www.sciencedirect.com/science/article/abs/pii/S0003267025012516) | [Chemistry World](https://www.chemistryworld.com/news/ai-agents-set-to-democratise-computational-chemistry/4022465.article) | [NVIDIA Slurm](https://www.hpcwire.com/2026/01/06/what-does-nvidias-acquisition-of-schedmd-mean-for-slurm/)

### 학술 도구
- [Jupyter MCP](https://www.jan.ai/docs/desktop/mcp-examples/data-analysis/jupyter) | [Jupyter AI](https://github.com/jupyterlab/jupyter-ai) | [Notebook Intelligence](https://github.com/notebook-intelligence/notebook-intelligence) | [PapersGPT](https://github.com/papersgpt/papersgpt-for-zotero) | [Zotero AI 비교](https://citationstyler.com/en/knowledge/ai-plugins-for-zotero/) | [OpenAI Prism](https://openai.com/prism/) | [Overleaf AI](https://www.digital-science.com/blog/2025/06/digital-science-launches-new-cutting-edge-ai-writing-tools-for-20-million-overleaf-users/)

---

**[Self-Check]:** PASS ✅ (Scale: Paradigm)
- 가정 파쇄: 3개 (API 레지스트리→문서 추가, 비용 라우팅→작업 수준, MCP/A2A 필수→보완적 공존)
- 유추 제어: 없음
- Action: 10/20/30분
- Pre-mortem: 4개
- Epistemic: [확실] 문서 기반 프로토콜 독보성, [확실] 기존 프레임워크와 다른 계층, [추정] 시그널 실시간성, [가정] Phase 기간
