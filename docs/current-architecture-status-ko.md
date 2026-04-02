# Conitens 현재 아키텍처 및 코드 현황

기준 시점: `2026-04-01`

이 문서는 현재 저장소의 운영 구조와 코드 상태를 한 번에 파악하기 위한
현행 요약 문서다. 과거 개념 스케치나 배치별 리뷰를 대체하지는 않지만,
지금 기준으로 어떤 계층이 실제 운영 truth인지, 어떤 계층이 forward
구현인지, 무엇이 완료되었고 무엇이 남아 있는지 빠르게 이해할 수 있도록
정리한다.

## 1. 한눈에 보는 현재 상태

- 현재 운영 truth는 여전히 `scripts/ensemble.py` + `.notes/` + `.agent/`다.
- `scripts/ensemble_*.py` + `.conitens/`는 Batch 1-11까지 구현된 forward
  디스크 기반 루프 스택이다.
- `.vibe/`는 실행 state machine이 아니라 repo intelligence, fast precommit,
  doctor, typecheck baseline, cycle blocking을 담당하는 sidecar다.
- Wave 1 refactor와 후속 security hardening까지 반영되어, forward 스택 내부의
  상태 경계, packet discipline, validator/approval control path는 이전보다
  훨씬 명확해졌다.
- 다만 forward 스택이 아직 `scripts/ensemble.py`의 기본 런타임으로 승격된
  것은 아니다. 현재 저장소는 운영 코어와 forward 스택이 병행하는 구조다.
- 최근 추가된 명시적 진입 계약은 `ensemble forward ...`와
  `ensemble --forward status`이며, 이는 forward 스택을 운영 기본값으로
  바꾸지 않고도 operator-visible target으로 선택 가능하게 만든다.

## 2. 계층별 구조

### 2.1 Active runtime lineage

현재 제품 라인의 운영 기준은 아래 경로다.

- `scripts/ensemble.py`
- `.notes/`
- `.agent/`

이 계층은 기존 Conitens 운영면을 담당한다. `CONITENS.md`와
`docs/adr-0001-control-plane.md`도 이 경계를 현재 truth로 본다.

### 2.2 Forward `.conitens` execution stack

forward Batch 1-11 구현은 아래 축으로 구성된다.

- 상태 저장소: `scripts/ensemble_loop_repository.py`
- run / iteration 서비스:
  - `scripts/ensemble_run_service.py`
  - `scripts/ensemble_iteration_service.py`
- 복구 / 디버그:
  - `scripts/ensemble_state_restore.py`
  - `scripts/ensemble_loop_debug.py`
- markdown projection:
  - `scripts/ensemble_context_markdown.py`
- packet assembly:
  - `scripts/ensemble_context_assembler.py`
- orchestration:
  - `scripts/ensemble_orchestration.py`
- iterative loop:
  - `scripts/ensemble_execution_loop.py`
- approval / security:
  - `scripts/ensemble_approval.py`
- room / replay / insight:
  - `scripts/ensemble_room_service.py`
  - `scripts/ensemble_replay_service.py`
  - `scripts/ensemble_insight_extractor.py`
  - `scripts/ensemble_ag2_room_adapter.py`

이 스택은 Ralph-aware, disk-backed, restartable loop를 목표로 한 additive
구현이며, 현재 운영 코어를 대체한다고 주장하면 안 된다.

### 2.3 `.vibe` sidecar

`.vibe/`는 별도 실행 엔진이 아니라 repo intelligence와 품질 게이트 레이어다.

- 인덱싱 / 요약:
  - `.vibe/brain/context_db.py`
  - `.vibe/brain/indexer.py`
  - `.vibe/brain/watcher.py`
  - `.vibe/brain/summarizer.py`
- fast lane / doctor:
  - `.vibe/brain/precommit.py`
  - `.vibe/brain/doctor.py`
  - `.vibe/brain/typecheck_baseline.py`
  - `.vibe/brain/check_circular.py`
  - `.vibe/brain/run_core_tests.py`

역할은 명확하지만, `.vibe/context/LATEST_CONTEXT.md`는 현재 stale 리스크가
남아 있다.

## 3. Source of truth 정리

Wave 1-1 이후 forward 스택 기준 authoritative owner는 아래처럼 정리되었다.

