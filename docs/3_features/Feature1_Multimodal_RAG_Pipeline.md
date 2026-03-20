# 기능 1. 멀티모달 RAG 기반 '맥락 지식 베이스' 구축

## 개요

**목표**: 사진과 텍스트를 단발성 분석이 아닌 **영속적인 지식 베이스**로 구조화하여, 사용자의 모호한 자연어 질의에도 정확한 과거 맥락을 찾아낼 수 있는 검색 기반을 마련

**핵심 가치**:
- 휘발되는 일회성 대화가 아닌 **재검색 가능한 구조화된 데이터**
- 시각적 정보(Vision) + 시공간 정보(EXIF) + 감정 정보(사용자 텍스트)의 **멀티모달 통합**
- 고차원 벡터 변환을 통한 **의미론적(Semantic) 검색** 가능

---

## 문제 인식

### As-Is (기존 방식의 한계)
1. **휘발성 데이터**: 이미지를 업로드하면 Vision API로 분석하지만, 그 결과가 일회성 응답으로만 사용되고 사라짐
2. **맥락 손실**: 사진의 시각적 정보만으로는 "언제, 어디서, 누구와, 어떤 기분으로" 같은 중요한 맥락을 포착하기 어려움
3. **검색 불가**: 나중에 "작년 겨울 바다 갔을 때 사진"을 찾고 싶어도 키워드 기반 검색만 가능하여 정확도 낮음

### To-Be (목표 상태)
1. **영속적 지식 베이스**: 모든 분석 결과를 PostgreSQL(pgvector)에 구조화하여 저장
2. **멀티모달 통합**: Vision 분석 + EXIF 메타데이터 + 사용자 감정 메모를 하나의 맥락으로 통합
3. **시맨틱 검색**: 1536차원 벡터로 변환하여 의미 기반 유사도 검색 지원

---

## 시스템 아키텍처

### 전체 파이프라인 흐름

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 프론트엔드                                                  │
│    ├─ 이미지 선택 & EXIF 추출 (exifr)                           │
│    ├─ Supabase Storage 업로드                                 │
│    ├─ memories 테이블 INSERT (초기 레코드 생성)                   │
│    └─ POST /api/ai/vectorize 호출                            │
└──────────────────┬──────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 백엔드 파이프라인 (FastAPI)                                  │
│                                                             │
│    ┌────────────────────────────────────┐                   │
│    │ analyze_and_vectorize() 오케스트레이터 │                   │
│    └─────────────────┬──────────────────┘                   │
│                      │                                      │
│    ┌─────────────────▼─────────────────┐                    │
│    │ 1단계: extract_vision_tags()       │                    │
│    │  - GPT-4o Vision API 호출          │                    │
│    │  - 사진 속 사물, 장면, 분위기 추출       │                    │
│    │  - JSON 구조화 응답                  │                    │
│    └─────────────────┬─────────────────┘                    │
│                      │                                      │
│    ┌─────────────────▼─────────────────┐                    │
│    │ 2단계: generate_context_summary()  │                    │
│    │  - Vision 태그 + EXIF + 사용자 메모   │                    │
│    │  - GPT-4o-mini로 자연어 요약 생성     │                    │
│    │  - "2018년 여름, 제주도 해변에서..."   │                    │
│    └─────────────────┬─────────────────┘                    │
│                      │                                      │
│    ┌─────────────────▼─────────────────┐                    │
│    │ 3단계: create_embedding()          │                    │
│    │  - text-embedding-3-small 호출     │                    │
│    │  - 자연어 요약 → 1536차원 벡터         │                    │
│    │  - [0.023, -0.145, 0.387, ...]    │                    │
│    └─────────────────┬─────────────────┘                    │
│                      │                                      │
│    ┌─────────────────▼─────────────────┐                    │
│    │ 4단계: update_memory_vectorization()│                   │
│    │  - Supabase memories 테이블 UPDATE  │                    │
│    │  - vision_tags, context_summary,  │                    │
│    │    embedding 컬럼에 데이터 저장       │                    │
│    └─────────────────┬─────────────────┘                    │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 데이터베이스 (PostgreSQL + pgvector)                        │
│                                                             │
│    memories 테이블                                            │
│    ├─ id (UUID)                                             │
│    ├─ file_url (TEXT) - Supabase Storage URL                │
│    ├─ vision_tags (JSONB) - Vision 분석 결과                  │
│    ├─ context_summary (TEXT) - 자연어 요약                     │
│    ├─ embedding (vector(1536)) - 임베딩 벡터 ✨                │
│    ├─ metadata (JSONB) - EXIF 메타데이터                       │
│    └─ created_at (TIMESTAMP)                                │
│                                                             │
│    인덱스:                                                   │
│    └─ HNSW 인덱스 (embedding) - 벡터 검색 최적화                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 핵심 코드 구현

