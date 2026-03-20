# Backend API Specification - Project Synapse

> **FastAPI 기반 멀티모달 RAG 백엔드 API 명세서**

---

## 목차

1. [개요](#-개요)
2. [API 엔드포인트 목록](#-api-엔드포인트-목록)
3. [공통 사항](#-공통-사항)
4. [API 상세 명세](#-api-상세-명세)
5. [에러 처리](#-에러-처리)
6. [인증 및 보안](#-인증-및-보안)
7. [성능 지표](#-성능-지표)
8. [예시 시나리오](#-예시-시나리오)

---

## 개요

### 기본 정보

```yaml
Base URL: http://localhost:8000 (개발), https://api.synapse.com (프로덕션)
Framework: FastAPI 0.109+
Python Version: 3.11+
API Prefix: /api/ai
Content-Type: application/json
```

### API 설계 원칙

- **RESTful 설계**: HTTP 메서드와 URL 구조가 리소스 중심
- **비동기 처리**: 모든 엔드포인트가 `async/await` 지원
- **타입 안전성**: Pydantic 모델로 요청/응답 검증
- **명확한 에러**: HTTPException으로 일관된 에러 응답
- **로깅**: 모든 요청/응답 로깅 (디버깅 용이)

---

## API 엔드포인트 목록

| Method | Endpoint | 설명 | Feature |
|--------|----------|------|---------|
| POST | `/api/ai/vectorize` | 사진 벡터화 파이프라인 | Feature 1 |
| POST | `/api/ai/message` | MCP 채팅 라우팅 (검색/저장/대화) | Feature 2 |
| POST | `/api/ai/thread` | 스레드 멀티턴 대화 | Feature 3 |

---

## 공통 사항

### Request Headers

```http
Content-Type: application/json
Authorization: Bearer <supabase_access_token>  # Supabase Auth JWT
```

### Response Format

**성공 응답**:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-03-19T10:00:00Z"
}
```

**에러 응답**:
```json
{
  "detail": "에러 메시지",
  "status_code": 500,
  "timestamp": "2026-03-19T10:00:00Z"
}
```

### HTTP Status Codes

| Code | 의미 | 사용 예시 |
|------|------|----------|
| 200 | OK | 정상 처리 완료 |
| 400 | Bad Request | 잘못된 요청 파라미터 |
| 401 | Unauthorized | 인증 실패 |
| 403 | Forbidden | 권한 없음 |
| 404 | Not Found | 리소스 없음 |
| 500 | Internal Server Error | 서버 내부 에러 |

---

## API 상세 명세

## 1. POST `/api/ai/vectorize`

**목적**: 사진을 벡터화하여 검색 가능한 지식 베이스로 변환

**Feature**: Multimodal RAG Pipeline (Feature 1)

**프로세스**:
```
1. Vision API로 이미지 분석
2. EXIF + Vision 결과 + 사용자 텍스트 → 자연어 요약
3. 요약문을 1536차원 벡터로 변환
4. DB에 저장
```

---

### Request

**HTTP Method**: `POST`

**URL**: `/api/ai/vectorize`

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Body** (JSON):
```json
{
  "imageUrl": "https://supabase.co/storage/v1/object/public/photos/user123/photo1.jpg",
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "metadata": {
    "derived": {
      "latitude": 35.1796,
      "longitude": 129.0756
    },
    "location": {
      "hasLocation": true,
      "shortAddress": "부산 해운대구",
      "poi": "해운대 해수욕장"
    },
    "captureTime": {
      "year": 2023,
      "month": 12,
      "day": 25,
      "hour": 14,
      "minute": 30
    },
    "environment": {
      "weather": "맑음",
      "temperature": "10°C"
    }
  },
  "userText": "바다 너무 좋아!"
}
```

**Request Schema** (Pydantic):
```python
class VectorizeRequest(BaseModel):
    imageUrl: str                          # Supabase Storage Public URL
    memoryId: str                          # memories 테이블 UUID
    metadata: Optional[dict] = None        # EXIF 메타데이터
    userText: Optional[str] = None         # 사용자 입력 텍스트
```

---

### Response

**HTTP Status**: `200 OK`

**Body** (JSON):
```json
{
  "success": true,
  "visionTags": {
    "objects": ["바다", "모래사장", "파도", "하늘"],
    "peopleCount": 2,
    "dominantColors": ["Blue", "White", "Yellow"],
    "scene": "해변 풍경",
    "mood": "평화로움"
  },
  "contextSummary": "2023년 12월 25일 부산 해운대 해수욕장에서 찍은 사진. 맑은 날씨에 바다, 모래사장, 파도가 보이며 평화로운 분위기. 사용자는 '바다 너무 좋아!'라고 표현함.",
  "embeddingDimensions": 1536
}
```

**Response Schema** (Pydantic):
```python
class VectorizeResponse(BaseModel):
    success: bool
    visionTags: Optional[dict] = None           # Vision API 결과
    contextSummary: Optional[str] = None        # 자연어 요약
    embeddingDimensions: Optional[int] = None   # 1536
    error: Optional[str] = None
```

---

### 성능 지표

| 단계 | 평균 소요 시간 | 비고 |
|-----|------------|-----|
| Vision API | 2~3초 | OpenAI GPT-4o Vision |
| Context Summary | 1~2초 | OpenAI GPT-4o-mini |
| Embedding | 0.5초 | text-embedding-3-small |
| DB 저장 | 0.1초 | Supabase UPDATE |
| **총 처리 시간** | **4~6초** | 비동기 병렬 처리 적용 시 3.5초 |

---

### 에러 케이스

**1. 이미지 URL 접근 실패**:
```json
{
  "detail": "Failed to fetch image from URL",
  "status_code": 400
}
```

**2. Vision API 호출 실패**:
```json
{
  "detail": "Vision API request failed: <error message>",
  "status_code": 500
}
```

**3. DB 저장 실패**:
```json
{
  "detail": "Failed to update memory vectorization: <error message>",
  "status_code": 500
}
```

---

### 호출 예시 (cURL)

```bash
curl -X POST "http://localhost:8000/api/ai/vectorize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "imageUrl": "https://supabase.co/storage/.../photo1.jpg",
    "memoryId": "550e8400-e29b-41d4-a716-446655440000",
    "metadata": {
      "captureTime": { "year": 2023, "month": 12, "day": 25 },
      "location": { "shortAddress": "부산 해운대구" }
    },
    "userText": "바다 너무 좋아!"
  }'
```

---

### 호출 예시 (Python)

```python
import requests

url = "http://localhost:8000/api/ai/vectorize"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {access_token}"
}
payload = {
    "imageUrl": "https://supabase.co/storage/.../photo1.jpg",
    "memoryId": "550e8400-e29b-41d4-a716-446655440000",
    "metadata": {
        "captureTime": {"year": 2023, "month": 12, "day": 25},
        "location": {"shortAddress": "부산 해운대구"}
    },
    "userText": "바다 너무 좋아!"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

---

### 호출 예시 (JavaScript)

```javascript
const response = await fetch('http://localhost:8000/api/ai/vectorize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    imageUrl: 'https://supabase.co/storage/.../photo1.jpg',
    memoryId: '550e8400-e29b-41d4-a716-446655440000',
    metadata: {
      captureTime: { year: 2023, month: 12, day: 25 },
      location: { shortAddress: '부산 해운대구' }
    },
    userText: '바다 너무 좋아!'
  })
});

const data = await response.json();
console.log(data);
```

---

## 2. POST `/api/ai/message`

**목적**: 사용자의 자연어 메시지를 분석하여 검색/저장/대화 중 적절한 동작 수행

**Feature**: Agentic Routing & Semantic Search (Feature 2)

**프로세스**:
```
1. LLM이 사용자 의도 분석 (1st Turn)
2. 도구 선택: search_memories | save_memo | chat
3. 도구 실행: pgvector 검색 또는 DB 저장
4. LLM이 최종 응답 생성 (2nd Turn)
```

---

### Request

**HTTP Method**: `POST`

**URL**: `/api/ai/message`

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Body** (JSON):
```json
{
  "message": "작년 겨울 바다 갔을 때 기분 어땠지?",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Schema** (Pydantic):
```python
class MessageRequest(BaseModel):
    message: str                               # 사용자 입력 텍스트
    userId: str                                # Supabase Auth 사용자 UUID
    sessionId: str                             # chat_sessions UUID
```

---

### Response

**HTTP Status**: `200 OK`

**Body** (JSON) - 검색 케이스:
```json
{
  "response": "작년 겨울 바다 사진 3개를 찾았어요. 2023년 12월 부산 해운대, 강릉 경포대, 인천 을왕리에서 찍으신 사진들이네요. 그때 정말 평화로운 시간을 보내셨던 것 같아요.",
  "actions": [
    {
      "action": "search_photos",
      "query": "작년 겨울 바다",
      "results": [
        {
          "id": "uuid-001",
          "file_url": "https://supabase.co/storage/.../photo1.jpg",
          "context_summary": "2023년 12월 25일 부산 해운대 해수욕장에서 찍은 사진...",
          "similarity": 0.85,
          "created_at": "2023-12-25T14:30:00Z"
        },
        {
          "id": "uuid-002",
          "file_url": "https://supabase.co/storage/.../photo2.jpg",
          "context_summary": "2023년 12월 26일 강릉 경포대에서 찍은 사진...",
          "similarity": 0.78,
          "created_at": "2023-12-26T10:15:00Z"
        },
        {
          "id": "uuid-003",
          "file_url": "https://supabase.co/storage/.../photo3.jpg",
          "context_summary": "2024년 1월 5일 인천 을왕리 해수욕장에서 찍은 사진...",
          "similarity": 0.72,
          "created_at": "2024-01-05T16:00:00Z"
        }
      ],
      "count": 3
    }
  ]
}
```

**Body** (JSON) - 저장 케이스:
```json
{
  "response": "오늘 힘든 하루를 보내셨군요. 메모로 기록해두었습니다. 힘내세요!",
  "actions": [
    {
      "action": "save_memo",
      "content": "오늘 정말 힘들었어",
      "memoryId": "uuid-004",
      "count": null,
      "query": null,
      "results": null
    }
  ]
}
```

**Body** (JSON) - 잡담 케이스:
```json
{
  "response": "안녕하세요! 어떤 추억을 찾아드릴까요?",
  "actions": []
}
```

**Response Schema** (Pydantic):
```python
class ActionResult(BaseModel):
    action: str                                # "search_photos" | "search_memos" | "save_memo"
    query: Optional[str] = None                # 검색 쿼리
    content: Optional[str] = None              # 저장한 메모 내용
    results: Optional[list] = None             # 검색 결과 목록
    count: Optional[int] = None                # 결과 수
    memoryId: Optional[str] = None             # 저장된 memory UUID

class MessageResponse(BaseModel):
    response: str                              # LLM 최종 응답
    actions: list[ActionResult] = []           # 실행된 도구 결과
```

---

### 성능 지표

| 단계 | 평균 소요 시간 | 비고 |
|-----|------------|-----|
| LLM 의도 분석 (1st Turn) | 0.5~1초 | GPT-4o-mini Tool Calling |
| 검색어 임베딩 | 0.3초 | text-embedding-3-small |
| pgvector 검색 | 0.05초 | HNSW 인덱스 활용 |
| LLM 응답 생성 (2nd Turn) | 0.8~1.5초 | GPT-4o-mini |
| **총 응답 시간** | **1.5~2.5초** | 도구 실행 포함 |

---

### 도구 실행 케이스

**1. search_memories (검색)**:
```python
# LLM이 선택한 도구
tool_call = {
    "name": "search_memories",
    "arguments": { "query": "작년 겨울 바다" }
}

# 백엔드가 실행
query_embedding = await create_embedding("작년 겨울 바다")
results = await search_memories(query_embedding, user_id)

# 사진과 메모 분류
photos = [r for r in results if r.get("file_url")]
memos = [r for r in results if not r.get("file_url")]

# 우선순위: 사진 > 메모
if photos:
    return {"action": "search_photos", "results": photos}
elif memos:
    return {"action": "search_memos", "results": memos}
```

**2. save_memo (저장)**:
```python
# LLM이 선택한 도구
tool_call = {
    "name": "save_memo",
    "arguments": { "content": "오늘 정말 힘들었어" }
}

# 백엔드가 실행
context_summary = await generate_context_summary(user_text="오늘 정말 힘들었어")
embedding = await create_embedding(context_summary)
saved = await save_text_memory(user_id, session_id, user_text, context_summary, embedding)

return {"action": "save_memo", "memory_id": saved[0]["id"]}
```

**3. 복합 케이스 (검색 + 저장 동시)**:
```json
{
  "response": "오늘 힘든 하루를 보내셨군요. 메모로 기록해두었고, 비슷한 시기의 기억을 찾아봤어요.",
  "actions": [
    {
      "action": "save_memo",
      "content": "오늘 정말 힘들었어",
      "memoryId": "uuid-004"
    },
    {
      "action": "search_memos",
      "query": "힘들었던 날",
      "results": [ ... ],
      "count": 2
    }
  ]
}
```

---

### 에러 케이스

**1. 검색 임베딩 생성 실패**:
```json
{
  "detail": "Failed to create embedding for search query",
  "status_code": 500
}
```

**2. pgvector 검색 실패**:
```json
{
  "detail": "Failed to search memories: <error message>",
  "status_code": 500
}
```

**3. LLM Tool Calling 실패**:
```json
{
  "detail": "Failed to route message: <error message>",
  "status_code": 500
}
```

---

### 호출 예시 (cURL)

```bash
curl -X POST "http://localhost:8000/api/ai/message" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "작년 겨울 바다 갔을 때 기분 어땠지?",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

### 호출 예시 (JavaScript)

```javascript
const response = await fetch('http://localhost:8000/api/ai/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    message: '작년 겨울 바다 갔을 때 기분 어땠지?',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    sessionId: '550e8400-e29b-41d4-a716-446655440000'
  })
});

const data = await response.json();
console.log(data.response); // LLM 응답
console.log(data.actions);  // 실행된 도구 결과
```

---

## 3. POST `/api/ai/thread`

**목적**: 검색 결과를 기반으로 스레드 내 멀티턴 대화 수행

**Feature**: Threaded Conversation (Feature 3)

**프로세스**:
```
1. 부모 메시지 + 이전 스레드 대화 조회
2. Context Window 구성 (부모 메시지 포함)
3. LLM 응답 생성
4. 대화 맥락 유지
```

---

### Request

**HTTP Method**: `POST`

**URL**: `/api/ai/thread`

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Body** (JSON):
```json
{
  "message": "첫 번째 사진 그날 날씨 어땠어?",
  "parentMessageId": "msg-002",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Schema** (Pydantic):
```python
class ThreadRequest(BaseModel):
    message: str                               # 사용자의 새 메시지
    parentMessageId: str                       # 부모 메시지 UUID (검색 결과 메시지)
    sessionId: str                             # chat_sessions UUID
```

---

### Response

**HTTP Status**: `200 OK`

**Body** (JSON):
```json
{
  "response": "2023년 12월 25일 부산 해운대에서 찍으신 사진이네요. 그날은 맑은 날씨였고, 바람이 조금 불었던 것 같아요. 사진 속 푸른 하늘과 햇살이 인상적이네요."
}
```

**Response Schema** (Pydantic):
```python
class ThreadResponse(BaseModel):
    response: str                              # LLM 응답 텍스트
```

---

### Context Window 구성

**부모 메시지 예시**:
```json
{
  "id": "msg-002",
  "role": "assistant",
  "content": "작년 겨울 바다 사진 3개를 찾았어요...",
  "action_data": {
    "action": "search_photos",
    "results": [
      {
        "id": "uuid-001",
        "context_summary": "2023년 12월 25일 부산 해운대...",
        "metadata": { "environment": { "weather": "맑음" } }
      }
    ]
  }
}
```

**LLM에 전달되는 messages 배열**:
```python
messages = [
    {
        "role": "system",
        "content": THREAD_SYSTEM_PROMPT  # 스레드 규칙 안내
    },
    {
        "role": "assistant",
        "content": "[스레드 시작 — 부모 메시지]\n작년 겨울 바다 사진 3개를 찾았어요..."
    },
    {  # 이전 스레드 대화 1
        "role": "user",
        "content": "첫 번째 사진 언제 찍었어?"
    },
    {
        "role": "assistant",
        "content": "2023년 12월 25일에 찍으셨네요."
    },
    {  # 현재 사용자 메시지
        "role": "user",
        "content": "첫 번째 사진 그날 날씨 어땠어?"
    }
]
```

---

### 성능 지표

| 단계 | 평균 소요 시간 | 비고 |
|-----|------------|-----|
| DB 조회 (부모 + 스레드) | 0.05초 | 2번의 SELECT 쿼리 |
| Context 구성 | 0.005초 | Python 메모리 연산 |
| LLM 응답 생성 | 0.8~1.5초 | GPT-4o-mini, 대화 길이에 따라 변동 |
| **총 응답 시간** | **1.0~2.0초** | 스레드 길이에 따라 변동 |

---

### Context Window 효율성

| 스레드 길이 | 토큰 수 (추정) | GPT-4o-mini 한도 대비 |
|-----------|------------|------------------|
| 부모 메시지 (검색 결과 3개) | ~500 tokens | 0.4% |
| 이전 대화 10턴 | ~1,500 tokens | 1.2% |
| 이전 대화 30턴 | ~4,500 tokens | 3.5% |
| 이전 대화 50턴 | ~7,500 tokens | 5.9% |
| **GPT-4o-mini 한도** | **128,000 tokens** | - |

**결론**: 수십 턴의 깊은 대화 가능, 한도 초과 우려 없음

---

### 에러 케이스

**1. 부모 메시지 없음**:
```json
{
  "detail": "Parent message not found",
  "status_code": 404
}
```

**2. DB 조회 실패**:
```json
{
  "detail": "Failed to get thread messages: <error message>",
  "status_code": 500
}
```

**3. LLM 응답 생성 실패**:
```json
{
  "detail": "Failed to generate thread response: <error message>",
  "status_code": 500
}
```

---

### 호출 예시 (cURL)

```bash
curl -X POST "http://localhost:8000/api/ai/thread" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "첫 번째 사진 그날 날씨 어땠어?",
    "parentMessageId": "msg-002",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

### 호출 예시 (JavaScript)

```javascript
const response = await fetch('http://localhost:8000/api/ai/thread', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    message: '첫 번째 사진 그날 날씨 어땠어?',
    parentMessageId: 'msg-002',
    sessionId: '550e8400-e29b-41d4-a716-446655440000'
  })
});

const data = await response.json();
console.log(data.response);
```

---

## 에러 처리

### 에러 응답 형식

**공통 에러 응답**:
```json
{
  "detail": "에러 메시지",
  "status_code": 500,
  "timestamp": "2026-03-19T10:00:00Z"
}
```

### 에러 코드별 처리 방법

**400 Bad Request**:
```json
{
  "detail": "Invalid request parameters: imageUrl is required"
}
```
- **원인**: 필수 파라미터 누락, 잘못된 형식
- **해결**: 요청 파라미터 검증

**401 Unauthorized**:
```json
{
  "detail": "Invalid or expired token"
}
```
- **원인**: 인증 토큰 없음 또는 만료
- **해결**: Supabase Auth로 토큰 재발급

**500 Internal Server Error**:
```json
{
  "detail": "OpenAI API request failed: rate limit exceeded"
}
```
- **원인**: OpenAI API 호출 실패, DB 연결 실패 등
- **해결**: 로그 확인, 재시도 로직 구현

---

### 에러 핸들링 예시 (JavaScript)

```javascript
try {
  const response = await fetch('/api/ai/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, userId, sessionId })
  });

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 401) {
      // 인증 에러: 토큰 재발급
      await refreshToken();
      return retry();
    } else if (response.status === 500) {
      // 서버 에러: 사용자에게 알림
      alert(`서버 에러가 발생했습니다: ${error.detail}`);
    }

    throw new Error(error.detail);
  }

  const data = await response.json();
  return data;

} catch (err) {
  console.error('API 호출 실패:', err);
  throw err;
}
```

---

## 인증 및 보안

### Supabase Auth 통합

**인증 흐름**:
```
1. 프론트엔드: Supabase Auth로 로그인
2. Supabase: JWT 토큰 발급
3. 프론트엔드: API 요청 시 Authorization 헤더에 토큰 포함
4. 백엔드: 토큰 검증 (미들웨어)
5. 백엔드: user_id 추출하여 비즈니스 로직 수행
```

**Authorization Header**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### RLS (Row Level Security)

**Supabase RLS 정책**:
```sql
-- memories 테이블: 본인 데이터만 읽기/쓰기
CREATE POLICY "Users can read own memories"
ON memories FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
ON memories FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**백엔드 서비스 계층**:
```python
# Service Role Key 사용 (RLS 우회)
_supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# 하지만 비즈니스 로직에서 user_id 필터링으로 보안 유지
result = client.table("memories").select("*").eq("user_id", user_id).execute()
```

---

### API 보안 체크리스트

- **HTTPS 사용**: 프로덕션 환경에서 필수
- **JWT 토큰 검증**: 모든 요청에서 토큰 검증
- **Rate Limiting**: 사용자당 분당 최대 60 요청
- **Input Validation**: Pydantic으로 자동 검증
- **SQL Injection 방지**: Supabase ORM 사용
- **CORS 설정**: 허용된 도메인만 접근 가능

---

## 성능 지표

### API별 성능 요약

| API | 평균 응답 시간 | P95 응답 시간 | 목표 |
|-----|------------|------------|------|
| `/api/ai/vectorize` | 4~6초 | 7초 | <10초 |
| `/api/ai/message` | 1.5~2.5초 | 3초 | <3초 |
| `/api/ai/thread` | 1~2초 | 2.5초 | <3초 |

### 성능 병목 지점

**1. OpenAI API 호출**:
- Vision API: 2~3초 (가장 느림)
- Chat API: 0.8~1.5초
- Embedding API: 0.3~0.5초

**개선 방향**:
- AsyncOpenAI 클라이언트 사용
- Vision API와 Embedding API 병렬 호출

**2. DB 쿼리**:
- pgvector 검색: ~50ms (HNSW 인덱스)
- Chat messages 조회: ~20ms

**개선 방향**:
- Connection Pooling 적용 완료 ✅
- 향후 Read Replica 도입 검토

---

## 예시 시나리오

### 시나리오 1: 사진 업로드 및 검색

**1단계: 사진 업로드**
```javascript
// 1. Supabase Storage에 사진 업로드
const { data: upload } = await supabase.storage
  .from('photos')
  .upload('user123/photo1.jpg', file);

// 2. memories 테이블에 INSERT
const { data: memory } = await supabase
  .from('memories')
  .insert({
    user_id: userId,
    file_url: upload.path,
    metadata: extractedMetadata
  })
  .select()
  .single();

// 3. 백엔드에 벡터화 요청
const response = await fetch('/api/ai/vectorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageUrl: upload.path,
    memoryId: memory.id,
    metadata: extractedMetadata,
    userText: '바다 너무 좋아!'
  })
});

const result = await response.json();
console.log('벡터화 완료:', result.contextSummary);
```

**2단계: 검색**
```javascript
// 검색 요청
const response = await fetch('/api/ai/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '작년 겨울 바다 사진 찾아줘',
    userId: userId,
    sessionId: sessionId
  })
});

