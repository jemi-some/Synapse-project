import { Component } from '../core'
import { sendThreadMessage } from '../services/openai'
import { addMessage } from '../services/supabase'

export default class ThreadPanel extends Component {
    constructor() {
        super({
            tagName: 'div',
            state: {
                isOpen: false,
                parentMessageId: null,
                parentContent: null, // AI가 준 결과값 데이터 조각
                messages: [], // [{ type: 'user'|'ai', content: '', isStreaming: false, id: '' }]
                isSending: false,
                inputText: '',
                currentSessionId: null
            }
        })

        this.el.className = 'thread-panel-wrapper'
    }

    // 외부에서 스레드를 열 때 호출
    open(parentMessageId, parentContentGroup) {
        this.state.isOpen = true
        this.state.parentMessageId = parentMessageId
        this.state.parentContent = parentContentGroup
        this.state.messages = []
        this.state.inputText = ''
        this.state.isSending = false
        this.state.currentSessionId = window.app?.currentSessionId

        // 모바일/PC 모두 화면에 덮도록 표시
        this.el.classList.add('open')
        document.body.classList.add('thread-open')
        this.render()

        // 처음에 AI가 맥락을 이어가는 인사말 표시
        this.showAIMessage("선택하신 사진/기록에 대해 무엇이든 물어보세요!")
    }

    close() {
        this.state.isOpen = false
        this.el.classList.remove('open')
        document.body.classList.remove('thread-open')
        this.state.messages = []
        this.render()
    }

    showAIMessage(text) {
        const messageId = `ai-thread-${Date.now()}`
        this.state.messages.push({
            type: 'ai',
            content: '',
            isStreaming: true,
            id: messageId
        })
        this.render()

        // 간단한 스트리밍 효과
        let i = 0
        let currentText = ''
        const interval = setInterval(() => {
            if (i < text.length && this.state.isOpen) {
                currentText += text[i]
                const idx = this.state.messages.findIndex(m => m.id === messageId)
                if (idx > -1) {
                    this.state.messages[idx].content = currentText
                }
                this.render()
                this.scrollToBottom()
                i++
            } else {
                clearInterval(interval)
                const idx = this.state.messages.findIndex(m => m.id === messageId)
                if (idx > -1) {
                    this.state.messages[idx].isStreaming = false
                }
                this.render()
            }
        }, 30)
    }

    async handleSendMessage(e) {
        if (e && e.preventDefault) e.preventDefault()

        const text = this.state.inputText.trim()
        if (!text || this.state.isSending) return

        // 1. 사용자 메시지 추가
        this.state.messages.push({
            type: 'user',
            content: text,
            isStreaming: false,
            id: `user-${Date.now()}`
        })

        this.state.inputText = ''
        this.state.isSending = true
        this.render()
        this.scrollToBottom()

        // 로딩 인디케이터용 빈 AI 메시지 추가
        const loadingId = `ai-loading-${Date.now()}`
        this.state.messages.push({
            type: 'ai',
            content: '...',
            isStreaming: true,
            id: loadingId
        })
        this.render()
        this.scrollToBottom()

        try {
            // 2. DB 저장 (현재 세션에 추가)
            const sessionId = this.state.currentSessionId
            if (sessionId) {
                // 스레드에서는 parent_message_id 개념으로 저장 가능(스키마에 따라 다름) 
                // 현재는 같은 세션의 일반 메시지로 기록하되 내용 접두어를 달거나 그냥 저장
                await addMessage(sessionId, `[스레드: ${this.state.parentMessageId}] ${text}`, 'text', 'user')
            }

            // 3. 백엔드 스레드 API 호출
            // parentMessageId(또는 parent_message_id)를 넘겨서 맥락을 유지
            const responseData = await sendThreadMessage(text, this.state.parentMessageId, sessionId)

            // 4. 로딩 메시지 삭제 후 실제 응답 표시
            this.state.messages = this.state.messages.filter(m => m.id !== loadingId)

            if (responseData && responseData.success) {
                this.showAIMessage(responseData.response)
                if (sessionId) {
                    await addMessage(sessionId, `[스레드 응답] ${responseData.response}`, 'text', 'assistant')
                }
            } else {
                this.showAIMessage('스레드 대화 중 오류가 발생했습니다.')
            }

        } catch (error) {
            console.error('스레드 메시지 전송 실패:', error)
            this.state.messages = this.state.messages.filter(m => m.id !== loadingId)
            this.showAIMessage('서버와의 연결에 문제가 발생했습니다.')
        } finally {
            this.state.isSending = false
            this.render()

            // 입력창 포커스 유지
            setTimeout(() => {
                const input = this.el.querySelector('.thread-input')
                if (input && document.activeElement !== input) {
                    input.focus()
                }
            }, 50)
        }
    }

