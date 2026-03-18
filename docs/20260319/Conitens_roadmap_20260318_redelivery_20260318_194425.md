# Conitens 발전 방향 및 구현 로드맵

최신 Agent Ecosystem · Skills Map · Workflow Library · Agent Orchestration 기준 제안

- **대상**: Conitens (main branch snapshot, 2026-03-18 기준 검토)
- **목적**: 현재 Conitens v2 커널 위에 최신 에이전트/스킬/워크플로/오케스트레이션 기능을 어디까지, 어떤 순서로 붙일지 실행 가능한 계획으로 정리
- **근거**: 현재 공개 저장소 + RFC-1.0.1 + 업로드된 Antigravity/vibe-kit 대화 자료 + OpenAI / Anthropic / Google / MCP / A2A 공식 문서

> 한 줄 판단: Conitens는 지금 'kernel rewrite'가 필요한 단계가 아니라, 'file-native event-sourced kernel 위에 control plane과 runtime intelligence를 제품화'해야 하는 단계다. 즉, `.conitens`를 단일 진실 공급원으로 유지한 채, canonical skills/workflows/capabilities registry, 실체화된 MCP/A2A 어댑터, subagent 추적, operational context intelligence, provider-specific artifact generator를 얹는 전략이 가장 낫다. [C1][C2][C4][C7][E1][E5][E9]

## 0. 문서 해석 기준과 우선순위

이 보고서는 문서 우선순위를 분명히 두고 작성했다. 현재 저장소에는 Conitens v2 RFC/README와, 그 이전 계보인 Ensemble·Antigravity 성격의 문서들이 함께 존재한다. 따라서 충돌이 있을 때는 (1) RFC-1.0.1, (2) README와 현재 package/core 구조, (3) architecture.md, (4) 과거 전략 문서와 업로드 자료 순으로 해석했다. [C1][C2][C6][C8][C9][C10][C14]

- RFC-1.0.1은 `.conitens/`, 5-plane taxonomy, 7 invariants, reducer ownership, approval model을 canonical truth로 둔다. [C2]
- README는 현재 monorepo 패키지 구성과 core module 확장점을 가장 잘 보여준다. [C1]
- 업로드된 Antigravity/vibe-kit 자료는 매우 유용한 설계 원칙을 제공하지만, 그대로 경로를 재도입하기보다 `.conitens` 규격에 맞게 재매핑해야 한다. [U1][U2][U3]

> **핵심 원칙**
>
> Conitens의 본질은 API-first 오케스트레이터가 아니라 '파일이 곧 프로토콜'인 협업 커널이다. 따라서 최신 agent 기능을 붙이더라도 core
> truth를 MCP/A2A로 바꾸면 안 된다. MCP/A2A는 adapter layer이고, kernel은 `.conitens` + `events/*.jsonl`
> + reducer ownership으로 유지해야 한다. [C1][C2][C9][E14][E15]

## 1. 현재 Conitens 상태 진단

현재 Conitens는 이미 매우 좋은 기반을 갖고 있다. README와 RFC는 `.conitens/`를 공유 workspace, `events/*.jsonl`를 유일한 commit point로 정의하며, control/command/event/entity/view/operational의 5-plane taxonomy와 7 invariants를 명시한다. 또한 monorepo에는 protocol/core/tui/dashboard 패키지가 있고, core에는 event-log, orchestrator, reducers, replay, agent-spawner, worktree, ws-bus, mcp, a2a, plugins, generator가 존재한다. [C1][C2]

| 영역 | 현재 강점 | 왜 중요한가 |
|---|---|---|
| 커널 | 파일 기반 이벤트 소싱과 reducer ownership이 명확함 | 장기 작업, replay, audit, multi-provider coordination의 기반 |
| 상태 모델 | RFC 승인본이 이미 존재하고 task/handoff/approval/memory/state machine이 정리됨 | 확장 기능을 '새 시스템'이 아니라 '확장된 프로토콜'로 만들 수 있음 |
| 실행 인프라 | orchestrator / reducers / replay / ws-bus / worktree / agent-spawner 보유 | workflow 엔진과 병렬 workcell을 얹기 좋음 |
| 표면 계층 | TUI와 web dashboard 패키지 존재 | 추가되는 skill/workflow/gate/subagent 상태를 바로 가시화 가능 |
| 도구화 씨앗 | repo 안에 `vibe-kit/`가 이미 별도 하위 시스템으로 존재 | context intelligence와 quality gates를 Conitens에 재통합하기 좋음 |

