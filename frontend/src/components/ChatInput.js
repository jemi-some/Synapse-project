import { Component } from '../core'
import { saveRecord, searchMemories, vectorize, fetchRelatedMemories } from '../services/openai'
import { addMessage, updateChatSession, getMessages, uploadFile, saveMemory, insertMemoryImage, createChatSession, supabase } from '../services/supabase'
import * as exifr from 'exifr'
import imageCompression from 'browser-image-compression'
import { getUserFriendlyError, isOnline } from '../utils/errorHandler'
import { getCurrentLocationName } from '../utils/geolocation'

export default class ChatInput extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        message: '',
        isSending: false,
        isVisible: true,
        isHidden: false,
        isEnabled: true,
        placeholder: '',
        currentChatSessionId: null,
        attachedFile: null, // 첨부된 파일 객체
        attachedFilePreview: null, // 첨부된 파일 미리보기 URL
        hasPreviousActions: false, // 직전 AI 응답에 actions가 있었는지 여부 (자동 스레드 전환용)
        mode: 'record', // 'record' | 'search'
      }
    })

    // 이벤트 핸들러 바인딩
    this.handleInput = this.handleInput.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleFocus = this.handleFocus.bind(this)
    this.handleBlur = this.handleBlur.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.protectFocus = this.protectFocus.bind(this)
    this.handleFileSelect = this.handleFileSelect.bind(this)
    this.handleRemoveFile = this.handleRemoveFile.bind(this)

    // 포커스 관련 플래그
    this.hasFocus = false
    this.focusProtected = false

    // 세션 복원/조회 관련 상태
    this.sessionLookupPromise = null
    this.sessionStorageKey = 'memorymoments:lastSessionId'

    // 뷰포트 크기 추적 (가상 키보드 리사이즈와 구분)
    this.lastViewportWidth = window.innerWidth
    this.lastViewportHeight = window.innerHeight

    // 클래스 추가
    this.el.className = 'chat-input-container'

    // 리사이즈 이벤트 리스너 추가
    window.addEventListener('resize', this.handleResize)

    // 탭 변경 이벤트 리스너 (외부 연동용, 현재는 내부 탭으로 처리)
    document.addEventListener('tab-change', (e) => {
      this.state.mode = e.detail.tab
      this.updatePlaceholder()
      this.render()
    })

    // 모바일 감지
    this.isMobile = this.detectMobile()

    // 초기 placeholder 설정
    this.updatePlaceholder()

    // 로컬에 저장된 세션 ID 복원
    this.restoreSessionFromCache()

    // 로그인/로그아웃 시 세션 초기화 및 재로드
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        this.persistSessionId(null)
        this.state.currentChatSessionId = null
        if (window.app) window.app.currentSessionId = null
        setTimeout(() => this.restoreSessionFromCache(), 0)
      } else if (event === 'SIGNED_OUT') {
        this.persistSessionId(null)
        this.state.currentChatSessionId = null
        if (window.app) window.app.currentSessionId = null
        const chatBubbles = window.app?.chatBubbles
        if (chatBubbles) chatBubbles.clearMessages()
      }
    })
  }

  async handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    const toast = window.app?.toast

    if (!file.type.startsWith('image/')) {
      toast?.warning('이미지 파일만 업로드 가능', '이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.', 4000)
      return
    }

    // 파일 크기 체크 (예: 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast?.warning('파일 크기 초과', '파일 크기는 10MB를 초과할 수 없습니다.', 4000)
      return
    }

    try {
      // 이미지 압축 (1MB 이하, 1920px 이하)
      console.log(`원본 이미지 크기: ${(file.size / 1024 / 1024).toFixed(2)}MB`)

      const options = {
        maxSizeMB: 1,           // 최대 1MB
        maxWidthOrHeight: 1920, // 최대 해상도
        useWebWorker: true,     // 백그라운드 처리로 성능 개선
        fileType: file.type,    // 원본 파일 형식 유지
        preserveExif: true      // EXIF 메타데이터 보존 (중요!)
      }

      const compressedFile = await imageCompression(file, options)
      console.log(`압축된 이미지 크기: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)

      // EXIF 보존 확인
      console.log('압축된 파일:', compressedFile.name, compressedFile.type)

      // 미리보기 URL 생성 (압축된 파일 사용)
      const previewUrl = URL.createObjectURL(compressedFile)

      this.state.attachedFile = compressedFile
      this.state.attachedFilePreview = previewUrl

      // 파일 입력 초기화 (같은 파일 다시 선택 가능하도록)
      e.target.value = ''

      this.updateSendButton()
      this.render()
    } catch (error) {
      console.error('이미지 압축 실패:', error)
      const errorInfo = getUserFriendlyError(error, '이미지 처리 중 오류가 발생했습니다.')
      toast?.error(errorInfo.title, errorInfo.message)
      e.target.value = ''
    }
  }

  handleRemoveFile(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (this.state.attachedFilePreview) {
      URL.revokeObjectURL(this.state.attachedFilePreview)
    }
    this.state.attachedFile = null
    this.state.attachedFilePreview = null

    this.updateSendButton()
    this.render()
  }

  handleResize() {
    const currentWidth = window.innerWidth
    const currentHeight = window.innerHeight
    const widthChanged = currentWidth !== this.lastViewportWidth
    const heightChanged = currentHeight !== this.lastViewportHeight

    this.lastViewportWidth = currentWidth
    this.lastViewportHeight = currentHeight

    const activeElement = document.activeElement
    const isTextareaFocused =
      activeElement &&
      activeElement.classList &&
      activeElement.classList.contains('chat-input-field')

    // 가상 키보드로 인한 높이 변화만 발생하면 리렌더링을 건너뜀
    if (!widthChanged && heightChanged && isTextareaFocused) {
      return
    }

    if (!widthChanged) return

    this.updatePlaceholder()
    const isAndroid = /Android/i.test(navigator.userAgent)
    const preserveFocus = this.isMobile && isTextareaFocused

    if (isAndroid || preserveFocus) {
      this.updateDOMWithoutRerender()
    } else {
      this.render()
    }
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
  }

  handleInput(e) {
    this.state.message = e.target.value
    this.autoResize(e.target)
    this.updateSendButton()
  }

  handleSubmit(e) {
    e.preventDefault()
    this.sendMessage()
  }

  handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (this.isMobile) return
      e.preventDefault()

      // AI 스트리밍 중인지 체크
      const chatBubbles = window.app?.chatBubbles
      const isAIStreaming = chatBubbles && chatBubbles.state && chatBubbles.state.isStreaming

      // AI 스트리밍 중이면 메시지 전송 차단
      if (!isAIStreaming) {
        this.sendMessage()
      }
    }
  }

  handleFocus(e) {
    const container = this.el.querySelector('.chat-input-wrapper')
    if (container) container.classList.add('focused')

    // 안드로이드에서 포커스가 유지되도록 플래그 설정
    if (/Android/i.test(navigator.userAgent)) {
      this.hasFocus = true
      // 포커스를 잃어버리는 것을 방지하기 위해 짧은 시간 동안 포커스 보호
      this.protectFocus(e.target)
    }
  }

  handleBlur(e) {
    // 안드로이드에서 의도하지 않은 blur 방지
    if (/Android/i.test(navigator.userAgent) && this.hasFocus) {
      // 짧은 시간 안에 blur가 발생하면 다시 포커스
      const relatedTarget = e.relatedTarget
      const isInternalBlur = relatedTarget && this.el.contains(relatedTarget)

      if (!isInternalBlur && this.focusProtected) {
        // 포커스 보호 중이면 다시 포커스
        setTimeout(() => {
          if (this.hasFocus && !document.activeElement.matches('input, textarea')) {
            e.target.focus()
          }
        }, 10)
        return
      }
    }

    this.hasFocus = false
    const container = this.el.querySelector('.chat-input-wrapper')
    if (container) container.classList.remove('focused')
  }

  async extractMetadata(file) {
    try {
      const metadata = {
        captureTime: {},   // { utc, local }
        location: null,    // { hasLocation, latitude, longitude, shortAddress, fullAddress }
        camera: {},
        imageSize: {}
      }

      // EXIF 데이터 추출
      console.log('EXIF 파싱 시작:', file.name)
      const exifData = await exifr.parse(file, true)
      console.log('EXIF 데이터:', exifData)

      if (exifData) {
        // 날짜/시간 (여러 필드 시도)
        const dateSource = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate || exifData.DateTime
        if (dateSource) {
          const utc = dateSource instanceof Date
            ? dateSource.toISOString()
            : new Date(dateSource).toISOString()
          metadata.captureTime = { utc, local: utc }
          console.log('📅 촬영 날짜:', utc)
        } else {
          console.warn('⚠️ 날짜/시간 정보 없음')
        }

        // 카메라 정보
        if (exifData.Make) metadata.camera.make = exifData.Make
        if (exifData.Model) metadata.camera.model = exifData.Model
        if (exifData.LensModel) metadata.camera.lens = exifData.LensModel

        // 이미지 크기
        if (exifData.ExifImageWidth) metadata.imageSize.width = exifData.ExifImageWidth
        if (exifData.ExifImageHeight) metadata.imageSize.height = exifData.ExifImageHeight

        // GPS
        if (exifData.latitude && exifData.longitude) {
          console.log('📍 GPS 좌표:', exifData.latitude, exifData.longitude)
          metadata.location = {
            hasLocation: true,
            latitude: exifData.latitude,
            longitude: exifData.longitude,
          }

          // 역지오코딩
          try {
            const { reverseGeocode } = await import('../services/geocoding.js')
            const addressInfo = await reverseGeocode(exifData.latitude, exifData.longitude)
            if (addressInfo) {
              metadata.location.fullAddress = addressInfo.fullAddress
              metadata.location.shortAddress = addressInfo.shortAddress
              console.log('📍 주소:', metadata.location.shortAddress)
            }
          } catch (geoError) {
            console.warn('역지오코딩 실패:', geoError)
          }
        } else {
          console.warn('⚠️ GPS 정보 없음')
          metadata.location = { hasLocation: false }
        }
      } else {
        console.warn('⚠️ EXIF 데이터가 없습니다')
      }

      return metadata
    } catch (error) {
      console.error('❌ 메타데이터 추출 실패:', error)
      return { captureTime: {}, location: { hasLocation: false }, camera: {}, imageSize: {} }
    }
  }

  async sendMessage() {
    const textMessage = this.state.message.trim()
    const attachedFile = this.state.attachedFile
    const isAIStreaming = window.app?.chatBubbles?.state?.isStreaming

    if ((!textMessage && !attachedFile) || this.state.isSending || !this.state.isEnabled || isAIStreaming) {
      return
    }

    let chatSessionId = this.state.currentChatSessionId || window.app?.currentSessionId || null
    if (!chatSessionId) {
      chatSessionId = await this.ensureExistingSession()
    }
    if (!chatSessionId) {
      try {
        const { data: newSession, error: sessionError } = await createChatSession()
        if (sessionError || !newSession?.id) {
          console.error('채팅 세션 생성 실패:', sessionError)
          return
        }
        chatSessionId = newSession.id
        this.state.currentChatSessionId = chatSessionId
        this.persistSessionId(chatSessionId)
        this.syncGlobalSessionId(chatSessionId)
        this.state.isEnabled = true
      } catch (sessionErr) {
        console.error('채팅 세션 생성 중 오류:', sessionErr)
        return
      }
    }

    // 1. 상태 정리 및 UI 블록
    this.state.message = ''
    this.state.isSending = true

    // 파일 업로드를 위해 로컬 참조 복사
    const fileToUpload = attachedFile
    const previewToRevoke = this.state.attachedFilePreview
    let shouldReleasePreview = false
    let userMessageId = null

    // UI 초기화 반영 (입력창 비우고 썸네일 숨김)
    this.state.attachedFile = null
    this.state.attachedFilePreview = null

    if (/Android/i.test(navigator.userAgent)) {
      const textarea = this.el.querySelector('.chat-input-field')
      if (textarea) {
        textarea.value = ''
        textarea.disabled = true
        this.autoResize(textarea)
      }
      this.updateSendButton()
    } else {
      this.render()
    }

    let userId = 'anonymous'
    try {
      const { data: authData } = await supabase.auth.getUser()
      userId = authData?.user?.id || 'anonymous'
    } catch (authError) {
      console.warn('사용자 정보를 불러오지 못했습니다:', authError)
    }

    try {
      const chatBubbles = window.app?.chatBubbles

      // Case A: 사진 업로드 + 텍스트 (옵션)
      if (fileToUpload) {
        // [1] 사용자 메시지로 사진과 텍스트 표시 (로컬 프리뷰)
        if (chatBubbles) {
          const bubbleOptions = {}
          if (previewToRevoke) {
            bubbleOptions.imageUrl = previewToRevoke
            bubbleOptions.metadata = { isLocalPreview: true }
          }
          userMessageId = chatBubbles.showUserMessage(textMessage || '', bubbleOptions)
        }

        // [2] 메타데이터 추출
        console.log('메타데이터 추출 시작...')
        const metadata = await this.extractMetadata(fileToUpload)
        console.log('추출된 메타데이터:', metadata)

        // [3] Supabase Storage 업로드
        const { data: uploadData, error: uploadError } = await uploadFile(fileToUpload)
        if (uploadError) throw new Error(`업로드 실패: ${uploadError.message}`)

        // [4] memories 테이블 INSERT (위치 fetch와 병렬 시작)
        const locationPromise = getCurrentLocationName()
        const { data: memoryData, error: memoryError } = await saveMemory({
          chat_session_id: chatSessionId,
          user_text: textMessage,
        })

        if (memoryError) {
          console.warn('Memory 테이블 저장 중 오류 발생 (진행은 계속됨):', memoryError)
        }

        const memoryId = memoryData ? memoryData.id : null

        // [4-1] memory_images 테이블 INSERT (exif_json, taken_at, place_name 즉시 저장)
        if (memoryId) {
          insertMemoryImage({
            memoryId,
            imageUrl: uploadData.publicUrl,
            takenAt: metadata?.captureTime?.utc || null,
            placeName: metadata?.location?.shortAddress || metadata?.location?.fullAddress || null,
            exifJson: metadata,
          }).catch(err => console.warn('memory_images 저장 실패:', err))
        }

        // [5] chat_messages에 사진 메시지 저장 (memories 저장 후 memory_id 포함)
        const { error: userMessageError } = await addMessage(chatSessionId, textMessage || '', 'memory_card', 'user', null, memoryId)
        if (userMessageError) {
          console.warn('사용자 메시지 저장 실패:', userMessageError)
        }

        // [5] imageUrl 업데이트와 memory_card 추가를 한 번의 render로 처리
        if (chatBubbles) {
          // 상태만 직접 수정 (render 호출 없음)
          if (userMessageId) {
            const metadataUpdates = {
              memoryId,
              storagePath: uploadData.path,
              mimeType: uploadData.mimeType || uploadData.type || fileToUpload?.type || null
            }
            const msgIdx = chatBubbles.state.messages.findIndex(m => m.id === userMessageId)
            if (msgIdx !== -1) {
              chatBubbles.state.messages[msgIdx].imageUrl = uploadData.publicUrl
              chatBubbles.state.messages[msgIdx].metadata = {
                ...(chatBubbles.state.messages[msgIdx].metadata || {}),
                ...metadataUpdates
              }
            }
            shouldReleasePreview = true
          }

          // memory_card 추가 → 여기서 한 번만 render
          const memoryCardId = chatBubbles.showMemoryCard(textMessage || '', null)
          await addMessage(chatSessionId, '', 'assistant_reply', 'assistant', null, memoryId)

          // 위치 완료 후 UI + DB 업데이트 (background)
          locationPromise.then(async locationName => {
            if (!locationName) return
            if (chatBubbles && memoryCardId) {
              chatBubbles.updateMessage(memoryCardId, { locationName })
            }
            if (memoryId) {
              await supabase.from('memories').update({ location_name: locationName }).eq('id', memoryId)
            }
          }).catch(() => {})
        }

        // [6] 백엔드 벡터화 파이프라인은 백그라운드에서 실행 (await 없음)
        // 사용자는 이미 메타데이터 응답을 받았으므로 벡터화 완료를 기다리지 않음
        vectorize(uploadData.publicUrl, memoryId, metadata, textMessage)
          .then(() => {
            console.log('✅ 벡터화 파이프라인 완료:', memoryId)
          })
          .catch(error => {
            console.error('⚠️ 벡터화 파이프라인 실패 (백그라운드):', error)
            // 사용자는 이미 응답을 받았으므로 에러를 표시하지 않음
          })

      }
      // Case B: 텍스트만 전송
      else if (textMessage) {
        if (this.state.mode === 'search') {
          // [검색 모드] 검색어 → /api/ai/search
          if (chatBubbles) chatBubbles.showUserMessage(textMessage)
          if (chatBubbles) chatBubbles.showLoadingBubble()

          const searchResult = await searchMemories(textMessage, userId)

          if (chatBubbles) chatBubbles.hideLoadingBubble()

          if (chatBubbles) {
            if (searchResult.total === 0) {
              chatBubbles.showAIMessage('검색 결과가 없습니다. 다른 검색어를 입력해보세요.')
            } else {
              chatBubbles.showSearchResultsV2(searchResult)
            }
          }

        } else {
          // [기록 모드] 텍스트 기록 저장 → /api/ai/record
          const userMessageId = chatBubbles ? chatBubbles.showUserMessage(textMessage) : null

          // 위치 fetch와 저장을 병렬로 시작
          const locationPromise = getCurrentLocationName()
          const recordResult = await saveRecord(textMessage, userId, chatSessionId, null)

          // memoryId를 user message 상태에 저장 (슬라이드 삭제용)
          if (userMessageId && recordResult?.memoryId && chatBubbles) {
            chatBubbles.updateMessage(userMessageId, { memoryId: recordResult.memoryId })
          }

          // 저장 완료 즉시 카드 표시 (위치는 나중에)
          const memoryCardId = chatBubbles?.showMemoryCard(textMessage, null)

          // 위치 완료 후 UI + DB 업데이트 (background)
          locationPromise.then(async locationName => {
            if (!locationName) return
            if (chatBubbles && memoryCardId) {
              chatBubbles.updateMessage(memoryCardId, { locationName })
            }
            if (recordResult?.memoryId) {
              await supabase.from('memories').update({ location_name: locationName }).eq('id', recordResult.memoryId)
            }
          }).catch(() => {})

          // 유사 기억 탐색 (background — memory_card 표시를 블로킹하지 않음)
          if (recordResult?.memoryId) {
            fetchRelatedMemories(recordResult.memoryId, userId).then(async result => {
              if (result.total > 0 && chatBubbles) {
                const payload = { ...result, summary: '비슷한 기억이 있어요' }
                chatBubbles.showSearchResultsV2(payload)
                // 새로고침 후에도 복원되도록 DB에 저장
                await addMessage(chatSessionId, '비슷한 기억이 있어요', 'structured_output', 'assistant', payload, recordResult.memoryId)
              }
            }).catch(() => {})
          }
        }
      }

    } catch (error) {
      console.error('메시지 전송/분석 에러:', error)

      // 사용자 친화적 에러 처리
      const toast = window.app?.toast
      const chatBubbles = window.app?.chatBubbles
      chatBubbles?.hideLoadingBubble()
      const errorInfo = getUserFriendlyError(error)

      // 네트워크 오류 체크
      if (!isOnline()) {
        toast?.error(
          '인터넷 연결 끊김',
          '인터넷 연결을 확인한 후 다시 시도해주세요.',
          '확인',
          null
        )
      } else {
        toast?.error(
          errorInfo.title,
          errorInfo.message,
          errorInfo.action,
          errorInfo.action === '재시도' ? () => this.handleSendMessage() : null
        )
      }

      if (chatBubbles) {
        chatBubbles.hideLoadingAndStartResponse("작업 처리 중 문제가 발생했습니다. 다시 시도해주세요.")
      }
    } finally {
      this.state.isSending = false

      // 포커스 복원 및 DOM 렌더링
      if (/Android/i.test(navigator.userAgent)) {
        const textarea = this.el.querySelector('.chat-input-field')
        if (textarea) textarea.disabled = false
        this.updateSendButton()
      } else {
        this.render()
        setTimeout(() => {
          const textarea = this.el.querySelector('.chat-input-field')
          if (textarea && !/Android/i.test(navigator.userAgent)) textarea.focus()
        }, 0)
      }

      if (shouldReleasePreview && previewToRevoke) {
        URL.revokeObjectURL(previewToRevoke)
      }
    }
  }

  async ensureExistingSession() {
    if (this.state.currentChatSessionId) {
      return this.state.currentChatSessionId
    }

    if (window.app?.currentSessionId) {
      this.state.currentChatSessionId = window.app.currentSessionId
      this.persistSessionId(window.app.currentSessionId)
      return window.app.currentSessionId
    }

    if (this.sessionLookupPromise) {
      return this.sessionLookupPromise
    }

    this.sessionLookupPromise = (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData?.user?.id
        if (!userId) return null

        const { data, error } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.warn('기존 채팅 세션 조회 실패:', error)
          return null
        }

        if (data?.id) {
          this.state.currentChatSessionId = data.id
          this.persistSessionId(data.id)
          this.syncGlobalSessionId(data.id)
          return data.id
        }
        return null
      } catch (lookupError) {
        console.warn('기존 채팅 세션 조회 중 오류:', lookupError)
        return null
      } finally {
        this.sessionLookupPromise = null
      }
    })()

    return this.sessionLookupPromise
  }

  restoreSessionFromCache() {
    if (typeof localStorage === 'undefined') return
    try {
      const cachedId = localStorage.getItem(this.sessionStorageKey)

      setTimeout(async () => {
        try {
          const { data: authData } = await supabase.auth.getUser()
          const userId = authData?.user?.id
          if (!userId) return

          if (cachedId) {
            // 캐시된 세션이 현재 유저 소유인지 확인
            const { data } = await supabase
              .from('chat_sessions')
              .select('id')
              .eq('id', cachedId)
              .eq('user_id', userId)
              .maybeSingle()

            if (data?.id) {
              this.state.currentChatSessionId = cachedId
              this.syncGlobalSessionId(cachedId)
              this.loadSessionMessages(cachedId)
              return
            }
            // 소유자 불일치 → 캐시 제거 후 DB에서 조회
            this.persistSessionId(null)
          }

          // 캐시 없거나 불일치 → DB에서 유저의 최신 세션 조회
          const sessionId = await this.ensureExistingSession()
          if (sessionId) this.loadSessionMessages(sessionId)
        } catch (e) {
          console.warn('세션 복원 실패:', e)
        }
      }, 0)
    } catch (error) {
      console.warn('세션 ID 복원 실패:', error)
    }
  }

  /**
   * 세션의 메시지 로드
   */
  async loadSessionMessages(sessionId) {
    if (!sessionId) return

    const chatBubbles = window.app?.chatBubbles
    if (!chatBubbles) {
      console.warn('ChatBubbles 컴포넌트를 찾을 수 없습니다.')
      return
    }

    await chatBubbles.loadMessages(sessionId)
  }

  persistSessionId(sessionId) {
    if (typeof localStorage === 'undefined') return
    try {
      if (sessionId) {
        localStorage.setItem(this.sessionStorageKey, sessionId)
      } else {
        localStorage.removeItem(this.sessionStorageKey)
      }
    } catch (error) {
      console.warn('세션 ID 저장 실패:', error)
    }
  }

  syncGlobalSessionId(sessionId) {
    if (!sessionId) return
    if (window.app?.updateCurrentSessionId) {
      window.app.updateCurrentSessionId(sessionId)
    } else if (window.app) {
      window.app.currentSessionId = sessionId
    }
  }

  autoResize(textarea) {
    if (!textarea) return
    if (textarea.value.trim() === '') {
      textarea.style.removeProperty('height')
      textarea.style.overflowY = 'hidden'
      return
    }

    // 기본 높이로 초기화
    textarea.style.height = 'auto'
    const maxHeight = 120
    const scrollHeight = textarea.scrollHeight
    const totalPadding = 12 // padding top + bottom (6px * 2)
    const contentHeight = scrollHeight - totalPadding
    const lineHeight = 24
    const lineCount = Math.ceil(contentHeight / lineHeight)
    const finalHeight = Math.max(lineHeight, lineCount * lineHeight)

    // 높이 조정 (최대 높이 제한)
    if (finalHeight <= (maxHeight - totalPadding)) {
      textarea.style.height = finalHeight + 'px'
      textarea.style.overflowY = 'hidden'
    } else {
      textarea.style.height = maxHeight + 'px'
      textarea.style.overflowY = 'auto'
    }
  }

  updateSendButton() {
    const sendButton = this.el.querySelector('.chat-send-button')
    if (!sendButton) return

    const hasMessage = this.state.message.trim().length > 0 || this.state.attachedFile !== null
    const isAIStreaming = window.app?.chatBubbles?.state?.isStreaming

    const shouldDisable = !hasMessage || this.state.isSending || isAIStreaming
    const shouldActivate = hasMessage && !this.state.isSending && !isAIStreaming

    // 상태가 변경될 때만 DOM 업데이트
    if (sendButton.disabled !== shouldDisable) {
      sendButton.disabled = shouldDisable
    }
    if (sendButton.classList.contains('active') !== shouldActivate) {
      sendButton.classList.toggle('active', shouldActivate)
    }
  }

  enableChatting(chatSessionId = null, photoContext = null) {
    this.state.isEnabled = true
    this.state.currentChatSessionId = chatSessionId
    this.state.photoContext = photoContext

    if (chatSessionId) {
      this.persistSessionId(chatSessionId)
      this.syncGlobalSessionId(chatSessionId)
    }

    // 전역 currentSessionId 업데이트
    if (window.app?.updateCurrentSessionId && chatSessionId) {
      window.app.updateCurrentSessionId(chatSessionId)
    }

    this.updatePlaceholder()

    // 안드로이드에서는 render() 대신 DOM을 직접 업데이트
    if (/Android/i.test(navigator.userAgent)) {
      this.updateDOMWithoutRerender()
    } else {
      this.render()
    }
  }

  disableChatting() {
    this.state.isEnabled = false
    this.state.currentChatSessionId = null
    this.state.photoContext = null
    this.updatePlaceholder()
    this.render()
  }

  updatePlaceholder() {
    if (!this.state.isEnabled) {
      this.state.placeholder = '이야기를 시작하세요'
    // } else if (this.state.mode === 'search') {
    //   this.state.placeholder = '검색어를 입력하세요...'
    } else {
      this.state.placeholder = '지금 떠오른 순간을 남겨보세요...'
    }
  }

  render() {
    // 완전히 숨김 상태면 아무것도 렌더링하지 않음
    if (this.state.isHidden) {
      this.el.innerHTML = ''
      this.el.style.display = 'none'
      return
    }

    // 렌더링 전에 현재 포커스 상태 저장
    const previousActiveElement = document.activeElement
    const wasTextareaFocused = previousActiveElement && previousActiveElement.classList && previousActiveElement.classList.contains('chat-input-field')
    const currentMessage = this.state.message

    this.el.style.display = ''
    const { message, isSending, isEnabled, placeholder, attachedFilePreview, mode } = this.state
    // const isSearchMode = mode === 'search' // 검색 모드 UI 변경 비활성화
    const isSearchMode = false
    const hasMessage = message.trim().length > 0 || attachedFilePreview !== null
    const isDisabled = !isEnabled || isSending
    const uploadInputId = 'chat-photo-upload'

    const wrapperClasses = [
      'chat-input-wrapper',
      isEnabled ? '' : 'disabled',
      attachedFilePreview ? 'has-preview' : '',
      // isSearchMode ? 'search-mode' : '',
    ].filter(Boolean).join(' ')

    const previewHtml = attachedFilePreview ? `
      <div class="chat-input-preview">
        <div class="chat-preview-image-wrapper">
          <img src="${attachedFilePreview}" alt="첨부 이미지 미리보기" class="chat-preview-thumb" />
          <button type="button" class="chat-preview-remove" aria-label="첨부 이미지 제거">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
    ` : ''

    const uploadButtonHtml = `
          <div class="chat-input-left">
            <input type="file" id="${uploadInputId}" accept="image/*" class="chat-upload-input" ${isDisabled ? 'disabled' : ''} />
            <label for="${uploadInputId}" class="chat-upload-button ${isDisabled ? 'disabled' : ''}" aria-label="사진 업로드" tabindex="0">
              <span class="material-symbols-outlined">add</span>
            </label>
          </div>
    `
    // 기록 모드: + 버튼 표시 / 검색 모드: + 버튼 숨김
    // const uploadButtonHtml = !isSearchMode ? `...` : ''

    const sendIcon = isSending ? 'hourglass_empty' : 'send'
    // 기록 모드: send 아이콘 / 검색 모드: search 아이콘
    // const sendIcon = isSending ? 'hourglass_empty' : (isSearchMode ? 'search' : 'send')

    this.el.innerHTML = `
      ${/* 기록/검색 슬라이더 주석처리 */''}
      ${/* <div class="segment-tabs">
        <div class="segment-tab-slider" style="transform: translateX(${activeTab === 'search' ? '100%' : '0'})"></div>
        <button class="segment-tab ${activeTab === 'record' ? 'active' : ''}" data-tab="record">기록</button>
        <button class="segment-tab ${activeTab === 'search' ? 'active' : ''}" data-tab="search">검색</button>
      </div> */''}
      <div class="segment-tabs" style="display:none"><!-- 슬라이더 비활성화 --></div>
      <div class="${wrapperClasses}">
        ${previewHtml}

        <form class="chat-input-form" role="search" aria-label="메시지 입력">
          ${uploadButtonHtml}

          <div class="chat-input-field-wrapper">
            <textarea
              class="chat-input-field"
              placeholder="${placeholder}"
              aria-label="메시지 입력"
              autocomplete="off"
              spellcheck="true"
              rows="1"
              inputmode="text"
              enterkeyhint="send"
              ${isDisabled ? 'disabled' : ''}
            >${message}</textarea>
          </div>

          <button
            type="submit"
            class="chat-send-button ${hasMessage && !isDisabled ? 'active' : ''}"
            aria-label="메시지 전송"
            ${!hasMessage || isDisabled ? 'disabled' : ''}
          >
            <span class="chat-send-icon material-symbols-outlined">
              ${sendIcon}
            </span>
          </button>
        </form>
      </div>
      <div class="chat-disclaimer">
        AI는 실수를 할 수 있습니다. 중요한 정보는 재차 확인하세요.
      </div>
    `
    // 글자수 ${message.length > 0 ? `<div class="character-count">${message.length}</div>` : ''}

    // 세그먼트 탭 이벤트
    this.el.querySelectorAll('.segment-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab
        if (this.state.mode === tab) return
        this.state = { ...this.state, mode: tab }
        const isSearch = tab === 'search'

        // 슬라이더 + 탭 active 클래스
        const slider = this.el.querySelector('.segment-tab-slider')
        if (slider) slider.style.transform = `translateX(${isSearch ? '100%' : '0'})`
        this.el.querySelectorAll('.segment-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))

        // wrapper search-mode 클래스
        const wrapper = this.el.querySelector('.chat-input-wrapper')
        if (wrapper) wrapper.classList.toggle('search-mode', isSearch)

        // 업로드 버튼 show/hide
        const leftBtn = this.el.querySelector('.chat-input-left')
        if (leftBtn) leftBtn.style.display = isSearch ? 'none' : ''

        // 전송 아이콘
        const sendIcon = this.el.querySelector('.chat-send-icon')
        if (sendIcon) sendIcon.textContent = isSearch ? 'search' : 'send'

        // textarea placeholder + enterkeyhint
        const textarea = this.el.querySelector('.chat-input-field')
        if (textarea) {
          this.updatePlaceholder()
          textarea.placeholder = this.state.placeholder
          textarea.setAttribute('enterkeyhint', isSearch ? 'search' : 'send')
          textarea.focus()
        }

        // ChatBubbles 화면 전환
        const chatBubbles = window.app?.chatBubbles
        if (chatBubbles) {
          if (isSearch) {
            chatBubbles.switchToSearchMode()
          } else {
            chatBubbles.switchToRecordMode()
          }
        }
      })
    })

    // 이벤트 리스너 추가 (지연 실행으로 DOM 준비 대기)
    setTimeout(() => {
      const form = this.el.querySelector('.chat-input-form')
      const textarea = this.el.querySelector('.chat-input-field')
      const fileInput = this.el.querySelector('#chat-photo-upload')
      const removeBtn = this.el.querySelector('.chat-preview-remove')

      if (form && textarea) {
        form.removeEventListener('submit', this.handleSubmit)
        textarea.removeEventListener('input', this.handleInput)
        textarea.removeEventListener('keydown', this.handleKeyDown)
        textarea.removeEventListener('focus', this.handleFocus)
        textarea.removeEventListener('blur', this.handleBlur)

        form.addEventListener('submit', this.handleSubmit)
        textarea.addEventListener('input', this.handleInput)
        textarea.addEventListener('keydown', this.handleKeyDown)
        textarea.addEventListener('focus', this.handleFocus)
        textarea.addEventListener('blur', this.handleBlur)
        if (fileInput) {
          fileInput.removeEventListener('change', this.handleFileSelect)
          fileInput.addEventListener('change', this.handleFileSelect)
        }
        if (removeBtn) {
          removeBtn.removeEventListener('click', this.handleRemoveFile)
          removeBtn.addEventListener('click', this.handleRemoveFile)
        }

        // 안드로이드에서 키보드 활성화 개선
        if (/Android/i.test(navigator.userAgent)) {
          // 터치 시작 시 포커스 보호 활성화
          textarea.addEventListener('touchstart', (e) => {
            this.hasFocus = true
            this.protectFocus(textarea)
          }, { passive: true })

          // 클릭 시 포커스 유지
          textarea.addEventListener('click', (e) => {
            if (document.activeElement !== textarea) {
              e.preventDefault()
              e.stopPropagation()
              textarea.focus()
              this.hasFocus = true
            }
          })
        }




        // 초기 높이 설정
        this.autoResize(textarea)

        // 안드로이드에서 렌더링 후 포커스 복원
        if (/Android/i.test(navigator.userAgent) && wasTextareaFocused && this.hasFocus) {
          // 짧은 지연 후 포커스 복원
          setTimeout(() => {
            if (textarea && !document.activeElement.matches('input, textarea')) {
              textarea.focus()
              // 커서 위치를 끝으로 이동
              textarea.setSelectionRange(textarea.value.length, textarea.value.length)
            }
          }, 100)
        }
      }
    }, 0)
  }

  // 채팅창 완전히 숨기기
  hide() {
    this.state.isHidden = true
    this.render()
  }

  // 채팅창 다시 보이기
  show() {
    this.state.isHidden = false
    this.render()
  }


  // 완전 초기 상태로 리셋
  // 포커스 보호 함수 - 안드로이드에서 일정 시간 동안 포커스 유지
  protectFocus(element) {
    this.focusProtected = true
    setTimeout(() => { this.focusProtected = false }, 500)
    const checkFocus = setInterval(() => {
      if (this.focusProtected && this.hasFocus && document.activeElement !== element) {
        element.focus()
      }
      if (!this.focusProtected) {
        clearInterval(checkFocus)
      }
    }, 50)
  }

  // 안드로이드용: render() 없이 DOM 업데이트
  updateDOMWithoutRerender() {
    const textarea = this.el.querySelector('.chat-input-field')
    const wrapper = this.el.querySelector('.chat-input-wrapper')

    if (textarea) {
      textarea.placeholder = this.state.placeholder
      textarea.disabled = !this.state.isEnabled || this.state.isSending
    }
    if (wrapper) {
      if (this.state.isEnabled) wrapper.classList.remove('disabled')
      else wrapper.classList.add('disabled')
    }

    // 버튼 상태 업데이트
    this.updateSendButton()
  }

  resetToInitialState() {
    this.state.message = ''
    this.state.isSending = false
    this.state.isVisible = true
    this.state.isHidden = false
    this.state.isEnabled = false
    this.state.currentChatSessionId = null
    this.state.attachedFile = null
    if (this.state.attachedFilePreview) URL.revokeObjectURL(this.state.attachedFilePreview)
    this.state.attachedFilePreview = null
    this.updatePlaceholder()
    this.render()
  }
}
