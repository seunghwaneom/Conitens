# CONITENS — 보안·윤리·저작권 검토 보고서

> **검토일**: 2026-02-02
> **버전**: 4.2.0
> **상태**: 검토 완료

---

## 📋 Executive Summary

| 카테고리 | 위험도 | 조치 필요 |
|----------|--------|----------|
| **npm 이름 충돌** | 🔴 높음 | 이름 변경 필요 |
| **상표권 (Claude/Gemini/Codex)** | 🟡 중간 | 문구 수정 필요 |
| **라이선스 호환성** | 🟢 낮음 | 명시 필요 |
| **보안 취약점** | 🟡 중간 | 문서화 필요 |
| **윤리적 이슈** | 🟢 낮음 | 투명성 유지 |

---

## 1. 저작권·상표권 이슈

### 1.1 npm 패키지명 충돌 🔴

**현황:**
- `ensemble`은 이미 npm에 존재 (2015년, 마지막 업데이트 10년 전)
- `@ensemble-ai/sdk`도 존재 (활발한 프로젝트, 2026년 최근 업데이트)

**위험:**
- npm publish 시 이름 충돌로 실패
- 기존 사용자와의 혼란

**권장 대안:**

| 옵션 | 패키지명 | 장점 | 단점 |
|------|----------|------|------|
| A | `@seunghwan/ensemble` | 소유권 명확 | scope 필요 |
| B | `ensemble-orchestrator` | 직관적 | 길이 |
| C | `ensemble-swarm` | 브랜딩 연결 | swarm 혼동 |
| D | `ai-ensemble` | 간결 | 중복 검사 필요 |

**권장: 옵션 A (`@seunghwan/ensemble`)** — npm scope로 소유권 명확화

### 1.2 AI 서비스 상표 사용 🟡

**현황:**
| 상표 | 소유자 | 사용 맥락 | 위험도 |
|------|--------|----------|--------|
| Claude | Anthropic PBC | 도구 연동 설명 | 중간 |
| Gemini | Google LLC | 도구 연동 설명 | 중간 |
| Codex | OpenAI | 도구 연동 설명 | 중간 |
| Antigravity | ? | IDE 이름 | 낮음 |

**문제점:**
- "Claude Code", "Gemini", "Codex"를 마치 CONITENS의 일부처럼 표현
- 공식 파트너십이 아님에도 통합을 강조

**권장 조치:**
1. **면책 조항 추가** (README.md, CONITENS.md):
   ```markdown
   ## Trademark Notice
   
   - "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
   - "Gemini" is a trademark of Google LLC.
   - "Codex" is associated with OpenAI.
   - "CONITENS" is an independent project and is not affiliated with, 
     endorsed by, or sponsored by any of these companies.
   ```

2. **표현 수정:**
   - ❌ "Conitens orchestrates Claude, Gemini, and Codex"
   - ✅ "Conitens coordinates workflows across AI coding assistants including Claude Code, Gemini-based tools, and Codex-compatible extensions"

### 1.3 라이선스 호환성 🟢

**CONITENS 라이선스: MIT**

| 의존성/참조 | 라이선스 | 호환성 |
|------------|----------|--------|
| Python stdlib | PSF | ✅ |
| Node.js | MIT | ✅ |
| vibe-kit 컨셉 | 참조만 | ✅ (원본 출처 명시) |
| Claude Code | Proprietary | ⚠️ 래핑만 가능 |

**주의사항:**
- Claude Code 자체를 재배포하면 안 됨
- CONITENS은 Claude Code를 "호출"만 함 (OK)
- vibe-kit 영감을 받았다면 README에 명시 권장

**권장 추가 문구:**
```markdown
## Acknowledgments

- Inspired by [vibe-kit](링크) concepts for context management
- Uses AI assistants as external tools (not embedded)
```

### 1.4 AI 생성 코드 저작권 🟡

**현황:**
- CONITENS이 AI 에이전트를 조율하여 코드 생성
- AI 생성 코드의 저작권은 법적으로 모호

**Anthropic Consumer Terms (2024):**
> "Subject to this Section, we authorize you to use the Outputs for the Permitted Use."
> Permitted Use = non-commercial, internal applications

**권장 조치:**
1. **README에 고지:**
   ```markdown
   ## Disclaimer: AI-Generated Content
   
   Code generated through AI assistants coordinated by CONITENS may have 
   uncertain copyright status. Users are responsible for:
   - Reviewing and modifying AI-generated code
   - Ensuring compliance with respective AI service terms
   - Adding substantial human contribution before claiming ownership
   ```

2. **USAGE_GUIDE에 상세 설명 추가**

---

## 2. 보안 취약점 분석

### 2.1 파일 시스템 접근 🟡

**현황:**
```python
WORKSPACE = os.environ.get("CONITENS_WORKSPACE", os.getcwd())
```

**위험:**
- WORKSPACE 외부 경로 접근 가능성
- Symlink를 통한 탈출 가능

**현재 보호:**
- `WORKSPACE_POLICY.json`의 `write_roots` 제한
- 파일 잠금 시스템

