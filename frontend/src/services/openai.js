// ============================================================
// OpenAI 서비스 — FastAPI 백엔드 API 호출
// 기존 Supabase Edge Function 대신 백엔드 API를 사용합니다.
// ============================================================

// 백엔드 API URL (개발 환경)
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

/**
 * 공통 API 호출 함수
 */
async function callApi(endpoint, body) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(errorData.detail || `API 오류 (${response.status})`)
  }

  return response.json()
}

/**
 * 이미지 분석 (description)
 */
export const analyzeImage = async (imageUrl, prompt = "이 이미지에 대해 자세히 설명해주세요.") => {
  try {
    const data = await callApi('/api/ai/analyze-image', {
      imageUrl,
      analysisType: 'description',
    })
    if (!data.success) throw new Error(data.error || '알 수 없는 오류')
    return data.result
  } catch (error) {
    console.error('이미지 분석 에러:', error)
    throw new Error(`이미지 분석에 실패했습니다: ${error.message}`)
  }
}

/**
 * 채팅 응답 생성
 */
export const generateChatResponse = async (message, conversationHistory = [], photoContext = null) => {
  try {
    const data = await callApi('/api/ai/chat', {
      message,
      conversationHistory,
      photoContext,
    })
    if (!data.success) throw new Error(data.error)
    return data.response
  } catch (error) {
    console.error('AI 응답 생성 에러:', error)
    throw new Error('AI 응답 생성에 실패했습니다.')
  }
}

/**
 * 감정 분석
 */
export const analyzeImageEmotion = async (imageUrl) => {
  try {
    const data = await callApi('/api/ai/analyze-image', {
      imageUrl,
      analysisType: 'emotion',
    })
    if (!data.success) throw new Error(data.error)
    return data.result
  } catch (error) {
    console.error('감정 분석 에러:', error)
    throw new Error('감정 분석에 실패했습니다.')
  }
}

/**
 * 메타데이터 기반 이미지 분석
 */
export const analyzeImageWithMetadata = async (imageUrl, metadata) => {
  try {
    const data = await callApi('/api/ai/analyze-image', {
      imageUrl,
      analysisType: 'context_analysis',
      metadata,
    })
    if (!data.success) throw new Error(data.error || '알 수 없는 오류')
    return data.result
  } catch (error) {
    console.error('메타데이터 기반 이미지 분석 에러:', error)
    throw new Error(`메타데이터 기반 이미지 분석에 실패했습니다: ${error.message}`)
  }
}



export default {
  analyzeImage,
  generateChatResponse,
  analyzeImageEmotion,
  analyzeImageWithMetadata,
}
