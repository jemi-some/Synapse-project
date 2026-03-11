"""
OpenAI 서비스 — 벡터화 파이프라인 + 임베딩 + MCP 라우팅 + 스레드 대화

Phase 1-A:
- extract_vision_tags()      — GPT-4o Vision으로 사진의 시각적 태그 추출
- generate_context_summary() — 메타데이터 + vision_tags + 사용자 텍스트를 자연어 요약
- create_embedding()         — 요약문을 1536차원 벡터로 변환
- analyze_and_vectorize()    — 위 3개를 연결하고 Supabase에 저장하는 오케스트레이터

Phase 1-B:
- route_message()            — MCP Tool Calling으로 의도 판별 후 분기
- thread_conversation()      — 스레드 내 멀티턴 대화 (검색 결과 context 기반)
"""

import json
import logging

from app.config import (
    openai_client,
    DEFAULT_VISION_MODEL,
    DEFAULT_CHAT_MODEL,
    DEFAULT_EMBEDDING_MODEL,
    IMAGE_DETAIL,
)

logger = logging.getLogger(__name__)


def _parse_json_response(text: str) -> dict:
    """JSON 응답 파싱 (코드 블록 제거 포함)"""
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned.removeprefix("```json").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```").strip()
    if cleaned.endswith("```"):
        cleaned = cleaned.removesuffix("```").strip()
    return json.loads(cleaned)


# ============================================================
# 1. Vision 태그 추출 (GPT-4o)
# ============================================================

async def extract_vision_tags(image_url: str) -> dict:
    """
    GPT-4o Vision API로 사진을 분석하여 시각적 태그를 추출합니다.

    Returns:
        {
            "objects": ["해바라기", "푸른 초원", "울타리"],
            "peopleCount": 0,
            "dominantColors": ["Green", "Yellow", "Blue"],
            "scene": "야외 자연 풍경",
            "mood": "평화로움"
        }
    """
    response = openai_client.chat.completions.create(
        model=DEFAULT_VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 이미지 분석 전문가입니다. "
                    "주어진 사진을 보고 아래 JSON 형식으로만 응답하세요. "
                    "다른 텍스트는 절대 포함하지 마세요."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "이 사진을 분석하여 다음 JSON 형식으로 응답해주세요:\n"
                            "{\n"
                            '  "objects": ["사진에 보이는 주요 사물/피사체 목록 (한국어)"],\n'
                            '  "peopleCount": 사진에 보이는 사람 수 (숫자),\n'
                            '  "dominantColors": ["사진의 주요 색상 목록 (영어)"],\n'
                            '  "scene": "사진의 전체적인 장면/배경 설명 (한국어, 짧게)",\n'
                            '  "mood": "사진에서 느껴지는 분위기 (한국어, 한 단어)"\n'
                            "}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": IMAGE_DETAIL},
                    },
                ],
            },
        ],
        max_tokens=300,
    )

    result_text = response.choices[0].message.content
    try:
        return _parse_json_response(result_text)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("vision_tags JSON 파싱 실패: %s", e)
        return {"objects": [], "peopleCount": 0, "dominantColors": [], "scene": "", "mood": ""}


# ============================================================
# 2. 자연어 요약문 생성 (GPT-4o-mini)
# ============================================================

