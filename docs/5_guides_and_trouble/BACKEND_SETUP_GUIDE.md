# FastAPI 로컬 개발 환경 설정 가이드

이 문서에서는 `uv`(초고속 Python 패키지 매니저)를 사용하여 FastAPI 백엔드 서버를 로컬에서 실행하는 방법을 안내합니다.

## ✅ 필수 준비물
- Python 3.11 이상 설치 확인 (터미널에서 `python3 --version` 확인)
- uv 설치 확인 (터미널에서 `uv --version` 확인, 없으면 아래 0단계 참고)
- Supabase 프로젝트 생성 완료 (DB 스키마 `00.schema.sql` 실행 완료)
- OpenAI API Key 발급 완료

---

## 🛠️ 백엔드 실행 방법 순서대로 따라하기

### 0단계: uv 설치 (최초 1회)
[uv](https://docs.astral.sh/uv/)는 Rust로 만든 초고속 Python 패키지 매니저입니다. pip보다 10~100배 빠르며, 가상환경 관리를 자동으로 처리합니다.
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
> 설치 후 터미널을 재시작하고 `uv --version`으로 확인하세요.

### 1단계: 백엔드 폴더로 이동하기
터미널을 열고 터미널의 현재 위치(경로)를 백엔드 디렉토리로 맞춥니다.
```bash
cd backend
```

### 2단계: 패키지 설치하기
`pyproject.toml`에 명시된 의존성을 설치합니다. (최초 1회 또는 의존성 변경 시)
```bash
uv sync
```
> `uv sync`는 가상환경 생성 + 패키지 설치를 한번에 처리합니다.
> 별도로 `python3 -m venv venv`나 `source venv/bin/activate`를 할 필요가 없습니다!

### 3단계: 백엔드(.env) 환경변수 설정하기
`backend` 디렉토리에 `.env` 파일을 생성하거나 오픈한 뒤, 아래 항목들을 채워 넣습니다.

```env
# backend/.env

# ── Phase 1: 필수 ──
OPENAI_API_KEY=sk-본인의-실제-키를-입력하세요
SUPABASE_URL=https://본인프로젝트.supabase.co
SUPABASE_SERVICE_KEY=eyJ...서비스롤키...    # Supabase Dashboard > Settings > API > service_role key
FRONTEND_URL=http://localhost:1234

# ── Phase 2: LangSmith (추후 추가) ──
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=ls-...
# LANGCHAIN_PROJECT=synapse
```

> **SUPABASE_SERVICE_KEY 찾는 법:**
> Supabase Dashboard → Settings → API → Project API keys → `service_role` (secret) 값을 복사하세요.
> ⚠️ 이 키는 RLS를 우회하므로 **절대 프론트엔드에 노출하면 안 됩니다.**

### 4단계: 백엔드 서버 (FastAPI) 실행하기
```bash
uv run uvicorn app.main:app --reload
```
- `uv run`은 자동으로 가상환경을 활성화한 뒤 명령을 실행합니다.
- `--reload` 옵션은 코드 수정 시 서버를 자동 재시작합니다.
- 서버가 정상 작동하면 `http://127.0.0.1:8000` 에서 구동됩니다.
- `http://localhost:8000/docs` 에서 Swagger UI로 API를 테스트할 수 있습니다.

---

## 📦 패키지 관리 (uv 명령어)

| 작업 | 명령어 |
|:---|:---|
| 패키지 추가 | `uv add 패키지명` |
| 패키지 제거 | `uv remove 패키지명` |
| 의존성 동기화 | `uv sync` |
| 스크립트 실행 | `uv run 명령어` |
| Python 버전 고정 | `uv python pin 3.11` |

> `pyproject.toml`에 의존성이 자동 기록되고, `uv.lock` 파일로 정확한 버전이 고정됩니다.

---

## 📡 API 엔드포인트 목록

> 상세 구현은 [backend_implementation_plan.md](./backend_implementation_plan.md) 참조

### Phase 1-A: 벡터화 파이프라인

| Method | 경로 | 설명 |
|:---|:---|:---|
| POST | `/api/ai/vectorize` | 이미지 URL + 메타데이터를 받아 Vision 분석 → context_summary 생성 → 임베딩 벡터화 → Supabase 저장 |

### Phase 1-B: MCP 채팅 라우팅

| Method | 경로 | 설명 |
|:---|:---|:---|
| POST | `/api/ai/message` | 메인 피드 메시지 처리 (검색 / 스레드 오픈 / 일반 대화 분기) |
| POST | `/api/ai/thread` | 스레드 내 멀티턴 대화 처리 |

---

## 📂 프로젝트 구조

```
backend/
├── .env                          # 환경변수 (Git에 올라가지 않음)
├── pyproject.toml                # 프로젝트 설정 + 의존성 (uv 관리)
├── uv.lock                       # 의존성 Lock 파일 (정확한 버전 고정)
└── app/
    ├── main.py                   # FastAPI 앱 진입점
    ├── config.py                 # 환경변수, OpenAI/Supabase 클라이언트 설정
    ├── routers/
    │   └── memory.py             # API 엔드포인트 정의
    ├── schemas/
    │   └── memory.py             # Pydantic 요청/응답 모델
    └── services/
        ├── openai_service.py     # OpenAI API 호출 (Vision, Chat, Embedding)
        ├── supabase_service.py   # Supabase DB 연동 (벡터 저장, 검색)
        └── mcp_tools.py          # MCP 도구 정의 (search_memories 등)
```

---

## 💡 자주 묻는 질문 (FAQ)

- **Q. `uv`가 설치되지 않아요.**
  - **A.** `curl -LsSf https://astral.sh/uv/install.sh | sh` 실행 후 터미널을 재시작하세요. Mac이라면 `brew install uv`로도 가능합니다.

- **Q. `No module named 'fastapi'` 오류가 나요.**
  - **A.** `uv sync`를 먼저 실행했는지 확인하세요. `uv run` 없이 직접 `uvicorn`을 실행하면 가상환경 밖에서 실행되어 오류가 날 수 있습니다. 반드시 **`uv run uvicorn ...`** 형태로 실행해주세요.

- **Q. 기존처럼 `source venv/bin/activate` 해야 하나요?**
  - **A.** 아닙니다! `uv run` 명령어가 자동으로 가상환경을 관리합니다. 수동 활성화가 불필요합니다.

- **Q. IDE(VS Code/Cursor)에서 자동완성이 안 돼요.**
  - **A.** `Cmd + Shift + P` → `Python: Select Interpreter` → `backend/.venv/bin/python` 을 선택하세요.