**권장 강화:**
```python
# 추가 검증 (미구현)
def validate_path(path):
    """Ensure path is within workspace and not a symlink escape."""
    real_path = os.path.realpath(path)
    workspace_real = os.path.realpath(WORKSPACE)
    if not real_path.startswith(workspace_real):
        raise SecurityError(f"Path escape attempt: {path}")
```

**문서화 필요:**
- SECURITY.md에 알려진 제한사항 명시

### 2.2 명령어 인젝션 🟡

**현황:**
```python
subprocess.run(["git", "add", ...], cwd=WORKSPACE)
```

**분석:**
- ✅ 배열 형태로 전달 (shell=False) — 기본 안전
- ⚠️ 사용자 입력이 직접 들어가는 경우 검증 필요

**위험 코드 패턴:**
```python
# 위험: 사용자 입력이 직접 들어감
args.file  # --file 인자
args.title  # --title 인자
```

**권장:**
```python
# 파일명 검증
import re
def sanitize_filename(name):
    """Remove potentially dangerous characters."""
    return re.sub(r'[^\w\-.]', '_', name)
```

### 2.3 인증 시스템 약점 🟡

**현황:**
```python
def is_owner():
    owner_file = Path(WORKSPACE) / ".notes" / "OWNER.json"
    # 파일 기반 인증
```

**위험:**
- 누구나 OWNER.json 수정 가능 (물리적 접근 시)
- 이메일 기반 검증 없음

**설계 의도:**
- 로컬 개발 도구이므로 물리적 보안은 사용자 책임
- 협업 시나리오에서는 Git 권한에 의존

**문서화 필요:**
- "OWNER 시스템은 편의 기능이며 보안 메커니즘이 아님" 명시

### 2.4 민감 정보 노출 🟢

**현황:**
```python
# 홈 디렉토리 마스킹
path_masked = path.replace(os.path.expanduser("~"), "~")
```

**분석:**
- ✅ 로그에 전체 경로 노출 방지
- ✅ 모든 데이터는 로컬 저장 (외부 전송 없음)
- ✅ API 키 등 저장 안 함

---

## 3. 윤리적 고려사항

### 3.1 AI 사용 투명성 🟢

**현황:**
- AI 에이전트가 코드를 생성/수정함이 명확
- task.md에 agent 기록
- Journal에 작업 이력 보존

**권장 강화:**
- 생성된 코드 파일에 주석 추가 옵션
  ```python
  # Generated with assistance from AI (CONITENS v4.2.0)
  ```

### 3.2 자동화 책임 소재 🟡

**위험:**
- AI가 잘못된 코드 생성 시 책임 불명확
- 자동 승인 모드에서 의도치 않은 변경

**현재 보호:**
- 3-tier 승인 시스템 (AUTO/GUARD/ASK)
- Mandatory verify before close
- Hash audit trail

**권장 추가:**
1. README에 책임 고지:
   ```markdown
   ## Responsibility
   
   CONITENS is a coordination tool. All code changes should be reviewed 
   by humans before deployment. The project maintainers are not responsible 
   for damages caused by AI-generated code.
   ```

### 3.3 데이터 프라이버시 🟢

**현황:**
- 모든 데이터 로컬 저장 (.notes/, .vibe/)
- 외부 서버 통신 없음 (AI 서비스 제외)
- AI 서비스 통신은 해당 서비스 TOS 적용

**분석:**
- CONITENS 자체는 데이터를 수집하지 않음
- AI 서비스 사용 시 해당 서비스의 데이터 정책 적용

---

## 4. 권장 조치 요약

### 즉시 조치 (Release Blocker)

| # | 항목 | 조치 |
|---|------|------|
| 1 | npm 이름 | `@seunghwan/ensemble`로 변경 |
| 2 | 상표 면책 | README.md에 Trademark Notice 추가 |
| 3 | AI 책임 고지 | README.md에 Responsibility 섹션 추가 |

### 권장 조치 (Next Version)

| # | 항목 | 조치 |
|---|------|------|
| 4 | 경로 검증 | symlink 탈출 방지 로직 |
| 5 | 입력 검증 | 파일명/경로 sanitization 강화 |
| 6 | vibe-kit 명시 | Acknowledgments에 영감 출처 추가 |

### 문서화 필요

| 문서 | 추가 내용 |
|------|----------|
| SECURITY.md | 알려진 제한사항, 보안 경계 |
| README.md | Trademark, Responsibility, AI Disclaimer |
| USAGE_GUIDE.md | AI 생성 코드 저작권 안내 |

---

## 5. 결론

CONITENS v4.2.0은 **로컬 개발 도구**로서 기본적인 보안/윤리 기준을 충족합니다. 
GitHub 공개 전 **npm 이름 변경**과 **상표/책임 면책 조항 추가**가 필수입니다.

**최종 위험 평가: 🟡 중간 (조치 후 🟢 낮음으로 전환 가능)**

---

*이 문서는 법률 자문이 아닙니다. 상업적 사용 전 전문가 검토를 권장합니다.*
