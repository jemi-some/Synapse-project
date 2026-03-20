# Project Synapse(가제) - 멀티모달 RAG 기반 개인 지식 에이전트

> **당신의 흩어진 순간들을 하나의 맥락으로 이어줍니다.** - RAG와 AI Agent 기반 개인 기억 및 지식 통합 플랫폼


[![Tech Stack](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat&logo=openai&logoColor=white)](https://openai.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

---

## 프로젝트 소개

**RAG(Retrieval-Augmented Generation)** 기술을 활용하여 흩어져 있는 사용자의 사진과 기록을 지능적으로 검색하고, **AI Agent**와 대화하며 자신을 되돌아볼 수 있는 시스템입니다.
단순한 메모 보관함을 넘어, **당신의 맥락(Context)을 이해하고 파편화된 정보들 사이에서 의미 있는 연결을 만들어내는 개인 지식 에이전트**를 지향합니다.

### 핵심 가치

- **멀티모달 RAG**: 이미지(Vision API)와 텍스트를 통합 검색
- **자연어 검색**: "바다에서 찍은 사진 보여줘" → 관련 사진/메모 자동 검색
- **대화형 인터페이스**: 검색 결과를 기반으로 AI와 자연스러운 대화
- **지능형 라우팅**: MCP Tool Calling으로 사용자 의도 자동 분류
- **경험의 확장성**: 사진/메모를 넘어 영화, 책, 음악 등 개인의 모든 경험과 지식을 연결할 수 있는 구조

---

## 핵심 기획 및 설계 문서

- [프로젝트 기획안 (PRD)](docs/1_planning/Project_Planning_Document.md): 문제 정의부터 RAG/Tool Calling을 통한 해결 등
- [Database Schema Design](docs/2_architecture/Database_Schema_Design.md): pgvector 기반 벡터 DB 튜닝(HNSW), JSONB 상태 복원, 스레딩 테이블 설계도 (ERD 포함)
- [Backend API Specification](docs/2_architecture/Backend_API_Specification.md): 멀티모달 RAG 파이프라인 및 MCP Tool Calling API 명세, Context Window 최적화 분석
- [Features 딥다이브 문서](docs/3_features): RAG, 검색 라우팅, 스레드 대화 등 개별 기능의 기술적 해결 과정

---

## 데모

### 주요 기능 시연

**1. 이미지 업로드 → 자동 분석 및 벡터화**
- Vision API로 이미지 내용 분석
- EXIF 메타데이터 추출 (GPS, 촬영 시간, 카메라 정보)
- 자동 context 생성 및 임베딩 벡터 저장

**2. 자연어 검색**
```
사용자: "제주도에서 찍은 사진 찾아줘"
AI: "여기 제주도에서 촬영한 사진들이에요. 2023년 7월에 찍으셨네요."
    [관련 사진 3장 표시]
```

**3. 대화형 메모 저장**
```
사용자: "오늘 기분이 우울했어"
AI: "기록했습니다. 어떤 일이 있었는지 더 이야기해볼까요?"
```

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vanilla JS)                │
│  ┌───────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │ ChatInput │ │ ChatBubbles │ │ ThreadPanel │ │ Library │  │
│  └───────────┘ └─────────────┘ └─────────────┘ └─────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API
┌────────────────────────────┴────────────────────────────────┐
│                   Backend (FastAPI + Python)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        Agent Router (OpenAI Tool Calling)            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐   │   │
│  │  │search_memories│ │  save_memo   │  │   chat    │   │   │
│  │  └──────────────┘  └──────────────┘  └───────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Vectorization Pipeline                     │   │
│  │  Vision API → Context Gen → Embedding (1536-dim)     │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│              Supabase (PostgreSQL + pgvector)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  memories    │  │chat_messages │  │chat_sessions │       │
│  │(embedding 🔍)│  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
│  match_memories(query_embedding) → Cosine Similarity Search │
└─────────────────────────────────────────────────────────────┘
```

> 📌 상세 아키텍처는 [docs/architecture.md](./docs/architecture.md)에서 확인하세요.

### 주요 컴포넌트

**Frontend Layer**
- Vanilla JS SPA (커스텀 컴포넌트 시스템)
- ChatInput, ChatBubbles, ThreadPanel, Library 컴포넌트
- Parcel 2 번들러

**Backend Layer**
- FastAPI 비동기 REST API
- Agent Tool Calling Router (OpenAI)
- Vectorization Pipeline (Vision → Context → Embedding)

**Database Layer**
- PostgreSQL + pgvector (벡터 검색)
- Supabase (Auth + Storage + Realtime)
- match_memories() 함수 (코사인 유사도)

---

## 핵심 기술 스택

### Backend (Python)
| 기술 | 역할 | 핵심 구현 내용 |
|------|------|------|
| **FastAPI** | REST API 서버 | 비동기 처리, Pydantic을 활용한 데이터 검증 |
| **OpenAI GPT-4o** | Vision API (멀티모달) | 이미지 분석 및 상세 메타데이터(vision_tags) 추출 |
| **OpenAI GPT-4o-mini** | LLM 기반 Agent | 사용자 의도 파악, Tool Calling 라우팅 로직 처리 |
| **text-embedding-3-small** | Embedding | 1536차원 벡터 생성 |
| **pgvector** | Vector Search | 코사인 유사도 기반 검색 |
| **Supabase Python SDK** | DB 연동 | PostgreSQL + Auth + Storage |

### Frontend (JavaScript)
| 기술 | 역할 | 핵심 구현 내용 |
|------|------|------|
| **Vanilla JS** | 클라이언트 사이드 렌더링 | SPA 아키텍처 및 커스텀 컴포넌트/라우터 구현 |
| **Parcel 2** | 모듈 번들러 | 빠르고 최적화된 빌드 및 개발 환경 구축 |
| **exifr** | 메타데이터 파서 | 이미지 파일 내장 메타데이터(GPS, 시간 등) 정보 추출 |
| **browser-image-compression** | 클라이언트 리소스 최적화 | 이미지 업로드 전 클라이언트 단에서 이미지 압축 |

### Database
```sql
-- 핵심 테이블 구조
memories (
  id UUID,
  file_url TEXT,                    -- 이미지 URL
  vision_tags JSONB,                -- Vision API 분석 결과
  context_summary TEXT,             -- AI 생성 요약
  embedding vector(1536),           -- 검색용 벡터
  metadata JSONB                    -- EXIF (GPS, 시간 등)
)

