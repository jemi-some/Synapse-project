// ============================================================
// Supabase 연동 코드
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * 익명 로그인을 수행합니다.
 * @returns {Promise<{data: Object|null, error: Object|null}>} 로그인 결과 (사용자 정보 및 오류)
 */
export const signInAnonymously = async () => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Google OAuth를 사용하여 로그인을 수행합니다.
 * @returns {Promise<{data: Object|null, error: Object|null}>} OAuth 리디렉션 결과
 */
export const signInWithGoogle = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 현재 세션에서 로그아웃합니다.
 * @returns {Promise<{error: Object|null}>} 로그아웃 에러 상태
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    return { error }
  } catch (error) {
    return { error }
  }
}

/**
 * 현재 로그인된 사용자 정보를 가져옵니다.
 * @returns {Promise<{user: Object|null, error: Object|null}>} 현재 인증된 사용자 객체
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  } catch (error) {
    return { user: null, error }
  }
}

/**
 * 사용자 인증 상태 변화(로그인, 로그아웃 등)를 감지하는 리스너를 등록합니다.
 * @param {Function} callback - 상태 변화 시 호출될 콜백 함수
 * @returns {Object} 리스너 구독 객체 (구독 취소 시 사용)
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback)
}


/**
 * 새로운 채팅 세션을 생성합니다.
 * @param {string} [title='새로운 대화'] - 채팅 세션 제목
 * @returns {Promise<{data: Object|null, error: Object|null}>} 생성된 채팅 세션 정보
 */
export const createChatSession = async (title = '새로운 대화') => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ user_id: user.id, title: title }])
      .select()
      .single()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 특정 채팅 세션의 정보(제목 등)를 업데이트합니다.
 * @param {string} sessionId - 업데이트할 채팅 세션의 ID
 * @param {Object} updates - 변경할 필드와 값
 * @returns {Promise<{data: Object|null, error: Object|null}>} 업데이트된 채팅 세션 정보
 */
export const updateChatSession = async (sessionId, updates) => {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 특정 채팅 세션을 삭제합니다. 연관된 데이터도 cascade 로 삭제될 수 있습니다.
 * @param {string} sessionId - 삭제할 채팅 세션의 ID
 * @returns {Promise<{error: Object|null}>} 삭제 결과 에러 상태
 */
export const deleteChatSession = async (sessionId) => {
  try {
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
    return { error }
  } catch (error) {
    return { error }
  }
}

/**
 * 특정 채팅 세션에 속한 텍스트 메시지 전체 목록을 오래된 순서대로 가져옵니다.
 * @param {string} sessionId - 조회할 채팅 세션 ID
 * @returns {Promise<{data: Array|null, error: Object|null}>} 메시지 객체 배열
 */
export const getMessages = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_session_id', sessionId)
      .eq('message_type', 'text')
      .order('created_at', { ascending: true })
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 대화 세션에 새로운 메시지(사용자 또는 AI)를 추가합니다.
 * @param {string} sessionId - 대상 채팅 세션 ID
 * @param {string} content - 메시지 내용
 * @param {string} [messageType='text'] - 데이터 타입 ('text', 'image', 'system' 등)
 * @param {string} [senderType='user'] - 발송자 식별자 ('user', 'assistant')
 * @param {Object} [metadata={}] - 메시지에 추가될 메타데이터 JSON
 * @returns {Promise<{data: Object|null, error: Object|null}>} 기록된 메시지 객체 반환
 */
export const addMessage = async (sessionId, content, messageType = 'text', senderType = 'user', metadata = {}) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        chat_session_id: sessionId,
        content: content,
        message_type: messageType,
        sender_type: senderType,
        metadata: metadata
      }])
      .select()
      .single()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}



/**
 * 브라우저에서 선택한 사진(또는 파일)을 Supabase Storage 특정 버킷에 업로드하고 Public URL을 받아옵니다.
 * @param {File} file - 업로드할 첨부 파일 (Browser File 객체)
 * @param {string} [bucket='media'] - 대상 Storage 버킷 이름
 * @param {string|null} [path=null] - 저장할 서브 디렉터리 경로명 (선택)
 * @returns {Promise<{data: Object|null, error: Object|null}>} Storage 내 경로 경로, CDN 공개 URL, 크기 등의 메타데이터
 */
