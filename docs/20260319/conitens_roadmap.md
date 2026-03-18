# Conitens Development Roadmap & Strategic Research Report

**AI Agent Orchestration, Skills Map, Workflows, and Implementation Plan**

File-Based Multi-Agent Collaboration Platform
[github.com/seunghwaneom/Conitens](https://github.com/seunghwaneom/Conitens)

Seunghwan Eom · KAIST
2026년 3월 19일 · Conitens AI Guide v5

---

## 1. Executive Summary

Conitens는 파일 기반 프로토콜('files as protocol')로 Claude Code, Codex CLI, Gemini CLI 간 협업을 조율하는 멀티 에이전트 협업 플랫폼이다. 본 보고서는 2025-2026년 AI 에이전트 오케스트레이션 생태계를 조사하고, Conitens의 발전 방향과 기능 구현 계획을 제시한다.

> **핵심 발견:** Conitens가 진입하는 시장에서 building block은 모두 존재하지만, Obsidian 네이티브 통합 + 멀티 CLI 오케스트레이션 + 영속적 메모리 + 구조화된 지식 관리를 모두 결합한 프로젝트는 아직 없다. 이것이 Conitens의 핵심 차별화 지점이다.

---

## 2. 에이전트 오케스트레이션 프레임워크 현황

### 2.1 주요 프레임워크 비교

2025-2026년 기준 7개 주요 프레임워크가 경쟁 중이며, 각각 명확한 포지션을 확보했다.

| 프레임워크 | 버전 | GitHub Stars | 최적 용도 | 메모리 |
|---|---|---|---|---|
| LangGraph | 1.1.x (GA) | ~8K (97K 생태계) | 프로덕션 에이전트, 복잡한 상태 관리 | LangMem SDK |
| CrewAI | 1.10.1 | 45.9K | 빠른 멀티 에이전트 프로토타입 | 내장 short/long/entity |
| OpenAI Agents SDK | 0.12.3 | 18.9K | 간단한 에이전트 설정 | Sessions (Redis) |
| Google ADK | 0.6.0 | 빠른 성장세 | Google 생태계, 멀티 에이전트 | Session + Memory Bank |
| MS Agent Framework | RC 1.0 | ~27.4K (SK) | 엔터프라이즈 .NET | Context providers |
| Mem0 | Latest | 48K | 드롭인 메모리 레이어 | Vector + Graph DB |
| Letta (MemGPT) | Latest | ~33K | 영속적 상태 에이전트 | 자기 편집 계층 메모리 |

**출처:**
- LangGraph GA: [changelog.langchain.com](https://changelog.langchain.com/announcements/langgraph-1-0-is-now-generally-available)
- CrewAI vs LangChain 비교: [nxcode.io](https://www.nxcode.io/resources/news/crewai-vs-langchain-ai-agent-framework-comparison-2026)
- OpenAI Agents SDK 리뷰: [mem0.ai/blog](https://mem0.ai/blog/openai-agents-sdk-review)
- OpenAI Agents SDK PyPI: [pypi.org/project/openai-agents](https://pypi.org/project/openai-agents/)
- Google ADK: [developers.googleblog.com](https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/)
- Google ADK GitHub: [github.com/google/adk-python](https://github.com/google/adk-python)
- MS Agent Framework: [devblogs.microsoft.com](https://devblogs.microsoft.com/autogen/microsofts-agentic-frameworks-autogen-and-semantic-kernel/)
- AutoGen v0.4: [microsoft.com/research](https://www.microsoft.com/en-us/research/video/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-and-more-microsoft-research-forum/)
- Mem0 대안 비교: [vectorize.io](https://vectorize.io/articles/mem0-alternatives)
- Letta GitHub: [github.com/letta-ai/letta](https://github.com/letta-ai/letta)
- Letta 메모리 벤치마크: [letta.com/blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- Graph Memory (Mem0): [mem0.ai/blog](https://mem0.ai/blog/graph-memory-solutions-ai-agents)

### 2.2 Anthropic 에이전트 설계 철학

Anthropic은 프레임워크 대신 설계 가이드를 발행하여 단순성을 강조했다:

**단일 LLM + 도구 → 워크플로우 (prompt chaining, routing, parallelization) → 에이전트 (orchestrator-worker, evaluator-optimizer) → 자율 에이전트**

Conitens는 이 계층 구조를 따라야 한다 — 직접 LLM API 호출 + MCP로 시작하고, 워크플로우 복잡도가 요구될 때만 LangGraph로 졸업.

**출처:**
- Anthropic 'Building Effective Agents': [anthropic.com/research](https://www.anthropic.com/research/building-effective-agents)

---

## 3. MCP & A2A 프로토콜 생태계

### 3.1 Model Context Protocol (MCP)

MCP는 2024년 11월 Anthropic이 오픈소스화한 이후 거의 모든 AI 도구에서 채택되었다. 현재 스펙 버전 2025-11-25, 월간 SDK 다운로드 9,700만 건, 발행된 MCP 서버 10,000개 이상.

**2025년 11월 스펙 주요 추가사항:**
- Tasks: 비동기 장기 실행 작업 지원 (실험적)
- OAuth 2.1 인증 표준화
- Structured Tool Outputs: 구조화된 도구 출력
- Elicitation: 서버 주도 사용자 상호작용

**2026년 로드맵:** Streamable HTTP 확장성, Task retry 의미론, 엔터프라이즈 준비(audit, SSO, gateway), MCP Apps (OpenAI 공동 개발).

**AAIF (에이전틱 AI 파운데이션):** 2025년 12월 Linux Foundation 산하로 설립. Platinum 멤버: AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI.

**채택 현황:** Claude Desktop, ChatGPT, Cursor, VS Code Copilot, Gemini CLI, Codex CLI, Windsurf, Zed 등 주요 도구에서 1급 지원.

**인기 MCP 서버:** Context7 (버전별 문서), Playwright (브라우저 자동화), Sequential Thinking, Filesystem, GitHub, Git, PostgreSQL, Slack.

**출처:**
- MCP 스펙: [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification/2025-11-25)
- MCP AAIF 합류: [blog.modelcontextprotocol.io](http://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)
- AAIF 설립: [linuxfoundation.org](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- MCP 2026 로드맵: [blog.modelcontextprotocol.io](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- MCP 엔터프라이즈 가이드: [guptadeepak.com](https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/)
- MCP 보안 보고서: [astrix.security](https://astrix.security/learn/blog/state-of-mcp-server-security-2025/)
- 인기 MCP 서버 Top 10: [fastmcp.me](https://fastmcp.me/blog/top-10-most-popular-mcp-servers)
- MCP 스펙 분석 (Nov 2025): [medium.com/@dave-patten](https://medium.com/@dave-patten/mcps-next-phase-inside-the-november-2025-specification-49f298502b03)
- 필수 MCP 서버 7선: [dev.to](https://dev.to/docat0209/7-mcp-servers-every-claude-user-should-know-about-2026-29jl)

### 3.2 Agent-to-Agent (A2A) 프로토콜

Google이 주도한 A2A 프로토콜(v0.3, 2025년 7월)은 MCP를 보완하여 에이전트 간 통신을 표준화한다. MCP가 에이전트-도구 연결이라면, A2A는 에이전트-에이전트 연결. 150개 이상 조직이 지원. Agent Cards (JSON at `/.well-known/agent.json`)로 능력 발견, 태스크 기반 통신으로 협업.

**Conitens 시사점:** MCP는 도구 통합(Obsidian vault 접근, 파일 조작, DB)에 사용. A2A는 독립 에이전트 서비스 오케스트레이션이 필요할 때만 고려.

**출처:**
- A2A 개요 (IBM): [ibm.com/think/topics/agent2agent-protocol](https://www.ibm.com/think/topics/agent2agent-protocol)
- A2A 구현 가이드: [cybage.com](https://www.cybage.com/blog/mastering-google-s-a2a-protocol-the-complete-guide-to-agent-to-agent-communication)
- A2A Linux Foundation: [linuxfoundation.org](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- NIST AI Agent 표준: [nist.gov](https://www.nist.gov/caisi/ai-agent-standards-initiative)
- CSA Agentic AI Identity: [cloudsecurityalliance.org](https://cloudsecurityalliance.org/artifacts/agentic-ai-identity-and-access-management-a-new-approach)

---

## 4. Obsidian AI 생태계

### 4.1 핵심 플러그인

Obsidian은 현재 150만 활성 사용자, 2,732+ 커뮤니티 플러그인, 100+ AI 관련 플러그인 보유. "Claude Code inside Obsidian"이 파워유저 워크플로우로 부상.

| 플러그인 | Stars/다운로드 | 핵심 기능 |
|---|---|---|
| Copilot for Obsidian | 5,776 stars | 멀티모델 채팅, VaultQA, Composer |
| Smart Connections | 4,357 stars | RAG 기반 시맨틱 검색, 로컬 모델 지원 |
| Gemini Scribe | 신규 | 에이전트 모드, 파일 생성/편집 |
| Note Companion AI | 3,000+ stars | AI 기반 자동 파일 정리 |
| Khoj | 33,400+ stars | 셀프 호스팅 AI second brain |
| Letta Obsidian | 신규 | 영속적 자기편집 메모리 |

**출처:**
- Obsidian AI Second Brain 가이드: [nxcode.io](https://www.nxcode.io/resources/news/obsidian-ai-second-brain-complete-guide-2026)
- Obsidian AI 플러그인 목록: [obsidian.md/plugins?search=ai](https://obsidian.md/plugins?search=ai)
- Awesome Obsidian AI Tools: [github.com/danielrosehill](https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools)
- Obsidian AI 플러그인 오버뷰: [medium.com/@petermilovcik](https://medium.com/@petermilovcik/obsidian-ai-plugins-overview-a6747d52977e)
- Smart Connections: [obsidianstats.com](https://www.obsidianstats.com/plugins/smart-connections)
- Note Companion AI: [notecompanion.ai](https://www.notecompanion.ai/)
- Khoj GitHub: [github.com/khoj-ai/khoj](https://github.com/khoj-ai/khoj)
- Letta Obsidian: [github.com/letta-ai/letta-obsidian](https://github.com/letta-ai/letta-obsidian)
- Claude Code + Obsidian 사례: [xda-developers.com](https://www.xda-developers.com/claude-code-inside-obsidian-and-it-was-eye-opening/)

### 4.2 Obsidian MCP 서버

6개 MCP 서버가 Obsidian vault와 AI 에이전트를 연결한다:

| MCP 서버 | 연결 방식 | 특징 |
|---|---|---|
| mcp-obsidian | REST API 플러그인 경유 | 가장 널리 사용 |
| obsidian-mcp-server | TypeScript, 포괄적 | 읽기/쓰기/검색/프론트매터 관리 |
| obsidian-mcp | 직접 파일시스템 | 가장 단순한 설정 |
| obsidian-mcp-tools | 시맨틱 검색 + Templater | 검색 + 자동화 |
| MCP-Vault | 멀티 어시스턴트 | 다중 AI 지원 |
| mcp-obsidian-advanced | NetworkX 그래프 | vault 연결 분석 |

**출처:**
- mcp-obsidian: [github.com/MarkusPfundstein/mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)
- obsidian-mcp-server: [github.com/cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server)
- Obsidian Skills (Kepano 공식): [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- Obsidian MCP 시작 가이드: [medium.com/towards-agi](https://medium.com/towards-agi/getting-started-with-obsidian-mcp-server-a-comprehensive-guide-6f44ba3fb279)

### 4.3 지식 관리 파이프라인

**CEQRC 워크플로우** (Capture → Explain → Question → Refine → Connect): AI Zettelkasten 프로젝트가 CLI, REST API, Streamlit UI, MCP 서버로 제공.

**Periodic Review 파이프라인:** Daily capture (최소 구조) → End-of-day Claude Code 처리 (링크 제안, TODO 업데이트) → Weekly Dataview 집계 + AI 종합 → Monthly 트렌드 분석. 비용: ~$20/월 (Claude Pro).

**출처:**
- AI Zettelkasten: [github.com/joshylchen/zettelkasten](https://github.com/joshylchen/zettelkasten)
- A-MEM (Zettelkasten 기반 에이전트 메모리): [arxiv.org/abs/2502.12110](https://arxiv.org/abs/2502.12110)
- Agent Memory Paper List: [github.com/Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List)
- Obsidian + Claude MCP 통합 사례: [erickhun.com](https://erickhun.com/posts/partner-os-claude-mcp-obsidian/)
- Obsidian AI Second Brain (Substack): [noahvnct.substack.com](https://noahvnct.substack.com/p/how-to-build-your-ai-second-brain)
- Obsidian 주간 리뷰 워크플로: [bagerbach.com](https://bagerbach.com/blog/weekly-review-obsidian/)
- AI Weekly Reviews (GPT + Obsidian): [medium.com/@airabbitX](https://medium.com/@airabbitX/ai-powered-weekly-reviews-with-gpt-and-obsidian-72b7fa1d356a)
- Obsidian Periodic Notes 가이드: [vaultofjosh.com](https://vaultofjosh.com/blog/obsidian-periodic-notes/)
- Claude to Obsidian 확장: [Chrome Web Store](https://chromewebstore.google.com/detail/claude-to-obsidian-markdo/ehacefdknbaacgjcikcpkogkocemcdil)
- Claude Vault (Obsidian Forum): [forum.obsidian.md](https://forum.obsidian.md/t/claude-vault-turn-your-claude-chats-into-a-knowledge-base-for-obsidian-free/109275)

---

## 5. 오케스트레이션 패턴 & 비용 최적화

### 5.1 주요 오케스트레이션 패턴

LangChain Tau-bench 벤치마크에 따르면, **Swarm 아키텍처가 Supervisor 패턴보다 약간 우수하며 토큰 사용량이 적다.** 2-5 에이전트 시스템에서 Swarm이 권장 시작점.

| 패턴 | 설명 | 적합 시나리오 |
|---|---|---|
| Orchestrator-Worker | 태스크를 동적 분해 후 위임 | 서브태스크 예측 불가 시 |
| Router | 입력 분류 → 전문 핸들러 디스패치 | 저지연 필요 시 |
| Evaluator-Optimizer | 생성-평가 루프 반복 | 품질 기준 충족까지 반복 |
| Parallelization | 독립 서브태스크 동시 실행 | 속도 최적화 |
| Prompt Chaining | 순차적 LLM 호출 파이프라인 | 단계별 처리 |

**출처:**
- LangChain 멀티 에이전트 벤치마크: [blog.langchain.com](https://blog.langchain.com/benchmarking-multi-agent-architectures/)
- 오케스트레이션 패턴 비교 (Swarm/Mesh/Hierarchical): [gurusup.com](https://gurusup.com/blog/agent-orchestration-patterns)
- 상세 패턴 비교: [dev.to](https://dev.to/jose_gurusup_dev/agent-orchestration-patterns-swarm-vs-mesh-vs-hierarchical-vs-pipeline-b40)
- Azure 에이전트 패턴: [learn.microsoft.com](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

### 5.2 멀티모델 라우팅 & 비용

**RouteLLM** (ICLR 2025, UC Berkeley): 비용 **85% 절감**, GPT-4 품질의 **95% 유지**. 라우터 오버헤드 0.4% 미만.

**현재 모델 가격 (2026년 3월 기준):**

| 티어 | 모델 | 입력/출력 ($/MTok) |
|---|---|---|
| Budget | DeepSeek V3.2 | $0.28 / $0.42 |
| Budget | GPT-5 nano | $0.05 / $0.40 |
| Budget | Claude Haiku 3 | $0.25 / $1.25 |
| Production | Claude Sonnet 4.6 | $3 / $15 |
| Production | GPT-5.2 | $1.75 / $14 |
| Production | Gemini 2.5 Pro | $1.25 / $10 |
| Frontier | Claude Opus 4.6 | $5 / $25 |

**비용 최적화 전략:**
- Prompt Caching: 반복 시스템 프롬프트 90% 절감 (Anthropic 0.1x 요금)
- Batch API: 비실시간 작업 50% 할인
- 연구자 월 비용 추정: Haiku 5M+1M + Sonnet 1M+500K = **$20-30/월** (배치 시 절반)

**출처:**
- RouteLLM: [lmsys.org/blog](https://lmsys.org/blog/2024-07-01-routellm/)
- RouteLLM 논문 (ICLR 2025): [arxiv.org/pdf/2406.18665](https://arxiv.org/pdf/2406.18665)
- LLM API 가격 비교: [intuitionlabs.ai](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)
- Claude API 가격: [platform.claude.com](https://platform.claude.com/docs/en/about-claude/pricing)
- Claude API 가격 가이드 2026: [aifreeapi.com](https://www.aifreeapi.com/en/posts/claude-api-pricing-per-million-tokens)

### 5.3 관측성 (Observability)

**Langfuse** (오픈소스, 셀프호스팅, 무료 50K observations/월): per-trace 비용 귀속, OpenTelemetry 지원, ~15% 오버헤드.

3-level 에이전트 평가 프레임워크: (1) Final response evaluation — 무엇이 잘못됐나, (2) Trajectory evaluation — 어디서 잘못됐나, (3) Single step evaluation — 왜 잘못됐나.

**출처:**
- Langfuse 에이전트 관측성: [langfuse.com/blog](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse)
- 에이전트 관측성 도구 15선: [aimultiple.com](https://research.aimultiple.com/agentic-monitoring/)
- 에이전트 평가 가이드 (Langfuse): [langfuse.com/guides](https://langfuse.com/guides/cookbook/example_pydantic_ai_mcp_agent_evaluation)
- AI 관측성 플랫폼 비교: [braintrust.dev](https://www.braintrust.dev/articles/best-ai-observability-platforms-2025)

---

## 6. 경쟁 프로젝트 분석

어떤 기존 프로젝트도 Obsidian 네이티브 통합 + 멀티 CLI 오케스트레이션 + 영속적 메모리 + 구조화된 지식 관리를 모두 결합하지 못했다.

| 프로젝트 | 핵심 기능 | Conitens 대비 갭 (Gap) |
|---|---|---|
| Obsidian Agent Client | ACP 기반 멀티 CLI 통합 | 지식관리 부재, 메모리 없음 |
| Claude Octopus | 멀티 CLI 합의 오케스트레이션 (75% consensus) | Claude Code 플러그인, Obsidian 비네이티브 |
| Obsidian Skills | 에이전트 스킬 정의 레이어 (Kepano) | 오케스트레이션 없음 |
| OpenClaw | 개인 AI OS (~320K stars) | 메시징 중심, Obsidian 비네이티브 |
| Khoj | AI second brain (33K stars) | 멀티 CLI 오케스트레이션 없음 |
| Claude-Code-Workflow | JSON 기반 멀티 에이전트 (22 agents, 37 skills) | 지식관리 부재 |
| Personal AI Infrastructure | Daniel Miessler의 개인 AI 인프라 | 연구자 특화 부족 |

**커뮤니티 수렴 패턴:** Gemini=기획 → Claude=코딩 → Codex=리뷰 파이프라인이 멀티 CLI 코딩 오케스트레이션의 표준으로 자리잡음.

**출처:**
- Obsidian Agent Client: [github.com/RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)
- Claude Octopus: [github.com/nyldn/claude-octopus](https://github.com/nyldn/claude-octopus)
- Obsidian Skills: [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- Claude-Code-Workflow: [github.com/catlog22/Claude-Code-Workflow](https://github.com/catlog22/Claude-Code-Workflow)
- Personal AI Infrastructure: [github.com/danielmiessler/Personal_AI_Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure)
- claude-codex-gemini: [github.com/Z-M-Huang/claude-codex-gemini](https://github.com/Z-M-Huang/claude-codex-gemini)
- CLI 비교 (Gemini vs Claude vs Codex): [inventivehq.com](https://inventivehq.com/blog/gemini-vs-claude-vs-codex-comparison)
- AI 코딩 도구 비교 2026: [medium.com/@terrycho](https://medium.com/@terrycho/major-ai-coding-tools-comparison-2026-claude-code-codex-gemini-55f1140cd05e)
- OpenClaw 개요: [digitalocean.com](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- Top AI GitHub Repos 2026: [blog.bytebytego.com](https://blog.bytebytego.com/p/top-ai-github-repositories-in-2026)

---

## 7. Conitens 구현 로드맵

### 7.1 권장 아키텍처 (4계층)

| 계층 | 역할 | 구현 방법 |
|---|---|---|
| **Layer 1: Foundation** | Obsidian vault = SSOT, 스킬 정의 | kepano/obsidian-skills + MCP 서버 |
| **Layer 2: Memory** | 계층적 메모리 (core/recall/archival) | Letta 스타일 자기편집 + vault 연동 |
| **Layer 3: Orchestration** | 멀티 CLI 라우팅 + 상태 관리 | Gemini=기획 / Claude=코딩 / Codex=리뷰 |
| **Layer 4: Knowledge** | 대화→노트, 주기적 리뷰, Zettelkasten | CEQRC 파이프라인 + 자동 링킹 |

**비용 최적화 구성:**
- 라우팅/단순 작업: DeepSeek V3.2 또는 GPT-5 nano
- 실질적 작업: Claude Sonnet 4.6
- 기획/대용량 컨텍스트: Gemini 2.5 Flash 무료 티어 (1,000 req/day)
- 월 비용 목표: **$20-30** (단일 연구자)

### 7.2 Phase 0: 기반 연결 (1-2일)

**목표:** Conitens .context/ 변경이 Claw-Empire 칸반에 반영되는 것을 확인

- [ ] Claw-Empire 로컬 설치 + 구동 확인
- [ ] bridge.py 최소 구현 (watchdog 기반 .context/task_plan.md 감지 → POST /api/inbox)
- [ ] MVE: task_plan.md 체크박스 추가 → Claw-Empire 칸반 반영 확인 (5초 이내)

### 7.3 Phase 1: MCP 서버 노출 (3-5일)

**목표:** Conitens 조율 작업을 MCP 서버로 래핑

- [ ] `conitens-mcp-server` 구현 (FastMCP 기반)
- [ ] 도구 세트: task 생성/수정, findings 추가, progress 조회, agent 상태 확인
- [ ] Claude Code / Gemini CLI / Codex CLI에서 네이티브 MCP 호출 테스트
- [ ] AGENTS.md 템플릿에 MCP 도구 사용법 주입

### 7.4 Phase 2: 메모리 & 라우팅 (1-2주)

**목표:** 계층적 메모리 시스템 + 비용 최적화 라우터

- [ ] **3-Tier Memory 구현:**
  - Core (항상 컨텍스트): 사용자 목표, 프로젝트 상태, 선호도
  - Recall (최근 세션): 활성 대화, activeContext.md
  - Archival (vault 인덱스): lessons-learned, anti-patterns, 과거 세션
- [ ] **RouteLLM 스타일 라우터:** 태스크 복잡도 기반 모델 자동 선택
- [ ] Prompt Caching 적용: 시스템 프롬프트 90% 비용 절감
- [ ] 월 비용 모니터링 대시보드

### 7.5 Phase 3: 지식 파이프라인 (2주+)

**목표:** 대화 → 지식 자동 변환, 주기적 리뷰

- [ ] **CEQRC 파이프라인:** 에이전트 대화 → Obsidian 구조화 노트 자동 변환
- [ ] **Periodic Notes 연동:** 일간 캡처 → 주간 Dataview 집계 → 월간 AI 분석
- [ ] **vibe-kit 통합:** 코드베이스 네비게이션 + 품질 게이트
- [ ] **Langfuse 연동:** 에이전트 핸드오프 트레이싱 + 비용 추적 (셀프호스팅)

### 7.6 Phase 4: 시각화 & 확장 (3주+)

- [ ] Conitens 네이티브 React 대시보드 (zustand + Node.js/chokidar bridge)
- [ ] XP 기반 에이전트 자동 선택 (Claw-Empire 랭킹 데이터 활용)
- [ ] ClawHub 스킬 호환 브리지 (SKILL.md ↔ ClawHub JSON 스키마)
- [ ] A2A 프로토콜 기반 에이전트 간 통신 (장기)
- [ ] 브라우저 기반 visual orchestration: 드래그앤드롭 핸드오프, 에이전트 비교 split view

---

## 8. 리스크 & 즉시 실행 항목

### 8.1 Pre-mortem

| 리스크 | 영향도 | 완화 전략 |
|---|---|---|
| 플랫폼 흡수 (Anthropic이 기능 내재화) | 높음 | Obsidian 네이티브 지식관리에 집중 (흡수 불가 영역) |
| MCP 스펙 변경 | 중간 | MCP 레이어 추상화, 버전 체크 로직 |
| 토큰 비용 폭주 | 낮음 | RouteLLM 라우팅 + Prompt Caching + 사용량 상한 |
| Claw-Empire API 변경 | 낮음 | bridge.py API 버전 체크 + /healthz 활용 |
| AGENTS.md 비대화 (토큰 소비) | 중간 | 점진적 공개(Progressive Disclosure): 요약→상세 2단계 |

### 8.2 Next Actions

| # | 작업 | 소요 시간 |
|---|---|---|
| 1 | Conitens GitHub 레포에 본 보고서 반영 (ROADMAP.md) | 15분 |
| 2 | conitens-mcp-server 초기 구현 (FastMCP, 3개 도구) | 30분 |
| 3 | bridge.py MVE (task_plan.md → Claw-Empire) | 30분 |
| 4 | kepano/obsidian-skills 포크 후 Conitens 전용 스킬 추가 | 20분 |

### 8.3 핵심 차별화

> **Conitens의 핵심 차별화는 Obsidian 네이티브 지식 관리 통합이다.** OpenClaw(플랫폼 레벨)이나 claude-octopus(코딩 특화)는 이 영역을 채우지 못한다. Vault는 단순한 데이터 저장소가 아니라 메모리 시스템이자 컨텍스트 엔진이며 출력 목적지이다. 모든 에이전트 상호작용이 지식 그래프에서 가져오고 기여해야 한다.

---

## 부록: 전체 참조 링크 목록

### 프레임워크 & 메모리
- LangGraph GA: https://changelog.langchain.com/announcements/langgraph-1-0-is-now-generally-available
- CrewAI vs LangChain: https://www.nxcode.io/resources/news/crewai-vs-langchain-ai-agent-framework-comparison-2026
- OpenAI Agents SDK: https://mem0.ai/blog/openai-agents-sdk-review
- OpenAI Agents SDK PyPI: https://pypi.org/project/openai-agents/
- OpenAI Agents SDK Docs: https://openai.github.io/openai-agents-python/
- Google ADK Blog: https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/
- Google ADK GitHub: https://github.com/google/adk-python
- MS Agent Framework: https://devblogs.microsoft.com/autogen/microsofts-agentic-frameworks-autogen-and-semantic-kernel/
- SK+AutoGen 통합: https://visualstudiomagazine.com/articles/2025/10/01/semantic-kernel-autogen--open-source-microsoft-agent-framework.aspx
- Anthropic Agent Guide: https://www.anthropic.com/research/building-effective-agents
- Mem0 대안: https://vectorize.io/articles/mem0-alternatives
- Letta GitHub: https://github.com/letta-ai/letta
- Letta Memory Benchmark: https://www.letta.com/blog/benchmarking-ai-agent-memory
- Graph Memory (Mem0): https://mem0.ai/blog/graph-memory-solutions-ai-agents

### MCP & A2A
- MCP Spec: https://modelcontextprotocol.io/specification/2025-11-25
- MCP AAIF 합류: http://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/
- AAIF 설립: https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- MCP 2026 로드맵: http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/
- MCP 엔터프라이즈: https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/
- MCP 보안: https://astrix.security/learn/blog/state-of-mcp-server-security-2025/
- 인기 MCP 서버: https://fastmcp.me/blog/top-10-most-popular-mcp-servers
- A2A (IBM): https://www.ibm.com/think/topics/agent2agent-protocol
- A2A 가이드: https://www.cybage.com/blog/mastering-google-s-a2a-protocol-the-complete-guide-to-agent-to-agent-communication
- NIST AI Agent: https://www.nist.gov/caisi/ai-agent-standards-initiative

### Obsidian AI
- Obsidian AI Guide: https://www.nxcode.io/resources/news/obsidian-ai-second-brain-complete-guide-2026
- Awesome Obsidian AI: https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools
- Khoj: https://github.com/khoj-ai/khoj
- Letta Obsidian: https://github.com/letta-ai/letta-obsidian
- Claude Code + Obsidian: https://www.xda-developers.com/claude-code-inside-obsidian-and-it-was-eye-opening/
- mcp-obsidian: https://github.com/MarkusPfundstein/mcp-obsidian
- obsidian-mcp-server: https://github.com/cyanheads/obsidian-mcp-server
- Obsidian Skills: https://github.com/kepano/obsidian-skills
- AI Zettelkasten: https://github.com/joshylchen/zettelkasten
- A-MEM: https://arxiv.org/abs/2502.12110
- Claude + Obsidian MCP: https://erickhun.com/posts/partner-os-claude-mcp-obsidian/

### 패턴 & 비용
- 멀티에이전트 벤치마크: https://blog.langchain.com/benchmarking-multi-agent-architectures/
- 오케스트레이션 패턴: https://gurusup.com/blog/agent-orchestration-patterns
- Azure 패턴: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
- RouteLLM: https://lmsys.org/blog/2024-07-01-routellm/
- LLM 가격 비교: https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025
- Claude 가격: https://platform.claude.com/docs/en/about-claude/pricing
- Langfuse: https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse
- 에이전트 평가: https://langfuse.com/guides/cookbook/example_pydantic_ai_mcp_agent_evaluation

### 경쟁 프로젝트
- Obsidian Agent Client: https://github.com/RAIT-09/obsidian-agent-client
- Claude Octopus: https://github.com/nyldn/claude-octopus
- Claude-Code-Workflow: https://github.com/catlog22/Claude-Code-Workflow
- Personal AI Infra: https://github.com/danielmiessler/Personal_AI_Infrastructure
- claude-codex-gemini: https://github.com/Z-M-Huang/claude-codex-gemini
- CLI 비교: https://inventivehq.com/blog/gemini-vs-claude-vs-codex-comparison

---

*Report generated: 2026-03-19 KST · Conitens AI Guide v5 · Claude Project Analysis*
