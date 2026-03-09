from pydantic import BaseModel
from typing import Optional


# ============================================================
# 이미지 분석 (analyze-image Edge Function 대응)
# ============================================================

class CaptureTime(BaseModel):
    """촬영 시간 정보"""
    timeOfDay: Optional[str] = None
    season: Optional[str] = None
    weekday: Optional[str] = None


class Location(BaseModel):
    """촬영 위치 정보"""
    hasLocation: Optional[bool] = False
    shortAddress: Optional[str] = None
    poi: Optional[str] = None


class Derived(BaseModel):
    """추론된 메타데이터"""
    lightCondition: Optional[str] = None
    subjectHint: Optional[str] = None


class ImageMetadata(BaseModel):
    """이미지 메타데이터"""
    captureTime: Optional[CaptureTime] = None
    location: Optional[Location] = None
    derived: Optional[Derived] = None
    fileName: Optional[str] = None


class ImageAnalysisRequest(BaseModel):
    """이미지 분석 요청"""
    imageUrl: str
    analysisType: str = "description"  # description | emotion | context_analysis
    metadata: Optional[ImageMetadata] = None


class ImageAnalysisResponse(BaseModel):
    """이미지 분석 응답"""
    success: bool
    result: Optional[dict | str] = None
    analysisType: Optional[str] = None
    error: Optional[str] = None


# ============================================================
# 채팅 응답 (openai-chat Edge Function 대응)
# ============================================================

class PhotoContext(BaseModel):
    """사진 컨텍스트 정보"""
    metadata: Optional[ImageMetadata] = None
    firstAnalysis: Optional[dict] = None


class ConversationMessage(BaseModel):
    """대화 메시지"""
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    """채팅 응답 생성 요청"""
    message: str
    conversationHistory: list[ConversationMessage] = []
    imageUrl: Optional[str] = None
    photoContext: Optional[PhotoContext] = None


class ChatResponse(BaseModel):
    """채팅 응답"""
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None