export const uploadFile = async (file, bucket = 'media', path = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    const fileName = `${user.id}/${Date.now()}_${file.name}`
    const filePath = path ? `${path}/${fileName}` : fileName
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file)
    if (error) throw error
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)
    return {
      data: {
        path: filePath,
        publicUrl: publicUrlData.publicUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      },
      error: null
    }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Storage 업로드 결과에 따른 메타데이터를 `media_files` 테이블에 저장합니다.
 * @param {Object} fileData - 버킷, 이름, 작성자 등 파일의 기본 정보와 참조 키
 * @returns {Promise<{data: Object|null, error: Object|null}>} 기록된 레코드 반환
 */
export const saveMediaFile = async (fileData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    const { data, error } = await supabase
      .from('media_files')
      .insert([{ ...fileData, user_id: user.id }])
      .select()
      .single()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 이미지의 구체적인 메타 정보(EXIF 등)를 DB에 통합하여 저장합니다.
 * @param {Object} imageData - url, 사이즈 뿐 아니라 파싱된 세부 메타데이터가 담긴 객체
 * @returns {Promise<{data: Object|null, error: Object|null}>} 기록된 레코드 반환
 */
export const saveImageMetadata = async (imageData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    const { data, error } = await supabase
      .from('media_files')
      .insert([{
        user_id: user.id,
        file_url: imageData.image_url,
        file_name: imageData.file_name,
        file_size: imageData.file_size,
        mime_type: imageData.mime_type,
        file_type: 'image',
        metadata: {
          chat_session_id: imageData.chat_session_id,
          ...imageData.selected_metadata
        },
        chat_session_id: imageData.chat_session_id
      }])
      .select()
      .single()
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 사진 업로드 후, 사진 메타데이터(시간, 장소, 기기)를 바탕으로 제목을 임의 생성한 새 채팅 세션을 열고, 이미지 정보를 연동시켜 저장합니다.
 * @param {Object} imageMetadata - 수집된 사진 메타 정보
 * @param {string|null} [title=null] - 사용자가 지정하고 싶은 대화 제목 (없을 시 자동 유추)
 * @returns {Promise<{sessionData: Object|null, metadataData: Object|null, error: Object|null}>} 채팅 및 미디어 정보 동시 반환
 */
export const createChatSessionWithImage = async (imageMetadata, title = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    let sessionTitle = title
    if (!sessionTitle) {
      if (imageMetadata.camera?.make && imageMetadata.camera?.model) {
        sessionTitle = `${imageMetadata.camera.make} ${imageMetadata.camera.model}로 찍은 사진`
      } else if (imageMetadata.dateTime?.original) {
        const date = new Date(imageMetadata.dateTime.original)
        sessionTitle = `${date.toLocaleDateString('ko-KR')} 사진`
      } else {
        sessionTitle = '새로운 사진 대화'
      }
    }
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert([{ user_id: user.id, title: sessionTitle }])
      .select()
      .single()
    if (sessionError) throw sessionError
    const { data: metadataData, error: metadataError } = await saveImageMetadata({
      ...imageMetadata,
      chat_session_id: sessionData.id
    })
    if (metadataError) {
      console.error('이미지 메타데이터 저장 실패:', metadataError)
    }
    return { sessionData, metadataData, error: null }
  } catch (error) {
    return { sessionData: null, metadataData: null, error }
  }
}

/**
 * 실시간 Supabase 채널을 오픈하여, 특정 채팅 세션 내 메시지 생성/업데이트를 수신(구독)합니다.
 * @param {string} sessionId - 모니터링할 대상 채팅 세션 ID
 * @param {Function} callback - 수신 이벤트를 처리할 콜백 함수 (payload가 넘어옴)
 * @returns {Object} 리얼타임 채널 객체 (unsubscribe 호출 용도)
 */
export const subscribeToMessages = (sessionId, callback) => {
  return supabase
    .channel('messages')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `chat_session_id=eq.${sessionId}`
    }, callback)
    .subscribe()
}

/**
 * 실시간 Supabase 채널을 오픈하여, 사용자의 모든 채팅방 목록 변동(생성/삭제)을 수신(구독)합니다.
 * @param {Function} callback - 수신 이벤트를 처리할 콜백 함수
 * @returns {Object} 리얼타임 채널 객체 (unsubscribe 호출 용도)
 */
export const subscribeToChatSessions = (callback) => {
  return supabase
    .channel('chat_sessions')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_sessions'
    }, callback)
    .subscribe()
}