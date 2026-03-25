"""
Logic 3: 검색 (V2)

흐름:
  POST /api/ai/search
    → create_embedding(query)     검색어 → 1536차원 벡터
    → match_memories RPC          pgvector 유사도 검색
    → photos / memos 분류         image_url 유무로 판단
    → 결과 반환

V1과의 차이:
  - V1: route_message() → Tool Calling → _execute_search_memories()
  - V2: 검색창에서 이 엔드포인트 직접 호출. LLM / Tool Calling 없음.
  - 결과 분류 기준: file_url → image_url (memory_images JOIN 여부)
  - match_threshold: 0.3 → 0.25 (V2에서 완화)
"""

import logging

from app.services.openai_service import create_embedding

logger = logging.getLogger(__name__)


async def search_memories_by_query(
    query: str,
    user_id: str,
    threshold: float = 0.25,
    count: int = 5,
) -> dict:
    """
    검색어로 유사한 기억을 찾아 사진/텍스트로 분류하여 반환합니다.

    Args:
        query:     사용자가 입력한 검색어
        user_id:   Supabase Auth 사용자 UUID
        threshold: 유사도 임계치 (V2 기본값: 0.25, V1: 0.3)
        count:     최대 반환 개수

    Returns:
        {
            "photos": [{ id, user_text, image_url, image_caption, image_tags, similarity }, ...],
            "memos":  [{ id, user_text, combined_text, similarity }, ...],
            "total":  검색 결과 전체 수
        }
    """
    from app.services.supabase_service import search_memories

    # 1단계: 검색어 임베딩
    logger.info("검색 시작: query=%s, user_id=%s", query[:30], user_id)
    query_embedding = await create_embedding(query)

    # 2단계: pgvector 유사도 검색
    results = await search_memories(
        query_embedding=query_embedding,
        user_id=user_id,
        threshold=threshold,
        count=count,
    )

    # 3단계: image_url 유무로 사진/텍스트 분류
    # memory_images가 JOIN된 결과만 image_url이 존재함
    photos = [r for r in results if r.get("image_url")]
    memos = [r for r in results if not r.get("image_url")]

    logger.info("검색 완료: photos=%d, memos=%d", len(photos), len(memos))

    return {
        "photos": photos,
        "memos": memos,
        "total": len(results),
    }