-- Vector Search Function
match_memories(query_embedding, match_threshold, match_count, filter_user_id)
RETURNS TABLE (id, file_url, context_summary, similarity)
```

---

## 핵심 구현 기술

### 1. 멀티모달 RAG 파이프라인

**이미지 벡터화 플로우**
```python
# backend/app/services/openai_service.py

async def analyze_and_vectorize(image_url: str, metadata: dict, memory_id: str):
    # 1. Vision API로 이미지 메타데이터 및 태그 추출
    vision_tags = await analyze_image_with_vision(image_url, metadata)

    # 2. Context-aware 자연어 요약문 생성 (검색 성능 향상 목적)
    context_summary = await generate_context_summary(vision_tags, metadata)

    # 3. 요약문을 1536차원 임베딩 벡터로 변환 (text-embedding-3-small)
    embedding = await create_embedding(context_summary)

    # 4. Supabase DB에 메타데이터 및 벡터 저장
    await update_memory_vectorization(memory_id, vision_tags, context_summary, embedding)
```

**벡터 유사도 검색 플로우**
```python
async def search_memories(query: str, user_id: str):
    # 1. 사용자 검색어를 벡터 차원으로 변환
    query_embedding = await create_embedding(query)

    # 2. pgvector로 코사인 유사도 검색
    results = await supabase.rpc('match_memories', {
        'query_embedding': query_embedding,
        'match_threshold': 0.7,
        'match_count': 10,
        'filter_user_id': user_id
    })

    # 3. 사진/메모 분류하여 반환
    return classify_results(results)
```

### 2. LLM Tool Calling (AI Agent Routing)

**사용자 의도 자동 분류 및 도구 호출**
```python
# backend/app/services/mcp_tools.py

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_memories",
            "description": "사용자의 과거 기억(사진, 메모)을 검색합니다.",
            "parameters": {...}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_memo",
            "description": "사용자의 텍스트를 메모로 저장합니다.",
            "parameters": {...}
        }
    }
]

# backend/app/services/openai_service.py

async def route_message(message: str, user_id: str, session_id: str):
    # 1st Turn: LLM이 사용자 의도를 파악하여 적절한 도구(Tool) 선택
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": ROUTING_SYSTEM_PROMPT},
            {"role": "user", "content": message}
        ],
        tools=TOOLS,
        tool_choice="auto"
    )

    # 2nd Turn: 도구 실행 결과를 LLM 컨텍스트에 주입하여 최종 응답 생성
    if response.tool_calls:
        for tool_call in response.tool_calls:
            if tool_call.function.name == "search_memories":
                result = await _execute_search_memories(...)
            elif tool_call.function.name == "save_memo":
                result = await _execute_save_memo(...)
            # ... 추가 도구 처리 로직

        final_response = openai_client.chat.completions.create(...)

    return final_response