반면, 현 상태는 '기반은 좋지만 control plane productization은 아직 시작 단계'에 가깝다. 특히 canonical RFC와 legacy/transition 문서 사이의 드리프트가 크며, tool layer와 workflow layer가 아직 얇다. [C2][C3][C4][C7][C11][C12][C13][C14]

| 관찰 | 근거 | 의미 / 해결 방향 |
|---|---|---|
| 버전·명명 전환기 | README는 Conitens v2, root package는 4.2.0, bin은 `ensemble`과 `conitens`를 함께 노출 | 먼저 canonical naming과 문서 우선순위를 정리해야 함 [C1][C14] |
| legacy 문서 잔존 | `CONITENS.md`, `AGENTS.md`, `CLAUDE.md`, `USAGE_GUIDE.md`는 `.notes/`, `task.md`, `ensemble` 흐름을 여전히 강하게 반영 | 업로드 자료의 아이디어를 살리되 `.conitens` 구조로 재매핑해야 함 [C8][C11][C12][C13] |
| MCP 도구는 실질적으로 stub | `create_task`, `assign_task`, `list_tasks`, `get_task_status`, `submit_command`가 모두 `stub: true` 응답 | 외부 agent와의 실사용 통합 전, MCP를 먼저 실제 event-backed operations로 완성해야 함 [C4] |
| doctor가 너무 얇음 | 현재 `doctor`는 events/MODE/agents 존재 여부 정도만 확인 | quality gates, workflow health, reducer drift, MCP/A2A adapter 진단으로 확장 필요 [C3] |
| SQLite layer는 README 상 'planned' | 프로토콜 스택에 SQLite index/query가 planned로 기재 | context intelligence와 fast retrieval는 아직 성장 여지가 큼 [C1] |
| vibe-kit은 Python pack 중심 | `vibe-kit` README는 Python pack과 unified CLI를 보여주지만, Conitens core runtime은 Node/TypeScript | Conitens에 맞는 TypeScript pack 또는 core-integrated adapter가 필요 [C1][C7] |

> **현재 상태의 진짜 진단**
>
> 지금 Conitens의 병목은 '오케스트레이션 철학 부재'가 아니다. 오히려 철학은 충분하다. 병목은 그 철학을 실행형 control plane으로 굳히는 마지막
> 20% — 즉 skills/workflows registry, real MCP handlers, subagent tracking, context
> intelligence, generator-driven provider adapters — 가 비어 있다는 점이다.

## 2. 최신 agent 생태계가 주는 시사점

현재 공식 문서 기준으로 보면, 최신 agent 생태계는 네 갈래의 패턴으로 수렴하고 있다: (1) 중앙 관리형 manager/orchestrator 패턴, (2) specialist handoff 패턴, (3) explicit skills / bundled capabilities, (4) local tool protocol(MCP)과 remote federation(A2A)의 분리다. Conitens는 이 네 가지를 모두 받아들일 수 있지만, file-native kernel을 기준축으로 둬야 한다. [E1][E2][E5][E6][E9][E10][E11][E14][E15]

| 생태계 | 공식 문서상 핵심 기능 | Conitens에 주는 의미 |
|---|---|---|
| OpenAI | Manager(agents as tools)와 handoffs를 명시적으로 구분하고, guardrails와 Responses API의 stateful tool use를 제공 | Conitens 기본 오케스트레이션은 manager 패턴으로 두고, handoff는 선택적 workflow로 모델링하는 것이 맞음 [E1][E2][E3][E4] |
| Claude Code | `SKILL.md` 기반 skill 확장, custom subagents, plugin system(skills/agents/hooks/MCP), context compaction 제공 | canonical skill registry를 만들어 Claude용 skill/subagent adapter를 자동 생성하기 좋음 [E5][E6][E7][E8] |
| Google ADK / Gemini | ADK는 model-agnostic multi-agent framework이며, workflow agents와 A2A 협업을 공식화. Gemini CLI extension은 tools/commands/context를 확장하고 sub-agents는 preview | Conitens workflow engine과 capability registry를 ADK/A2A adapter로 자연스럽게 노출할 수 있음. 단, Gemini CLI subagent는 optional adapter로 취급하는 편이 안전함 [E9][E10][E11][E12][E13] |
| MCP / A2A | MCP는 tool integration 표준, A2A는 remote agent discovery와 task-oriented federation 표준 | Conitens는 '로컬 도구 연동=MCP, 원격 에이전트 협업=A2A'로 층위를 분리해야 함 [E14][E15] |