async def generate_context_summary(
    metadata: dict | None = None,
    vision_tags: dict | None = None,
    user_text: str | None = None,
) -> str:
    """
    메타데이터 + 시각적 태그 + 사용자 텍스트를 종합하여
    자연어 기반 요약문(context_summary)을 생성합니다.

    이 요약문이 벡터화(임베딩)의 원본 텍스트가 됩니다.
    검색 품질은 이 요약문의 품질에 직접적으로 영향받습니다.

    Args:
        metadata: 프론트엔드에서 추출한 메타데이터 (위치, 시간, 날씨 등)
        vision_tags: extract_vision_tags()의 결과
        user_text: 사용자가 함께 입력한 텍스트 (메모, 감정 등)

    Returns:
        자연어 요약문 (예: "2018년 여름, 제주도 렛츠런팜에서...")
    """
    # 프롬프트에 넣을 정보 조합
    parts = []

    if metadata:
        capture_time = metadata.get("captureTime", {})
        location = metadata.get("location", {})
        environment = metadata.get("environment", {})

        if capture_time:
            parts.append(f"촬영 시간: {json.dumps(capture_time, ensure_ascii=False)}")
        if location and location.get("hasLocation"):
            parts.append(f"촬영 장소: {location.get('shortAddress', '')} {location.get('poi', '')}")
        if environment:
            parts.append(f"날씨/환경: {json.dumps(environment, ensure_ascii=False)}")

    if vision_tags:
        if vision_tags.get("objects"):
            parts.append(f"사진 속 사물: {', '.join(vision_tags['objects'])}")
        if vision_tags.get("peopleCount", 0) > 0:
            parts.append(f"사람 수: {vision_tags['peopleCount']}명")
        if vision_tags.get("scene"):
            parts.append(f"장면: {vision_tags['scene']}")
        if vision_tags.get("mood"):
            parts.append(f"분위기: {vision_tags['mood']}")

    if user_text:
        parts.append(f"사용자 메모: \"{user_text}\"")

    context_info = "\n".join(parts)

    response = openai_client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 사진과 메모의 맥락을 자연스러운 한국어 문장으로 요약하는 전문가입니다. "
                    "아래 정보를 종합하여 2~3문장의 서술형 요약문을 작성하세요. "
                    "이 요약문은 나중에 사용자가 '그때 그 사진'을 검색할 때 매칭되어야 하므로, "
                    "시간, 장소, 사물, 감정, 분위기 등 핵심 키워드를 자연스럽게 포함하세요. "
                    "JSON이 아닌 순수한 문장으로만 응답하세요."
                ),
            },
            {
                "role": "user",
                "content": f"다음 정보를 종합하여 자연어 요약문을 작성해주세요:\n\n{context_info}",
            },
        ],
        max_tokens=200,
        temperature=0.3,  # 일관된 요약을 위해 낮은 temperature
    )

    return response.choices[0].message.content.strip()


# ============================================================
# 3. 임베딩 벡터 생성 (text-embedding-3-small)
# ============================================================

async def create_embedding(text: str) -> list[float]:
    """
    텍스트를 OpenAI text-embedding-3-small 모델로 1536차원 벡터로 변환합니다.

    Args:
        text: 임베딩할 텍스트 (보통 context_summary)

    Returns:
        1536개의 float로 구성된 벡터 배열
    """
    response = openai_client.embeddings.create(
        model=DEFAULT_EMBEDDING_MODEL,
        input=text,
    )

    return response.data[0].embedding


# ============================================================
# 4. 벡터화 파이프라인 오케스트레이터
# ============================================================

async def analyze_and_vectorize(
    image_url: str,
    metadata: dict | None = None,
    memory_id: str | None = None,
    user_text: str | None = None,
) -> dict:
    """
    벡터화 파이프라인 오케스트레이터.
    사진의 Vision 분석 → 자연어 요약 → 임베딩 → DB 저장을 순차 실행합니다.

    Args:
        image_url: Supabase Storage의 이미지 URL
        metadata: 프론트엔드에서 추출한 메타데이터 (JSONB)
        memory_id: memories 테이블의 UUID (프론트에서 INSERT 후 전달)
        user_text: 사용자가 함께 입력한 텍스트

    Returns:
        { vision_tags, context_summary, embedding_dimensions }
    """
    from app.services.supabase_service import update_memory_vectorization

    # 1단계: Vision API로 시각적 태그 추출
    logger.info("1/3 Vision 태그 추출 시작: %s", image_url[:50])
    vision_tags = await extract_vision_tags(image_url)

    # 2단계: 자연어 요약문 생성
    logger.info("2/3 Context Summary 생성 시작")
    context_summary = await generate_context_summary(
        metadata=metadata,
        vision_tags=vision_tags,
        user_text=user_text,
    )

    # 3단계: 임베딩 벡터 생성
    logger.info("3/3 임베딩 벡터 생성 시작")
    embedding = await create_embedding(context_summary)

    # 4단계: DB 저장
    if memory_id:
        await update_memory_vectorization(
            memory_id=memory_id,
            vision_tags=vision_tags,
            context_summary=context_summary,
            embedding=embedding,
        )
        logger.info("벡터화 파이프라인 완료: memory_id=%s", memory_id)

    return {
        "vision_tags": vision_tags,
        "context_summary": context_summary,
        "embedding_dimensions": len(embedding),
    }


