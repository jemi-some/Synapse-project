"""
AI API 라우터

Phase 1-A:
- POST /api/ai/vectorize  — 사진 벡터화 파이프라인 (Vision → 요약 → 임베딩 → DB 저장)

Phase 1-B:
- POST /api/ai/message    — 메인 피드 텍스트 입력 (MCP 라우팅)
- POST /api/ai/thread     — 스레드 내 멀티턴 대화
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.memory import (
    VectorizeRequest, VectorizeResponse,
    MessageRequest, MessageResponse, ActionResult,
    ThreadRequest, ThreadResponse,
)
from app.services.openai_service import (
    analyze_and_vectorize,
    route_message,
    thread_conversation,
)

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


# ============================================================
# Phase 1-B: MCP 채팅 라우팅
# ============================================================

@router.post("/message", response_model=MessageResponse)
async def message_endpoint(req: MessageRequest):
    """
    텍스트 메시지를 MCP 라우팅으로 처리합니다.

    LLM이 사용자 의도를 판단하여:
      - 검색 → search_memories 도구 호출 → 유사한 기억 반환
      - 메모 → save_memo 도구 호출 → memories 테이블에 저장
      - 잡담 → 도구 없이 직접 응답
      - 위 조합 → 여러 도구 동시 호출 가능
    """
    try:
        result = await route_message(
            message=req.message,
            user_id=req.userId,
            session_id=req.sessionId,
        )

        # route_message 결과를 ActionResult 모델로 변환
        actions = []
        for action_data in result.get("actions", []):
            actions.append(ActionResult(
                action=action_data.get("action", ""),
                query=action_data.get("query"),
                content=action_data.get("content"),
                results=action_data.get("results"),
                count=action_data.get("count"),
                memoryId=action_data.get("memory_id"),
            ))

        return MessageResponse(
            response=result["response"],
            actions=actions,
        )
    except Exception as e:
        logger.error("MCP 라우팅 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 스레드 멀티턴 대화
# ============================================================

@router.post("/thread", response_model=ThreadResponse)
async def thread_endpoint(req: ThreadRequest):
    """
    스레드 내 멀티턴 대화를 처리합니다.

    검색 결과가 메인 피드에 표시된 뒤, 사용자가 후속 대화를 시작하면
    프론트가 자동으로 스레드를 생성하고 이 엔드포인트를 호출합니다.
    부모 메시지의 context(검색 결과 등)를 유지하면서 대화를 이어갑니다.
    """
    try:
        result = await thread_conversation(
            message=req.message,
            parent_message_id=req.parentMessageId,
        )
        return ThreadResponse(response=result["response"])
    except Exception as e:
        logger.error("스레드 대화 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))