> **권고 해석**
>
> Conitens의 기본 패턴은 OpenAI식 manager pattern이 가장 잘 맞는다. 왜냐하면 Conitens는 file ownership,
> approval gate, replay, audit trail을 보존해야 하기 때문이다. handoff는 필요하지만 기본값이어서는 안 된다. parallel
> workcell 역시 가능하지만, 반드시 locks/worktree/validator-join을 동반해야 한다. [C1][C2][E1][E2][E10]

## 3. Conitens vNext의 설계 원칙

- Kernel-first: `.conitens`와 `events/*.jsonl`의 지위를 낮추지 않는다. 최신 agent 기능은 kernel 위의 control/adapter/runtime layer로 얹는다. [C1][C2]
- Provider-neutral control, provider-specific emitters: canonical skill/workflow/capability 정의는 Conitens 내부 YAML/MD에 두고, Claude/Gemini/OpenAI/Codex용 artifacts는 generator가 만든다. [C1][C2][E1][E5][E13]
- Manager default, handoff selective, parallel bounded: 기본 제어권은 orchestrator가 유지하고, handoff는 explicit, 병렬은 partition과 join이 명확할 때만 허용한다. [E1][E2][C2]
- Validator mandatory before done: 업로드 자료의 Plan→Execute→Validate 원칙을 RFC의 `review → done` validator 승인 규칙과 결합한다. [U2][C2]
- Trace-heavy, event-light: skill invocation, tool spans, profiling, fine-grained diagnostics는 먼저 `traces/*.jsonl` 또는 runtime cache에 쌓고, 비즈니스 상태 전이는 event log에만 올린다. [C1][C2]
- Operational intelligence is not canonical view: workspace-derived index/LATEST_CONTEXT/baseline/profiler 결과는 운영 캐시로 분리하고, canonical `views/CONTEXT.md`는 event-derived 성격을 유지한다. [C2][U3]
- SQLite/BM25 first, vectors later: vibe-kit 철학대로 초기엔 symbol/dependency/FTS 기반 retrieval을 먼저 넣고, 임베딩은 나중 단계로 미룬다. [U3][C1][C7]

> **가장 중요한 설계 결정**
>
> 업로드된 vibe-kit의 `LATEST_CONTEXT.md`를 그대로 `views/CONTEXT.md`에 덮어씌우면 RFC 불변식과 충돌한다. 정답은 두 층을
> 분리하는 것이다: `views/CONTEXT.md`는 event-derived canonical summary로 유지하고, `runtime/agent-
> context/LATEST_CONTEXT.md`는 code index/quality gate를 반영하는 operational snapshot으로 둔다. 이렇게
> 해야 replay 가능성과 개발 생산성을 동시에 잡을 수 있다. [C2][U3]

## 4. 목표 아키텍처: Conitens = Kernel + Control Plane + Runtime Intelligence + Federation

```
Human / Channels
       ↓
Conitens Kernel (.conitens + events/*.jsonl)
  ├─ Control Plane
  │   ├─ capabilities/
  │   ├─ skills/
  │   ├─ workflows/
  │   └─ policies/quality-gates.yaml
  ├─ Execution Plane
  │   ├─ orchestrator/
  │   ├─ reducers/
  │   ├─ agent-spawner/
  │   ├─ worktree/
  │   └─ generator/
  ├─ Runtime Intelligence
  │   ├─ runtime/agent-context/LATEST_CONTEXT.md
  │   ├─ runtime/code-index.sqlite
  │   ├─ runtime/quality/
  │   └─ traces/*.jsonl
  └─ Federation & Adapters
      ├─ MCP tools
      ├─ A2A Agent Card
      ├─ Claude skill/subagent bundle
      ├─ Gemini extension bundle
      └─ OpenAI manager/handoff adapter
```

| 레이어 | 역할 | 권장 위치 |
|---|---|---|
| Kernel | commit point, reducer ownership, replay, approval, task/handoff/memory state | 기존 `@conitens/protocol`, `@conitens/core`, `.conitens/` |
| Control Plane | provider-neutral capability/skill/workflow/policy 정의 | `.conitens/capabilities/`, `.conitens/skills/`, `.conitens/workflows/`, `.conitens/policies/` |
| Runtime Intelligence | workspace index, latest context, impact, baseline gates, profiler | `.conitens/runtime/agent-context/`, `.conitens/runtime/quality/`, `vibe-kit/packs/typescript/` |
| Federation & Adapters | MCP/A2A/Claude/Gemini/OpenAI/Codex별 adapter emit & serve | `packages/core/src/generator`, `packages/core/src/mcp`, `packages/core/src/a2a` |