```

### 3. 무한 스크롤 기반 UI 최적화

**Cursor 기반 페이지네이션 쿼리**
```javascript
// frontend/src/services/supabase.js

export const getMessages = async (sessionId, options = {}) => {
  const { cursor = null, limit = 50, ascending = true } = options

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_session_id', sessionId)
    .order('created_at', { ascending })
    .limit(limit + 1)  // 다음 페이지 존재 여부 확인을 위해 +1개 조회

  if (cursor) {
    query = query.lt('created_at', cursor)  // cursor 이전 메시지만
  }

  const { data, error } = await query
  const hasMore = data && data.length > limit

  return {
    data: hasMore ? data.slice(0, limit) : data,
    error,
    hasMore
  }
}
```

### 4. 구조화된 검색 결과 Persistence 유지

**action_data 연동형 메시지 저장 플로우**
```javascript
// frontend/src/components/ChatInput.js

// 1. 순수 텍스트 기반의 AI 응답 우선 저장
await addMessage(sessionId, responseData.response, 'text', 'assistant')

// 2. 검색에 의해 도출된 부가 데이터(이미지/메모 객체)를 action_data 구조체로 DB에 별도 저장
// 이를 통해 페이지 새로고침 시에도 동일한 검색 결과 UI 복원 가능
if (responseData.actions && responseData.actions.length > 0) {
  for (const action of responseData.actions) {
    await addMessage(
      sessionId,
      '',  // content는 빈 문자열
      'text',
      'assistant',
      action  // action_data JSONB 필드에 저장
    )
  }
}
```

### 5. 컴포넌트 간 독립적 상태 관리 (Context Thread)

**ThreadPanel을 통한 서브 대화 세션 분리**
```javascript
// frontend/src/components/ThreadPanel.js

export class ThreadPanel extends Component {
  async loadThreadMessages() {
    // 1. '대화 이야기 나누기' 선택 시, 부모 세션(Primary)과 논리적으로 분리된 
    //    신규 Thread 세션(Secondary) 컨텍스트 생성 및 데이터 로딩
    const { data } = await getMessages(this.state.threadSessionId);
    this.setState({ messages: data });
  }
  // ... 렌더링 로직 (상위 ChatBubbles 컴포넌트의 상태를 침범하지 않고 독립적으로 동작)
}
```

---

## 프로젝트 구조

```
Project_Synapse/
├── backend/                   # FastAPI 기반 백엔드 서버
│   ├── app/
│   │   ├── main.py            # 앱 진입점 및 CORS/미들웨어 설정
│   │   ├── config.py          # 환경변수 검증 및 외부 API 클라이언트 초기화
│   │   ├── routers/           # /vectorize, /message, /thread 등 라우터 계층
│   │   ├── services/          # 비즈니스 로직 (Vision, Embedding, Agent Tool Calling)
│   │   └── schemas/           # Pydantic 기반 Request/Response 데이터 검증 모델
│   └── requirements.txt
│
├── frontend/                  # Vanilla JS 기반 SPA 프론트엔드
│   ├── src/
│   │   ├── components/        # ChatInput, ChatBubbles, Sidebar, ThreadPanel 등 UI 컴포넌트
│   │   ├── services/          # Supabase DB 연동 및 엔드포인트 통신 모듈
│   │   ├── core/              # 커스텀 프레임워크 (Component, Router)
│   │   └── main.css           # 글로벌 및 컴포넌트 스타일링
│   ├── index.html             # 애플리케이션 진입점
│   └── package.json           # 프로젝트 의존성 및 스크립트 설정
│
├── docs/                      # 프로젝트 기술 문서 및 에셋
│   └── *.sql                  # Supabase 초기화용 SQL 마이그레이션 파일
│
└── README.md                  # 프로젝트 개요
```

---

## References

- [OpenAI API](https://openai.com/api/): GPT-4o 멀티모달 추론 및 Embedding 모델
- [Supabase](https://supabase.com/): 확장성 높은 PostgreSQL 및 pgvector 통합 환경
- [FastAPI](https://fastapi.tiangolo.com/): 고성능 비동기 Python 웹 프레임워크
- [exifr](https://github.com/MikeKovarik/exifr): 빠르고 신뢰성 높은 브라우저 기반 EXIF 파서

---

