# Forward Operator Usage Guide

상태: `implemented`

이 문서는 현재 forward runtime dashboard를 실제로 사용하는 절차를
운영자 기준으로 정리한 문서다.

중요한 전제:

- 현재 제품의 기본 runtime truth는 여전히 `scripts/ensemble.py + .notes + .agent`다.
- 이 문서의 대상은 그 위에 additive로 올라간 forward `.conitens` bridge/dashboard다.
- 즉, 여기서 다루는 UI와 API는 forward operator shell 사용법이지 legacy runtime
  대체 가이드가 아니다.

## 1. 무엇을 할 수 있나

현재 forward dashboard에서 가능한 일:

- forward run 목록 조회
- run detail 조회
- replay 조회
- state docs 조회
- runtime/repo digest 조회
- room timeline 조회
- graph/state inspector 조회
- insights 조회
- approval list/detail 조회
- approval approve / reject / resume
- live snapshot 기반 자동 새로고침

현재 의도적으로 없는 것:

- 일반 write API
- graph 편집
- approval payload editor
- websocket transport
- legacy runtime implicit fallback

## 2. 보안 / 경계 모델

이 shell은 로컬 운영자 도구다.

- bridge host는 loopback만 허용한다.
- bridge read/write 모두 bearer token이 필요하다.
- dashboard는 token을 브라우저 storage에 저장하지 않는다.
- approval reviewer identity는 브라우저가 임의 입력하지 못하고 bridge가 서버에서
  stamp한다.
- live stream도 query token이 아니라 bearer-authenticated `fetch()` SSE로 붙는다.
- loopback CORS만 허용되므로 로컬 preview origin에서만 bridge 호출이 가능하다.

운영 의미:

- token은 세션 메모리용이다.
- 새로고침 후에는 token을 다시 넣어야 한다.
- reviewer audit trail은 브라우저 입력이 아니라 bridge launch identity를 따른다.

## 3. 사전 준비

필수:

- Python 사용 가능
- `pnpm` 사용 가능
- repo 루트가 `D:\Google\.Conitens`

권장 확인:

```powershell
python --version
pnpm --version
```

## 4. 가장 빠른 시작

터미널 1에서 bridge 실행:

```powershell
python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785 --reviewer local/<your-name>
```

예시:

```powershell
python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785 --reviewer local/eomshwan
```

실행되면 JSON이 출력된다:

```json
{
  "url": "http://127.0.0.1:8785/",
  "api_root": "http://127.0.0.1:8785/api",
  "token": "<paste-this-into-dashboard>",
  "reviewer_identity": "local/eomshwan"
}
```

터미널 2에서 dashboard preview 실행:

```powershell
pnpm --filter @conitens/dashboard preview --host 127.0.0.1 --port 4291
```

브라우저에서 열기:

```text
http://127.0.0.1:4291/
```

## 5. 화면 연결 절차

dashboard 상단 setup form에 아래를 입력한다.

- `API root`: bridge JSON의 `api_root`
- `Bearer token`: bridge JSON의 `token`

그 다음 `Connect`를 누른다.

정상 연결되면:

- 왼쪽 `Runs` 패널 state가 `ready`
- run이 있으면 목록 표시
- run이 없으면 `No forward runs yet.`

연결 실패 시 우선 확인:

- bridge가 실제로 떠 있는지
- `api_root` 포트가 맞는지
- token을 정확히 붙여 넣었는지
- browser와 bridge가 모두 `127.0.0.1` loopback에서 열렸는지

## 6. run 상세 사용 순서

run list에서 항목을 누르면 `#/runs/:id` 해시 라우트로 이동한다.

detail 화면에서 확인 가능한 영역:

- Detail hero
- Acceptance
- Replay
- Approvals
- Graph
- Insights
- State docs
- Context latest
- Room timeline

상세 조회 시 dashboard는 아래 데이터를 읽는다:

- `GET /api/runs/:id`
- `GET /api/runs/:id/replay`
- `GET /api/runs/:id/state-docs`
- `GET /api/runs/:id/context-latest`
- room 선택 후 `GET /api/rooms/:id/timeline`

## 7. approval center 사용법

approval center는 선택된 run에 종속된다.

사용 순서:

1. run detail 화면으로 들어간다.
2. `Approvals` 섹션에서 request를 고른다.
3. detail의 payload와 status를 확인한다.
4. `Reviewer note`를 입력한다.
5. 아래 중 하나를 수행한다.

가능한 액션:

- `Approve`
- `Reject`
- `Resume`

의미:

- `Approve`: decision만 기록
- `Reject`: rejection만 기록
- `Resume`: 이미 승인된 request를 build graph에 이어 붙임

주의:

- reviewer 이름을 UI에서 넣지 않는다. bridge launch identity가 자동 사용된다.
- `Resume`는 active `pending_approval_request_id`와 일치하는 request에만 허용된다.
- 즉, stale request를 잘못 resume하는 경로는 막혀 있다.

## 8. live update는 어떻게 동작하나

dashboard는 run detail 화면에서만 live stream을 연다.

현재 방식:

- `GET /api/events/stream?run_id=...&room_id=...`
- auth는 `Authorization: Bearer <token>`
- transport는 `fetch()` 기반 SSE

이벤트 처리 방식:

- `snapshot`이 오면 dashboard가 다시 read API들을 호출한다.
- browser가 자체 event source of truth가 되는 구조는 아니다.

