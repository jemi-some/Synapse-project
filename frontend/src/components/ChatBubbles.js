import { Component } from '../core'

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
        currentStreamingId: null // 현재 스트리밍 중인 메시지 ID
      }
    })

    this.el.className = 'chat-bubbles-container'
    this.streamInterval = null
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
  showUserMessage(userMessage) {
    const messageId = `user-${Date.now()}`
    
    // 메시지 배열에 사용자 메시지 추가
    this.state.messages.push({
      type: 'user',
      content: userMessage,
      id: messageId,
      isStreaming: false
    })
    
    this.state.isVisible = true
    this.state.isAnimating = true
    this.render()
    
    // 사용자 메시지 추가 후 스크롤
    this.scrollToBottom()
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
      isStreaming: true
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
    this.state.messages = [] // 메시지 배열 초기화
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
    if (this.state.isLoading) {
      this.el.innerHTML = `
        <div class="chat-bubbles">
          <div class="ai-bubble glass-bubble">
            <div class="bubble-content">
              <div class="bubble-text loading-message">
                ${this.getLoadingMessage()}
              </div>
              <div class="loading-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          </div>
        </div>
      `
      return
    }

    // 메시지 배열을 기반으로 렌더링
    const messagesHtml = this.state.messages.map((message, index) => {
      const isLatest = index === this.state.messages.length - 1
      const bubbleClass = this.state.isAnimating && isLatest ? 'slide-up' : ''
      
      if (message.type === 'ai') {
        const isCurrentlyStreaming = message.isStreaming && this.state.currentStreamingId === message.id
        return `
          <div class="ai-bubble glass-bubble ${bubbleClass}">
            <div class="bubble-content">
              <div class="bubble-text">
                ${this.escapeHtml(message.content)}
                ${isCurrentlyStreaming ? '<span class="typing-cursor">|</span>' : ''}
              </div>
            </div>
          </div>
        `
      } else if (message.type === 'diary') {
        return `
          <div class="diary-bubble glass-bubble ${bubbleClass}">
            <div class="bubble-content">
              <div class="bubble-text">${this.escapeHtml(message.content)}</div>
            </div>
          </div>
        `
      } else {
        return `
          <div class="user-bubble glass-bubble ${bubbleClass}">
            <div class="bubble-content">
              <div class="bubble-text">${this.escapeHtml(message.content)}</div>
            </div>
          </div>
        `
      }
    }).join('')

    this.el.innerHTML = `
      <div class="chat-bubbles ${this.state.isAnimating ? 'animating' : ''}">
        ${messagesHtml}
      </div>
    `
    
    // 스트리밍 중에는 강제로 DOM 업데이트
    if (this.state.isStreaming) {
      this.el.offsetHeight // 강제 reflow 트리거
    }
  }

  // 스크롤을 맨 아래로
  scrollToBottom() {
    setTimeout(() => {
      this.el.scrollTop = this.el.scrollHeight
    }, 50)
  }

  // 현재 맨 아래에 있을 때만 스크롤 (사용자가 위로 스크롤했다면 방해하지 않음)
  scrollToBottomIfAtBottom() {
    setTimeout(() => {
      const element = this.el
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
        element.scrollTop = scrollHeight

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