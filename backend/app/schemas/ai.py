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
# Phase 1-B: MCP 채팅 라우팅 (예정)
# ============================================================
# 아래 모델들은 Phase 1-B에서 구현할 때 추가됩니다.
#
# class MessageRequest(BaseModel):
#     """메인 피드 텍스트 입력."""
#     message: str
#     userId: str
#     sessionId: str
#
# class MessageResponse(BaseModel):
#     """MCP 라우팅 결과."""
#     action: str          # "search" | "save_memo" | "chat" | "open_thread"
#     response: Optional[str] = None
#     searchResults: Optional[list] = None
