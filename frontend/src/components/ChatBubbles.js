import { Component } from '../core'
import { getMessages } from '../services/supabase'

export default class ChatBubbles extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        messages: [], // 메시지 배열 [{ type: 'user'|'ai', content: '', id: '', isStreaming: false }]
        isVisible: false,
        isAnimating: false,
        isStreaming: false,
        streamText: '',
        isLoading: false,
        currentStreamingId: null, // 현재 스트리밍 중인 메시지 ID
        hasMore: true, // 더 로드할 메시지가 있는지 여부
        isLoadingMore: false, // 추가 메시지 로딩 중인지 여부
        oldestCursor: null // 가장 오래된 메시지의 created_at (페이지네이션용)
      }
    })

    this.el.className = 'chat-bubbles-container'
    this.streamInterval = null

    // 스크롤 이벤트 핸들러 바인딩
    this.handleScroll = this.handleScroll.bind(this)
  }

  /**
   * 세션의 최신 메시지 로드 (초기 로딩)
   */
  async loadMessages(sessionId) {
    if (!sessionId) {
      console.warn('세션 ID가 없어서 메시지를 로드할 수 없습니다.')
      return
    }

    try {
      // 최신 30개를 내림차순으로 가져온 뒤 역순으로 뒤집어서 오래된 순으로 표시
      const { data: rawMessages, error, hasMore } = await getMessages(sessionId, { limit: 30, ascending: false })

      if (error) {
        console.error('메시지 로드 실패:', error)
        return
      }

      if (!rawMessages || rawMessages.length === 0) {
        console.log('로드할 메시지가 없습니다.')
        this.state.hasMore = false
        return
      }

      const messages = [...rawMessages].reverse()
      console.log(`${messages.length}개의 메시지를 로드했습니다.`)

      // 메시지를 UI 형식으로 변환
      this.state.messages = messages.map(msg => this.convertMessageToUI(msg))
      this.state.hasMore = hasMore
      this.state.oldestCursor = messages.length > 0 ? messages[0].created_at : null
      this.state.isVisible = true
      this.currentSessionId = sessionId

      this.render()
      this.scrollToBottomInstant()

      // 스크롤 이벤트 리스너 등록
      this.attachScrollListener()
    } catch (error) {
      console.error('메시지 로드 중 오류:', error)
    }
  }

  /**
   * 이전 메시지 추가 로드 (무한 스크롤)
   */
  async loadMoreMessages() {
    if (!this.state.hasMore || this.state.isLoadingMore || !this.currentSessionId) {
      return
    }

    this.state.isLoadingMore = true
    this.render()

    try {
      // oldestCursor 이전의 메시지를 오름차순으로 가져옴 (supabase lt 조건 활용)
      const { data: rawMessages, error, hasMore } = await getMessages(this.currentSessionId, {
        cursor: this.state.oldestCursor,
        limit: 30,
        ascending: true
      })

      if (error) {
        console.error('추가 메시지 로드 실패:', error)
        this.state.isLoadingMore = false
        this.render()
        return
      }

      if (!rawMessages || rawMessages.length === 0) {
        this.state.hasMore = false
        this.state.isLoadingMore = false
        this.render()
        return
      }

      // ascending: true + lt(cursor) → cursor보다 오래된 메시지가 오름차순으로 옴 → 그대로 사용
      const messages = rawMessages
      console.log(`${messages.length}개의 추가 메시지를 로드했습니다.`)

      // 실제 스크롤 컨테이너에서 현재 높이 저장
      const scrollContainer = document.querySelector('.app-main')
      const oldScrollHeight = scrollContainer ? scrollContainer.scrollHeight : 0

      // 오래된 메시지를 기존 메시지 앞에 추가
      const newMessages = messages.map(msg => this.convertMessageToUI(msg))
      this.state.messages = [...newMessages, ...this.state.messages]
      this.state.hasMore = hasMore
      this.state.oldestCursor = messages.length > 0 ? messages[0].created_at : this.state.oldestCursor
      this.state.isLoadingMore = false

      this.render()

      // 스크롤 위치 복원: 추가된 높이만큼 scrollTop을 올려서 현재 보던 위치 유지
      if (scrollContainer) {
        const newScrollHeight = scrollContainer.scrollHeight
        scrollContainer.style.scrollBehavior = 'auto'
        scrollContainer.scrollTop += newScrollHeight - oldScrollHeight
        scrollContainer.style.scrollBehavior = ''
      }
    } catch (error) {
      console.error('추가 메시지 로드 중 오류:', error)
      this.state.isLoadingMore = false
      this.render()
    }
  }

  /**
   * 스크롤 이벤트 핸들러
   */
  handleScroll(e) {
    const container = e.target

    // 상단에 도달했을 때 (스크롤 위치가 상단 근처)
    if (container.scrollTop < 100 && this.state.hasMore && !this.state.isLoadingMore) {
      this.loadMoreMessages()
    }
  }

  /**
   * 스크롤 이벤트 리스너 등록 (실제 스크롤 영역인 .app-main에 등록)
   */
  attachScrollListener() {
    const scrollContainer = document.querySelector('.app-main')
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', this.handleScroll)
      scrollContainer.addEventListener('scroll', this.handleScroll)
    }
  }

  /**
   * 컴포넌트 정리 시 이벤트 리스너 제거
   */
  destroy() {
    const scrollContainer = document.querySelector('.app-main')
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', this.handleScroll)
    }
  }

  /**
   * DB 메시지를 UI 형식으로 변환
   */
  convertMessageToUI(dbMessage) {
    // action_data가 있으면 action 타입으로 처리 (검색 결과 등)
    if (dbMessage.action_data && dbMessage.role === 'assistant') {
      return {
        id: dbMessage.id,
        type: 'action',
        actionData: dbMessage.action_data,
        summary: dbMessage.content || '',
        isStreaming: false,
        createdAt: dbMessage.created_at, // 날짜 구분선용
      }
    }

    // AI 사진 메타데이터 응답: memory_id가 있는 assistant 메시지
    if (dbMessage.role === 'assistant' && dbMessage.memories?.metadata) {
      const mem = dbMessage.memories
      const rawDate = mem.metadata?.dateTime?.original
      const dateText = rawDate
        ? new Date(rawDate).toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : ''
      const locationText = mem.metadata?.gps?.shortAddress || mem.metadata?.gps?.address || '위치 정보 없음'
      return {
        id: dbMessage.id,
        type: 'photo_meta',
        date: dateText,
        location: locationText,
        isStreaming: false,
        createdAt: dbMessage.created_at,
      }
    }

    const message = {
      id: dbMessage.id,
      type: dbMessage.role === 'user' ? 'user' : 'ai',
      content: dbMessage.content || '',
      isStreaming: false,
      createdAt: dbMessage.created_at,
    }

    // 사진 메시지: memories JOIN으로 가져온 file_url 사용
    if (dbMessage.message_type === 'image' && dbMessage.memories?.file_url) {
      message.imageUrl = dbMessage.memories.file_url
    }

    return message
  }

  setPreviewMode(previewType = 'ai_text') {
    const previewMessages = this.getPreviewMessages(previewType)
    if (!previewMessages) {
      console.warn('알 수 없는 채팅 버블 프리뷰 타입:', previewType)
      return
    }

    // 스트리밍/로딩 상태 정리
    if (this.streamInterval) {
      clearInterval(this.streamInterval)
      this.streamInterval = null
    }
    this.stopLoadingMessages()

    this.state.messages = previewMessages
    this.state.isVisible = true
    this.state.isAnimating = false
    this.state.isStreaming = false
    this.state.isLoading = false
    this.state.currentStreamingId = null
    this.render()
  }

  getPreviewMessages(type) {
    const commonUser = {
      type: 'user',
      content: '이 사진 언제 어디서 찍었는지 알려줄 수 있어?',
      imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=60',
      id: 'preview-user'
    }

    if (type === 'ai_text') {
      return [
        commonUser,
        {
          type: 'ai',
          content: '📍 제주 렛츠런팜 주변으로 보여요. 2018년 7월 31일 오후에 촬영된 해바라기 밭 사진 같네요. 이날 남긴 메모에는 "여름 저녁 공기가 너무 좋았다"고 적혀 있어요. 기억나는 장면이 있다면 들려주세요!',
          id: 'preview-ai-text',
          isStreaming: false
        }
      ]
    }

    if (type === 'ai_search') {
      return [
        {
          type: 'ai',
          content: '비슷한 추억 두 건을 찾았어요. 어떤 순간인지 더 이야기해볼까요?',
          id: 'preview-ai-search-intro'
        },
        {
          type: 'action',
          id: 'preview-ai-search-action',
          actionData: {
            action: 'search_photos',
            results: [
              {
                image_url: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=400&q=60',
                capture_time: '2023-03-09T12:00:00Z',
                description: '흐린 날 퇴근길 하늘'
              },
              {
                image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=60',
                capture_time: '2022-11-21T08:00:00Z',
                description: '가을 아침의 공원 산책'
              }
            ]
          }
        }
      ]
    }

    if (type === 'memo_search') {
      return [
        {
          type: 'ai',
          content: '우울했던 날에 대한 기록 3건을 찾았어요.',
          id: 'preview-memo-search-intro'
        },
        {
          type: 'action',
          id: 'preview-memo-search-action',
          actionData: {
            action: 'search_memos',
            results: [
              {
                capture_time: '2024-03-01T14:30:00Z',
                context: '오늘 기분이 우울했다'
              },
              {
                capture_time: '2024-02-15T09:00:00Z',
                context: '프로젝트 스트레스로 힘든 하루였다'
              },
              {
                capture_time: '2024-01-20T18:00:00Z',
                context: '비 오는 날, 마음도 축축하다'
              }
            ]
          }
        }
      ]
    }

    if (type === 'mixed_search') {
      return [
        {
          type: 'ai',
          content: '2건의 기록을 찾았어요',
          id: 'preview-mixed-intro'
        },
        {
          type: 'action',
          id: 'preview-mixed-photos',
          actionData: {
            action: 'search_photos',
            results: [
              {
                image_url: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=400&q=60',
                capture_time: '2024-03-09T12:00:00Z',
                description: '우중충한 하늘 사진'
              }
            ]
          }
        },
        {
          type: 'action',
          id: 'preview-mixed-memos',
          actionData: {
            action: 'search_memos',
            results: [
              {
                capture_time: '2024-03-01T14:30:00Z',
                context: '오늘 기분이 우울했다'
              },
              {
                capture_time: '2024-02-15T09:00:00Z',
                context: '프로젝트 스트레스로 힘든 하루였다'
              }
            ]
          }
        }
      ]
    }

    return null
  }

  showBubbles(userMessage, aiResponse = null) {
    // 이전 버블들 제거 (fade out 애니메이션)
    if (this.state.isVisible) {
      this.hideBubbles()
      // 약간의 딜레이 후 새 버블 표시
      setTimeout(() => {
        this.displayNewBubbles(userMessage, aiResponse)
      }, 300)
    } else {
      this.displayNewBubbles(userMessage, aiResponse)
    }
  }

  // 사용자 메시지 추가
  showUserMessage(userMessage, options = {}) {
    const messageId = `user-${Date.now()}`

    // 메시지 배열에 사용자 메시지 추가
    this.state.messages.push({
      type: 'user',
      content: userMessage,
      imageUrl: options.imageUrl || null,
      metadata: options.metadata || null,
      id: messageId,
      isStreaming: false,
      createdAt: new Date().toISOString(),
    })

    this.state.isVisible = true
    this.state.isAnimating = true
    this.render()

    // 사용자 메시지 추가 후 스크롤
    this.scrollToBottom()
    return messageId
  }

  updateMessage(messageId, updates = {}) {
    if (!messageId) return
    const targetIndex = this.state.messages.findIndex(msg => msg.id === messageId)
    if (targetIndex === -1) return

    const { metadata: metadataUpdates, ...restUpdates } = updates
    const existing = this.state.messages[targetIndex]
    const nextMessage = {
      ...existing,
      ...restUpdates
    }

    if (metadataUpdates) {
      nextMessage.metadata = {
        ...(existing.metadata || {}),
        ...metadataUpdates
      }
    }

    this.state.messages[targetIndex] = nextMessage
    this.render()
    this.scrollToBottomIfAtBottom()
  }

  // 일기 엔트리 표시
  showDiaryEntry(content) {
    const messageId = `diary-${Date.now()}`

    // 메시지 배열에 일기 추가
    this.state.messages.push({
      type: 'diary',
      content: content,
      id: messageId,
      isStreaming: false
    })

    this.state.isVisible = true
    this.state.isAnimating = true
    this.render()
  }

  displayUserMessage(userMessage) {
    this.state.currentUser = userMessage
    this.state.currentAI = ''
    this.state.isVisible = true
    this.state.isAnimating = true
    this.state.isStreaming = false

    this.render()

    setTimeout(() => {
      this.state.isAnimating = false
    }, 600)
  }

  // AI가 먼저 대화를 시작하는 메서드
  showAIFirstMessage(aiMessage) {
    const messageId = `ai-${Date.now()}`

    // 메시지 배열에 AI 메시지 추가
    this.state.messages.push({
      type: 'ai',
      content: '',
      id: messageId,
      isStreaming: true
    })

    this.state.isVisible = true
    this.state.isAnimating = true
    this.state.currentStreamingId = messageId
    this.render()

    // 스트리밍으로 AI 메시지 표시
    setTimeout(() => {
      this.startStreamingResponse(aiMessage, messageId)
    }, 600)
  }

  // 채팅 모드에서 AI 메시지 응답 (깜박임 방지용)
  showAIMessage(aiMessage) {
    const messageId = `ai-${Date.now()}`

    // 메시지 배열에 AI 메시지 추가
    this.state.messages.push({
      type: 'ai',
      content: '',
      id: messageId,
      isStreaming: true,
      createdAt: new Date().toISOString(),
    })

    this.state.isVisible = true
    this.state.isAnimating = true
    this.state.currentStreamingId = messageId
    this.render()

    // AI 메시지 버블 추가 후 스크롤
    this.scrollToBottom()

    // 애니메이션이 끝난 후 스트리밍 시작 (깜박임 방지)
    setTimeout(() => {
      this.state.isAnimating = false // 애니메이션 상태 고정
      this.startStreamingResponse(aiMessage, messageId)
    }, 600)
  }

  displayAIFirstMessage(aiMessage) {
    this.state.currentUser = '' // 사용자 메시지 없음
    this.state.currentAI = ''
    this.state.isVisible = true
    this.state.isAnimating = true
    this.state.isStreaming = false

    // AI 버블만 표시
    this.render()

    // 스트리밍으로 AI 메시지 표시
    setTimeout(() => {
      this.startStreamingResponse(aiMessage)
    }, 600)
  }

  displayNewBubbles(userMessage, aiResponse) {
    this.state.currentUser = userMessage
    this.state.currentAI = aiResponse || ''
    this.state.isVisible = true
    this.state.isAnimating = true

    this.render()

    // 애니메이션 완료 후 상태 업데이트
    setTimeout(() => {
      this.state.isAnimating = false
    }, 600)
  }

  hideBubbles() {
    const container = this.el
    container.classList.add('fade-out')

    setTimeout(() => {
      this.state.isVisible = false
      this.state.messages = [] // 메시지 배열 초기화
      this.state.isStreaming = false
      this.state.streamText = ''
      this.state.isLoading = false
      this.state.currentStreamingId = null

      // DOM 완전 초기화
      container.innerHTML = ''
      container.classList.remove('fade-out')

      // 스트리밍 인터벌과 로딩 인터벌 정리
      if (this.streamInterval) {
        clearInterval(this.streamInterval)
        this.streamInterval = null
      }

      // 로딩 메시지 인터벌도 정리
      this.stopLoadingMessages()
    }, 300)
  }

  updateAIResponse(aiResponse) {
    if (this.state.isVisible) {
      this.state.currentAI = aiResponse
      this.render()
    }
  }

  // 스트리밍 응답 시작
  startStreamingResponse(fullResponse, messageId = null) {
    // 메시지 ID가 없으면 새로 생성 (기존 호출과의 호환성을 위해)
    if (!messageId) {
      messageId = `ai-${Date.now()}`
      this.state.messages.push({
        type: 'ai',
        content: '',
        id: messageId,
        isStreaming: true
      })
    }

    this.state.isStreaming = true
    this.state.streamText = ''
    this.state.currentStreamingId = messageId

    this.render()

    // AI 스트리밍 시작 시 ChatInput 버튼 업데이트
    this.updateChatInputButton()

    let currentIndex = 0
    const streamSpeed = 50 // 밀리초 단위 (조정 가능)

    // 약간의 딜레이 후 스트리밍 시작
    setTimeout(() => {
      this.streamInterval = setInterval(() => {
        if (currentIndex < fullResponse.length) {
          this.state.streamText += fullResponse[currentIndex]

          // 해당 메시지를 찾아서 업데이트
          const message = this.state.messages.find(msg => msg.id === messageId)
          if (message) {
            message.content = this.state.streamText
          }

          this.render()

          // 스트리밍 중 주기적으로 스크롤 (성능 고려해서 10글자마다)
          // 단, 사용자가 위로 스크롤한 상태라면 방해하지 않음
          if (currentIndex % 10 === 0) {
            this.scrollToBottomIfAtBottom()
          }

          currentIndex++
        } else {
          // 스트리밍 완료
          this.state.isStreaming = false
          this.state.currentStreamingId = null

          // 메시지의 스트리밍 상태 업데이트
          const message = this.state.messages.find(msg => msg.id === messageId)
          if (message) {
            message.isStreaming = false
          }

          clearInterval(this.streamInterval)
          this.streamInterval = null
          this.scrollToBottom()

          // AI 스트리밍 완료 시 ChatInput 버튼 업데이트
          this.updateChatInputButton()
        }
      }, streamSpeed)
    }, 500) // AI 응답 시작 전 약간의 딜레이
  }

  // 스트리밍 중단
  stopStreaming() {
    if (this.streamInterval) {
      clearInterval(this.streamInterval)
      this.streamInterval = null
      this.state.isStreaming = false
    }
  }

  // 로딩 상태 시작 (이미지 업로드 후 AI 질문 생성 대기)
  showLoadingBubble() {
    // 이미 로딩 중이면 중복 호출 방지
    if (this.state.isLoading) {
      console.log('⚠️ 이미 로딩 버블 표시 중 - 중복 호출 스킵')
      return
    }

    console.log('🎬 로딩 버블 표시 시작')
    this.state.isLoading = true
    this.state.isVisible = true
    this.state.isStreaming = false
    this.state.loadingMessageIndex = 0

    this.render()
    this.startLoadingMessages()
  }

  // 로딩 메시지들을 순환하면서 표시
  startLoadingMessages() {
    const loadingMessages = [
      "사진을 분석하고 있어요... ✨",
      "어떤 이야기가 담겨있을까요? 🤔",
      "곧 흥미로운 질문을 드릴게요! ⏰",
      "사진 속 순간들을 살펴보고 있어요 📸",
      "특별한 질문을 준비하고 있어요 💭"
    ]

    // 2초마다 로딩 메시지 변경
    this.loadingInterval = setInterval(() => {
      if (this.state.isLoading) {
        this.state.loadingMessageIndex = (this.state.loadingMessageIndex + 1) % loadingMessages.length
        this.render()
      }
    }, 2000)
  }

  // 로딩 상태 정리
  stopLoadingMessages() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval)
      this.loadingInterval = null
    }
  }

  // 로딩 상태 종료 후 실제 AI 응답 시작
  clearMessages() {
    this.state.messages = []
    this.state.hasMore = true
    this.state.oldestCursor = null
    this.currentSessionId = null
    this.render()
  }

  hideLoadingBubble() {
    this.state.isLoading = false
    this.stopLoadingMessages()
    this.render()
  }

  hideLoadingAndStartResponse(aiResponse) {
    this.state.isLoading = false
    this.stopLoadingMessages()

    // AI 메시지 추가
    const messageId = `ai-${Date.now()}`
    this.state.messages.push({
      type: 'ai',
      content: '',
      id: messageId,
      isStreaming: true
    })

    this.startStreamingResponse(aiResponse, messageId)
  }

  render() {
    if (!this.state.isVisible) {
      this.el.innerHTML = ''
      return
    }

  // 로딩 상태일 때는 로딩 버블만 표시
    const loadingHtml = this.state.isLoading ? `
      <div class="ai-bubble glass-bubble">
        <div class="bubble-content">
          <div class="loading-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>
    ` : ''

    // 메시지 배열을 기반으로 렌더링 (날짜 구분선 포함)
    const messagesHtml = this.state.messages.map((message, index) => {
      const isLatest = index === this.state.messages.length - 1
      const bubbleClass = this.state.isAnimating && isLatest ? 'slide-up' : ''

      // 날짜 구분선 체크
      let dateSeparator = ''
      if (message.createdAt && index > 0) {
        const currentDate = this.formatDateOnly(message.createdAt)
        const prevMessage = this.state.messages[index - 1]
        const prevDate = prevMessage.createdAt ? this.formatDateOnly(prevMessage.createdAt) : null

        if (currentDate !== prevDate) {
          dateSeparator = this.renderDateSeparator(message.createdAt)
        }
      } else if (message.createdAt && index === 0) {
        // 첫 번째 메시지에는 항상 날짜 표시
        dateSeparator = this.renderDateSeparator(message.createdAt)
      }

      const timeText = this.formatTimeOnly(message.createdAt)
      const timeHtml = timeText ? `<span class="bubble-time">${timeText}</span>` : ''

      let messageHtml = ''
      if (message.type === 'ai') {
        const isCurrentlyStreaming = message.isStreaming && this.state.currentStreamingId === message.id
        messageHtml = `
          <div class="ai-bubble-wrapper">
            <div class="ai-bubble glass-bubble ${bubbleClass}">
              <div class="bubble-content">
                <div class="bubble-text">
                  ${this.escapeHtml(message.content)}
                  ${isCurrentlyStreaming ? '<span class="typing-cursor">|</span>' : ''}
                </div>
              </div>
            </div>
            ${timeHtml}
          </div>
        `
      } else if (message.type === 'action') {
        // AI 도구 호출 결과 (사진 렌더링, 메모 렌더링 등)
        const summaryBubble = message.summary ? `
          <div class="ai-bubble-wrapper">
            <div class="ai-bubble glass-bubble">
              <div class="bubble-content">
                <div class="bubble-text">${this.escapeHtml(message.summary)}</div>
              </div>
            </div>
            ${timeHtml}
          </div>
        ` : ''
        let cardsHtml = ''
        if (message.actionData.action === 'search_photos' || message.actionData.action === 'view_my_photos') {
          cardsHtml = this.renderPhotoCards(message.actionData.results, message.id, bubbleClass)
        } else if (message.actionData.action === 'search_memos' || message.actionData.action === 'view_my_memos') {
          cardsHtml = this.renderMemoList(message.actionData.results, message.id, bubbleClass)
        }
        messageHtml = summaryBubble + cardsHtml
      } else if (message.type === 'photo_meta') {
        messageHtml = this.renderPhotoMeta(message.date, message.location, bubbleClass)
      } else if (message.type === 'diary') {
        messageHtml = `
          <div class="diary-bubble glass-bubble ${bubbleClass}">
            <div class="bubble-content">
              <div class="bubble-text">${this.escapeHtml(message.content)}</div>
            </div>
          </div>
        `
      } else {
        const hasImage = !!message.imageUrl
        const hasText = typeof message.content === 'string' && message.content.trim().length > 0

        const imageBlock = hasImage ? `
          <div class="user-image-wrapper">
            <img src="${message.imageUrl}" alt="사용자 첨부 이미지" class="bubble-image" />
          </div>
        ` : ''

        const textBlock = hasText ? `
          <div class="user-bubble glass-bubble">
            <div class="bubble-content">
              <div class="bubble-text">${this.escapeHtml(message.content)}</div>
            </div>
          </div>
        ` : ''

        messageHtml = `
          <div class="user-message-block ${bubbleClass}">
            ${timeHtml}
            <div class="user-message-content">
              ${imageBlock}
              ${textBlock}
            </div>
          </div>
        `
      }

      return dateSeparator + messageHtml
    }).join('')

    // 추가 메시지 로딩 인디케이터
    const loadingMoreHtml = this.state.isLoadingMore ? `
      <div class="loading-more-indicator">
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    ` : ''

    this.el.innerHTML = `
      <div class="chat-bubbles ${this.state.isAnimating ? 'animating' : ''}">
        ${loadingMoreHtml}
        ${messagesHtml}
        ${loadingHtml}
      </div>
    `

    // 스크롤 이벤트 리스너 재등록 (innerHTML로 DOM이 새로 생성되므로)
    this.attachScrollListener()


    // 스트리밍 중에는 강제로 DOM 업데이트
    if (this.state.isStreaming) {
      this.el.offsetHeight // 강제 reflow 트리거
    }
  }

  showSearchResults(actions) {
    if (!actions || actions.length === 0) return

    const totalCount = actions.reduce((sum, a) => sum + (a.count || 0), 0)
    const summaryText = `검색결과 ${totalCount}건을 찾았습니다.`

    actions.forEach((actionGroup, i) => {
      const messageId = `ai-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      this.state.messages.push({
        type: 'action',
        actionData: actionGroup,
        summary: i === 0 ? summaryText : '',
        id: messageId,
        isStreaming: false
      })
    })

    this.render()
    this.scrollToBottom()
  }

  showPhotoUploadResult(date, location) {
    const messageId = `ai-photo-meta-${Date.now()}`
    this.state.messages.push({
      type: 'photo_meta',
      date,
      location,
      id: messageId,
      isStreaming: false
    })
    this.render()
    this.scrollToBottom()
  }

  renderPhotoMeta(date, location, bubbleClass = '') {
    const dateRow = date ? `
      <div class="photo-card-meta-row">
        <span class="material-symbols-outlined photo-meta-icon">calendar_today</span>
        <span class="photo-meta-text">${this.escapeHtml(date)}</span>
      </div>` : ''
    const locationRow = `
      <div class="photo-card-meta-row">
        <span class="material-symbols-outlined photo-meta-icon">location_on</span>
        <span class="photo-meta-text">${this.escapeHtml(location || '위치 정보 없음')}</span>
      </div>`

    return `
      <div class="ai-bubble-wrapper">
        <div class="ai-bubble glass-bubble ${bubbleClass}">
          <div class="bubble-content">
            <div class="photo-card-meta">
              ${dateRow}
              ${locationRow}
            </div>
          </div>
        </div>
      </div>
    `
  }

  renderPhotoCards(results, messageId, bubbleClass = '') {
    if (!results || results.length === 0) return ''

    const cardsHtml = results.map(photo => {
      const url = photo.image_url || photo.file_url || photo.url

      // 날짜 추출: metadata.dateTime.original > capture_time > created_at
      let dateText = ''
      const rawDate = photo.metadata?.dateTime?.original || photo.capture_time || photo.created_at
      if (rawDate) {
        const d = new Date(rawDate)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        dateText = `${y}.${m}.${day}`
      }

      // 위치 정보 추출
      const locationText = photo.metadata?.gps?.shortAddress || ''

      return `
        <div class="photo-card action-card" data-message-id="${messageId}">
          <img src="${url}" alt="검색된 사진" class="photo-card-img" />
          <div class="photo-card-meta">
            ${dateText ? `
              <div class="photo-card-meta-row">
                <span class="material-symbols-outlined photo-meta-icon">calendar_today</span>
                <span class="photo-meta-text">${this.escapeHtml(dateText)}</span>
              </div>` : ''}
            ${locationText ? `
              <div class="photo-card-meta-row">
                <span class="material-symbols-outlined photo-meta-icon">location_on</span>
                <span class="photo-meta-text">${this.escapeHtml(locationText)}</span>
              </div>` : ''}
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="search-results-container ${bubbleClass}">
        <div class="photo-cards-container">
          ${cardsHtml}
        </div>
      </div>
    `
  }

  renderMemoList(results, messageId, bubbleClass = '') {
    if (!results || results.length === 0) return ''

    const memosHtml = results.map(memo => {
      // 날짜 추출: metadata.dateTime.original > created_at (RN 앱과 동일 우선순위)
      let dateText = ''
      const rawDate = memo.metadata?.dateTime?.original || memo.created_at
      if (rawDate) {
        const d = new Date(rawDate)
        const m = d.getMonth() + 1
        const day = d.getDate()
        dateText = `${m}월 ${day}일`
      }

      // 메모 내용 추출 (우선순위: user_text > context_summary — RN 앱과 동일)
      const content = memo.user_text || memo.context_summary || '기록'

      return `
        <div class="memo-item" data-message-id="${messageId}">
          <div class="memo-bullet"></div>
          <div class="memo-content">
            ${dateText ? `<div class="memo-date">${this.escapeHtml(dateText)}</div>` : ''}
            <div class="memo-text">${this.escapeHtml(content)}</div>
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="search-results-container ${bubbleClass}">
        <div class="memo-list-container">
          ${memosHtml}
        </div>
      </div>
    `
  }

  /**
   * 날짜만 추출 (YYYY-MM-DD 형식)
   */
  formatDateOnly(dateString) {
    if (!dateString) return null
    const date = new Date(dateString)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  formatTimeOnly(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  /**
   * 날짜 구분선 렌더링
   */
  renderDateSeparator(dateString) {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let displayText = ''

    // 오늘, 어제 체크
    if (this.formatDateOnly(date) === this.formatDateOnly(today)) {
      displayText = '오늘'
    } else if (this.formatDateOnly(date) === this.formatDateOnly(yesterday)) {
      displayText = '어제'
    } else {
      // 날짜 포맷: "3월 17일 일요일"
      displayText = date.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })
    }

    return `
      <div class="date-separator">
        <span class="date-separator-line"></span>
        <span class="date-separator-text">${displayText}</span>
        <span class="date-separator-line"></span>
      </div>
    `
  }

  // 초기 로드 시 애니메이션 없이 즉시 맨 아래로
  scrollToBottomInstant() {
    setTimeout(() => {
      const appMain = document.querySelector('.app-main')
      if (appMain) {
        appMain.style.scrollBehavior = 'auto'
        appMain.scrollTop = appMain.scrollHeight
        appMain.style.scrollBehavior = ''
      }
    }, 50)
  }

  // 스크롤을 맨 아래로
  scrollToBottom() {
    setTimeout(() => {
      // .app-main이 실제 스크롤 영역이므로 이를 찾아서 스크롤
      const appMain = document.querySelector('.app-main')
      if (appMain) {
        appMain.scrollTo({
          top: appMain.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 50)
  }

  // 현재 맨 아래에 있을 때만 스크롤 (사용자가 위로 스크롤했다면 방해하지 않음)
  scrollToBottomIfAtBottom() {
    setTimeout(() => {
      // .app-main이 실제 스크롤 영역
      const element = document.querySelector('.app-main')
      if (!element) return

      const scrollTop = element.scrollTop
      const scrollHeight = element.scrollHeight
      const clientHeight = element.clientHeight
      const activeElement = document.activeElement
      const isTextareaFocused = activeElement && activeElement.classList.contains('chat-input-field')

      // 스크롤이 필요없는 경우
      if (scrollHeight <= clientHeight) {
        return
      }

      // 사용자가 맨 아래 근처에 있을 때만 스크롤 (50px 여유)
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        element.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        })

        // 안드로이드에서 textarea가 포커스를 잃었다면 복구
        if (/Android/i.test(navigator.userAgent) && isTextareaFocused) {
          setTimeout(() => {
            activeElement.focus()
          }, 10)
        }
      }
    }, 50)
  }

  // ChatInput의 보내기 버튼 상태 업데이트
  updateChatInputButton() {
    // 안드로이드에서는 포커스 문제를 방지하기 위해 지연 실행
    if (/Android/i.test(navigator.userAgent)) {
      setTimeout(() => {
        const chatInput = window.app?.chatInput
        if (chatInput && typeof chatInput.updateSendButton === 'function') {
          chatInput.updateSendButton()
        }
      }, 200)
    } else {
      const chatInput = window.app?.chatInput
      if (chatInput && typeof chatInput.updateSendButton === 'function') {
        chatInput.updateSendButton()
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  getLoadingMessage() {
    const loadingMessages = [
      "사진을 분석하고 있어요... ✨",
      "어떤 이야기가 담겨있을까요? 🤔",
      "곧 흥미로운 질문을 드릴게요! ⏰",
      "사진 속 순간들을 살펴보고 있어요 📸",
      "특별한 질문을 준비하고 있어요 💭"
    ]

    const index = this.state.loadingMessageIndex || 0
    return loadingMessages[index]
  }


  // 완전 초기 상태로 리셋
  resetToInitialState() {
    // 모든 인터벌 정리
    if (this.streamInterval) {
      clearInterval(this.streamInterval)
      this.streamInterval = null
    }
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval)
      this.loadingInterval = null
    }

    // 상태 완전 초기화
    this.state.messages = []
    this.state.isVisible = false
    this.state.isAnimating = false
    this.state.isStreaming = false
    this.state.streamText = ''
    this.state.isLoading = false
    this.state.currentStreamingId = null
    this.state.loadingMessageIndex = 0

    // DOM 즉시 초기화
    this.el.innerHTML = ''
    this.el.classList.remove('fade-out')
  }
}
