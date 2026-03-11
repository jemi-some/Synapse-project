"""
AI API 라우터

Phase 1-A:
- POST /api/ai/vectorize  — 사진 벡터화 파이프라인 (Vision → 요약 → 임베딩 → DB 저장)

Phase 1-B (예정):
- POST /api/ai/message    — 메인 피드 텍스트 입력 (MCP 라우팅)
- POST /api/ai/thread     — 스레드 내 멀티턴 대화
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.ai import VectorizeRequest, VectorizeResponse
from app.services.openai_service import analyze_and_vectorize

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI"])


# ============================================================
# Phase 1-A: 사진 벡터화 파이프라인
# ============================================================

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