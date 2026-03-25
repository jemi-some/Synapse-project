"""
Logic 1: 벡터화 파이프라인 (V2)

흐름:
  사진 업로드
    → extract_vision_tags()         (GPT-4o Vision) → image_caption + image_tags
    → build_combined_text()         (LLM 없이 직접 조합)
    → create_embedding()            (text-embedding-3-small)
    → update_memory_images()        (memory_images 테이블 INSERT)
    → update_memories_vectorization() (memories 테이블 combined_text + combined_embedding UPDATE)

V1과의 차이:
  - generate_context_summary() (LLM 호출) → build_combined_text() (직접 조합, LLM 없음)
  - vision_tags { objects, scene, mood } → image_caption + image_tags
  - DB 저장이 memories 단일 UPDATE → memory_images INSERT + memories UPDATE 두 단계로 분리
"""

import logging

from app.services.openai_service import extract_vision_tags, create_embedding

logger = logging.getLogger(__name__)


def build_combined_text(
    user_text: str | None = None,
    image_caption: str | None = None,
    image_tags: list | None = None,
    place_name: str | None = None,
) -> str:
    """
    combined_text를 조합합니다. LLM 호출 없이 구조화된 텍스트를 직접 만듭니다.

    출력 예시:
        "오늘 정말 즐거웠다. [장소: 제주도 렛츠런팜] [사진: 야외 자연 풍경, 해바라기 밭] [태그: 해바라기, 자연, 맑음]"

    Args:
        user_text:     사용자가 입력한 텍스트
        image_caption: Vision API가 생성한 사진 한 줄 설명
        image_tags:    Vision API가 추출한 키워드 목록
        place_name:    역지오코딩 결과 (shortAddress + poi)

    Note:
        taken_at(촬영 시각)은 DB 필터링용 컬럼이므로 임베딩 텍스트에서 제외.

    Returns:
        임베딩용 combined_text 문자열
    """
    parts = []

    if user_text:
        parts.append(user_text)

    if place_name:
        parts.append(f"[장소: {place_name}]")

    if image_caption:
        parts.append(f"[사진: {image_caption}]")

    if image_tags:
        tags_str = ", ".join(str(t) for t in image_tags)
        parts.append(f"[태그: {tags_str}]")

    return " ".join(parts)


async def run_vectorize_pipeline(
    image_url: str,
    metadata: dict | None = None,
    memory_id: str | None = None,
    user_text: str | None = None,
) -> dict:
    """
    벡터화 파이프라인 오케스트레이터 (V2).

    프론트 호출 순서:
      1. 프론트가 Supabase Storage에 사진 업로드
      2. 프론트가 memories 테이블에 INSERT (user_text 등)
      3. 프론트가 POST /api/ai/vectorize 호출 (memoryId + imageUrl + metadata)
      4. 이 함수가 Vision → combined_text → 임베딩 → DB 저장 수행

    Args:
        image_url:  Supabase Storage 이미지 URL
        metadata:   프론트에서 추출한 EXIF 메타데이터 (captureTime, location 등)
        memory_id:  memories 테이블 UUID
        user_text:  사용자가 함께 입력한 텍스트

    Returns:
        { image_caption, image_tags, combined_text, embedding_dimensions }
    """
    from app.services.supabase_service import update_memory_images, update_memories_vectorization

    # metadata에서 위치/시각 추출
    place_name = None
    taken_at = None

    if metadata:
        location = metadata.get("location", {})
        if location.get("hasLocation"):
            short_addr = location.get("shortAddress", "")
            poi = location.get("poi", "")
            place_name = f"{short_addr} {poi}".strip() or None

        capture_time = metadata.get("captureTime", {})
        taken_at = capture_time.get("utc") or None

    # 1단계: Vision API → image_caption + image_tags
    logger.info("1/3 Vision 분석 시작: %s", image_url[:50])
    vision_result = await extract_vision_tags(image_url)
    image_caption = vision_result.get("image_caption") or ""
    image_tags = vision_result.get("image_tags") or []

    # 2단계: combined_text 직접 조합 (LLM 없음)
    logger.info("2/3 combined_text 생성")
    combined_text = build_combined_text(
        user_text=user_text,
        image_caption=image_caption,
        image_tags=image_tags,
        place_name=place_name,
    )

    # 3단계: 임베딩 생성
    logger.info("3/3 임베딩 생성")
    embedding = await create_embedding(combined_text)

    # 4단계: DB 저장
    if memory_id:
        # memory_images 테이블 INSERT
        await update_memory_images(
            memory_id=memory_id,
            image_url=image_url,
            image_caption=image_caption,
            image_tags=image_tags,
            taken_at=taken_at,
            place_name=place_name,
            exif_json=metadata,
        )
        # memories 테이블 combined_text + combined_embedding UPDATE
        await update_memories_vectorization(
            memory_id=memory_id,
            combined_text=combined_text,
            combined_embedding=embedding,
        )
        logger.info("벡터화 파이프라인 완료: memory_id=%s", memory_id)

    return {
        "image_caption": image_caption,
        "image_tags": image_tags,
        "combined_text": combined_text,
        "embedding_dimensions": len(embedding),
    }