| 개념 | authoritative owner | 비고 |
| --- | --- | --- |
| run state | `sqlite:runs` | `.conitens/runtime/loop_state.sqlite3` |
| iteration state | `sqlite:iterations` | same DB |
| room event log | `sqlite:messages` | legacy `.notes/rooms/*.jsonl`는 호환용 mirror/import surface |
| validator result | `sqlite:validator_results` | validator gate 결과 |
| approval decision | `sqlite:approval_requests` | risky action 승인 상태 |
| task plan status | `sqlite:context_task_plans` | `task_plan.md`는 deterministic projection |
| immutable progress log | `sqlite:context_progress_entries` | `progress.md`는 append-only projection |

중요한 점은 `.conitens/context/*.md`가 사람 친화적인 운영 digest라는 점이다.
원천 truth는 DB이고, markdown은 projection이다.

## 4. 실행 흐름

현재 forward 스택의 실행 흐름은 아래처럼 읽는 것이 가장 정확하다.

1. `PlannerGraph`가 목표와 step을 잡고 run/plan state를 만든다.
2. `BuildGraph`가 orchestration shell과 checkpoint wrapper 역할을 맡는다.
3. `ContextAssembler`가 compact execution packet을 만든다.
4. `IterativeBuildLoop.run()`이 실제 제어권을 가진다.
5. worker가 artifact를 만들고 필요 시 risky action을 approval queue로 보낸다.
6. validator가 반드시 최종 gate 역할을 한다.
7. 실패 시 retry / planner revise / specialist swap / human escalation으로
   진행한다.
8. room/replay/insight/audit 이벤트는 evidence로 남고, markdown digest는
   DB 상태에서 projection된다.

Wave 1-3 이후 control path owner는 명확하다.

- `IterativeBuildLoop.run()`:
  - validator pass -> success
  - validator fail -> retry / revise / specialist swap
  - repeated failure -> human escalation
  - risky action -> approval gate
- `BuildGraph`:
  - outer orchestration shell
  - checkpoint / resume wrapper

즉, 실제 loop decision은 execution loop로 수렴했고, orchestration은 바깥
껍데기와 재개 경로를 담당한다.

## 5. ContextAssembler와 token discipline

Wave 1-2 이후 execution packet은 replay/archive보다 작고 의도적으로
제한된 구조를 가진다.

기본 packet 핵심 요소:

- `persona_core`
- `objective`
- `current_step`
- `relevant_findings`
- `latest_runtime_digest`
- `latest_repo_digest`
- `episodic_memory_top_k`
- `recent_message_slice`
- `tool_whitelist`
- `done_when`
- `validator_failure_reason`

주요 제한:

- full room transcript는 기본 execution context에 들어가지 않는다.
- `identity` memory와 `procedural` memory는 기본 packet에서 제외된다.
- unapproved candidate policy patch는 제외된다.
- `recent_message_slice`는 `handoff_summary` 우선, 없을 때만 bounded room
  episode summary를 사용한다.
- skill resolution은 full `SKILL.md` body가 아니라 metadata 우선이다.

## 6. Validator, retry, approval, security

### 6.1 Validator gate

validator는 여전히 completion 직전 mandatory gate다. worker가 artifact를
만들어도 validator를 통과하지 않으면 성공으로 닫히지 않는다.

### 6.2 Retry / escalation

forward loop의 기본 분기 순서는 아래처럼 이해하면 된다.

- 초기 validator fail -> same-worker retry
- 반복 fail -> planner revise
- 더 반복 fail -> specialist swap
- 한계 도달 -> human escalation

이 경로는 현재 `IterativeBuildLoop.run()`이 단일 owner다.

### 6.3 Approval / security

Batch 10과 후속 hardening으로 risky action path는 다음을 만족한다.

- risky action 분류
- approval queue persistence
- pause / resume
- rejection feedback reinjection
- audit trail

기본 위험 범주:

- write / overwrite file
- delete file
- shell execution
- network access
- secret usage
- deploy / merge / publish

후속 보안 hardening에서는 dashboard/API 경계도 강화되었다.

- 민감한 `GET /api/*`는 loopback + dashboard auth가 필요하다.
- `room_id`, `spawn_id` 등 path-like identifier는 중앙 검증을 거친다.
- replay / memory / approval 관련 읽기 경로도 인증 없이 열려 있지 않다.