이 구조에서 가장 중요한 점은 'canonical meaning'과 'adapter syntax'를 분리하는 것이다. 예를 들어 skill의 의미는 Conitens control plane에 한 번만 정의하고, Claude에는 `SKILL.md`, Gemini에는 extension command/agent/context, OpenAI에는 agent-tools/handoffs schema, Codex에는 generated instruction block으로 내려보낸다. 이렇게 해야 provider 기능 차이가 생겨도 Conitens의 중심 모델은 흔들리지 않는다. [E1][E5][E6][E13]

| Canonical object | Claude adapter | Gemini adapter | OpenAI/Codex adapter |
|---|---|---|---|
| skills | `SKILL.md`, subagent prompt | extension agents / commands / GEMINI.md | agent tools / handoff target / generated AGENTS.md |
| workflows | slash command + subagent chain | ADK workflow agent or extension command | manager graph / handoff graph |
| context | CLAUDE.md + hooks + compaction hints | GEMINI.md + extension context | system prompt + Responses stateful context |
| quality gates | plugin/hook + checklist | workflow guard + policy | guardrail + tool wrapper + generated checks |

## 5. 업로드된 Antigravity / vibe-kit 아이디어를 Conitens에 맞게 재매핑하는 방법

업로드 자료는 Conitens에 그대로 가져오면 좋은 것과, 경로/용어를 바꿔서 흡수해야 하는 것을 분명히 보여준다. 특히 Antigravity의 Plan→Execute→Validate, Manus Protocol, progressive skill loading, vibe-kit의 fast loop와 baseline gate는 Conitens에 매우 잘 맞는다. 다만 `.notes/`나 프로젝트별 중복 task 파일 체계를 다시 만들 필요는 없다. [U1][U2][U3][C2]

| 업로드 자료의 개념 | 의미 | Conitens-native 매핑 |
|---|---|---|
| Plan → Execute → Validate | 기획/실행/검증의 역할 분리 | `wf.plan_execute_validate` 기본 워크플로 + `review → done` validator gate [U2][C2] |
| task_plan.md | planner-owned master plan | `.conitens/task-specs/*.md` + `tasks/*.md`로 분리 [U2][C2] |
| findings.md | 공유된 기술적 발견/제약 | `decisions/*.md`, `task.artifact_added`, `views/TIMELINE.md`로 흡수 [U1][U2][C2] |
| progress.md | 불변 실행 기록 | `events/*.jsonl` + `traces/*.jsonl` + generated timeline [U2][C1][C2] |
| SKILL.md | progressive disclosure skill package | canonical `skill.yaml`에서 Claude용 `SKILL.md`를 생성하고, 다른 provider용 adapter도 함께 생성 [U1][E5] |
| LATEST_CONTEXT.md | 빠른 operational context snapshot | `.conitens/runtime/agent-context/LATEST_CONTEXT.md`로 운영 캐시화 [U3][C2] |
| staged-only precommit | 빠른 품질 루프 | `vibe-kit/packs/typescript` + generated hook/doctor integration [U3][C7] |

> **재도입하면 안 되는 것**
>
> legacy `.notes/` 체계, provider 전용 문서 구조, 중복 task journal 체계를 다시 canonical source로 만들면 안 된다.
> Conitens에는 이미 task/handoff/decision/memory/approval/event 구조가 있으므로, 과거 아이디어는 semantics로만
> 가져오고 path는 `.conitens`로 통일해야 한다. [C2][C8][C9][C10][U1][U2]

## 6. 제안 Skills Map

Skills는 provider-specific prompt 폴더가 아니라, '입출력 계약 + 권한 + 도구 요구사항 + default orchestration pattern'을 갖는 canonical capability unit으로 정의하는 것이 좋다. 초기에는 8~12개 수준의 좁고 강한 skill부터 시작하는 편이 관리가 쉽다. [E5][E6][E13][U1][U3]

| Family | 초기 skill ID | 기본 역할 | 기본 gate |
|---|---|---|---|
| Discovery | repo-map, dependency-trace, change-impact | Planner / Analyst | read-only, no approval |
| Planning | task-planner, workflow-selector | Planner / Orchestrator | task-spec write only |
| Implementation | code-implementer, migration-migrator | Implementer | file-write policy + verify required |
| Verification | test-runner, security-audit, architecture-guard | Validator / Sentinel | done 전 PASS 필수 |
| Context | context-curator, memory-curator | Curator | memory/approval gate |
| Performance | performance-profiler | Specialist | doctor/profile only |
| Delivery | release-notes, channel-summary | Closer / Channel agent | approval gate on outbound |