실제 효과:

- replay가 새로고침됨
- room timeline이 새로고침됨
- approvals/state/context/detail도 다시 읽힘

room 선택 유지 규칙:

- 현재 선택한 room이 새 payload에도 있으면 그대로 유지
- 사라졌으면 첫 room으로 fallback

## 9. state docs / context latest 읽는 법

`State docs` 패널은 아래 네 문서를 projection으로 보여준다.

- `task_plan.md`
- `findings.md`
- `progress.md`
- `LATEST_CONTEXT.md`

`Context latest` 패널은 digest를 두 rail로 분리해 보여준다.

- runtime latest: `.conitens/context/LATEST_CONTEXT.md`
- repo latest: `.vibe/context/LATEST_CONTEXT.md`

운영상 의미:

- runtime digest와 repo digest를 섞어 해석하지 않는다.
- 현재 loop 상태와 repo intelligence는 별개다.

## 10. graph / insights / room timeline 보는 법

`Graph` 패널:

- run detail + replay + room timeline에서 파생된 읽기 전용 모델이다.
- sparse하면 textual fallback으로 내려간다.

`Insights` 패널:

- `replay.insights`
- `roomTimeline.insights`
- `findings.md`
- `validator_history`
  를 함께 보여준다.

`Room timeline` 패널:

- replay에서 추출한 room option 중 하나를 선택해 timeline을 본다.
- live snapshot이 와도 현재 room이 남아 있으면 유지된다.

## 11. 실제 현재 세션 확인 방법

이 문서를 읽는 시점에 이미 로컬 테스트 세션이 떠 있을 수 있다.

현재 세션 메타는 아래 artifact에 기록된다:

- [bridge-meta.json](D:/Google/.Conitens/.omx/artifacts/forward-live-session/bridge-meta.json)

PowerShell에서 빠르게 확인:

```powershell
Get-Content .omx/artifacts/forward-live-session/bridge-meta.json -Raw
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 4291,8791 }
```

이 파일에는 아래 정보가 있다:

- `url`
- `api_root`
- `token`
- `reviewer_identity`

## 12. 종료 방법

foreground로 실행했다면 각 터미널에서 `Ctrl+C`로 종료한다.

PID로 종료하려면:

```powershell
Stop-Process -Id <bridge-pid>,<dashboard-pid>
```

현재 세션 PID 확인:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 4291,8791 } |
  Select-Object LocalPort,OwningProcess
```

## 13. 문제 해결

### 13.1 dashboard는 열리는데 Connect가 안 된다

확인 순서:

```powershell
curl.exe -i http://127.0.0.1:8785/api/runs -H "Authorization: Bearer <token>"
```

정상이라면 `200`과 JSON이 와야 한다.

### 13.2 브라우저 콘솔에 CORS 에러가 보인다

확인:

```powershell
curl.exe -i -X OPTIONS http://127.0.0.1:8785/api/runs `
  -H "Origin: http://127.0.0.1:4291" `
  -H "Access-Control-Request-Method: GET" `
  -H "Access-Control-Request-Headers: authorization"
```

정상이라면:

- `204 No Content`
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Headers`

이 보여야 한다.

### 13.3 새로고침 후 연결이 끊긴다

정상 동작이다.

- API root는 저장됨
- bearer token은 저장되지 않음

즉 새로고침 후에는 token을 다시 넣어야 한다.

### 13.4 approval reviewer가 원하는 이름으로 안 찍힌다

의도된 동작이다.

reviewer는 dashboard 입력이 아니라 bridge launch 시 identity에서 정해진다.

다른 이름으로 찍고 싶으면 bridge를 그 identity로 다시 띄운다:

```powershell
python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785 --reviewer local/ops-lead
```

### 13.5 run list가 비어 있다

가능한 원인:

- 실제 forward run이 아직 없음
- 다른 workspace를 보고 있음
- bridge는 맞지만 `.conitens` state가 비어 있음

확인:

```powershell
python scripts/ensemble.py --workspace . forward status --format json
```

### 13.6 live 업데이트가 안 보인다

확인 순서:

- detail 화면에 들어가 있는지
- token이 유효한지
- bridge가 살아 있는지
- replay/room 대상 run이 실제로 변하는지

현재 구현은 snapshot 기반 새로고침이므로, 실제 run state 변화가 없으면 눈에 띄는
차이가 없을 수 있다.

## 14. 운영자가 기억해야 할 핵심

- 이 shell은 forward-only operator surface다.
- legacy runtime을 자동 대체하지 않는다.
- token은 세션 메모리용이다.
- reviewer identity는 bridge가 소유한다.
- live stream도 bearer header 기반이다.
- room 선택은 live refresh에서 유지된다.
- runtime digest와 repo digest는 별개로 본다.

## 15. 관련 문서

- [BE1A_API.md](D:/Google/.Conitens/docs/frontend/BE1A_API.md)
- [BE1B_API.md](D:/Google/.Conitens/docs/frontend/BE1B_API.md)
- [FE6_APPROVAL_CENTER.md](D:/Google/.Conitens/docs/frontend/FE6_APPROVAL_CENTER.md)
- [CONTROL_PLANE_DECISION.md](D:/Google/.Conitens/docs/frontend/CONTROL_PLANE_DECISION.md)
- [current-architecture-status-ko.md](D:/Google/.Conitens/docs/current-architecture-status-ko.md)
