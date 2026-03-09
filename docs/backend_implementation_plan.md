# Backend 구현 계획

DB 스키마 설정이 완료되었으므로, FastAPI 백엔드를 새로운 아키텍처에 맞게 개편합니다.

## 기술 스택 (Tech Stack)

| 영역 | 기술 | 용도 | 도입 시점 |
|:---|:---|:---|:---|
| **Backend Framework** | FastAPI (Python 3.11+) | REST API 서버, 비동기 처리 | Phase 1 |
| **AI / LLM** | OpenAI GPT-4o | Vision API (사진 분석, vision_tags 추출) | Phase 1 |
| | OpenAI GPT-4o-mini | 채팅 응답, context_summary 생성, MCP 의도 판별 | Phase 1 |
| | OpenAI text-embedding-3-small | 텍스트 → 1536차원 벡터 변환 (임베딩) | Phase 1 |
| **Database** | Supabase (PostgreSQL) | 사용자, 세션, 메시지, 미디어 파일 저장 | Phase 1 |
| | pgvector (PostgreSQL 익스텐션) | 벡터 유사도 검색 (코사인 거리 기반 RAG) | Phase 1 |
| **Storage** | Supabase Storage | 이미지 파일 저장 및 Public URL 제공 | Phase 1 |
| **인증** | Supabase Auth | 사용자 인증 (현재 익명 로그인) | Phase 1 |
| **AI 라우팅** | OpenAI Function Calling (Tool Use) | 의도 판별 (`search_memories`, `continue_in_thread`) | Phase 1 |
| **관찰성(Observability)** | LangSmith | LLM 호출 추적, 토큰/비용/지연 모니터링 | Phase 2 |
| **AI 프레임워크** | LangChain + LangChain-OpenAI | RAG 체인, Agent, VectorStore 추상화로 리팩토링 | Phase 3 |
| **프론트엔드** | Vanilla JS (SPA) | 메인 피드 + 스레드 UI | Phase 1 이후 |
| **배포 (예정)** | Vercel (프론트) + GCP Cloud Run (백엔드) | 1차 마일스톤: 웹 데모 배포 | Phase 1 이후 |

### Python 패키지 (Phase별 도입)

| 패키지 | 용도 | Phase |
|:---|:---|:---|
| `fastapi` 0.115.x | 웹 프레임워크 | 1 |
| `uvicorn` 0.34.x | ASGI 서버 | 1 |
| `openai` ≥1.0.0 | OpenAI API 클라이언트 (Chat, Vision, Embedding) | 1 |
| `supabase` ≥2.0.0 | Supabase Python 클라이언트 (DB 연동) | 1 |
| `pydantic` 2.x | 요청/응답 데이터 검증 | 1 |
| `python-dotenv` 1.x | 환경변수 로딩 | 1 |
| `langsmith` | `@traceable` 데코레이터로 LLM 호출 추적 | 2 |
| `langchain`, `langchain-openai`, `langchain-community` | RAG 체인, Agent, SupabaseVectorStore | 3 |

---

## 점진적 도입 로드맵

```
Phase 1: OpenAI SDK 직접 구현 ← 지금 할 것
  ├─ 벡터화 파이프라인 (사진 → vision_tags → context_summary → embedding)
  ├─ MCP 라우팅 (Tool Calling으로 검색/스레드/일반대화 분기)
  └─ Postman/Swagger로 독립 검증

Phase 2: LangSmith 도입 (관찰성 확보)
  ├─ langsmith SDK 설치
  ├─ 각 서비스 함수에 @traceable 데코레이터 추가
  └─ LangSmith 대시보드에서 전체 LLM 파이프라인 모니터링

Phase 3: LangChain 점진적 마이그레이션
  ├─ OpenAIEmbeddings + SupabaseVectorStore로 벡터 저장/검색 교체
  ├─ create_tool_calling_agent()로 MCP 라우팅 교체
  └─ LangSmith 자동 추적으로 전환 (@traceable 제거)
```

> Phase 1에서 서비스 함수를 잘 분리해 두면, Phase 3에서 **함수 내부만 교체**하면 되므로 라우터/스키마는 수정 불필요.

---

## 현재 백엔드 구조 (AS-IS)

```
backend/app/
├── config.py              # OpenAI 클라이언트, 환경변수
├── main.py                # FastAPI 앱 진입점
├── schemas/ai.py          # Pydantic 모델 (ImageAnalysisRequest, ChatRequest 등)
├── routers/ai.py          # 2개 엔드포인트 (/analyze-image, /chat)
└── services/openai_service.py  # analyze_image(), generate_chat_response()
```

---

## Phase 1-A: 벡터화 파이프라인 (사진 업로드 → 조용히 저장)

사진이 업로드되면 Vision 분석 + 요약문 생성 + 임베딩 변환 → Supabase 저장까지 수행합니다.

### 변경 파일 목록

