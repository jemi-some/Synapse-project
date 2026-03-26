"""
Supabase 서비스 — 기록 저장 및 유사도 검색

Logic 2 (record_service.py):
- save_memory():                텍스트 기록 INSERT (combined_text, combined_embedding)
- save_record_chat_messages():  raw_input + memory_card 두 행 INSERT

Logic 1 (vectorize_service.py):
- update_memory_images():           memory_images 테이블 INSERT
- update_memories_vectorization():  memories 테이블 combined_text + combined_embedding UPDATE

공통:
- search_memories():     match_memories RPC 호출
- get_thread_messages(): 스레드 대화 조회
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
# Logic 2: 텍스트 기록 저장 (record_service.py가 호출)
# ============================================================

async def save_memory(
    user_id: str,
    chat_session_id: str,
    user_text: str,
    combined_text: str,
    combined_embedding: list[float],
    location_name: str | None = None,
) -> list[dict]:
    """
    텍스트 기록을 memories 테이블에 INSERT합니다.

    Args:
        user_id:            사용자 UUID
        chat_session_id:    현재 세션 UUID
        user_text:          사용자가 입력한 원본 텍스트
        combined_text:      임베딩용 구조화 텍스트 (Phase A: user_text와 동일)
        combined_embedding: combined_text의 1536차원 벡터
        location_name:      기록 시점 위치명 (Nominatim reverse geocoding, 없으면 None)

    Returns:
        생성된 레코드 목록
    """
    client = get_client()

    result = (
        client.table("memories")
        .insert({
            "user_id": user_id,
            "chat_session_id": chat_session_id,
            "user_text": user_text,
            "combined_text": combined_text,
            "combined_embedding": combined_embedding,
            "location_name": location_name,
        })
        .execute()
    )

    logger.info("기록 저장 완료: user_id=%s", user_id)
    return result.data


async def save_record_chat_messages(
    session_id: str,
    user_text: str,
    memory_id: str | None,
) -> None:
    """
    기록 저장 시 chat_messages에 두 행을 INSERT합니다.

    저장 행:
      1. raw_input   — 사용자 입력 원본 (role: user, is_visible: true)
      2. memory_card — 저장 완료 카드 (role: assistant, is_visible: true, memory_id 포함)

    Args:
        session_id: chat_sessions UUID
        user_text:  사용자가 입력한 원본 텍스트
        memory_id:  저장된 memories UUID
    """
    client = get_client()

    rows = [
        # 1행: 사용자 입력 원본
        {
            "chat_session_id": session_id,
            "role": "user",
            "message_type": "raw_input",
            "content": user_text,
            "is_visible": True,
            "status": "completed",
        },
        # 2행: 저장 완료 카드 (프론트에서 memory_card UI로 표시)
        {
            "chat_session_id": session_id,
            "role": "assistant",
            "message_type": "memory_card",
            "content": None,
            "memory_id": memory_id,
            "is_visible": True,
            "status": "completed",
        },
    ]

    client.table("chat_messages").insert(rows).execute()
    logger.info("chat_messages INSERT 완료: session_id=%s, memory_id=%s", session_id, memory_id)


# ============================================================
# Logic 1: 사진 벡터화 결과 저장 (vectorize_service.py가 호출)
# ============================================================

async def update_memory_images(
    memory_id: str,
    image_caption: str | None,
    image_tags: list | None,
) -> list[dict]:
    """
    memory_images 테이블의 Vision 분석 결과(image_caption, image_tags)를 UPDATE합니다.

    프론트에서 이미 INSERT한 행(image_url, taken_at, place_name, exif_json)에
    백엔드 Vision 분석 결과만 채웁니다.

    Args:
        memory_id:     memories 테이블 UUID (FK)
        image_caption: Vision API가 생성한 사진 한 줄 설명
        image_tags:    Vision API가 추출한 키워드 목록 (JSONB)

    Returns:
        업데이트된 레코드 목록
    """
    client = get_client()

    result = (
        client.table("memory_images")
        .update({
            "image_caption": image_caption,
            "image_tags": image_tags,
        })
        .eq("memory_id", memory_id)
        .execute()
    )

    logger.info("memory_images Vision 결과 UPDATE 완료: memory_id=%s", memory_id)
    return result.data


async def update_memories_vectorization(
    memory_id: str,
    combined_text: str,
    combined_embedding: list[float],
) -> list[dict]:
    """
    memories 테이블에 combined_text + combined_embedding을 UPDATE합니다.

    Args:
        memory_id:          memories 테이블 UUID
        combined_text:      임베딩용 구조화 텍스트
        combined_embedding: combined_text의 1536차원 벡터

    Returns:
        업데이트된 레코드 목록
    """
    client = get_client()

    result = (
        client.table("memories")
        .update({
            "combined_text": combined_text,
            "combined_embedding": combined_embedding,
        })
        .eq("id", memory_id)
        .execute()
    )

    logger.info("memories 벡터화 업데이트 완료: memory_id=%s", memory_id)
    return result.data


# ============================================================
# 공통: 유사도 검색 (match_memories RPC)
# ============================================================

async def search_memories(
    query_embedding: list[float],
    user_id: str,
    threshold: float = 0.25,
    count: int = 5,
) -> list[dict]:
    """
    사용자의 검색 쿼리 벡터와 유사한 기억을 찾습니다.
    DB의 match_memories RPC 함수를 호출합니다.

    Args:
        query_embedding: 검색어를 임베딩한 1536차원 벡터
        user_id:         현재 사용자 UUID (내 기억만 검색)
        threshold:       유사도 임계치 (0~1, 높을수록 엄격)
        count:           최대 반환 개수

    Returns:
        유사도 내림차순으로 정렬된 기억 목록
        각 항목: { id, chat_session_id, user_text, combined_text, created_at, image_url, image_caption, image_tags, taken_at, place_name, similarity }
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


# ============================================================
# 공통: 스레드 대화 조회
# ============================================================

async def get_thread_messages(
    parent_message_id: str,
) -> dict:
    """
    스레드의 부모 메시지와 이전 대화 내역을 조회합니다.

    Returns:
        {
            "parent": { id, content, role, message_type, ... },
            "messages": [ { id, content, role, ... }, ... ]
        }
    """
    client = get_client()

    parent_result = (
        client.table("chat_messages")
        .select("*")
        .eq("id", parent_message_id)
        .single()
        .execute()
    )

    thread_result = (
        client.table("chat_messages")
        .select("*")
        .eq("parent_message_id", parent_message_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {
        "parent": parent_result.data,
        "messages": thread_result.data,
    }
