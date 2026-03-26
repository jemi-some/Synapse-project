// ============================================================
// Supabase 연동 코드
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * 데모 계정으로 로그인합니다. (포트폴리오 체험용)
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export const signInWithDemo = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: import.meta.env.VITE_DEMO_EMAIL,
      password: import.meta.env.VITE_DEMO_PASSWORD
    })
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
 * 기억(memory)과 연관된 chat_messages를 삭제합니다.
 * @param {string} memoryId - 삭제할 memories UUID
 * @returns {Promise<{error: Object|null}>}
 */
export const deleteMemory = async (memoryId) => {
  try {
    await supabase.from('chat_messages').delete().eq('memory_id', memoryId)
    const { error } = await supabase.from('memories').delete().eq('id', memoryId)
    return { error }
  } catch (error) {
    return { error }
  }
}

/**
 * 대화 세션에 속한 메시지를 시간 순서대로 가져옵니다. (Cursor 기반 페이지네이션)
 * @param {string} sessionId - 조회할 채팅 세션 UUID
 * @param {Object} options - 페이지네이션 옵션
 * @param {string} options.cursor - 이전에 로드한 마지막 메시지의 created_at (ISO 8601)
 * @param {number} options.limit - 한 번에 가져올 메시지 개수 (기본값: 50)
 * @param {boolean} options.ascending - 정렬 순서 (기본값: true)
 * @returns {Promise<{data: Array|null, error: Object|null, hasMore: boolean}>} 메시지 배열과 더 있는지 여부
 */
export const getMessages = async (sessionId, options = {}) => {
  try {
    const { cursor = null, limit = 50, ascending = true } = options

    let query = supabase
      .from('chat_messages')
      .select('*, memories(user_text, combined_text, location_name, memory_images(image_url, image_caption, image_tags, taken_at, place_name))')
      .eq('chat_session_id', sessionId)
      .eq('is_visible', true)
      .in('message_type', ['text', 'image', 'raw_input', 'memory_card', 'assistant_reply'])
      .order('created_at', { ascending })
      .limit(limit + 1) // +1개를 가져와서 hasMore 판단

    // cursor가 있으면 해당 시점 이후/이전 메시지만 가져오기
    if (cursor) {
      if (ascending) {
        query = query.lt('created_at', cursor) // 이전 메시지 (과거로)
      } else {
        query = query.gt('created_at', cursor) // 이후 메시지 (미래로)
      }
    }

    const { data, error } = await query

    if (error) {
      return { data: null, error, hasMore: false }
    }

    // hasMore 판단: limit+1개를 요청했으므로, limit+1개가 왔으면 더 있는 것
    const hasMore = data && data.length > limit
    const messages = hasMore ? data.slice(0, limit) : data

    return { data: messages, error: null, hasMore }
  } catch (error) {
    return { data: null, error, hasMore: false }
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
export const addMessage = async (sessionId, content, messageType = 'text', role = 'user', actionData = null, memoryId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const messageRow = {
      chat_session_id: sessionId,
      content: content,
      message_type: messageType,
      role: role,
      user_id: user?.id ?? null
    }

    if (actionData) {
      messageRow.action_data = actionData
    }

    if (memoryId) {
      messageRow.memory_id = memoryId
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert([messageRow])
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
 * 사진 업로드 직후 `memory_images` 테이블에 레코드를 생성합니다. (V2)
 * image_caption, image_tags는 백엔드 벡터화 완료 후 UPDATE됩니다.
 * @param {Object} params - memoryId, imageUrl, takenAt, placeName, exifJson
 */
export const insertMemoryImage = async ({ memoryId, imageUrl, takenAt, placeName, exifJson }) => {
  try {
    const { data, error } = await supabase
      .from('memory_images')
      .insert([{
        memory_id: memoryId,
        image_url: imageUrl,
        taken_at: takenAt || null,
        place_name: placeName || null,
        exif_json: exifJson || null,
      }])
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * 사진 업로드 직후 `memories` 테이블에 레코드를 생성합니다. (V2)
 * 이미지 URL, 캡션, 태그 등은 백엔드 /api/ai/vectorize가 채웁니다.
 * @param {Object} memoryData - chat_session_id, user_text 등
 * @returns {Promise<{data: Object|null, error: Object|null}>} 생성된 memory 레코드 반환
 */
export const saveMemory = async (memoryData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('memories')
      .insert([{
        user_id: user.id,
        chat_session_id: memoryData.chat_session_id,
        user_text: memoryData.user_text || null,
      }])
      .select()
      .single()

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}


/**
 * 사진 업로드 후, 메타데이터를 바탕으로 제목을 임의 생성한 새 채팅 세션을 열고, memory를 생성합니다.
 * @param {Object} imageMetadata - 수집된 사진 메타 정보
 * @param {string|null} [title=null] - 지정하고 싶은 대화 제목 (없을 시 모바일/날짜 기준 자동 유추)
 * @returns {Promise<{sessionData: Object|null, memoryData: Object|null, error: Object|null}>} 세션 및 생성된 memory 동시 반환
 */
export const createChatSessionWithImage = async (imageMetadata, title = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    let sessionTitle = title
    if (!sessionTitle) {
      if (imageMetadata.selected_metadata?.camera?.make && imageMetadata.selected_metadata?.camera?.model) {
        sessionTitle = `${imageMetadata.selected_metadata.camera.make} ${imageMetadata.selected_metadata.camera.model} 사진`
      } else if (imageMetadata.selected_metadata?.dateTime?.original) {
        const date = new Date(imageMetadata.selected_metadata.dateTime.original)
        sessionTitle = `${date.toLocaleDateString('ko-KR')} 사진`
      } else {
        sessionTitle = '새로운 사진 대화'
      }
    }

    // 1. 세션 생성
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert([{ user_id: user.id, title: sessionTitle }])
      .select()
      .single()
    if (sessionError) throw sessionError

    // 2. Memory 생성
    const { data: memoryData, error: memoryError } = await saveMemory({
      ...imageMetadata,
      chat_session_id: sessionData.id
    })

    if (memoryError) {
      console.error('Memory 생성 실패:', memoryError)
    }
    return { sessionData, memoryData, error: null }
  } catch (error) {
    return { sessionData: null, memoryData: null, error }
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
