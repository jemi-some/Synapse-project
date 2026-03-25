"""
OpenAI 서비스 — 공통 OpenAI API 호출 함수

- extract_vision_tags()   — GPT-4o Vision으로 사진 분석 (V2: image_caption + image_tags 반환)
- create_embedding()      — 텍스트를 1536차원 벡터로 변환
- thread_conversation()   — 스레드 내 멀티턴 대화 (검색 결과 context 기반)

Logic 1 (벡터화 파이프라인): vectorize_service.py
Logic 2 (기록 처리 MVP):     record_service.py
"""

import base64
import json
import logging

import httpx

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
# 1. Vision 분석 (GPT-4o) — V2
# ============================================================

async def _fetch_image_as_base64(image_url: str) -> str:
    """이미지 URL을 다운로드해서 base64 data URI로 변환합니다."""
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(image_url)
        res.raise_for_status()
        b64 = base64.b64encode(res.content).decode()
        content_type = res.headers.get("content-type", "image/jpeg").split(";")[0]
        return f"data:{content_type};base64,{b64}"


async def extract_vision_tags(image_url: str) -> dict:
    """
    GPT-4o Vision API로 사진을 분석합니다.

    V2 반환 형식:
        {
            "image_caption": "햇빛이 드는 실내 창가 근처에 고양이가 누워 있는 장면",
            "image_tags": ["고양이", "창가", "햇빛", "실내", "휴식", "주간"]
        }
    """
    image_data_uri = await _fetch_image_as_base64(image_url)

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
                            '  "image_caption": "사진 전체 장면을 한 문장으로 서술 (한국어, ~하는 장면 형식)",\n'
                            '  "image_tags": ["핵심 키워드 6개 내외 (한국어) — 장소, 피사체, 날씨/시간대, 행동/분위기 포함"]\n'
                            "}\n\n"
                            "예시:\n"
                            '{ "image_caption": "햇빛이 드는 실내 창가 근처에 고양이가 누워 있는 장면", '
                            '"image_tags": ["고양이", "창가", "햇빛", "실내", "휴식", "주간"] }'
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data_uri, "detail": IMAGE_DETAIL},
                    },
                ],
            },
        ],
        max_tokens=200,
    )

    result_text = response.choices[0].message.content
    try:
        return _parse_json_response(result_text)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("vision_tags JSON 파싱 실패: %s", e)
        return {"image_caption": "", "image_tags": []}


# ============================================================
# 2. 임베딩 벡터 생성 (text-embedding-3-small)
# ============================================================

async def create_embedding(text: str) -> list[float]:
    """
    텍스트를 OpenAI text-embedding-3-small 모델로 1536차원 벡터로 변환합니다.

    Args:
        text: 임베딩할 텍스트 (보통 combined_text)

    Returns:
        1536개의 float로 구성된 벡터 배열
    """
    response = openai_client.embeddings.create(
        model=DEFAULT_EMBEDDING_MODEL,
        input=text,
    )

    return response.data[0].embedding


# ============================================================
# 3. 스레드 멀티턴 대화
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