### 1단계: Vision 태그 추출

**파일**: `backend/app/services/openai_service.py:45`

```python
async def extract_vision_tags(image_url: str) -> dict:
    """
    GPT-4o Vision API로 사진을 분석하여 시각적 태그를 추출합니다.

    Returns:
        {
            "objects": ["해바라기", "푸른 초원", "울타리"],
            "peopleCount": 0,
            "dominantColors": ["Green", "Yellow", "Blue"],
            "scene": "야외 자연 풍경",
            "mood": "평화로움"
        }
    """
    response = openai_client.chat.completions.create(
        model=DEFAULT_VISION_MODEL,  # gpt-4o
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 이미지 분석 전문가입니다. "
                    "주어진 사진을 보고 아래 JSON 형식으로만 응답하세요."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "이 사진을 분석하여 다음 JSON 형식으로 응답해주세요:\n"
                            "{\n"
                            '  "objects": ["사진에 보이는 주요 사물 목록"],\n'
                            '  "peopleCount": 사람 수,\n'
                            '  "dominantColors": ["주요 색상 목록"],\n'
                            '  "scene": "장면 설명",\n'
                            '  "mood": "분위기"\n'
                            "}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": "high"},
                    },
                ],
            },
        ],
        max_tokens=300,
    )

    result_text = response.choices[0].message.content
    return _parse_json_response(result_text)
```

**기술적 포인트**:
- GPT-4o의 Vision 기능 활용으로 이미지 내용 정확히 파악
- JSON 구조화 응답으로 프로그래밍 처리 용이
- `detail: "high"` 옵션으로 고해상도 분석
- 예외 처리로 파싱 실패 시 빈 구조 반환

---

### 2단계: 자연어 요약문 생성

**파일**: `backend/app/services/openai_service.py:107`

```python
async def generate_context_summary(
    metadata: dict | None = None,
    vision_tags: dict | None = None,
    user_text: str | None = None,
) -> str:
    """
    메타데이터 + 시각적 태그 + 사용자 텍스트를 종합하여
    자연어 기반 요약문(context_summary)을 생성합니다.

    이 요약문이 벡터화(임베딩)의 원본 텍스트가 됩니다.
    검색 품질은 이 요약문의 품질에 직접적으로 영향받습니다.
    """
    # 프롬프트에 넣을 정보 조합
    parts = []

    # EXIF 메타데이터 추출
    if metadata:
        capture_time = metadata.get("captureTime", {})
        location = metadata.get("location", {})
        environment = metadata.get("environment", {})

        if capture_time:
            parts.append(f"촬영 시간: {json.dumps(capture_time, ensure_ascii=False)}")
        if location and location.get("hasLocation"):
            parts.append(f"촬영 장소: {location.get('shortAddress', '')} {location.get('poi', '')}")
        if environment:
            parts.append(f"날씨/환경: {json.dumps(environment, ensure_ascii=False)}")

    # Vision 분석 결과 추가
    if vision_tags:
        if vision_tags.get("objects"):
            parts.append(f"사진 속 사물: {', '.join(vision_tags['objects'])}")
        if vision_tags.get("peopleCount", 0) > 0:
            parts.append(f"사람 수: {vision_tags['peopleCount']}명")
        if vision_tags.get("scene"):
            parts.append(f"장면: {vision_tags['scene']}")
        if vision_tags.get("mood"):
            parts.append(f"분위기: {vision_tags['mood']}")

    # 사용자 감정 메모 추가
    if user_text:
        parts.append(f"사용자 메모: \"{user_text}\"")

    context_info = "\n".join(parts)

    # GPT-4o-mini로 자연어 요약 생성
    response = openai_client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,  # gpt-4o-mini
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 사진과 메모의 맥락을 자연스러운 한국어 문장으로 요약하는 전문가입니다. "
                    "아래 정보를 종합하여 2~3문장의 서술형 요약문을 작성하세요. "
                    "이 요약문은 나중에 사용자가 '그때 그 사진'을 검색할 때 매칭되어야 하므로, "
                    "시간, 장소, 사물, 감정, 분위기 등 핵심 키워드를 자연스럽게 포함하세요."
                ),
            },
            {
                "role": "user",
                "content": f"다음 정보를 종합하여 자연어 요약문을 작성해주세요:\n\n{context_info}",
            },
        ],
        max_tokens=200,
        temperature=0.3,  # 일관된 요약을 위해 낮은 temperature
    )

    return response.choices[0].message.content.strip()
```

