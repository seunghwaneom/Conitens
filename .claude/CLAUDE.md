# CLAUDE.md — Conitens v2 (Compact)

> 경량 참조 파일. 상세 프로토콜은 `docs/RFC-1.0.1.md`, 타입은 `packages/protocol/src/` 참조.
> 현재 런타임은 `scripts/ensemble_*.py` + `.notes/` + `.agent/`. → `AGENTS.md` 참조.

## 프로젝트 정의

Conitens v2: 이종 CLI 에이전트를 마크다운 네이티브, 이벤트 소싱 프로토콜로 조율하는 로컬퍼스트 협업 OS.
**파일이 프로토콜이다.** `events/*.jsonl`이 유일한 commit point.

## 정본: `docs/RFC-1.0.1.md`

## 7대 불변식

| # | 불변식 |
|---|--------|
| I-1 | `events/*.jsonl` append가 유일한 commit point |
| I-2 | view는 이벤트 로그만으로 재생성 가능 (runtime 의존 금지) |
| I-3 | 에이전트는 reducer 소유 파일을 직접 수정하지 않음 |
| I-4 | MODE.md는 provider binding만 변경 |
| I-5 | 외부 발송은 승인 게이트 통과 필수 |
| I-6 | 이벤트 append 전 redaction 필수 |
| I-7 | 각 파일은 정확히 1개의 소유자(writer)만 가짐 |

## 기술 스택

Node.js ≥22.12, pnpm ≥9, TypeScript, Vite 7, vitest, React 19 + Zustand + dnd-kit + PixiJS 8.
**금지**: react-beautiful-dnd.

## 코딩 규칙

1. `@conitens/protocol` 타입/함수 재구현 금지 — 반드시 import
2. 새 경로 → `paths.ts` classifyPath() 업데이트 + 테스트
3. 새 Reducer → `ownership.ts` REDUCERS 업데이트 + 소유권 테스트
4. 새 EventType → `event.ts` EVENT_TYPES 추가 + exhaustiveness 테스트
5. Reducer는 소유권 표의 파일만 쓰고, 참조만 읽음 (I-7)
6. view 생성 시 runtime/operational 의존 금지 (I-2)
7. 테스트 우선 — protocol.test.ts 통과 확인 후 작업
8. event_id: `evt_<ulid>`, JSONL: 일별 파일, append 후 fsync
9. command 실패 → `command.rejected` 이벤트 발생 → 파일 삭제

## On-Demand 참조 (필요 시 읽기)

| 주제 | 파일 |
|------|------|
| 5-Plane 분류, 파일 소유권 | `packages/protocol/src/paths.ts`, `ownership.ts` |
| Reducer 소유권 표 | `packages/protocol/src/ownership.ts` |
| 태스크/핸드오프 상태 머신 | `packages/protocol/src/task-state.ts` |
| 이벤트 스키마 (121종) | `packages/protocol/src/event.ts` |
| Write Flow, Redaction, Dedupe | `docs/RFC-1.0.1.md` §7, §13, §14 |
| Phase 1 구현 범위 | `docs/RFC-1.0.1.md` 또는 git log |
| doctor --verify 검사 | `docs/RFC-1.0.1.md` §15 |

## Obsolete

- `react-beautiful-dnd`, `sessions/*.jsonl`, `approvals/*.md` 디렉토리, file-first write path — 모두 폐기.
- v2 보고서 이벤트 이름 → `event.ts` OBSOLETE_ALIASES 참조.
