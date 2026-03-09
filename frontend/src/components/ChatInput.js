import { Component } from '../core'
import { generateChatResponse } from '../services/openai'
import { addMessage, updateChatSession, getMessages } from '../services/supabase'

export default class ChatInput extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        message: '',
        isSending: false,
        isVisible: true,
        isHidden: false, // 완전히 숨기기 위한 상태
        isEnabled: false, // 초기에는 비활성화
        placeholder: '', // 초기값은 빈 문자열로 설정
        currentChatSessionId: null, // 현재 활성 채팅 세션 ID
        photoContext: null // 사진 맥락 정보 (메타데이터 + 첫 분석 결과)
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

    // 포커스 관련 플래그
    this.hasFocus = false
    this.focusProtected = false

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

    // 채팅 관련 이벤트 구독은 필요시 추가
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

    if (!widthChanged) {
      return
    }

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
      // 모바일에서는 엔터 키로 줄바꿈 허용 (기본 동작)
      if (this.isMobile) {
        return // preventDefault() 호출하지 않아서 기본 줄바꿈 동작 허용
      }

      // 웹에서만 엔터 키로 전송
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
    if (container) {
      container.classList.add('focused')
    }

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
    if (container) {
      container.classList.remove('focused')
    }
  }

  async sendMessage() {
    const message = this.state.message.trim()

    // AI 스트리밍 중인지 체크
    const chatBubbles = window.app?.chatBubbles
    const isAIStreaming = chatBubbles && chatBubbles.state && chatBubbles.state.isStreaming

    if (!message || this.state.isSending || !this.state.isEnabled || !this.state.currentChatSessionId || isAIStreaming) {
      return
    }

    // 버튼/엔터 클릭 즉시 입력창 비우기 및 버튼 비활성화
    this.state.message = ''
    this.state.isSending = true

    // 안드로이드에서는 render() 대신 직접 DOM 업데이트
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
      this.updateSendButton()
    }

    try {
      // 1. 사용자 메시지를 DB에 저장
      await addMessage(this.state.currentChatSessionId, message, 'text', 'user')

      // 2. ChatBubbles에 사용자 메시지 표시
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.showUserMessage(message)
      }

      // 3. 포커스 복원 및 높이 초기화 (전송 상태는 유지)
      setTimeout(() => {
        const textarea = this.el.querySelector('.chat-input-field')
        if (textarea) {
          textarea.value = ''
          this.autoResize(textarea)
          // 안드로이드에서는 포커스 처리를 하지 않음 (사용자가 직접 터치하도록)
          if (!/Android/i.test(navigator.userAgent)) {
            textarea.focus()
          }
        }
      }, 0)

      // 4. AI 응답 처리 (AI 응답 시작 후 전송 상태 해제)
      await this.handleAIResponse(message, chatBubbles)

      // 5. AI 응답 처리 완료 후 전송 상태 해제
      this.state.isSending = false

      // 안드로이드에서는 DOM 직접 업데이트
      if (/Android/i.test(navigator.userAgent)) {
        const textarea = this.el.querySelector('.chat-input-field')
        if (textarea) {
          textarea.disabled = false
        }
        this.updateSendButton()
      } else {
        this.render()
      }

      // 6. 분석 버튼 조건 재확인
      const analyzeButton = window.app?.analyzeButton
      if (analyzeButton && this.state.currentChatSessionId) {
        analyzeButton.show(this.state.currentChatSessionId)
      }

    } catch (error) {
      console.error('메시지 저장 실패:', error)
      this.state.isSending = false

      // 안드로이드에서는 DOM 직접 업데이트
      if (/Android/i.test(navigator.userAgent)) {
        const textarea = this.el.querySelector('.chat-input-field')
        if (textarea) {
          textarea.disabled = false
        }
        this.updateSendButton()
      } else {
        this.render()
      }
    }
  }

  async handleAIResponse(message, chatBubbles) {
    try {
      // 이전 대화 내역 불러오기
      let conversationHistory = []
      if (this.state.currentChatSessionId) {
        const { data: messages, error } = await getMessages(this.state.currentChatSessionId)
        if (!error && messages) {
          // 최근 10개 메시지만 사용 (토큰 제한 고려)
          conversationHistory = messages.slice(-10).map(msg => ({
            role: msg.sender_type === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))
        }
      }

      // OpenAI API 호출 (사진 컨텍스트 포함)
      const aiResponse = await generateChatResponse(message, conversationHistory, this.state.photoContext)

      // AI 응답을 DB에 저장
      if (this.state.currentChatSessionId && aiResponse) {
        await addMessage(this.state.currentChatSessionId, aiResponse, 'text', 'assistant')

        // 채팅 세션의 last_message_at 업데이트
        await updateChatSession(this.state.currentChatSessionId, {
          last_message_at: new Date().toISOString()
        })
      }

      // ChatBubbles에서 AI 응답 버블을 미리 추가하고 스트리밍 시작
      if (chatBubbles) {
        chatBubbles.showAIMessage(aiResponse)
      }
    } catch (error) {
      console.error('AI 응답 생성 실패:', error)

      // 오류 시 기본 응답 표시
      const errorResponse = "죄송합니다. 현재 AI 서비스에 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
      if (chatBubbles) {
        chatBubbles.showAIMessage(errorResponse)
      }
    }
  }

  autoResize(textarea) {
    if (!textarea) return

    // 텍스트가 비어있으면 인라인 스타일 제거
    if (textarea.value.trim() === '') {
      textarea.style.removeProperty('height')
      return
    }

    // 기본 높이로 초기화
    textarea.style.height = 'auto'

    // 스크롤 높이와 패딩 계산
    const maxHeight = 120 // 최대 높이 (약 5줄)
    const scrollHeight = textarea.scrollHeight
    const paddingTop = 16
    const paddingBottom = 16
    const totalPadding = paddingTop + paddingBottom

    // 실제 컨텐츠 높이 (패딩 제외)
    const contentHeight = scrollHeight - totalPadding
    const lineHeight = 24 // line-height 1.5 * font-size 16px = 24px

    // 줄 수 계산 (실제 줄바꿈 + 자동 줄바꿈)
    const lineCount = Math.ceil(contentHeight / lineHeight)

    // 최종 높이 = 줄 수 * 라인 높이
    const finalHeight = Math.max(lineHeight, lineCount * lineHeight)

    // 높이 조정 (최대 높이 제한)
    if (finalHeight <= (maxHeight - totalPadding)) {
      textarea.style.height = finalHeight + 'px'
    } else {
      textarea.style.height = maxHeight + 'px'
    }
  }

  updateSendButton() {
    const sendButton = this.el.querySelector('.send-button')
    if (!sendButton) return

    const hasMessage = this.state.message.trim().length > 0

    // AI 스트리밍 중인지 체크
    const chatBubbles = window.app?.chatBubbles
    const isAIStreaming = chatBubbles && chatBubbles.state && chatBubbles.state.isStreaming

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
    const isMobile = window.innerWidth <= 768

    if (!this.state.isEnabled) {
      this.state.placeholder = isMobile ? '사진 업로드 후 대화 시작' : '사진을 업로드하면 대화를 시작할 수 있어요'
    } else {
      this.state.placeholder = isMobile ? '메시지를 입력하세요' : '사진 속 추억에 대해 이야기해볼까요?'
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
    const currentMessage = this.state.message // 현재 입력된 메시지 저장

    this.el.style.display = ''
    const { message, isSending, isEnabled, placeholder } = this.state
    const hasMessage = message.trim().length > 0
    const isDisabled = !isEnabled || isSending


    this.el.innerHTML = `
      <form class="chat-input-wrapper ${isEnabled ? '' : 'disabled'}" role="search" aria-label="메시지 입력">
        <div class="input-container">
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
          <div class="action-buttons">
            <button 
              type="submit" 
              class="send-button ${hasMessage && !isDisabled ? 'active' : ''}" 
              aria-label="메시지 전송"
              ${!hasMessage || isDisabled ? 'disabled' : ''}
            >
              <span class="send-icon material-symbols-outlined">
                ${isSending ? 'hourglass_empty' : 'send'}
              </span>
            </button>
          </div>
        </div>
        
      </form>
      <div class="chat-disclaimer">
        AI는 실수를 할 수 있습니다. 중요한 정보는 재차 확인하세요.
      </div>
    `
    // 글자수 ${message.length > 0 ? `<div class="character-count">${message.length}</div>` : ''}

    // 이벤트 리스너 추가 (지연 실행으로 DOM 준비 대기)
    setTimeout(() => {
      const form = this.el.querySelector('.chat-input-wrapper')
      const textarea = this.el.querySelector('.chat-input-field')
      const sendButton = this.el.querySelector('.send-button')

      if (form && textarea && sendButton) {
        // 기존 리스너 제거
        form.removeEventListener('submit', this.handleSubmit)
        textarea.removeEventListener('input', this.handleInput)
        textarea.removeEventListener('keydown', this.handleKeyDown)
        textarea.removeEventListener('focus', this.handleFocus)
        textarea.removeEventListener('blur', this.handleBlur)

        // 새 리스너 추가
        form.addEventListener('submit', this.handleSubmit)
        textarea.addEventListener('input', this.handleInput)
        textarea.addEventListener('keydown', this.handleKeyDown)
        textarea.addEventListener('focus', this.handleFocus)
        textarea.addEventListener('blur', this.handleBlur)

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

    // 500ms 동안 포커스 보호
    setTimeout(() => {
      this.focusProtected = false
    }, 500)

    // 포커스가 빠져나가면 즉시 복구
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
    const placeholder = this.state.placeholder

    if (textarea) {
      // textarea의 속성만 업데이트
      textarea.placeholder = placeholder
      textarea.disabled = !this.state.isEnabled || this.state.isSending
    }

    if (wrapper) {
      // wrapper 클래스 업데이트
      if (this.state.isEnabled) {
        wrapper.classList.remove('disabled')
      } else {
        wrapper.classList.add('disabled')
      }
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
    this.state.photoContext = null
    this.state.showTooltip = false
    this.updatePlaceholder()
    this.render()
  }
}
