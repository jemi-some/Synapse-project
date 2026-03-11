"""
Supabase 서비스 — 기억(memories) 저장 및 유사도 검색

주요 함수:
- get_client(): Supabase 클라이언트 싱글톤
- save_text_memory(): 텍스트 메모를 memories 테이블에 INSERT + 벡터화
- update_memory_vectorization(): 사진의 vision_tags, context_summary, embedding을 DB에 UPDATE
- search_memories(): match_memories RPC를 호출하여 유사한 기억 검색
"""

import logging
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

logger = logging.getLogger(__name__)

# ============================================================
# Supabase 클라이언트 (싱글톤)
# ============================================================

_supabase_client: Client | None = None


def get_client() -> Client:
    """
    Supabase 클라이언트를 반환합니다.
    최초 호출 시 1회만 생성하고, 이후에는 동일 인스턴스를 재사용합니다.
    service_role 키를 사용하므로 RLS를 우회합니다.
    """
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise ValueError("SUPABASE_URL과 SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase_client


# ============================================================
# 텍스트 메모 저장 (MCP save_memo 도구가 호출)
# ============================================================

async def save_text_memory(
    user_id: str,
    chat_session_id: str,
    user_text: str,
    context_summary: str,
    embedding: list[float],
) -> dict:
    """
    텍스트 메모를 memories 테이블에 새로 INSERT합니다.
    사진 없이 텍스트만 입력한 경우 (시나리오 3: 메모/일기).

    Args:
        user_id: 사용자 UUID
        chat_session_id: 현재 세션 UUID
        user_text: 사용자가 입력한 메모 원본
        context_summary: AI가 생성한 자연어 요약문
        embedding: context_summary를 임베딩한 1536차원 벡터

    Returns:
        생성된 레코드
    """
    client = get_client()

    result = (
        client.table("memories")
        .insert({
            "user_id": user_id,
            "chat_session_id": chat_session_id,
            "user_text": user_text,
            "context_summary": context_summary,
            "embedding": embedding,
        })
        .execute()
    )

    logger.info("텍스트 메모 저장 완료: user_id=%s", user_id)
    return result.data


# ============================================================
# 사진 벡터화 결과 저장 (vectorize 파이프라인이 호출)
# ============================================================

async def update_memory_vectorization(
    memory_id: str,
    vision_tags: dict,
    context_summary: str,
    embedding: list[float],
) -> dict:
    """
    memories 테이블의 특정 레코드에 벡터화 결과를 업데이트합니다.
    프론트에서 사진 + 메타데이터를 먼저 INSERT한 뒤, 백엔드가 나머지를 UPDATE.

    Args:
        memory_id: memories 테이블의 UUID
        vision_tags: Vision API가 추출한 시각적 태그
        context_summary: AI가 생성한 자연어 요약문
        embedding: context_summary를 임베딩한 1536차원 벡터

    Returns:
        업데이트된 레코드
    """
    client = get_client()

    result = (
        client.table("memories")
        .update({
            "vision_tags": vision_tags,
            "context_summary": context_summary,
            "embedding": embedding,
        })
        .eq("id", memory_id)
        .execute()
    )

    logger.info("벡터화 저장 완료: memory_id=%s", memory_id)
    return result.data


# ============================================================
# 유사도 검색 (match_memories RPC)
# ============================================================

async def search_memories(
    query_embedding: list[float],
    user_id: str,
    threshold: float = 0.3,
    count: int = 5,
) -> list[dict]:
    """
    사용자의 검색 쿼리 벡터와 유사한 기억(사진+메모)을 찾습니다.
    DB의 match_memories RPC 함수를 호출합니다.

    Args:
        query_embedding: 검색어를 임베딩한 1536차원 벡터
        user_id: 현재 사용자 UUID (내 기억만 검색)
        threshold: 유사도 임계치 (0~1, 높을수록 엄격)
        count: 최대 반환 개수

    Returns:
        유사도 내림차순으로 정렬된 기억 목록
        각 항목: { id, chat_session_id, file_url, file_name, user_text, metadata, vision_tags, context_summary, similarity }
    """
    client = get_client()

    result = client.rpc(
        "match_memories",
        {
            "query_embedding": query_embedding,
            "match_threshold": threshold,
            "match_count": count,
            "filter_user_id": user_id,
        },
    ).execute()

    logger.info("유사도 검색 완료: %d건 반환 (user_id=%s)", len(result.data), user_id)
    return result.data
