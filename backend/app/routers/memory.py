"""
AI API 라우터

Logic 1: POST /api/ai/vectorize  — 사진 벡터화 파이프라인 (Vision → combined_text → 임베딩 → DB)
Logic 2: POST /api/ai/record     — 메인 피드 텍스트 기록 (MVP Phase A: LLM 없이 저장만)
Logic 3: POST /api/ai/search     — 검색창 직접 호출 (LLM 없음, pgvector 유사도 검색)
         POST /api/ai/thread     — 스레드 내 멀티턴 대화

V1에서 제거된 엔드포인트:
  POST /api/ai/message  — V1 MCP Tool Calling 라우터 (Logic 2 V1). /api/ai/record로 대체.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.memory import (
    VectorizeRequest, VectorizeResponse,
    RecordRequest, RecordResponse,
    SearchRequest, SearchResponse, SearchResultItem,
    ThreadRequest, ThreadResponse,
)
from app.services.vectorize_service import run_vectorize_pipeline
from app.services.record_service import save_record
from app.services.search_service import search_memories_by_query
from app.services.openai_service import thread_conversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI"])


# ============================================================
# Logic 1: 사진 벡터화 파이프라인
# ============================================================

@router.post("/vectorize", response_model=VectorizeResponse)
async def vectorize_endpoint(req: VectorizeRequest):
    """
    사진 벡터화 파이프라인을 실행합니다.

    프론트엔드 호출 순서:
      1. 프론트가 Supabase Storage에 사진 업로드
      2. 프론트가 memories 테이블에 INSERT (user_text 등)
      3. 프론트가 이 엔드포인트 호출 (memoryId + imageUrl + metadata)
      4. 백엔드가 Vision 분석 → combined_text 조합 → 임베딩 → DB 저장 수행
      5. 프론트에 성공 여부 반환

    V1과의 차이:
      - 응답 필드: visionTags/contextSummary → imageCaption/imageTags/combinedText
    """
    try:
        result = await run_vectorize_pipeline(
            image_url=req.imageUrl,
            metadata=req.metadata,
            memory_id=req.memoryId,
            user_text=req.userText,
        )
        return VectorizeResponse(
            success=True,
            imageCaption=result["image_caption"],
            imageTags=result["image_tags"],
            combinedText=result["combined_text"],
            embeddingDimensions=result["embedding_dimensions"],
        )
    except Exception as e:
        logger.error("벡터화 파이프라인 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Logic 2: 메인 피드 텍스트 기록 (MVP Phase A)
# ============================================================

@router.post("/record", response_model=RecordResponse)
async def record_endpoint(req: RecordRequest):
    """
    텍스트 기록을 저장합니다. (V2 MVP Phase A)

    Phase A: LLM 호출 없이 저장만.
      1. combined_embedding 생성 (user_text 그대로 임베딩)
      2. memories INSERT
      3. chat_messages INSERT (raw_input + memory_card)

    Phase B 이후: Structured Output으로 content_type 분류 + 조건부 Tool Calling
    """
    try:
        result = await save_record(
            user_text=req.userText,
            user_id=req.userId,
            session_id=req.sessionId,
            location_name=req.locationName,
        )
        return RecordResponse(
            success=True,
            memoryId=result["memory_id"],
            sessionId=result["session_id"],
        )
    except Exception as e:
        logger.error("기록 저장 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Logic 3: 검색
# ============================================================

@router.post("/search", response_model=SearchResponse)
async def search_endpoint(req: SearchRequest):
    """
    검색어로 유사한 기억을 찾아 사진/텍스트로 분류하여 반환합니다.

    V1과의 차이:
      - V1: POST /api/ai/message → LLM이 Tool Calling으로 검색 실행
      - V2: 검색창에서 이 엔드포인트 직접 호출. LLM / Tool Calling 없음.

    결과는 photos / memos 두 그룹으로 분리되어 반환됩니다.
    프론트에서 각 그룹을 다른 카드 UI로 렌더링합니다.
    """
    try:
        result = await search_memories_by_query(
            query=req.query,
            user_id=req.userId,
            threshold=req.threshold,
            count=req.count,
        )

        def to_item(r: dict) -> SearchResultItem:
            return SearchResultItem(
                id=r["id"],
                chatSessionId=r.get("chat_session_id"),
                userText=r.get("user_text"),
                combinedText=r.get("combined_text"),
                createdAt=r.get("created_at"),
                imageUrl=r.get("image_url"),
                imageCaption=r.get("image_caption"),
                imageTags=r.get("image_tags"),
                takenAt=r.get("taken_at"),
                placeName=r.get("place_name"),
                similarity=r["similarity"],
            )

        return SearchResponse(
            photos=[to_item(r) for r in result["photos"]],
            memos=[to_item(r) for r in result["memos"]],
            total=result["total"],
        )
    except Exception as e:
        logger.error("검색 실패: %s", e)
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