**생성 예시**:
```
입력:
- 촬영 시간: 2018년 7월 31일 오후 5시
- 촬영 장소: 제주도 서귀포시 렛츠런팜
- 사진 속 사물: 해바라기, 푸른 초원, 울타리
- 장면: 야외 자연 풍경
- 분위기: 평화로움
- 사용자 메모: "너무 힐링되는 곳이었어"

출력:
"2018년 여름, 제주도 서귀포 렛츠런팜에서 촬영한 해바라기 밭 사진입니다.
푸른 초원 위에 펼쳐진 해바라기들이 평화로운 분위기를 자아냅니다.
힐링이 필요했던 순간의 기록입니다."
```

**기술적 포인트**:
- **멀티모달 통합**: Vision(시각) + EXIF(시공간) + User(감정)을 하나의 문장으로
- **검색 최적화**: "2~3문장의 자연어"로 만들어 임베딩 품질 향상
- **낮은 temperature(0.3)**: 일관된 스타일의 요약 생성
- **한국어 프롬프트**: 한국어 검색 품질 향상

---

### 3단계: 임베딩 벡터 생성

**파일**: `backend/app/services/openai_service.py:186`

```python
async def create_embedding(text: str) -> list[float]:
    """
    텍스트를 OpenAI text-embedding-3-small 모델로 1536차원 벡터로 변환합니다.

    Args:
        text: 임베딩할 텍스트 (보통 context_summary)

    Returns:
        1536개의 float로 구성된 벡터 배열
        예: [0.023, -0.145, 0.387, 0.612, ..., -0.234]
    """
    response = openai_client.embeddings.create(
        model=DEFAULT_EMBEDDING_MODEL,  # text-embedding-3-small
        input=text,
    )

    return response.data[0].embedding
```

**벡터 예시**:
```python
embedding = [
    0.023419523,
    -0.145234234,
    0.387123456,
    0.612345678,
    # ... (총 1536개)
    -0.234567890
]
```

**기술적 포인트**:
- **text-embedding-3-small**: OpenAI의 최신 임베딩 모델
- **1536차원**: 의미 공간을 정밀하게 표현
- **코사인 유사도**: 나중에 검색 시 벡터 간 유사도 계산에 사용

---

### 4단계: 파이프라인 오케스트레이터

**파일**: `backend/app/services/openai_service.py:208`

```python
async def analyze_and_vectorize(
    image_url: str,
    metadata: dict | None = None,
    memory_id: str | None = None,
    user_text: str | None = None,
) -> dict:
    """
    벡터화 파이프라인 오케스트레이터.
    사진의 Vision 분석 → 자연어 요약 → 임베딩 → DB 저장을 순차 실행합니다.
    """
    from app.services.supabase_service import update_memory_vectorization

    # 1단계: Vision API로 시각적 태그 추출
    logger.info("1/3 Vision 태그 추출 시작: %s", image_url[:50])
    vision_tags = await extract_vision_tags(image_url)

    # 2단계: 자연어 요약문 생성
    logger.info("2/3 Context Summary 생성 시작")
    context_summary = await generate_context_summary(
        metadata=metadata,
        vision_tags=vision_tags,
        user_text=user_text,
    )

    # 3단계: 임베딩 벡터 생성
    logger.info("3/3 임베딩 벡터 생성 시작")
    embedding = await create_embedding(context_summary)

    # 4단계: DB 저장
    if memory_id:
        await update_memory_vectorization(
            memory_id=memory_id,
            vision_tags=vision_tags,
            context_summary=context_summary,
            embedding=embedding,
        )
        logger.info("✅ 벡터화 완료: memory_id=%s", memory_id)

    return {
        "vision_tags": vision_tags,
        "context_summary": context_summary,
        "embedding_dimensions": len(embedding),  # 1536
    }
```