```
# 권장 canonical skill metadata (예시)
id: security-audit
family: verification
purpose: "보안 취약점 탐지와 수정 제안"
inputs:
  - task_id
  - target_paths[]
  - acceptance_criteria
outputs:
  - findings.md
  - patch_suggestions[]
  - gate_result
tools:
  - read_file
  - search_code
  - run_tests
  - mcp_security_scanner
orchestration:
  default_pattern: manager
  validator_only: true
safety:
  write_scope: limited
  approval_required: false
quality_gates:
  - baseline_no_regression
  - security_review
  - validator_pass
```

실제 파일 구조는 `skill.yaml + PROMPT.md + adapters/`를 권장한다. Claude용 `SKILL.md`는 generator가 만들고, Gemini는 extension manifest/commands/agents, OpenAI는 tool/handoff schema, Codex는 AGENTS.md 블록이나 MCP tool binding으로 내린다. 이렇게 해야 control plane이 provider에 종속되지 않는다. [E1][E5][E13]

## 7. 제안 Workflow Library

Workflow는 단순 프롬프트 프리셋이 아니라, task state / handoff / approval / validation을 조합한 실행 정책이어야 한다. Conitens는 이미 state machine과 handoff 이벤트를 갖고 있으므로, workflow layer를 '새 task 시스템'으로 만들지 말고 기존 프로토콜의 상위 정책으로 구현하는 편이 맞다. [C2][E1][E10][U2]

| Workflow ID | 시퀀스 | 언제 쓰나 | 종료 조건 |
|---|---|---|---|
| wf.plan_execute_validate | Planner → Implementer → Validator | 기본 개발 작업 | validator PASS 후 review→done |
| wf.research_plan_implement | Researcher → Planner → Implementer → Validator | 새 기능/외부 조사 결합 | 근거 문서 + 구현 + 검증 완료 |
| wf.migration_sentinel | Planner → Migrator → Sentinel → Validator | 리팩터·마이그레이션·구조 변경 | 회귀 없음 + architecture/security gate PASS |
| wf.parallel_workcell | Planner → N개 workcell → Join Validator | 분할 가능한 병렬 작업 | 모든 partition merge + final validator PASS |
| wf.incident_review | Triage → Fix → Root-cause note → Validator | 장애/버그/보안 사건 | fix + RCA + regression test 완료 |
| wf.release_train | Planner → Release notes → Channel summary → Human approval | 릴리스/공지/배포 | approval granted + outbound sent |

> **프로토콜 확장 전략**
>
> 초기 단계에서는 `workflow_id`와 `skill_id`를 task spec metadata, trace span, artifact metadata에 먼저
> 넣는 것이 실용적이다. 실사용이 안정화되면 그다음 `workflow.*` 혹은 `quality.*` 이벤트를 정식 EventType으로 승격시키면 된다. 즉,
> Day 1부터 이벤트 스키마를 과하게 늘리기보다 trace-first 접근이 낫다. [C2][C5]

## 8. Agent Orchestration 권장 모델

| 패턴 | 기본값 | 권장 사용 조건 | 주의점 |
|---|---|---|---|
| Manager / Director | 기본 | 대부분의 코드 작업, 제어권·감사추적·approval이 중요한 경우 | orchestrator가 conversation ownership을 유지해야 함 [E1] |
| Explicit Handoff | 선택 | 전문 에이전트가 다음 턴을 소유해야 하는 경우 | `handoff.*`와 단일 active owner 규칙을 명확히 지켜야 함 [C2][E2] |
| Parallel Workcell | 선택 | 파일/모듈 partition이 명확하고 merge 비용이 통제 가능한 경우 | locks/worktree + join validator 없이는 금지 [C1][C2] |

Manager pattern을 Conitens 기본으로 두는 이유는 명확하다. OpenAI 공식 문서도 manager(agents as tools)와 handoffs를 분리하고, manager가 conversation control을 유지하는 패턴을 첫 번째로 제시한다. Conitens 역시 file ownership, approval gate, replay, reducer consistency가 중요하기 때문에, 중앙 orchestrator가 task 분해와 skill/subagent 호출을 통제하는 편이 가장 잘 맞는다. [E1][C2]

handoff는 이미 RFC의 `handoff.requested → accepted → completed/rejected` 상태 모델과 자연스럽게 맞물린다. 따라서 '전문가에게 대화 제어를 넘기는 순간'만 handoff로 모델링하고, 일반적인 내부 하위 작업은 handoff가 아니라 manager-driven skill/subagent 호출로 남기는 편이 깔끔하다. [C2][E2]