# ============================================================
# Phase 1-B: MCP 채팅 라우팅
# ============================================================
# route_message()가 전체 흐름을 관장합니다:
#   1. LLM에게 사용자 메시지 + 도구 목록 전달 (1st turn)
#   2. LLM이 도구 호출을 결정하면, 실제 함수 실행
#   3. 실행 결과를 LLM에게 다시 전달 (2nd turn)
#   4. LLM이 최종 사용자 응답 생성


async def _execute_search_memories(query: str, user_id: str) -> dict:
    """
    search_memories 도구 실행기.
    LLM이 "search_memories를 호출하겠다"고 결정하면 이 함수가 실행됩니다.

    흐름: 검색어 → 임베딩 → Supabase 유사도 검색 → 결과 반환
    """
    from app.services.supabase_service import search_memories

    # 검색어를 벡터로 변환
    query_embedding = await create_embedding(query)

    # DB에서 유사한 기억 검색
    results = await search_memories(
        query_embedding=query_embedding,
        user_id=user_id,
    )

    return {
        "action": "search",
        "query": query,
        "results": results,
        "count": len(results),
    }


async def _execute_save_memo(
    content: str, user_id: str, session_id: str
) -> dict:
    """
    save_memo 도구 실행기.
    LLM이 "save_memo를 호출하겠다"고 결정하면 이 함수가 실행됩니다.

    흐름: 메모 텍스트 → context_summary 생성 → 임베딩 → DB 저장
    """
    from app.services.supabase_service import save_text_memory

    # 메모를 자연어 요약 (메모 자체가 짧으면 그대로 사용될 수 있음)
    context_summary = await generate_context_summary(user_text=content)

    # 요약문을 벡터로 변환
    embedding = await create_embedding(context_summary)

    # DB에 저장
    saved = await save_text_memory(
        user_id=user_id,
        chat_session_id=session_id,
        user_text=content,
        context_summary=context_summary,
        embedding=embedding,
    )

    return {
        "action": "save_memo",
        "content": content,
        "memory_id": saved[0]["id"] if saved else None,
    }


