# Conitens Frontend 리뷰 및 작업 계획

> 기준일: 2026-04-02
> 재기준화 반영일: 2026-04-03
> 범위: `packages/dashboard` 전체 + forward bridge + pixel office
> 참조: `conitens_frontend_rebaseline_v4_1.md`, `FE8_STABILIZATION.md`, `pixel-office-figma-post-limit-checklist.md`, `pixel-office-design-improvement-plan.md`, `current-architecture-status-ko.md`

## Update Note

이 문서는 최초 작성 이후 여러 구현 slice가 `main`에 머지되면서 원래의 계획 우선순위가 바뀌었다.
현재 merged `main` 기준으로 이미 반영된 항목은 다음과 같다.

- forward shell / bridge / approvals / insights / live refresh 구현
- Pixel Office preview route (`#/office-preview`) 추가 및 browser verification 완료
- pixel-office shell hard-lock 및 rail row caps
- compact focus strip 및 quieter room chrome
- `Impl Office` / `Central Commons` density 보강
- specialist wing fixture polish
- ambient signal restraint
- operator-summary band / stage status pills / rail section counts
- correlated-signal strip / sticky desktop context rail
- avatar accessibility fix / reduced-motion handling
- live shell 기준 dark shell / panel grammar 통일
- onboarding overlay의 inline panel 전환
- `styles.css` import hub 전환 및 route-level style layering 시작
- `forward-bridge.ts` 구조 분리 완료 (`types / parsers / client / storage / stream`)

추가로 merged-main dashboard baseline capture도 완료되었다.

- dashboard tests: `68 passed / 0 failed`
- dashboard typecheck: passed
- dashboard build: passed

따라서 이 문서의 현재 남은 핵심 항목은:

1. 선택적 responsive / minor UX follow-up
2. `demo-data.ts` 정리 여부 판단

최신 preview verification evidence:

- `output/playwright/office-preview-2026-04-02-final.png`
- `output/playwright/office-preview-2026-04-02-final-2.png`
- `output/playwright/office-preview-2026-04-03-pre-polish.png`
- `output/playwright/office-preview-2026-04-03-polish.png`
- `output/playwright/office-preview-2026-04-03-research-pass.png`
- `output/playwright/dashboard-runs-unified-1440.png`
- `output/playwright/dashboard-run-detail-unified-1440.png`
- `output/playwright/dashboard-preview-unified-1440.png`
- `output/playwright/dashboard-agents-unified-1440.png`
- `output/playwright/dashboard-runs-unified-1220.png`
- `output/playwright/dashboard-preview-unified-1220.png`
- `output/playwright/dashboard-preview-unified-820.png`

---

## 1. 구현 현황 종합

### 1.1 Forward Runtime Shell (FE-1 ~ FE-8)

| Phase | 상태 | 산출물 | 비고 |
|-------|------|--------|------|
| P0 Runtime Audit | **완료** | `RUNTIME_AND_SERVICE_AUDIT.md` | 서비스 임포트 < 70ms 확인 |
| BE-1a Read-only Bridge | **완료** | `ensemble_forward_bridge.py` | 6개 GET 엔드포인트 |
| FE-0 Contracts | **완료** | 6개 계약 문서 (BRIDGE/STATE/EVENT/ROOM/VIEW_MODEL/MOCKING) | `docs/frontend/` |
| FE-1 Shell + Run List | **완료** | `App.tsx`, `forward-bridge.ts`, `forward-route.ts` | hash 기반 라우팅 |
| FE-3 Replay/State-Docs/Room | **완료** | `ForwardReplayPanel`, `ForwardStateDocsPanel`, `ForwardRoomPanel`, `ForwardContextPanel` | 4개 패널 |
| FE-4 Live Room Updates | **완료** | `use-forward-stream.ts`, `openForwardEventStream()` | merged state 기준 live refresh 반영 |
| FE-5 Graph Inspector | **완료** | `ForwardGraphPanel`, `forward-graph.ts` | SVG read-only |
| BE-1b Live/Approval Bridge | **완료** | SSE `GET /api/events/stream` + approval mutation 3개 | POST decide/resume |
| FE-6 Approval Center | **완료** | `ForwardApprovalCenterPanel.tsx` | approve/reject/resume |
| FE-7 Insights View | **완료** | `ForwardInsightsPanel.tsx` | insight cards + findings + validator |
| FE-8 Stabilization | **완료** | `test_forward_operator_flow.py` 외 | hardening pass 반영 완료 |

### 1.2 Pixel Office

| 항목 | 상태 | 비고 |
|------|------|------|
| 6-room 시맨틱 모델 | **완료** | ops-control, impl-office, central-commons, research-lab, validation-office, review-office |
| Office Stage 렌더링 | **완료** | `OfficeStage.tsx` + `OfficeRoomScene.tsx` |
| Sidebar (agent/task/handoff) | **완료** | `OfficeSidebar.tsx` |
| Avatar/Sprite 시스템 | **완료** | `OfficeAvatar.tsx`, `office-avatar-sprites.ts`, `pixel-canvas-avatar.ts` |
| Handoff 시각화 | **완료** | `HandoffLink.tsx` (SVG tone-based) |
| Preview verification route | **완료** | `#/office-preview` |
| Hierarchy / polish slices | **완료** | summary band, status pills, calmer rail, signal strip |
| Accessibility / motion restraint | **완료** | avatar accessibility, reduced-motion branch |

### 1.3 Dashboard Core

