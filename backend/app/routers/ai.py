"""
AI API 라우터 — Edge Function 엔드포인트를 FastAPI로 대체

엔드포인트 매핑:
- POST /api/ai/analyze-image  ← analyze-image Edge Function
- POST /api/ai/chat           ← openai-chat Edge Function (기본 대화)
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    ImageAnalysisRequest, ImageAnalysisResponse,
    ChatRequest, ChatResponse,
)
from app.services.openai_service import (
    analyze_image,
    generate_chat_response,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.post("/analyze-image", response_model=ImageAnalysisResponse)
async def analyze_image_endpoint(req: ImageAnalysisRequest):
    """이미지 분석 (description / emotion / context_analysis)"""
    try:
        result = await analyze_image(
            image_url=req.imageUrl,
            analysis_type=req.analysisType,
            metadata=req.metadata,
        )
        return ImageAnalysisResponse(
            success=True,
            result=result,
            analysisType=req.analysisType,
        )
    except Exception as e:
        logger.error("이미지 분석 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """채팅 응답 생성"""
    try:
        history = [{"role": m.role, "content": m.content} for m in req.conversationHistory]
        photo_ctx = req.photoContext.model_dump() if req.photoContext else None

        response_text = await generate_chat_response(
            message=req.message,
            conversation_history=history,
            image_url=req.imageUrl,
            photo_context=photo_ctx,
        )
        return ChatResponse(success=True, response=response_text)
    except Exception as e:
        logger.error("채팅 응답 생성 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))