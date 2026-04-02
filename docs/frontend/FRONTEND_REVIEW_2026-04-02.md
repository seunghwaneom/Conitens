# Conitens Frontend 리뷰 및 작업 계획

> 기준일: 2026-04-02
> 범위: `packages/dashboard` 전체 + forward bridge + pixel office
> 참조: `conitens_frontend_rebaseline_v4_1.md`, `FE8_STABILIZATION.md`, `pixel-office-figma-post-limit-checklist.md`, `pixel-office-design-improvement-plan.md`, `current-architecture-status-ko.md`

## Update Note

이 문서는 최초 작성 이후 여러 slice가 이미 반영되었다. 현재 기준으로 완료된 항목:

- forward shell / bridge / approvals / insights / live refresh 구현
- pixel-office shell hard-lock
- rail row caps
- compact focus strip
- room tile chrome reduction
- `Impl Office` / `Central Commons` density 보강
- specialist wing fixture polish
- ambient signal restraint
- design-only `#/office-preview` route 추가

현재 남은 핵심 항목:

1. review/planning 문서 정렬
2. 필요 시 `styles.css` / `forward-bridge.ts` 구조 분리
3. 선택적 미세 polish

Phase 4 verification 현황:

- `#/office-preview` route 추가 완료
- Playwright screenshot capture 완료:
  - `output/playwright/office-preview-2026-04-02-final.png`
  - `output/playwright/office-preview-2026-04-02-final-2.png`
- visual spot check 결과:
  - major issue 없음
  - minor polish debt:
    - right rail task rows의 약간 조밀한 타이포

즉, 아래 원문 계획표는 참고용이고, 실제 우선순위는 위 상태를 기준으로 해석해야 한다.

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
| FE-4 Live Room Updates | **완료** | `use-forward-stream.ts`, `openForwardEventStream()` | SSE hook 구현 |
| FE-5 Graph Inspector | **완료** | `ForwardGraphPanel`, `forward-graph.ts` | SVG read-only |
| BE-1b Live/Approval Bridge | **완료** | SSE `GET /api/events/stream` + approval mutation 3개 | POST decide/resume |
| FE-6 Approval Center | **완료** | `ForwardApprovalCenterPanel.tsx` (233줄) | approve/reject/resume |
| FE-7 Insights View | **완료** | `ForwardInsightsPanel.tsx` (71줄) | insight cards + findings + validator |
| FE-8 Stabilization | **완료** (scoped) | `ApprovalGate.tsx` 삭제, smoke test 추가 | `test_forward_operator_flow.py` |

### 1.2 Pixel Office

| 항목 | 상태 | 비고 |
|------|------|------|
| 6-room 시맨틱 모델 | **완료** | ops-control, impl-office, central-commons, research-lab, validation-office, review-office |
| Office Stage 렌더링 | **완료** | `OfficeStage.tsx` + `OfficeRoomScene.tsx` |
| Sidebar (agent/task/handoff) | **완료** | `OfficeSidebar.tsx` |
| Avatar/Sprite 시스템 | **완료** | `OfficeAvatar.tsx`, `office-avatar-sprites.ts`, `pixel-canvas-avatar.ts` |
| Handoff 시각화 | **완료** | `HandoffLink.tsx` (SVG tone-based) |
| Figma 체크리스트 적용 | **미완료** | `pixel-office-figma-post-limit-checklist.md` 항목 미반영 |
| Design Improvement Plan 적용 | **부분 완료** | stage-first 방향 설정됨, rail 단순화 미완 |

### 1.3 Dashboard Core

| 항목 | 상태 | 비고 |
|------|------|------|
| Overview Dashboard | **완료** | `OverviewDashboard.tsx` (metrics, sparkline, ledger) |
| Kanban Board | **완료** | `KanbanBoard.tsx` (dnd-kit, 9-column) |
| Timeline | **완료** | `Timeline.tsx` (temporal event sequencing) |
| Task Detail Modal | **완료** | `TaskDetailModal.tsx` |

---

## 2. 미완료 / GAP 분석

### 2.1 SSE Live Refresh 미연결 (FE-4 잔여)

**현상**: `use-forward-stream.ts` (93줄)와 `openForwardEventStream()` 이 구현되어 있으나, 실제 UI 자동 갱신에 연결되지 않음.

**영향**: run detail / approval center / replay 화면에서 실시간 업데이트 불가. 수동 새로고침 필요.

**출처**: FE8_STABILIZATION.md — "live SSE-driven UI refresh" 명시적 deferred.

### 2.2 Pixel Office Figma 체크리스트 미적용

`pixel-office-figma-post-limit-checklist.md` 기준 미반영 항목:

