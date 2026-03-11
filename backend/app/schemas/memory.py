"""
AI API 스키마 — Pydantic 요청/응답 모델

Phase 1-A: 벡터화 파이프라인
Phase 1-B: MCP 채팅 라우팅 (예정)
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
    """벡터화 파이프라인 결과."""
    success: bool
    visionTags: Optional[dict] = None           # Vision API가 추출한 시각적 태그
    contextSummary: Optional[str] = None        # AI가 생성한 자연어 요약문
    embeddingDimensions: Optional[int] = None   # 임베딩 벡터 차원 수 (정상이면 1536)
    error: Optional[str] = None


# ============================================================
# Phase 1-B: MCP 채팅 라우팅 (텍스트 입력)
# ============================================================

class ActionResult(BaseModel):
    """MCP 도구 실행 결과 1건."""
    action: str                                # "search" | "save_memo"
    query: Optional[str] = None                # search일 때: 검색 쿼리
    content: Optional[str] = None              # save_memo일 때: 저장한 메모 내용
    results: Optional[list] = None             # search일 때: 검색 결과 목록
    count: Optional[int] = None                # search일 때: 검색 결과 수
    memoryId: Optional[str] = None             # save_memo일 때: 저장된 memories UUID


class MessageRequest(BaseModel):
    """
    메인 피드 텍스트 입력 요청.
    시나리오 3~6(텍스트만)에서 사용됩니다.
    """
    message: str                               # 사용자 입력 텍스트
    userId: str                                # Supabase Auth 사용자 UUID
    sessionId: str                             # chat_sessions UUID


class MessageResponse(BaseModel):
    """MCP 라우팅 결과."""
    response: str                              # LLM의 최종 응답 텍스트
    actions: list[ActionResult] = []           # 실행된 도구 결과 목록 (없으면 빈 배열 = 잡담)


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