const data = await response.json();

// 검색 결과 렌더링
if (data.actions[0]?.action === 'search_photos') {
  const photos = data.actions[0].results;
  photos.forEach(photo => {
    renderPhotoCard(photo);
  });
}
```

---

### 시나리오 2: 스레드 대화

**1단계: 검색 결과에서 스레드 시작**
```javascript
// 검색 결과 메시지 ID 저장
const parentMessageId = 'msg-002';

// 사용자가 후속 질문
const response = await fetch('/api/ai/thread', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '첫 번째 사진 그날 날씨 어땠어?',
    parentMessageId: parentMessageId,
    sessionId: sessionId
  })
});

const data = await response.json();
console.log(data.response);
// "2023년 12월 25일 부산 해운대 사진이네요. 그날은 맑은 날씨였고..."
```

**2단계: 스레드 계속 이어가기**
```javascript
// 또 다른 후속 질문
const response2 = await fetch('/api/ai/thread', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '그날 누구랑 갔었지?',
    parentMessageId: parentMessageId,  // 동일한 부모 ID
    sessionId: sessionId
  })
});

const data2 = await response2.json();
console.log(data2.response);
// "사진에 2명이 보이네요. 함께 좋은 시간을 보내셨나 봐요."
```

---

## 관련 문서

- [Feature 1: Multimodal RAG Pipeline](./Feature1_Multimodal_RAG_Pipeline.md)
- [Feature 2: Agentic Routing & Semantic Search](./Feature2_Agentic_Routing_Semantic_Search.md)
- [Feature 3: Threaded Conversation](./Feature3_Threaded_Conversation.md)
- [Database Schema Design](./Database_Schema_Design.md)
- [Project Planning Document](./Project_Planning_Document.md)

---

## 결론

**Project Synapse의 Backend API**는 다음과 같은 특징을 제공합니다:

### 핵심 특징

1. **RESTful 설계**: 직관적이고 예측 가능한 API 구조
2. **타입 안전성**: Pydantic 모델로 요청/응답 자동 검증
3. **비동기 처리**: FastAPI의 async/await로 동시성 지원
4. **명확한 에러**: 일관된 에러 응답 형식
5. **성능 최적화**: HNSW 인덱스, Connection Pooling 등

### API 설계 철학

- **단순성**: 3개의 엔드포인트로 모든 기능 제공
- **일관성**: 모든 API가 동일한 요청/응답 패턴
- **확장성**: 향후 기능 추가 시 호환성 유지
- **보안성**: JWT 인증, RLS, Input Validation

---

**문서 버전**: v1.0
**작성일**: 2026.03.19
**작성자**: Project Synapse Team
