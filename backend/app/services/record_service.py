"""
Logic 2: 메인 피드 기록 처리 (V2 — MVP Phase A)

MVP Phase A: LLM 호출 없이 저장만.
  사용자 입력
    → memories INSERT (user_text + combined_text + combined_embedding)
    → chat_messages INSERT x2 (raw_input 행 + memory_card 행)

Phase B 이후: Structured Output + Tool Calling 하이브리드
  (docs/6_history_and_logs/logic_02_record_processing_v2.md 참조)

V1과의 차이:
  - V1: route_message() → LLM Tool Calling으로 의도 판별 후 save_memo 도구 실행
  - V2 Phase A: LLM 호출 없음. 입력을 바로 memories에 저장하고 카드 반환
"""

import logging

from app.services.openai_service import create_embedding

logger = logging.getLogger(__name__)


async def save_record(
    user_text: str,
    user_id: str,
    session_id: str,
    location_name: str | None = None,
) -> dict:
    """
    텍스트 기록 저장 (MVP Phase A).

    1. combined_text = user_text (Phase A: 구조화 없이 그대로)
    2. combined_embedding 생성
    3. memories INSERT
    4. chat_messages INSERT — raw_input 행 + memory_card 행

    Args:
        user_text:      사용자가 입력한 텍스트
        user_id:        Supabase Auth 사용자 UUID
        session_id:     chat_sessions UUID
        location_name:  기록 시점 위치명 (Nominatim reverse geocoding, 없으면 None)

    Returns:
        { memory_id, session_id }
    """
    from app.services.supabase_service import save_memory, save_record_chat_messages

    # Phase A: combined_text = user_text 그대로
    # Phase B 이후: Structured Output으로 분류 + 구조화 텍스트 조합 예정
    combined_text = user_text
    combined_embedding = await create_embedding(combined_text)

    # memories 테이블 INSERT
    memory = await save_memory(
        user_id=user_id,
        chat_session_id=session_id,
        user_text=user_text,
        combined_text=combined_text,
        combined_embedding=combined_embedding,
        location_name=location_name,
    )
    memory_id = memory[0]["id"] if memory else None

    # chat_messages INSERT: raw_input + memory_card
    await save_record_chat_messages(
        session_id=session_id,
        user_text=user_text,
        memory_id=memory_id,
    )

    logger.info("기록 저장 완료: memory_id=%s, session_id=%s", memory_id, session_id)
    return {
        "memory_id": memory_id,
        "session_id": session_id,
    }