    renderParentContext() {
        if (!this.state.parentContent) return ''

        const action = this.state.parentContent.action
        if (action === 'search_photos' || action === 'view_my_photos') {
            const count = this.state.parentContent.count || 0
            return `<div class="thread-context-summary">📷 ${count}장의 사진에 대한 스레드</div>`
        } else if (action === 'search_memos' || action === 'view_my_memos') {
            const count = this.state.parentContent.count || 0
            return `<div class="thread-context-summary">📝 ${count}개의 기록에 대한 스레드</div>`
        }
        return `<div class="thread-context-summary">선택한 결과에 대한 스레드</div>`
    }

    scrollToBottom() {
        setTimeout(() => {
            const list = this.el.querySelector('.thread-message-list')
            if (list) {
                list.scrollTop = list.scrollHeight
            }
        }, 50)
    }

    escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    render() {
        if (!this.state.isOpen) {
            this.el.innerHTML = ''
            return
        }

        const messagesHtml = this.state.messages.map(msg => {
            return `
        <div class="thread-bubble ${msg.type === 'ai' ? 'thread-ai' : 'thread-user'}">
          <div class="thread-bubble-content">
            ${this.escapeHtml(msg.content)}
            ${msg.isStreaming && msg.content !== '...' ? '<span class="typing-cursor">|</span>' : ''}
          </div>
        </div>
      `
        }).join('')

        this.el.innerHTML = `
      <div class="thread-panel-container">
        <header class="thread-header">
          <button class="thread-back-btn">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h2>이야기 나누기</h2>
          <div class="header-spacer"></div>
        </header>
        
        <div class="thread-context-area">
          ${this.renderParentContext()}
        </div>

        <div class="thread-message-list">
          ${messagesHtml}
        </div>

        <div class="thread-input-area">
          <form class="thread-form">
            <input type="text" 
                   class="thread-input" 
                   value="${this.escapeHtml(this.state.inputText)}" 
                   placeholder="궁금한 점을 물어보세요..." 
                   ${this.state.isSending ? 'disabled' : ''}>
            <button type="submit" class="thread-send-btn" ${!this.state.inputText.trim() || this.state.isSending ? 'disabled' : ''}>
              <span class="material-symbols-rounded">send</span>
            </button>
          </form>
        </div>
      </div>
    `

        // 이벤트 리스너: 뒤로가기
        const backBtn = this.el.querySelector('.thread-back-btn')
        if (backBtn) {
            backBtn.addEventListener('click', () => this.close())
        }

        // 이벤트 리스너: 텍스트 입력
        const inputEl = this.el.querySelector('.thread-input')
        const sendBtn = this.el.querySelector('.thread-send-btn')
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                this.state.inputText = e.target.value
                // 버튼 상태만 빠르게 업데이트 (전체 렌더링 피함)
                if (sendBtn) {
                    sendBtn.disabled = !this.state.inputText.trim() || this.state.isSending
                }
            })

            // 모바일 사파리 등 대응
            setTimeout(() => inputEl.focus(), 300)
        }

        // 이벤트 리스너: 전송
        const formEl = this.el.querySelector('.thread-form')
        if (formEl) {
            formEl.addEventListener('submit', (e) => this.handleSendMessage(e))
        }
    }
}