| 섹션 | 체크리스트 항목 | 현재 상태 |
|------|----------------|----------|
| Shell Lock | 1440×980 고정, 48px top bar, 1fr/340px split | CSS에 hard-lock 미적용 |
| Room Geometry | 좌(ops spine) / 중(commons) / 우(specialist wing) 배치 | room 존재하나 배치 순서 미검증 |
| Central Commons 밀도 | reception edge, commons table, shared board, ambient props | fixture 밀도 부족 가능 |
| Impl Office 밀도 | workbench, shelf, cart, seated/standing zone | fixture 밀도 부족 가능 |
| Specialist Wing | Ops Control 2 station, Research bench, Validation gate, Review desk | 개별 room fixture 미세분화 |
| Rail 시스템 | Agent 4행, Task 4행, Handoff 1-3행, focus strip | 행 수 제한 및 focus strip 미구현 |
| Ambient Signal | avatar ambient, task marker small, urgency restrained | urgency 레벨 시각화 미세분화 |

### 2.3 Pixel Office Design Improvement Plan 잔여

`pixel-office-design-improvement-plan.md` 기준:

| Phase | 상태 | 잔여 |
|-------|------|------|
| Phase 1 — Structural reset | **부분 완료** | stage 지배 레이아웃 확인 필요 |
| Phase 2 — Context rail 단순화 | **미완료** | dossier 카드 → flat ledger 전환 미적용 |
| Phase 3 — Stage polish | **미완료** | room scene 간소화 미적용 |
| Phase 4 — Verification | **미완료** | Playwright 검증 미실행 |

### 2.4 코드 구조 문제

| 파일 | 문제 | 크기 |
|------|------|------|
| `styles.css` | 단일 파일에 전체 forward shell + office 토큰 혼합 | 2,054줄 |
| `forward-bridge.ts` | 타입 정의 + API 클라이언트 + 스토리지 로직 단일 파일 | ~22KB |
| `office-stage-schema.ts` | room/fixture 스키마 전체가 1파일 | ~12KB |
| `demo-data.ts` | mocking policy 상 실 앱 사용 금지이나 잔존 | ~2.6KB |

### 2.5 아키텍처 리스크 (문서 명시)

| 리스크 | 출처 | 심각도 |
|--------|------|--------|
| Active runtime vs forward stack 이중 제어 플레인 | `current-architecture-status-ko.md` | **HIGH** — frontend는 forward만 타겟하나 실제 운영은 legacy |
| `.vibe/context/LATEST_CONTEXT.md` staleness | `current-architecture-status-ko.md` | **MEDIUM** — repo digest 신선도 보장 없음 |
| Room/handoff 경로 잔여 중복 | `current-architecture-status-ko.md` | **LOW** — forward room service가 canonical, legacy는 mirror |
| v4.1 planning doc 부분 superseded | `FE8_STABILIZATION.md` | **INFO** — 구현이 문서를 앞섰으나 문서 미갱신 |

---

## 3. 작업 목록

### 3.1 필수 작업 (Must Do)

#### T-1: Forward Bridge 실 연동 Smoke Test

- **설명**: BE-1a bridge를 실제 기동하여 FE-1~FE-7 전 패널 정상 렌더링 확인
- **검증**: `ensemble forward serve` → dashboard 연결 → 각 패널 데이터 로딩
- **산출물**: 패널별 스크린샷 + 실패 항목 목록
- **우선순위**: P0
- **의존성**: 없음

#### T-2: Pixel Office Figma 체크리스트 적용

- **설명**: `pixel-office-figma-post-limit-checklist.md`의 미반영 항목 구현
- **범위**:
  - Shell lock: 1440×980, 48px top bar, 1fr/340px split CSS 강제
  - Room geometry: left/center/right 배치 순서 정렬
  - Rail 시스템: agent 4행 max, task 4행, handoff 1-3행, focus strip
  - Ambient signal: urgency 레벨 시각 차별화
- **산출물**: CSS/컴포넌트 수정 + Figma 대비 스크린샷
- **우선순위**: P0
- **의존성**: T-1 (현재 상태 확인 후)

#### T-3: Pixel Office Design Improvement — Phase 2-4

- **설명**: `pixel-office-design-improvement-plan.md` 잔여 phase 실행
- **범위**:
  - Phase 2: dossier 카드 제거 → flat agent/task/handoff ledger
  - Phase 3: room scene chrome 감소, scan 용이성 향상
  - Phase 4: `pnpm build` + `pnpm test` + Playwright 스크린샷
- **산출물**: 컴포넌트 수정 + acceptance criteria 7항목 충족
- **우선순위**: P1
- **의존성**: T-2

#### T-4: SSE Live Refresh 연결 결정

- **설명**: `openForwardEventStream()` + `use-forward-stream.ts`를 실제 UI에 연결할지 결정
- **선택지**:
  - A) 연결: snapshot 이벤트 수신 시 run detail / approval / replay 자동 re-fetch
  - B) 보류: 현행 수동 새로고침 유지 (v0 단일 operator에 충분할 수 있음)