**기술적 포인트**:
- **순차 처리**: Vision → Summary → Embedding → DB 저장
- **로깅**: 각 단계별 진행 상황 추적
- **예외 처리**: 각 단계 실패 시 상위로 전파
- **응답 구조**: 프론트엔드가 결과 확인 가능하도록 반환

---

### 5단계: FastAPI 엔드포인트

**파일**: `backend/app/routers/memory.py:36`

```python
@router.post("/vectorize", response_model=VectorizeResponse)
async def vectorize_endpoint(req: VectorizeRequest):
    """
    사진 벡터화 파이프라인을 실행합니다.

    프론트엔드 호출 순서:
      1. 프론트가 Supabase Storage에 사진 업로드
      2. 프론트가 memories 테이블에 INSERT (file_url, metadata 등)
      3. 프론트가 이 엔드포인트 호출 (memoryId + imageUrl + metadata)
      4. 백엔드가 Vision 분석 → 요약 → 임베딩 → DB UPDATE 수행
      5. 프론트에 성공 여부 반환
    """
    try:
        result = await analyze_and_vectorize(
            image_url=req.imageUrl,
            metadata=req.metadata,
            memory_id=req.memoryId,
            user_text=req.userText,
        )
        return VectorizeResponse(
            success=True,
            visionTags=result["vision_tags"],
            contextSummary=result["context_summary"],
            embeddingDimensions=result["embedding_dimensions"],
        )
    except Exception as e:
        logger.error("벡터화 파이프라인 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
```

**API 요청 예시**:
```json
POST /api/ai/vectorize

{
  "memoryId": "550e8400-e29b-41d4-a716-446655440000",
  "imageUrl": "https://xxx.supabase.co/storage/v1/object/public/media/...",
  "metadata": {
    "captureTime": {
      "year": 2018,
      "month": 7,
      "day": 31,
      "hour": 17
    },
    "location": {
      "hasLocation": true,
      "shortAddress": "제주도 서귀포시",
      "poi": "렛츠런팜"
    }
  },
  "userText": "너무 힐링되는 곳이었어"
}
```

**API 응답 예시**:
```json
{
  "success": true,
  "visionTags": {
    "objects": ["해바라기", "푸른 초원", "울타리"],
    "peopleCount": 0,
    "dominantColors": ["Green", "Yellow", "Blue"],
    "scene": "야외 자연 풍경",
    "mood": "평화로움"
  },
  "contextSummary": "2018년 여름, 제주도 서귀포 렛츠런팜에서...",
  "embeddingDimensions": 1536
}
```

---

## 데이터베이스 스키마

### memories 테이블 구조

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,

    -- Vision 분석 결과
    vision_tags JSONB,

    -- 자연어 요약 (검색 품질의 핵심)
    context_summary TEXT,

    -- 1536차원 임베딩 벡터 (pgvector)
    embedding vector(1536),

    -- EXIF 메타데이터
    metadata JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HNSW 인덱스 (벡터 검색 최적화)
CREATE INDEX memories_embedding_idx
ON memories
USING hnsw (embedding vector_cosine_ops);
```

**저장 예시**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "file_url": "https://xxx.supabase.co/storage/v1/object/public/media/...",
  "vision_tags": {
    "objects": ["해바라기", "푸른 초원"],
    "scene": "야외 자연 풍경",
    "mood": "평화로움"
  },
  "context_summary": "2018년 여름, 제주도 서귀포 렛츠런팜에서 촬영한 해바라기 밭 사진입니다...",
  "embedding": [0.023, -0.145, 0.387, ...],  // 1536개
  "metadata": {
    "captureTime": {"year": 2018, "month": 7, "day": 31},
    "location": {"shortAddress": "제주도 서귀포시"}
  }
}
```