| 파일 | 변경 내용 |
|:---|:---|
| **[NEW] `services/supabase_service.py`** | Supabase Python 클라이언트 연동 (media_files UPDATE, match_memories RPC 호출) |
| **[MODIFY] `services/openai_service.py`** | `analyze_and_vectorize()` 함수 신설: Vision 태깅 → context_summary 생성 → 임베딩 변환 |
| **[MODIFY] `schemas/ai.py`** | 벡터화 요청/응답 Pydantic 모델 추가 |
| **[MODIFY] `routers/ai.py`** | `/api/ai/analyze-image` 엔드포인트를 벡터화 파이프라인으로 개편 |
| **[MODIFY] `config.py`** | Supabase URL/Key 환경변수 추가, 임베딩 모델명 변경 |
| **[MODIFY] `requirements.txt`** | `supabase` 패키지 추가 |

### 상세 구현 내용

#### 1. `config.py` — 환경변수 추가
```python
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # service_role 키 사용
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"  # ada-002에서 변경
```

#### 2. `services/supabase_service.py` — [NEW] Supabase 연동
```python
update_media_vectorization(media_id, vision_tags, context_summary, embedding)
  → media_files 테이블의 vision_tags, context_summary, embedding 컬럼 UPDATE

search_memories(query_embedding, user_id, threshold=0.3, count=5)
  → match_memories RPC 호출 → 유사한 사진 목록 반환
```

#### 3. `services/openai_service.py` — 벡터화 핵심 로직
```python
extract_vision_tags(image_url)
  → GPT-4o Vision에 이미지를 넣고 { objects, peopleCount, dominantColors } JSON 추출

generate_context_summary(metadata, vision_tags)
  → metadata + vision_tags를 종합하여 자연어 요약문(String) 생성

create_embedding(text)
  → text-embedding-3-small 모델로 1536차원 벡터 반환

analyze_and_vectorize(image_url, metadata, media_file_id)
  → 위 3개 함수를 순차 호출한 뒤, supabase_service.update_media_vectorization() 실행
```

#### 4. `routers/ai.py` — 엔드포인트 개편
```
기존: POST /api/ai/analyze-image  → AI 질문 생성 후 프론트에 반환
변경: POST /api/ai/analyze-image  → 벡터화 파이프라인 실행 후 성공 여부만 반환
```

---

## Phase 1-B: MCP 채팅 라우팅 (메인 피드 + 스레드)

사용자 텍스트 입력을 OpenAI Function Calling(Tool Use)으로 분기합니다.

### 변경 파일 목록

| 파일 | 변경 내용 |
|:---|:---|
| **[NEW] `services/mcp_tools.py`** | `search_memories`, `continue_in_thread` 도구 정의 (OpenAI Function Calling 스펙) |
| **[MODIFY] `services/openai_service.py`** | `route_message()` 함수 신설: Tool Calling으로 의도 판별 후 적절한 응답 생성 |
| **[MODIFY] `schemas/ai.py`** | 메인 피드 메시지 요청/응답, 스레드 요청/응답 Pydantic 모델 추가 |
| **[MODIFY] `routers/ai.py`** | `/api/ai/message` (메인 피드용), `/api/ai/thread` (스레드용) 엔드포인트 신설 |

### 상세 구현 내용

#### 1. `services/mcp_tools.py` — MCP 도구 정의
```python
TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "search_memories",
      "description": "사용자의 과거 사진/추억을 의미 기반으로 검색합니다",
      "parameters": { "query": str }
    }
  },
  {
    "type": "function", 
    "function": {
      "name": "continue_in_thread",
      "description": "직전 대화와 이어지는 후속 질문을 스레드로 분기합니다",
      "parameters": { "parent_message_id": str }
    }
  }
]
```

#### 2. `/api/ai/message` — 메인 피드 라우터
```
요청: { message, user_id, recent_context(직전 2개 메시지) }
처리: LLM + Tool Calling → 분기
응답 A (검색): { action: "search", results: [...사진 카드들] }
응답 B (스레드): { action: "open_thread", parent_id: "...", response: "..." }
응답 C (일반): { action: "chat", response: "안녕하세요!" }
```

#### 3. `/api/ai/thread` — 스레드 라우터
```
요청: { message, parent_message_id, thread_history }
처리: 부모 메시지의 media 컨텍스트 + 스레드 히스토리 → LLM
응답: { response: "그날 날씨는 맑았어요..." }
```

---

## 실행 순서

1. **Phase 1-A** (벡터화 파이프라인) → Postman/Swagger로 벡터 저장 검증
2. **Phase 1-B** (MCP 라우팅) → 저장된 벡터 기반 검색 + 스레드 동작 검증
3. **Phase 2** (LangSmith) → `@traceable` 데코레이터 추가, 모니터링 대시보드 확인
4. **Phase 3** (LangChain) → 서비스 함수 내부를 LangChain 추상화로 교체

## 필요한 환경변수 (.env)

```
# Phase 1
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...    # Dashboard > Settings > API > service_role key

# Phase 2 (추후 추가)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
LANGCHAIN_PROJECT=synapse
```