async def route_message(
    message: str,
    user_id: str,
    session_id: str,
) -> dict:
    """
    MCP 라우팅 오케스트레이터.
    사용자의 텍스트 메시지를 분석하여 적절한 도구를 호출하고 응답을 생성합니다.

    Args:
        message: 사용자가 입력한 텍스트
        user_id: 사용자 UUID
        session_id: 채팅 세션 UUID

    Returns:
        {
            "response": "LLM의 최종 응답 텍스트",
            "actions": [
                { "action": "search", "query": "...", "results": [...] },
                { "action": "save_memo", "content": "...", "memory_id": "..." }
            ]
        }
    """
    from app.services.mcp_tools import TOOLS, ROUTING_SYSTEM_PROMPT

    # ── 1st Turn: LLM에게 메시지 + 도구 전달 ──
    messages = [
        {"role": "system", "content": ROUTING_SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]

    response = openai_client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",  # LLM이 도구 호출 여부를 자동 판단
    )

    assistant_message = response.choices[0].message
    tool_calls = assistant_message.tool_calls
    actions = []

    # ── 도구 호출이 없으면 (일반 잡담) → 바로 반환 ──
    if not tool_calls:
        return {
            "response": assistant_message.content,
            "actions": [],
        }

    # ── 2nd Turn: 도구 실행 → 결과를 LLM에게 전달 ──

    # 대화 히스토리에 assistant의 도구 호출 결정을 추가
    messages.append(assistant_message)

    # 각 도구 호출을 순차 실행
    for tool_call in tool_calls:
        fn_name = tool_call.function.name
        fn_args = json.loads(tool_call.function.arguments)

        logger.info("MCP 도구 호출: %s(%s)", fn_name, fn_args)

        # 도구별 실제 함수 실행
        if fn_name == "search_memories":
            result = await _execute_search_memories(
                query=fn_args["query"],
                user_id=user_id,
            )
        elif fn_name == "save_memo":
            result = await _execute_save_memo(
                content=fn_args["content"],
                user_id=user_id,
                session_id=session_id,
            )
        else:
            result = {"error": f"알 수 없는 도구: {fn_name}"}

        actions.append(result)

        # 도구 실행 결과를 대화 히스토리에 추가
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result, ensure_ascii=False, default=str),
        })

    # ── 2nd Turn 응답: 도구 결과를 본 LLM이 최종 응답 생성 ──
    final_response = openai_client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=messages,
    )

    return {
        "response": final_response.choices[0].message.content,
        "actions": actions,
    }


# ============================================================
# 스레드 멀티턴 대화 (시나리오 7)
# ============================================================

THREAD_SYSTEM_PROMPT = """당신은 사용자의 소중한 기억을 함께 이야기하는 AI 비서 'Synapse'입니다.

지금은 메인 피드가 아닌 **스레드** 안에서 대화하고 있습니다.
스레드의 시작점(부모 메시지)에는 검색 결과나 특정 기억이 포함되어 있습니다.
이 context를 참고하여 사용자와 깊은 대화를 이어가세요.

## 대화 규칙
- 부모 메시지의 context(검색 결과, 사진 정보 등)를 자연스럽게 활용하세요.
- 사용자가 "첫 번째", "두 번째" 등으로 지칭하면, 검색 결과 순서에 맞춰 이해하세요.
- 따뜻하고 공감적인 톤으로 추억을 함께 회상하세요.
- 한국어로 응답하세요.
"""


async def thread_conversation(
    message: str,
    parent_message_id: str,
) -> dict:
    """
    스레드 내 멀티턴 대화.
    부모 메시지(검색 결과 등)의 context를 유지하면서 대화를 이어갑니다.

    Args:
        message: 사용자의 새 메시지
        parent_message_id: 스레드의 부모 메시지 UUID

    Returns:
        { "response": "LLM의 응답 텍스트" }
    """
    from app.services.supabase_service import get_thread_messages

    # DB에서 부모 메시지 + 이전 스레드 대화 조회
    thread_data = await get_thread_messages(parent_message_id)
    parent = thread_data["parent"]
    previous_messages = thread_data["messages"]

    # 대화 히스토리 구성
    messages = [
        {"role": "system", "content": THREAD_SYSTEM_PROMPT},
    ]

    # 부모 메시지의 내용을 context로 추가
    if parent:
        messages.append({
            "role": "assistant" if parent.get("role") == "assistant" else "user",
            "content": f"[스레드 시작 — 부모 메시지]\n{parent.get('content', '')}",
        })

    # 이전 스레드 대화 추가
    for msg in previous_messages:
        messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    # 사용자의 새 메시지 추가
    messages.append({"role": "user", "content": message})

    # LLM 응답 생성
    response = openai_client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=messages,
        temperature=0.7,
    )

    return {
        "response": response.choices[0].message.content,
    }