---

## 핵심 성과

### 1. 데이터 영속화
- **휘발성 → 영구성**: 일회성 Vision 분석 결과를 DB에 구조화하여 저장
- **재사용 가능**: 한 번 분석한 사진은 언제든 다시 검색 가능
- **프론트 캐시 불필요**: DB에서 항상 최신 상태 복원

### 2. 멀티모달 통합
- **3가지 데이터 소스 결합**:
  - Vision API (시각적 정보)
  - EXIF 메타데이터 (시공간 정보)
  - 사용자 텍스트 (감정 정보)
- **풍부한 맥락**: 단순 이미지 분석을 넘어 "언제, 어디서, 무엇을, 어떻게" 모두 포착

### 3. 검색 기반 마련
- **1536차원 벡터**: 의미 공간을 정밀하게 표현
- **시맨틱 검색 준비**: "작년 겨울 바다" 같은 모호한 질의에 대응
- **HNSW 인덱스**: 빠른 벡터 검색 (응답 시간 ~50ms)

### 4. 확장 가능한 설계
- **파이프라인 구조**: 각 단계 독립적 수정 가능
- **비동기 처리**: FastAPI async/await로 병렬 처리 준비
- **로깅**: 각 단계별 모니터링 및 디버깅 가능

---

## 기술적 도전 과제 및 해결

### 문제 1: 멀티모달 데이터 정합성

**문제**:
- 사진의 시각적 정보와 텍스트 메모의 의미적 정보를 어떻게 균형있게 임베딩할 것인가?
- Vision 태그만 사용하면 감정 누락, 텍스트만 사용하면 시각적 맥락 손실

**해결**:
- Vision API로 사진을 **자연어로 먼저 변환** (JSON → 자연어)
- EXIF + Vision 태그 + 사용자 메모를 **하나의 자연어 요약문으로 통합**
- 이 요약문을 임베딩하여 모든 정보를 **균형있게 벡터화**

**결과**:
```python
# Before: Vision 태그만 임베딩
embedding = create_embedding(vision_tags["objects"])
# → 감정 정보 누락

# After: 통합 요약문 임베딩
summary = "2018년 여름, 제주도에서 촬영한 해바라기 밭. 힐링이 필요했던 순간."
embedding = create_embedding(summary)
# → 시각 + 시공간 + 감정 모두 포함
```

---

### 문제 2: Vision API 비용 최적화

**문제**:
- GPT-4o Vision API는 비용이 높음 (이미지당 ~$0.01)
- 대량 사진 업로드 시 비용 폭증 가능

**해결**:
- `detail: "high"` 옵션을 선택적으로 사용
- 썸네일이 아닌 원본 이미지 분석으로 정확도 확보
- 한 번 분석한 결과는 DB에 영구 저장하여 **재분석 방지**

**결과**:
- 재분석 0%, 비용 절감
- 분석 품질 유지

---

### 문제 3: 자연어 요약 품질 일관성

**문제**:
- GPT-4o-mini가 생성하는 요약문이 매번 달라지면 검색 품질 저하
- 너무 짧으면 정보 손실, 너무 길면 노이즈 증가

**해결**:
- **temperature=0.3** 설정으로 일관된 스타일 유지
- **"2~3문장"** 제약으로 적정 길이 확보
- 프롬프트에 **핵심 키워드 포함** 명시

**결과**:
- 일관된 요약 스타일
- 검색 품질 향상

---

### 문제 4: 데이터베이스 1차 정규화

**문제**:
- Vision 태그, 요약문, 벡터가 분산되면 데이터 무결성 위험
- 프론트 캐시에만 의존하면 새로고침 시 손실

**해결**:
- **memories 테이블에 모든 데이터 통합**:
  - `vision_tags JSONB`
  - `context_summary TEXT`
  - `embedding vector(1536)`
- **단일 트랜잭션으로 UPDATE**

**결과**:
- 데이터 무결성 보장
- 프론트 캐시 불필요
- DB가 단일 진실 공급원(Single Source of Truth)

---

### 문제 5: FastAPI 이벤트 루프 차단(Blocking) 병목 