Parallel workcell은 업로드 자료의 '디지털 소프트웨어 하우스' 비전을 살리는 핵심이지만, 그만큼 엄격한 경계가 필요하다. Conitens가 이미 `agent-spawner`, `worktree`, `runtime/locks`, `approval gates`, `validator done gate`를 갖고 있으므로, 병렬 실행은 이 보호장치가 켜졌을 때만 허용해야 한다. 그렇지 않으면 subagent state fragmentation과 file collision이 생긴다. [C1][C2][C10][U2]

## 9. RFC 불변식을 지키는 Context Intelligence / vibe-kit 통합안

vibe-kit은 업로드 자료에서 가장 생산성 향상이 큰 아이디어다. 흥미로운 점은 현재 저장소에도 `vibe-kit/`가 이미 존재하고, README가 indexed structure, baseline gates, staged-only precommit, LATEST_CONTEXT, unified CLI라는 철학을 요약하고 있다는 점이다. 다만 Conitens에 제대로 흡수하려면 RFC와의 충돌을 피하는 구조화가 필요하다. [C7][U3][C2]

| 기능 | 권장 위치 | 비고 |
|---|---|---|
| code symbol / dependency index | `.conitens/runtime/code-index.sqlite` | canonical state가 아니라 operational cache로 둠 |
| LATEST_CONTEXT | `.conitens/runtime/agent-context/LATEST_CONTEXT.md` | `views/CONTEXT.md`와 별도 운영 |
| typecheck baseline / quality reports | `.conitens/runtime/quality/` | git tracking 여부는 선택, 기본은 operational |
| precommit / doctor / profile | `vibe-kit/packs/typescript/` + core CLI bridge | Conitens CLI와 vibe CLI를 분리하되 연계 |
| impact analyzer / cycle detector | `packages/core/src/context-intelligence/` 또는 vibe pack | task planning과 validator에 모두 사용 |

- vibe-kit은 'Conitens의 두 번째 source of truth'가 아니라 '운영형 생산성 부스터'여야 한다.
- canonical `views/CONTEXT.md`는 event-driven summary로 유지한다. operational `LATEST_CONTEXT.md`는 code/index/quality 기반으로 생성한다.
- staged-only precommit, baseline-no-regression, cycle detection, impact analysis, doctor/profile는 P0~P1 가치가 매우 높다.
- 현재 vibe-kit이 Python pack 중심이므로, Conitens 자체엔 `vibe-kit/packs/typescript/`를 먼저 추가하는 것이 자연스럽다. [C7][C1]

> **추천 실행 순서**
>
> 1) TypeScript pack 추가 → 2) `runtime/code-index.sqlite`와 `runtime/agent-
> context/LATEST_CONTEXT.md` 생성 → 3) precommit / doctor / impact / quality gates 연동 → 4)
> dashboard/TUI에 노출. 이 순서가 커널을 흔들지 않으면서 체감 효용을 가장 빠르게 만든다. [C7][U3]

## 10. 구현 로드맵 (권장 5단계)

| Phase | 핵심 목표 | 주요 구현 항목 | Exit Criteria |
|---|---|---|---|
| P0<br>(1~2주) | Canonicalization + Kernel Hardening | 문서 우선순위 확정, legacy naming 정리, MCP stub 제거, doctor 확장, generator 입력 규격 정리 | RFC/README/AGENTS/CLAUDE/GEMINI/CODEX 문서 체계가 충돌 없이 정리되고, MCP 5개 기본 도구가 실제 event-backed 동작 |
| P1<br>(2주) | Control Plane Registry | `.conitens/capabilities/`, `.conitens/skills/`, `.conitens/workflows/`, `policies/quality-gates.yaml` 추가, schema validator 구현 | 최소 5개 skill과 3개 workflow를 canonical metadata로 선언 가능 |
| P2<br>(2주) | Workflow Executor + Subagent Tracking | manager default routing, explicit handoff policy, bounded parallel workcell, subagent telemetry/reducer/view 추가 | plan_execute_validate와 parallel_workcell이 end-to-end로 재현 가능 |
| P3<br>(2~3주) | Runtime Intelligence / vibe-kit 통합 | TypeScript pack, code index, LATEST_CONTEXT, impact analyzer, baseline gate, cycle check, doctor/profile, hook generation | staged-only 빠른 루프 확보, full doctor report 생성, operational context 자동 갱신 |
| P4<br>(1~2주) | Federation + Visibility | A2A Agent Card 생성/노출, remote discovery, dashboard/TUI의 workflow/skill/gate/subagent 뷰 추가 | 하나의 원격 agent discovery와 하나의 local provider adapter가 실제 데모 가능 |