## 7. Room / replay / insight 구조

Batch 11의 visible collaboration layer는 execution backbone과 분리되어 있다.

- room transcript = UI / replay / evidence
- execution context = persisted state + `ContextAssembler` packet
- AG2 = debate / review / decision / approval room adapter
- AG2 != orchestration state machine

관련 핵심 모듈:

- `scripts/ensemble_room.py`
- `scripts/ensemble_room_service.py`
- `scripts/ensemble_replay_service.py`
- `scripts/ensemble_insight_extractor.py`
- `scripts/ensemble_ag2_room_adapter.py`

Replay는 room + run + iteration + agent + tool + approval 관점을 따라가며,
insight는 evidence ref를 가진 구조화 레코드로 저장된다.

## 8. 공유 상태 파일 현황

아래 파일들은 계속 유지되며, 운영 digest와 협업 handoff에 사용된다.

- `.conitens/context/task_plan.md`
- `.conitens/context/findings.md`
- `.conitens/context/progress.md`
- `.conitens/context/LATEST_CONTEXT.md`

현재 해석:

- `task_plan.md`: 현재 목표와 acceptance 요약
- `findings.md`: 검증된 사실과 설계/구현 메모
- `progress.md`: append-only 진행 로그
- `LATEST_CONTEXT.md`: runtime loop digest

주의할 점은 repo snapshot 안에서는 이 파일들이 "실행 중 자동 생성된 live
projection"이면서 동시에 "버전 관리되는 운영 요약" 역할도 같이 하고 있다는
것이다. 이것은 실용적이지만, architecture review에서 지적된 잔여 모호성 중
하나다.

## 9. 현재 코드 현황

### 9.1 완료된 큰 축

- Batch 1-11 forward `.conitens` 스택 구현 완료
- Wave 1 refactor 완료
  - Wave 1-1: source-of-truth / restore-debug boundary 정리
  - Wave 1-2: packet discipline / token discipline 정리
  - Wave 1-3: validator / retry / approval control path 정리
- post-refactor stabilization pass 완료
- dashboard/API 보안 hardening 완료

### 9.2 검증 상태

최근 작업 기준으로 확인된 사실:

- forward state restore / markdown / execution loop / approval / replay 관련
  targeted Python tests 통과
- `.vibe` fast precommit 명시 실행 통과
- Wave 1 stabilization에서 주요 invariant 위반 없음
- 최종 security hardening 이후 Claude 재검토에서 material issue 없음

### 9.3 남아 있는 구조적 리스크

아직 해결되지 않은 핵심 리스크는 아래 네 가지다.

1. active runtime와 forward stack의 이중 control plane
2. room / handoff 경로의 잔여 중복
3. `.vibe/context/LATEST_CONTEXT.md` stale 가능성
4. checked-in runtime/context artifact가 live projection과 versioned summary
   역할을 동시에 수행하는 모호성

## 10. 앞으로 문서를 읽는 순서

현재 구조를 이해하려면 아래 순서가 가장 효율적이다.

1. `AGENTS.md`
2. `.conitens/context/LATEST_CONTEXT.md`
3. `CONITENS.md`
4. `docs/adr-0001-control-plane.md`
5. `docs/control-plane-compatibility.md`
6. `scripts/ensemble_loop_repository.py`
7. `scripts/ensemble_context_assembler.py`
8. `scripts/ensemble_execution_loop.py`
9. `scripts/ensemble_orchestration.py`
10. `.conitens/reviews/batch11_architecture_review.md`
11. `.conitens/reviews/batch11_stabilization_report.md`

## 11. 결론

현재 Conitens는 "forward 디스크 기반 실행 스택" 자체는 꽤 많이 성숙한 상태다.
특히 state owner 정리, packet discipline, validator/approval control path,
replay/evidence 분리는 이전보다 훨씬 선명하다.

하지만 저장소 전체 관점에서는 아직 "운영 코어"와 "forward 스택"이 병행한다.
따라서 앞으로의 고레버리지 작업은 새 기능을 더 얹는 것보다, 이 두 control
plane의 경계를 더 선명하게 하거나 하나를 승격하는 방향으로 진행하는 것이
맞다.