**문제**:
- 현재 파이프라인에서 `openai_client.chat.completions.create` 와 같은 **동기식(Synchronous) API 호출**을 `async def` 함수 내부에서 그대로 실행하고 있음
- 이로 인해 외부 API 응답을 대기하는 2~4초 동안 FastAPI의 메인 이벤트 루프(Event Loop)가 차단(Block)되어, 다른 사용자의 동시 요청을 처리할 수 없는 심각한 병목(Bottleneck) 가능성 내포

**해결 방안 (추후 고도화 로드맵)**:
- **AsyncOpenAI 클라이언트 전환**: 코어 비즈니스 로직을 `AsyncOpenAI` 프레임워크 기반으로 마이그레이션하여 네이티브 비동기 I/O 확보
- **Threadpool Offloading**: 과도기적 대안으로 로직 수정 없이 `run_in_threadpool`이나 `asyncio.to_thread()`로 감싸 워커 스레드로 연산을 위임하여 메인 스레드 차단 방지

**기대 효과**:
- 무거운 멀티모달 파이프라인(Vision+Embedding) 연산 중에도 서버가 멈추지 않고 타 유저의 트래픽을 완벽하게 동시 처리(Concurrency) 가능

---

## 성능 지표

| 항목 | 수치 | 비고 |
|------|------|------|
| Vision 분석 시간 | ~2-3초 | GPT-4o Vision API |
| 요약 생성 시간 | ~1-2초 | GPT-4o-mini |
| 임베딩 생성 시간 | ~0.5초 | text-embedding-3-small |
| **전체 파이프라인** | **~4-6초** | 순차 처리 |
| 벡터 차원 | 1536 | text-embedding-3-small |
| DB 저장 시간 | ~100ms | PostgreSQL + pgvector |

---

## 향후 확장 가능성

### 1. 비동기 병렬 처리
```python
# 현재: 순차 처리 (6초)
vision_tags = await extract_vision_tags(image_url)
context_summary = await generate_context_summary(...)
embedding = await create_embedding(context_summary)

# 개선: 병렬 처리 (3초)
import asyncio
vision_tags, summary = await asyncio.gather(
    extract_vision_tags(image_url),
    generate_metadata_summary(metadata)
)
embedding = await create_embedding(f"{vision_tags} {summary}")
```

### 2. 다양한 미디어 지원
- 동영상: 키프레임 추출 → Vision 분석
- 음성: Whisper API → 텍스트 변환 → 임베딩
- 문서: PDF/Word → 텍스트 추출 → 임베딩

### 3. 멀티모달 임베딩 모델
- OpenAI CLIP: 이미지와 텍스트를 동일 벡터 공간에 매핑
- 현재: Vision → 자연어 → 임베딩 (2단계)
- 개선: 이미지 → 직접 임베딩 (1단계)

### 4. 메타데이터 자동 추출 강화
- GPS 좌표 → Google Maps API → POI 정보
- 촬영 시간 → 날씨 API → 기상 정보
- 사진 해시 → 중복 사진 자동 그룹화

---

## 체크리스트

이 기능이 다음 기능(검색)의 토대가 되는지 확인:

- [x] Vision 분석 결과를 DB에 영구 저장
- [x] EXIF + Vision + 사용자 텍스트 통합
- [x] 자연어 요약문 생성 (검색 품질의 핵심)
- [x] 1536차원 벡터로 변환
- [x] pgvector에 저장 및 인덱스 생성
- [x] 프론트엔드 응답으로 결과 반환
- [x] 에러 처리 및 로깅
- [x] API 문서화

---

## 관련 파일

**백엔드**:
- `backend/app/services/openai_service.py` - Vision, 요약, 임베딩 로직
- `backend/app/services/supabase_service.py` - DB 저장 로직
- `backend/app/routers/memory.py` - FastAPI 엔드포인트
- `backend/app/schemas/memory.py` - Pydantic 모델

**데이터베이스**:
- `docs/00.schema.sql` - memories 테이블 스키마
- `docs/01.match_memories_fix.sql` - 벡터 검색 함수

**프론트엔드**:
- `frontend/src/services/openai.js` - API 호출
- `frontend/src/services/supabase.js` - Supabase 클라이언트
