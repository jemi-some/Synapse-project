import { Component } from '../core'
import { sendMessage, vectorize } from '../services/openai'
import { addMessage, updateChatSession, getMessages, uploadFile, saveMemory, createChatSession, supabase } from '../services/supabase'
import * as exifr from 'exifr'
import imageCompression from 'browser-image-compression'

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
        hasPreviousActions: false // 직전 AI 응답에 actions가 있었는지 여부 (자동 스레드 전환용)
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

    // 모바일 감지
    this.isMobile = this.detectMobile()

    // 초기 placeholder 설정
    this.updatePlaceholder()

    // 로컬에 저장된 세션 ID 복원
    this.restoreSessionFromCache()
  }

  async handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    // 파일 크기 체크 (예: 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB를 초과할 수 없습니다.')
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
      alert('이미지 처리 중 오류가 발생했습니다.')
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
        dateTime: {},
        gps: null,
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
          // Date 객체인 경우 ISO 문자열로 변환
          metadata.dateTime.original = dateSource instanceof Date
            ? dateSource.toISOString()
            : new Date(dateSource).toISOString()
          console.log('📅 촬영 날짜:', metadata.dateTime.original, '(출처:',
            exifData.DateTimeOriginal ? 'DateTimeOriginal' :
            exifData.CreateDate ? 'CreateDate' :
            exifData.ModifyDate ? 'ModifyDate' : 'DateTime', ')')
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

        // GPS (exifr는 포맷팅된 위/경도를 제공함)
        if (exifData.latitude && exifData.longitude) {
          console.log('📍 GPS 좌표:', exifData.latitude, exifData.longitude)
          metadata.gps = {
            latitude: exifData.latitude,
            longitude: exifData.longitude
          }

          // 위치 정보를 주소로 변환 시도
          try {
            const { reverseGeocode } = await import('../services/geocoding.js')
            const addressInfo = await reverseGeocode(metadata.gps.latitude, metadata.gps.longitude)
            if (addressInfo) {
              metadata.gps.address = addressInfo.fullAddress
              metadata.gps.shortAddress = addressInfo.shortAddress
              console.log('📍 주소:', metadata.gps.shortAddress)
            }
          } catch (geoError) {
            console.warn('역지오코딩 실패:', geoError)
          }
        } else {
          console.warn('⚠️ GPS 정보 없음')
        }
      } else {
        console.warn('⚠️ EXIF 데이터가 없습니다')
      }

      return metadata
    } catch (error) {
      console.error('❌ 메타데이터 추출 실패:', error)
      return { dateTime: {}, gps: null, camera: {}, imageSize: {} }
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
        // [1] 사용자 메시지로 사진과 텍스트 표시
        const uploadMessageContent = textMessage ? `[사진 첨부] ${textMessage}` : '[사진 첨부]'
        if (chatBubbles) {
          const bubbleOptions = {}
          if (previewToRevoke) {
            bubbleOptions.imageUrl = previewToRevoke
            bubbleOptions.metadata = { isLocalPreview: true }
          }
          userMessageId = chatBubbles.showUserMessage(textMessage || '', bubbleOptions)
          // showLoadingBubble() 제거: 메타데이터 응답이 즉시 표시됨
        }

        const { error: userMessageError } = await addMessage(chatSessionId, uploadMessageContent, 'text', 'user')
        if (userMessageError) {
          console.warn('사용자 메시지 저장 실패:', userMessageError)
        }

        // [2] 메타데이터 추출
        console.log('메타데이터 추출 시작...')
        const metadata = await this.extractMetadata(fileToUpload)
        console.log('추출된 메타데이터:', metadata)

        // [3] Supabase Storage 업로드
        const { data: uploadData, error: uploadError } = await uploadFile(fileToUpload)
        if (uploadError) throw new Error(`업로드 실패: ${uploadError.message}`)

        // [4] memories 테이블 INSERT
        const memoryPayload = {
          file_url: uploadData.publicUrl,
          file_name: uploadData.name,
          file_size: uploadData.size,
          mime_type: uploadData.type,
          selected_metadata: metadata,
          chat_session_id: chatSessionId,
          user_text: textMessage // 사용자가 입력한 텍스트도 같이 저장
        }
        const { data: memoryData, error: memoryError } = await saveMemory(memoryPayload)

        if (memoryError) {
          console.warn('Memory 테이블 저장 중 오류 발생 (진행은 계속됨):', memoryError)
        }

        const memoryId = memoryData ? memoryData.id : null

        if (userMessageId && chatBubbles && typeof chatBubbles.updateMessage === 'function') {
          const metadataUpdates = {
            memoryId,
            storagePath: uploadData.path,
            mimeType: uploadData.mimeType || uploadData.type || fileToUpload?.type || null
          }
          chatBubbles.updateMessage(userMessageId, {
            imageUrl: uploadData.publicUrl,
            metadata: metadataUpdates
          })
          shouldReleasePreview = true
        }

        // [5] AI 응답: 메타데이터에서 추출한 장소와 날짜를 즉시 표시
        if (chatBubbles) {
          const locationText = metadata?.gps?.shortAddress || metadata?.gps?.address || '위치 정보 없음'
          const dateText = metadata?.dateTime?.original
            ? new Date(metadata.dateTime.original).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '시간 정보 없음'

          // 메타데이터 기반 즉시 응답 (로딩 없이 바로 표시)
          const simpleResponse = `📍 ${locationText}\n🕒 ${dateText}`

          chatBubbles.showAIMessage(simpleResponse)
          await addMessage(chatSessionId, simpleResponse, 'text', 'assistant')
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
        // [1] 사용자 텍스트 화면 표시
        if (chatBubbles) chatBubbles.showUserMessage(textMessage)
        const { error: textMessageError } = await addMessage(chatSessionId, textMessage, 'text', 'user')
        if (textMessageError) {
          console.warn('텍스트 메시지 저장 실패:', textMessageError)
        }

        // [2] 메인 피드 채팅 라우팅 (MCP)
        const responseData = await sendMessage(textMessage, userId, chatSessionId)

        // [3] AI 텍스트 응답 출력
        if (chatBubbles && responseData.success) {
          // AI 텍스트 응답
          chatBubbles.showAIMessage(responseData.response)
          await addMessage(chatSessionId, responseData.response, 'text', 'assistant')

          // actions 검색 결과가 있으면 렌더링하고, 다음 입력 시 스레드로 빠지도록 플래그 설정
          if (responseData.actions && responseData.actions.length > 0) {
            this.state.hasPreviousActions = true
            chatBubbles.showSearchResults(responseData.actions)
          } else {
            this.state.hasPreviousActions = false
          }
        }
      }

    } catch (error) {
      console.error('메시지 전송/분석 에러:', error)
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.hideLoadingAndStartResponse("작업 처리 중 문제가 발생했습니다.")
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
      if (cachedId) {
        this.state.currentChatSessionId = cachedId
        // window.app은 App 렌더링 이후에만 존재하므로 지연 실행
        setTimeout(() => {
          this.syncGlobalSessionId(cachedId)
        }, 0)
      }
    } catch (error) {
      console.warn('세션 ID 복원 실패:', error)
    }
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
    } else {
      this.state.placeholder = '메시지를 입력하세요...'
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
    const { message, isSending, isEnabled, placeholder, attachedFilePreview } = this.state
    const hasMessage = message.trim().length > 0 || attachedFilePreview !== null
    const isDisabled = !isEnabled || isSending
    const uploadInputId = 'chat-photo-upload'

    const wrapperClasses = [
      'chat-input-wrapper',
      isEnabled ? '' : 'disabled',
      attachedFilePreview ? 'has-preview' : ''
    ].filter(Boolean).join(' ')

    const previewHtml = attachedFilePreview ? `
      <div class="chat-input-preview">
        <img src="${attachedFilePreview}" alt="첨부 이미지 미리보기" class="chat-preview-thumb" />
        <div class="chat-preview-text">
          <span>이미지 1장을 첨부했어요</span>
        </div>
        <button type="button" class="chat-preview-remove" aria-label="첨부 이미지 제거">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    ` : ''

    this.el.innerHTML = `
      <div class="${wrapperClasses}">
        ${previewHtml}

        <form class="chat-input-form" role="search" aria-label="메시지 입력">
          <div class="chat-input-left">
            <input type="file" id="${uploadInputId}" accept="image/*" class="chat-upload-input" ${isDisabled ? 'disabled' : ''} />
            <label for="${uploadInputId}" class="chat-upload-button ${isDisabled ? 'disabled' : ''}" aria-label="사진 업로드" tabindex="0">
              <span class="material-symbols-outlined">add</span>
            </label>
          </div>

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
              ${isSending ? 'hourglass_empty' : 'send'}
            </span>
          </button>
        </form>
      </div>
      <div class="chat-disclaimer">
        AI는 실수를 할 수 있습니다. 중요한 정보는 재차 확인하세요.
      </div>
    `
    // 글자수 ${message.length > 0 ? `<div class="character-count">${message.length}</div>` : ''}

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
