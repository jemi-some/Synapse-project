"""
OpenAI 서비스 — Supabase Edge Function 로직을 Python으로 포팅

기존 Edge Functions:
- analyze-image/index.ts → analyze_image()
- openai-chat/index.ts   → generate_chat_response(), generate_session_summary(), create_embedding()
"""

import json
import logging

from app.config import openai_client, DEFAULT_VISION_MODEL, DEFAULT_CHAT_MODEL, IMAGE_DETAIL
from app.schemas.ai import ImageMetadata

logger = logging.getLogger(__name__)


# ============================================================
# 프롬프트 템플릿 (Edge Function에서 그대로 가져옴)
# ============================================================

PROMPTS = {
    "description": {
        "text": "이 이미지를 보고 짧게 설명해주세요. 그리고 사진은 사용자의 추억이며, 사진의 문맥에 맞는 질문을 하나 해주세요.",
        "max_tokens": 400,
    },
    "emotion": {
        "text": '이 이미지의 감정과 분위기를 분석해주세요. 다음 형식으로 응답해주세요: {"emotion": "감정", "mood": "분위기", "description": "설명"}',
        "max_tokens": 200,
    },
    "default": {
        "text": "이 이미지에 대해 자세히 설명해주세요.",
        "max_tokens": 300,
    },
}

CONTEXT_ANALYSIS_RESPONSE_FORMAT = """
{
  "description": "이미지와 메타데이터를 종합하여 시간과 장소를 자연스럽게 언급하는 친절한 첫 인사말 (1-2문장)",
  "context": "시각 정보와 메타데이터가 결합된 구체적 상황 요약 (내부 컨텍스트 유지용)",
  "question": "사용자가 이 사진과 관련된 기분 좋은 기억이나 구체적인 에피소드를 떠올려서 대답할 수 있는 다정하고 호기심 어린 질문 1개"
}"""

IMAGE_ANALYSIS_SYSTEM_PROMPT = (
    "당신은 사용자의 사진 속 소중한 추억을 찾아주고 함께 이야기를 나누는 다정한 '기억 가이드' AI입니다. "
    "사용자가 전해준 사진과, 사진에서 추출된 정확한 정보(시간, 장소, 날씨, 카메라 등)를 활용하세요. "
    "정보를 기계적으로 나열하지 말고, 마치 오랜 친구가 사진을 보며 '아, 2023년 가을에 제주도로 여행 갔을 때구나! 이때 날씨가 엄청 좋아보이는데, 누구랑 갔었어?'라고 묻는 것처럼 "
    "자연스럽고 따뜻하게 말을 건네야 합니다. 질문은 반드시 대화를 이어가고 싶게 만드는 1개의 구체적인 질문이어야 합니다."
)


def _build_context_prompt(metadata: ImageMetadata | None) -> str:
    """메타데이터 기반 컨텍스트 프롬프트 생성"""
    prompt = "첨부된 사진과 아래의 메타데이터를 분석하여, 사용자와 자연스럽고 반가운 추억 대화를 시작해주세요.\n\n"

    if metadata:
        prompt += "[사진 원본 메타데이터 정보]\n"

        if getattr(metadata, "captureTime", None):
            t = metadata.captureTime
            local_time = getattr(t, "local", "")
            season = getattr(t, "season", "")
            time_of_day = getattr(t, "timeOfDay", "")
            prompt += f"• 촬영 일시: {local_time} ({season}계절, {time_of_day})\n"

        if getattr(metadata, "location", None) and getattr(metadata.location, "hasLocation", False):
            loc = metadata.location
            address = getattr(loc, "shortAddress", getattr(loc, "fullAddress", ""))
            poi = getattr(loc, "poi", "")
            if address:
                prompt += f"• 촬영 장소: {address}"
                if poi:
                    prompt += f" ({poi} 근처)"
                prompt += "\n"

        if getattr(metadata, "device", None) or getattr(metadata, "camera", None):
            cam = getattr(metadata, "camera", getattr(metadata, "device", {}))
            if isinstance(cam, dict):
                make = cam.get("make")
                model = cam.get("model")
            else:
                make = getattr(cam, "make", "")
                model = getattr(cam, "model", "")
            if make or model:
                prompt += f"• 기종: {make} {model}\n"

        if getattr(metadata, "derived", None):
            d = metadata.derived
            if getattr(d, "lightCondition", None):
                prompt += f"• 조명 및 노출: {d.lightCondition}\n"
            if getattr(d, "subjectHint", None):
                prompt += f"• AI 사전 분석 주제 힌트: {d.subjectHint}\n"

    prompt += "\n위 정보들을 종합하여, 다음 JSON 형식으로만 정확히 응답해주세요:\n" + CONTEXT_ANALYSIS_RESPONSE_FORMAT
    return prompt


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
# 이미지 분석 (analyze-image Edge Function 대응)
# ============================================================

