// ============================================================
// OpenAI 서비스 — FastAPI 백엔드 API 연동
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
 * Step 1: 사진 분석 및 벡터화 (Phase 1-A)
 * @param {string} imageUrl - 업로드된 이미지 URL
 * @param {string} memoryId - 저장된 memory의 UUID
 * @param {Object} metadata - 위치, 촬영 시간 등 메타데이터
 * @param {string} [userText] - (선택) 사진과 함께 남긴 사용자 코멘트
 */
export const vectorize = async (imageUrl, memoryId, metadata, userText = null) => {
  try {
    const data = await callApi('/api/ai/vectorize', {
      imageUrl,
      memoryId,
      metadata,
      userText,
    })
    // 백엔드는 { success, visionTags, contextSummary, embeddingDimensions } 형태로 반환
    if (!data.success) throw new Error(data.error || '벡터화 실패')
    return data
  } catch (error) {
    console.error('벡터화 파이프라인 에러:', error)
    throw new Error(`이미지 분석에 실패했습니다: ${error.message}`)
  }
}

/**
 * Step 2: 메인 피드 채팅 메시지 라우팅 (Phase 1-B)
 * @param {string} message - 사용자 입력
 * @param {string} userId - 사용자 UUID
 * @param {string} sessionId - 현재 채팅 세션 ID (메인 피드용)
 */
export const sendMessage = async (message, userId, sessionId) => {
  try {
    const data = await callApi('/api/ai/message', {
      message,
      userId,
      sessionId,
    })
    // 백엔드는 { response, actions } 형태로 반환
    return { success: true, ...data }
  } catch (error) {
    console.error('채팅 응답 생성 에러:', error)
    throw new Error('AI 응답 생성에 실패했습니다.')
  }
}

/**
 * Step 3: 스레드 내부 다이얼로그 (Thread endpoint)
 * @param {string} message - 사용자 입력
 * @param {string} parentMessageId - 스레드가 시작된 부모 검색 결과 메시지의 UUID
 * @param {string} sessionId - 현재 채팅 세션 ID
 */
export const sendThreadMessage = async (message, parentMessageId, sessionId) => {
  try {
    // ThreadRequest schema에 맞춤
    const data = await callApi('/api/ai/thread', {
      message,
      parentMessageId,
      sessionId,
    })
    // 백엔드는 { response } 형태로 반환
    return { success: true, ...data }
  } catch (error) {
    console.error('스레드 대화 에러:', error)
    throw new Error('결과 대화 생성에 실패했습니다.')
  }
}

export default {
  vectorize,
  sendMessage,
  sendThreadMessage,
}
