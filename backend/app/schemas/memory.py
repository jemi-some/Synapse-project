"""
AI API 스키마 — Pydantic 요청/응답 모델

Logic 1: 벡터화 파이프라인  — POST /api/ai/vectorize
Logic 2: 기록 처리 MVP      — POST /api/ai/record
Logic 3: 검색               — POST /api/ai/search
         스레드 대화         — POST /api/ai/thread
"""

from pydantic import BaseModel
from typing import Optional


# ============================================================
# Phase 1-A: 벡터화 파이프라인 (사진 업로드 시)
# ============================================================

class VectorizeRequest(BaseModel):
    """
    사진 벡터화 요청.
    프론트엔드가 사진을 memories 테이블에 INSERT한 뒤,
    memory_id와 함께 백엔드에 벡터화를 요청합니다.
    """
    imageUrl: str                          # Supabase Storage의 이미지 Public URL
    memoryId: str                          # memories 테이블의 UUID (프론트에서 INSERT 후 전달)
    metadata: Optional[dict] = None        # 프론트엔드가 추출한 메타데이터 (captureTime, location, environment 등)
    userText: Optional[str] = None         # 사용자가 함께 입력한 텍스트 (시나리오 2: 사진+텍스트)


class VectorizeResponse(BaseModel):
    """
    벡터화 파이프라인 결과. (V2)

    V1과의 차이:
      - visionTags (dict) → imageCaption (str) + imageTags (list) 로 분리
      - contextSummary → combinedText (LLM 요약 → 직접 조합 텍스트)
    """
    success: bool
    imageCaption: Optional[str] = None          # Vision API가 생성한 사진 한 줄 설명
    imageTags: Optional[list] = None            # Vision API가 추출한 키워드 목록
    combinedText: Optional[str] = None          # 임베딩용 구조화 텍스트
    embeddingDimensions: Optional[int] = None   # 임베딩 벡터 차원 수 (정상이면 1536)
    error: Optional[str] = None


# ============================================================
# Logic 2: 기록 처리 (V2 MVP — POST /api/ai/record)
# ============================================================

class RecordRequest(BaseModel):
    """
    메인 피드 텍스트 기록 요청. (V2)

    V1 MessageRequest와의 차이:
      - message → userText (필드명 변경, 의미 명확화)
      - V1은 LLM 라우팅 포함 / V2 Phase A는 저장만
    """
    userText: str                              # 사용자 입력 텍스트
    userId: str                                # Supabase Auth 사용자 UUID
    sessionId: str                             # chat_sessions UUID


class RecordResponse(BaseModel):
    """기록 저장 결과. (V2)"""
    success: bool
    memoryId: Optional[str] = None             # 저장된 memories UUID
    sessionId: Optional[str] = None


# ============================================================
# Logic 3: 검색 (V2 — POST /api/ai/search)
# ============================================================

class SearchRequest(BaseModel):
    """
    검색 요청. (V2)

    V1과의 차이:
      - V1: MessageRequest로 메인 피드에서 LLM이 의도 판별 후 검색 실행
      - V2: 검색창에서 이 엔드포인트 직접 호출. LLM 없음.
    """
    query: str                                 # 사용자 검색어
    userId: str                                # Supabase Auth 사용자 UUID
    threshold: Optional[float] = 0.25         # 유사도 임계치 (기본값 0.25)
    count: Optional[int] = 5                   # 최대 반환 개수


class SearchResultItem(BaseModel):
    """검색 결과 단건."""
    id: str
    chatSessionId: Optional[str] = None
    userText: Optional[str] = None
    combinedText: Optional[str] = None
    imageUrl: Optional[str] = None             # 사진 기억일 때만 존재
    imageCaption: Optional[str] = None
    imageTags: Optional[list] = None
    similarity: float


class SearchResponse(BaseModel):
    """
    검색 결과. photos / memos 두 그룹으로 분리 반환.

    프론트에서 그룹별로 다른 카드 UI를 렌더링함.
    """
    photos: list[SearchResultItem] = []        # 사진 기억 (image_url 있는 것)
    memos: list[SearchResultItem] = []         # 텍스트 기억 (image_url 없는 것)
    total: int = 0                             # 전체 결과 수


# ============================================================
# 스레드 멀티턴 대화
# ============================================================

class ThreadRequest(BaseModel):
    """
    스레드 내 대화 요청.
    시나리오 7: 검색 결과에 대한 후속 대화.
    """
    message: str                               # 사용자의 새 메시지
    parentMessageId: str                       # 스레드의 부모 메시지 UUID (검색 결과 메시지 등)
    sessionId: str                             # chat_sessions UUID


class ThreadResponse(BaseModel):
    """스레드 대화 응답."""
    response: str                              # LLM의 응답 텍스트