async def analyze_image(image_url: str, analysis_type: str = "description", metadata: ImageMetadata | None = None) -> dict | str:
    """
    이미지 분석 수행.
    
    - description: 간단한 설명 + 질문
    - emotion: 감정/분위기 분석 (JSON)
    - context_analysis: 메타데이터 기반 상세 분석 (JSON)
    """
    # 프롬프트 결정
    if analysis_type == "context_analysis":
        prompt_text = _build_context_prompt(metadata)
        max_tokens = 500
    elif analysis_type in PROMPTS:
        prompt_text = PROMPTS[analysis_type]["text"]
        max_tokens = PROMPTS[analysis_type]["max_tokens"]
    else:
        prompt_text = PROMPTS["default"]["text"]
        max_tokens = PROMPTS["default"]["max_tokens"]

    # OpenAI API 호출
    response = openai_client.chat.completions.create(
        model=DEFAULT_VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": IMAGE_ANALYSIS_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": IMAGE_DETAIL},
                    },
                ],
            },
        ],
        max_tokens=max_tokens,
    )

    result_text = response.choices[0].message.content

    # JSON 파싱 필요한 타입 처리
    if analysis_type in ("emotion", "context_analysis"):
        try:
            return _parse_json_response(result_text)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("JSON 파싱 실패: %s — 기본값 반환", e)
            if analysis_type == "emotion":
                return {"emotion": "neutral", "mood": "평온함", "description": result_text}
            else:
                return {
                    "description": result_text or "멋진 사진이네요! 이 사진에 담긴 이야기가 궁금해요.",
                    "context": "사진 속 순간",
                    "question": "이 사진을 찍게 된 계기가 있나요?",
                }

    return result_text


# ============================================================
# 채팅 응답 생성 (openai-chat Edge Function 대응 — 기본 대화)
# ============================================================

def _build_chat_system_prompt(photo_context: dict | None = None) -> str:
    """사진 컨텍스트 기반 시스템 프롬프트 생성"""
    system = (
        "당신은 부드럽고 감성 지능이 높은 친근한 AI 동반자입니다. "
        "전달된 사진 컨텍스트 정보를 참고하여 사진을 함께 보는 것처럼 "
        "사용자의 추억 회상을 도와주세요.\n\n"
        "핵심 컨셉:\n"
        "- 사진이 대화의 중심입니다\n"
        "- 사용자와 함께 사진 속 순간을 들여다보며 추억을 되새기는 역할\n"
        "- 사진에서 보이는 것들과 사용자의 답변을 연결해서 이야기를 풀어가세요\n\n"
        "대화 원칙:\n"
        "1. 사진 속 세부 사항들을 언급하세요 (음식, 배경, 분위기, 색감 등)\n"
        "2. 사진에서 느껴지는 감정과 분위기를 함께 공감하세요\n"
        "3. 사용자의 답변과 사진 속 모습을 연결해서 더 풍성한 이야기를 만드세요\n"
        "4. 사진이 담고 있는 순간의 특별함을 함께 발견하고 공유하세요\n"
        "5. 사용자의 답변과 사진 요소를 연결해 한 문장으로 반응하세요\n"
        "6. 끝에는 자연스러운 질문 1개를 덧붙이되, 전체는 **1문장**으로 완결\n"
    )

    if photo_context and photo_context.get("metadata"):
        md = photo_context["metadata"]
        ct = md.get("captureTime", {})
        loc = md.get("location", {})
        derived = md.get("derived", {})

        system += (
            f"\n\n현재 함께 보고 있는 사진 정보:\n"
            f"  📸 파일명: {md.get('fileName', '알 수 없음')}\n"
            f"  📅 촬영 시간: {ct.get('timeOfDay', '알 수 없음')} ({ct.get('season', '')}계, {ct.get('weekday', '')}요일)\n"
            f"  📍 촬영 장소: {loc.get('shortAddress', '위치 정보 없음')}\n"
            f"  💡 조명 상태: {derived.get('lightCondition', '일반')}\n"
            f"  🎯 주제 힌트: {derived.get('subjectHint', '일반 사진')}"
        )

        first_analysis = photo_context.get("firstAnalysis", {})
        if first_analysis and first_analysis.get("description"):
            system += f'\n\n첫 분석 결과: "{first_analysis["description"]}"'

    system += (
        "\n\n응답 스타일:\n"
        "- 위의 사진 정보를 자연스럽게 활용하면서 1문장으로 따뜻하고 공감적으로 반응하세요\n"
        "- 추억 회상을 도와주는 자연스러운 질문이나 감탄을 하세요"
    )

    return system


async def generate_chat_response(
    message: str,
    conversation_history: list[dict],
    image_url: str | None = None,
    photo_context: dict | None = None,
) -> str:
    """대화 응답 생성"""
    system_prompt = _build_chat_system_prompt(photo_context)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)

    # 이미지 포함 여부에 따라 사용자 메시지 구성
    if image_url:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": message},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        })
        model = DEFAULT_VISION_MODEL
        max_tokens = 200
    else:
        messages.append({"role": "user", "content": message})
        model = DEFAULT_CHAT_MODEL
        max_tokens = 100

    response = openai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )

    return response.choices[0].message.content