현실적인 추천은 P0→P1→P3→P2→P4 순서다. 직관적으로는 subagent와 workflow부터 만들고 싶어지지만, 실무 생산성은 먼저 MCP বাস্ত체화, canonical registry, TypeScript vibe pack, doctor/gates가 갖춰져야 급격히 올라간다. 그 다음에 subagent/parallelism을 올리는 편이 훨씬 안정적이다. [C4][C7][U3]

## 11. 패키지 / 파일 수준의 구현 제안

| 대상 | 추가/확장 제안 | 목적 |
|---|---|---|
| `packages/protocol` | `capability.schema.ts`, `skill.schema.ts`, `workflow.schema.ts`, optional `quality.schema.ts` | canonical control metadata를 검증 가능한 타입으로 고정 |
| `packages/core/src/generator` | provider emitter(Claude/Gemini/OpenAI/Codex) 추가 | 동일한 canonical registry에서 provider-specific artifacts 생성 |
| `packages/core/src/orchestrator` | workflow-aware routing, manager/handoff policy, gate hooks | task를 단순 command ingest에서 실행 정책 엔진으로 확장 |
| `packages/core/src/context-intelligence` | indexer, latest-context, impact, cycle-check, baseline gates | vibe-kit 핵심을 Conitens에 맞게 흡수 |
| `packages/core/src/mcp` | stub 제거, event-log/reducer 기반 handlers, idempotency 강화 | 외부 agent가 실사용 가능한 tool surface 제공 |
| `packages/core/src/a2a` | Agent Card generator + discovery adapter | remote agent federation을 skill/capability registry와 연결 |
| `vibe-kit/packs/typescript` | indexer, deps, summarizer, precommit, doctor, profiler | 현재 Python pack을 넘어 Conitens core와 언어 정렬 |
| `packages/dashboard` / `packages/tui` | workflow runs, skills, quality gates, subagent states, latest context panels | 지표와 병목을 사람/agent 모두에게 가시화 |

```
# 권장 신규 경로 예시
.conitens/
  capabilities/
    index.yaml
  skills/
    repo-map/
      skill.yaml
      PROMPT.md
  workflows/
    plan-execute-validate.yaml
    parallel-workcell.yaml
  policies/
    quality-gates.yaml
  runtime/
    agent-context/
      LATEST_CONTEXT.md
    quality/
      typecheck-baseline.json
    code-index.sqlite
```

## 12. 즉시 시작해야 할 P0 백로그

- P0-1. RFC-1.0.1을 protocol truth로 공식 선언하고, README/CONITENS.md/AGENTS.md/CLAUDE.md/USAGE_GUIDE에 'legacy vs canonical' 우선순위 문장을 추가
- P0-2. `packages/core/src/mcp/mcp-server.ts`의 5개 도구를 실제 event-backed operations로 교체
- P0-3. `doctor`를 existence check 수준에서 workflow/gate/reducer/runtime 진단 도구로 확장
- P0-4. `vibe-kit/packs/typescript/` 스켈레톤 추가 및 `vibe-kit/cli/vibe.py`와 유사한 unified TS/Node bridge 설계
- P0-5. `policies/quality-gates.yaml`과 baseline-no-regression 규칙을 정의
- P0-6. generator가 canonical registry를 받아 `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`를 새로 출력하도록 설계

> **왜 이 순서인가**
>
> 이 여섯 가지를 먼저 끝내면, 그다음부터는 모든 기능이 '추가 구현'이 아니라 '정해진 control plane에 꽂는 작업'이 된다. 즉, 이후
> skill/workflow/subagent/dashboard 개발 속도가 급격히 빨라진다.

## 13. 주요 리스크와 완화책

| 리스크 | 설명 | 완화책 |
|---|---|---|
| 문서 드리프트 | RFC와 legacy docs가 함께 있어 agent가 서로 다른 규칙을 학습할 수 있음 | doc precedence를 명문화하고 generator 산출물만 자동 로드되도록 정리 |
| provider 비대칭 | Claude/Gemini/OpenAI/Codex의 skills/subagent/tooling 모델이 서로 다름 | canonical registry + emitter 구조로 해결 |
| 불변식 위반 | LATEST_CONTEXT나 index DB가 canonical view에 섞이면 replay invariant가 깨질 수 있음 | runtime/operational 계층으로 분리 |
| 병렬 충돌 | subagent 병렬 실행 시 file collision과 state fragmentation 발생 가능 | partition/worktree/lock/join-validator 강제 |
| 과도한 복잡도 | 처음부터 workflow.* / skill.* / vector DB까지 모두 넣으면 무거워짐 | trace-first, SQLite first, event schema는 후행 승격 |

## 14. 최종 권고

