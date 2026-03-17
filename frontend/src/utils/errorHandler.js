// ============================================================
// 에러 핸들링 유틸리티
// ============================================================

/**
 * 에러 타입 분류
 */
export const ErrorType = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  VALIDATION: 'validation',
  SERVER: 'server',
  UPLOAD: 'upload',
  UNKNOWN: 'unknown',
}

/**
 * 사용자 친화적 에러 메시지 매핑
 */
const ERROR_MESSAGES = {
  [ErrorType.NETWORK]: {
    title: '네트워크 연결 오류',
    message: '인터넷 연결을 확인해주세요.',
    action: '재시도',
  },
  [ErrorType.TIMEOUT]: {
    title: '요청 시간 초과',
    message: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
    action: '재시도',
  },
  [ErrorType.AUTH]: {
    title: '인증 오류',
    message: '로그인이 필요합니다.',
    action: '로그인',
  },
  [ErrorType.VALIDATION]: {
    title: '입력 오류',
    message: '입력 내용을 확인해주세요.',
    action: '확인',
  },
  [ErrorType.SERVER]: {
    title: '서버 오류',
    message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    action: '재시도',
  },
  [ErrorType.UPLOAD]: {
    title: '업로드 실패',
    message: '파일 업로드에 실패했습니다.',
    action: '재시도',
  },
  [ErrorType.UNKNOWN]: {
    title: '알 수 없는 오류',
    message: '예상치 못한 오류가 발생했습니다.',
    action: '확인',
  },
}

/**
 * 에러 타입 감지
 */
export function detectErrorType(error) {
  if (!error) return ErrorType.UNKNOWN

  const errorMessage = error.message?.toLowerCase() || ''
  const errorString = error.toString().toLowerCase()

  // 네트워크 에러
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorString.includes('networkerror') ||
    error.name === 'NetworkError'
  ) {
    return ErrorType.NETWORK
  }

  // 타임아웃
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    error.name === 'TimeoutError'
  ) {
    return ErrorType.TIMEOUT
  }

  // 인증 에러
  if (
    errorMessage.includes('auth') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('401')
  ) {
    return ErrorType.AUTH
  }

  // 서버 에러 (5xx)
  if (errorMessage.includes('500') || errorMessage.includes('server error')) {
    return ErrorType.SERVER
  }

  // 업로드 에러
  if (errorMessage.includes('upload') || errorMessage.includes('storage')) {
    return ErrorType.UPLOAD
  }

  // 검증 에러
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return ErrorType.VALIDATION
  }

  return ErrorType.UNKNOWN
}

/**
 * 사용자 친화적 에러 메시지 가져오기
 */
export function getUserFriendlyError(error, customMessage = null) {
  const errorType = detectErrorType(error)
  const errorInfo = ERROR_MESSAGES[errorType]

  return {
    type: errorType,
    title: errorInfo.title,
    message: customMessage || errorInfo.message,
    action: errorInfo.action,
    originalError: error,
  }
}

/**
 * 재시도 로직 (Exponential Backoff)
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options

  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const errorType = detectErrorType(error)

      // 재시도 가능한 에러인지 확인
      if (!shouldRetry(error, errorType)) {
        throw error
      }

      // 마지막 시도였으면 에러 던지기
      if (attempt === maxRetries - 1) {
        throw error
      }

      // Exponential backoff 계산
      const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay)

      console.log(`재시도 ${attempt + 1}/${maxRetries} (${delay}ms 후)`)

      // 대기
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * 재시도 가능 여부 판단
 */
export function isRetryableError(error, errorType) {
  // 네트워크, 타임아웃, 서버 에러는 재시도 가능
  return [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.SERVER].includes(errorType)
}

/**
 * 온라인/오프라인 감지
 */
export function isOnline() {
  return navigator.onLine
}

/**
 * 온라인 상태 변경 이벤트 리스너
 */
export function setupOnlineListener(onOnline, onOffline) {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}