- **판단 기준**: operator가 approval 대기 중 자동 갱신이 필요한지
- **우선순위**: P1
- **의존성**: T-1

### 3.2 추천 작업 (Should Do)

#### T-5: `styles.css` 모듈 분리

- **설명**: 2,054줄 단일 CSS를 기능별로 분리
- **제안 구조**:
  - `forward-shell.css` — shell/header/grid/form 기본 레이아웃
  - `forward-panels.css` — timeline/approval/graph/insight/doc 패널
  - `forward-tokens.css` — CSS 변수 (color, spacing, font)
  - `office-tokens.css` — pixel office 전용 토큰
- **우선순위**: P2
- **의존성**: T-2, T-3 완료 후 (디자인 변경분 확정 후 분리)

#### T-6: `forward-bridge.ts` 모듈 분리

- **설명**: 22KB 단일 파일을 역할별로 분리
- **제안 구조**:
  - `forward-bridge-types.ts` — 인터페이스/타입 정의
  - `forward-bridge-client.ts` — HTTP/SSE API 함수
  - `forward-bridge-storage.ts` — localStorage/URL param 관리
- **우선순위**: P2
- **의존성**: 없음

#### T-7: `demo-data.ts` 사용처 확인 및 정리

- **설명**: mocking policy 상 실 앱에서 demo data 사용 금지. 실제 import 확인 후 미사용시 삭제
- **우선순위**: P2
- **의존성**: 없음

#### T-8: v4.1 Planning Document 갱신

- **설명**: `conitens_frontend_rebaseline_v4_1.md` 상단 status note를 구현 완료 항목 반영하여 갱신. FE-8에서 "partially superseded" 언급된 부분 정리
- **우선순위**: P3
- **의존성**: T-1 ~ T-4 완료 후

### 3.3 의도적 보류 (Deferred — 문서 권고)

아래 항목은 v4.1 문서에서 명시적으로 범위 밖으로 지정됨. 현 시점에서 착수하지 않음.

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

---

## 4. 실행 순서 권고

```
Phase A — 검증 (T-1)
  └─ Forward bridge 실 기동 + 전 패널 smoke test
  └─ 산출물: 현재 상태 스크린샷, 실패 목록

Phase B — Pixel Office 디자인 (T-2 + T-3)
  └─ Figma 체크리스트 적용 (shell lock, room geometry, rail, ambient)
  └─ Design improvement Phase 2-4 (rail 단순화, stage polish)
  └─ 산출물: 디자인 완성 스크린샷, acceptance criteria 충족

Phase C — Live Refresh 결정 (T-4)
  └─ SSE 연결 여부 operator 관점 판단
  └─ 연결 시: snapshot → re-fetch 로직 추가
  └─ 보류 시: deferred 문서 유지

Phase D — 코드 품질 (T-5, T-6, T-7)
  └─ CSS/bridge 모듈 분리, demo-data 정리
  └─ 디자인 변경 확정 후 실행

Phase E — 문서 정렬 (T-8)
  └─ v4.1 planning doc 최종 갱신
```

---

## 5. 아키텍처 주의사항

### Forward Stack 승격 전 제약

현재 frontend는 forward runtime만 타겟하나, 실제 운영 truth는 legacy `ensemble.py` + `.notes/`. 이로 인해:

- Frontend에서 보이는 데이터 = forward stack 데이터만
- Operator가 legacy CLI로 실행한 작업은 dashboard에 표시되지 않음
- Forward stack이 default runtime으로 승격되기 전까지 이 불일치는 의도된 것

**권고**: 새 frontend surface 추가 전, forward stack 승격 또는 `--forward` mode 안정화 선행.

### Digest 분리 원칙

- `.conitens/context/LATEST_CONTEXT.md` = runtime loop digest
- `.vibe/context/LATEST_CONTEXT.md` = repo intelligence digest
- API 소비자는 두 digest를 alias로 취급하지 않을 것
- `context-latest` 엔드포인트가 `runtime_latest` / `repo_latest`를 분리 반환하는 현행 구조 유지

---

## 6. 검증 기준 요약

| 체크포인트 | Pass 기준 |
|-----------|----------|
| Forward bridge 연결 | 6개 GET 엔드포인트 정상 응답 |
| Run list 렌더링 | mock 없이 실 데이터 표시 |
| Approval workflow | approve → resume → 상태 전이 확인 |
| Pixel Office shell | 1440×980, stage 지배 레이아웃 |
| Rail 밀도 | agent 4행, task 4행, handoff 3행 이내 |
| Build 통과 | `pnpm --filter @conitens/dashboard build` 에러 0 |
| Type check | `tsc --noEmit` 에러 0 |
| Smoke test | `test_forward_operator_flow.py` PASS |

---

*Generated: 2026-04-02 | Source: docs/, packages/dashboard/, PLANS.md*