| 항목 | 상태 | 비고 |
|------|------|------|
| Overview Dashboard | **완료** | `OverviewDashboard.tsx` |
| Kanban Board | **완료** | `KanbanBoard.tsx` |
| Timeline | **완료** | `Timeline.tsx` |
| Task Detail Modal | **완료** | `TaskDetailModal.tsx` |

---

## 2. 현재 남은 GAP

### 2.1 구조 정리 후보

| 파일 | 문제 | 성격 |
|------|------|------|
| `styles.css` | **부분 해소** — import hub 전환 완료, route-level layer 분리 시작 | 후속 정리 필요 |
| `forward-bridge.ts` | **해소** — 타입 / parser / HTTP / storage / stream 분리 완료 | barrel export 유지 |
| `demo-data.ts` | preview/demo surface용 데이터 사용처 재점검 필요 | 선택적 정리 대상 |

**우선 대응**:

- `forward-bridge.ts` cleanup 완료
- `styles.css` split cleanup은 follow-up에서 마감

### 2.2 선택적 후속 UX

현재 preview는 이미 충분히 검증된 상태다. 추가 UX 작업은 다음 둘 중 하나일 때만 수행한다.

- 구조 정리 과정에서 실제 readability gap이 다시 확인될 때
- live forward shell 쪽에서 operator-flow gap이 구체적으로 발견될 때

### 2.3 지속 아키텍처 리스크

| 리스크 | 출처 | 심각도 |
|--------|------|--------|
| Active runtime vs forward stack 이중 제어 플레인 | `current-architecture-status-ko.md` | **HIGH** — frontend는 forward만 타겟하나 실제 운영은 legacy |
| `.vibe/context/LATEST_CONTEXT.md` staleness | `current-architecture-status-ko.md` | **MEDIUM** — repo digest 신선도 보장 없음 |
| Room/handoff 경로 잔여 중복 | `current-architecture-status-ko.md` | **LOW** — forward room service가 canonical, legacy는 mirror |
| planning doc stale risk | 현재 문서 자체 | **INFO** — merged state를 늦게 반영하면 후속 구현이 잘못된 우선순위를 따른다 |

---

## 3. 작업 목록

### 3.1 필수 작업 (Must Do)

#### T-1: Frontend Review Doc Rebaseline

- **상태**: 완료
- **설명**: 이 문서를 merged `main` 기준으로 다시 정렬하여 완료/잔여를 정확히 반영
- **검증**: merged code/context와 문서의 완료 상태가 모순되지 않음
- **산출물**: 갱신된 `FRONTEND_REVIEW_2026-04-02.md`
- **우선순위**: P0
- **의존성**: 없음

#### T-2: Merged-Main Baseline Capture

- **상태**: 완료
- **설명**: 구조 정리 전에 현재 merged `main` 상태의 dashboard baseline 확보
- **검증**:
  - dashboard tests
  - dashboard typecheck
  - dashboard build
- **산출물**: pre-cleanup baseline evidence
- **우선순위**: P0
- **의존성**: T-1

#### T-3: `styles.css` 구조 분리

- **설명**: 대형 단일 CSS를 책임별로 분리
- **제안 구조**:
  - `forward-shell.css`
  - `forward-panels.css`
  - `forward-tokens.css`
  - `office-preview.css` 또는 동등 책임 단위
- **우선순위**: P0
- **의존성**: T-2

#### T-4: `forward-bridge.ts` 구조 분리

- **상태**: 완료
- **설명**: bridge 모듈을 타입/클라이언트/storage/stream 책임으로 분리
- **제안 구조**:
  - `forward-bridge-types.ts`
  - `forward-bridge-client.ts`
  - `forward-bridge-storage.ts`
  - `forward-bridge-stream.ts`
- **우선순위**: P0
- **의존성**: T-2

### 3.2 추천 작업 (Should Do)

#### T-5: `demo-data.ts` 사용처 확인 및 정리

- **설명**: mocking policy 상 실 앱에서 demo data 사용 금지. 실제 import 확인 후 미사용시 삭제
- **우선순위**: P2
- **의존성**: 없음

#### T-6: 선택적 minor UX follow-up

- **설명**: 구조 정리 이후 실제 gap이 남을 때만 operator-flow or readability 미세 조정
- **우선순위**: P3
- **의존성**: T-3, T-4 완료 후

### 3.3 의도적 보류 (Deferred)

| 항목 | 출처 | 보류 사유 |
|------|------|----------|
| Approval `edited_payload` 에디터 | FE6 | write path 없는 v0 범위 |
| Policy editor UI | FE6 | operator 단일 사용자, CLI에서 관리 가능 |
| Audit-history-only 화면 | FE6 | replay에서 이력 확인 가능 |
| Insight 필터/검색 | FE7 | 데이터 양이 적은 v0에서 불필요 |
| Cross-run insight 비교 | FE7 | multi-run 운영 시 재검토 |
| Graph editing | v4.1 | read-only control shell 원칙 |
| WebSocket transport | v4.1 | SSE로 충분 |
| Multi-user auth/roles | v4.1 | 단일 operator 가정 |
| Sequence number gap recovery | BE-1b | snapshot = fresh point-in-time |
| 추가 Pixel Office floorplate rewrite | 현재 기준 | merged preview는 이미 충분히 stage-first이며 구조 변경은 다음 단계 아님 |

---

## 4. 실행 순서 권고

```text
Phase A — Optional Follow-Up (T-3 + T-5 + T-6)
  └─ `styles.css` split cleanup 마감
  └─ demo-data 정리
  └─ 필요할 때만 minor UX 조정
```