Conitens의 다음 단계는 '새 orchestration 철학 발명'이 아니라 '이미 좋은 커널을 최신 agent runtime과 연결 가능한 실행형 control plane으로 승격'시키는 것이다. 그 핵심은 네 가지다: (1) `.conitens` canonicalization, (2) skills/workflows/capabilities registry, (3) runtime intelligence(vibe-kit) 운영층, (4) provider adapters와 real MCP/A2A surface. 이 방향을 따르면 Antigravity/Ensemble 계열 아이디어를 잃지 않으면서도, 현재 Conitens v2 RFC의 일관성을 유지할 수 있다. [C1][C2][U1][U2][U3][E1][E5][E9]

> **실행 우선순위 요약**
>
> 지금 당장 해야 할 것은 'skill을 더 많이 추가하는 것'이 아니라 'canonical registry + real MCP + TypeScript vibe
> pack + expanded doctor'를 먼저 세우는 것이다. 이 네 가지가 정리되면, 이후 workflow/subagent/dashboard 확장은
> 자연스럽게 따라온다.

## 15. 참고 자료

표기 규칙: C = 현재 Conitens 저장소/문서, E = 외부 공식 문서, U = 업로드된 프로젝트 대화 자료.

- **[C1]** Conitens README (main branch, GitHub) — https://github.com/seunghwaneom/Conitens
- **[C2]** RFC-1.0.1 merged — Conitens v2 Protocol and State Model — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/docs/RFC-1.0.1-merged.md
- **[C3]** packages/core/src/cli.ts — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/packages/core/src/cli.ts
- **[C4]** packages/core/src/mcp/mcp-server.ts — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/packages/core/src/mcp/mcp-server.ts
- **[C5]** packages/core/src/orchestrator/orchestrator.ts — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/packages/core/src/orchestrator/orchestrator.ts
- **[C6]** docs/architecture.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/docs/architecture.md
- **[C7]** vibe-kit/README.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/vibe-kit/README.md
- **[C8]** CONITENS.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/CONITENS.md
- **[C9]** conitens_strategy_v3.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/conitens_strategy_v3.md
- **[C10]** conitens_subagent_layer.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/conitens_subagent_layer.md
- **[C11]** AGENTS.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/AGENTS.md
- **[C12]** CLAUDE.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/CLAUDE.md
- **[C13]** USAGE_GUIDE.md — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/USAGE_GUIDE.md
- **[C14]** package.json — https://raw.githubusercontent.com/seunghwaneom/Conitens/main/package.json
- **[E1]** OpenAI Agents SDK — Agents / Multi-agent system design patterns — https://openai.github.io/openai-agents-python/agents/
- **[E2]** OpenAI Agents SDK — Handoffs — https://openai.github.io/openai-agents-python/handoffs/
- **[E3]** OpenAI Agents SDK — Guardrails — https://openai.github.io/openai-agents-python/guardrails/
- **[E4]** OpenAI API — Responses — https://platform.openai.com/docs/api-reference/responses
- **[E5]** Claude Code Docs — Extend Claude with skills — https://code.claude.com/docs/en/slash-commands
- **[E6]** Claude Code Docs — Create custom subagents — https://code.claude.com/docs/en/sub-agents
- **[E7]** Claude Docs — Context windows / compaction — https://platform.claude.com/docs/en/build-with-claude/context-windows
- **[E8]** Claude Code Docs — Settings / plugins — https://code.claude.com/docs/en/settings
- **[E9]** Google ADK — Overview — https://google.github.io/adk-docs/
- **[E10]** Google ADK — Workflow Agents — https://google.github.io/adk-docs/agents/workflow-agents/
- **[E11]** Google ADK — ADK with Agent2Agent (A2A) — https://google.github.io/adk-docs/a2a/
- **[E12]** Gemini CLI extensions reference — sub-agents preview — https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md
- **[E13]** Gemini CLI — Build extensions — https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/writing-extensions.md
- **[E14]** Model Context Protocol Specification (2025-11-25) — https://modelcontextprotocol.io/specification/2025-11-25
- **[E15]** A2A Protocol — Agent Discovery — https://a2a-protocol.org/latest/topics/agent-discovery/
- **[U1]** 업로드 자료 — Antigravity 차세대 모델 기반 지능형 협업 아키텍처 설계 — 이 대화에서 제공된 업로드 자료
- **[U2]** 업로드 자료 — Antigravity Swarm 협업형 AI 에이전트 팀의 작동 원리 — 이 대화에서 제공된 업로드 자료
- **[U3]** 업로드 자료 — vibe-kit 메모/프롬프트 — 이 대화에서 제공된 업로드 자료