import { Component } from '../core'
import { getMessages, supabase } from '../services/supabase'
import { imageStore } from '../store/images'

export default class ChatHistory extends Component {
  constructor() {
    super({
      state: {
        sessionId: null,
        messages: [],
        mediaFile: null,
        loading: true,
        error: null
      }
    })
  }

  async loadSession(sessionId) {
    this.state.sessionId = sessionId
    this.state.loading = true
    this.state.error = null
    
    // 채팅 컴포넌트들 숨기기
    const chatInput = window.app?.chatInput
    if (chatInput) {
      chatInput.hide()
    }

    // 라이브 채팅 버블은 라우터에서 이미 초기화됨
    
    this.render()

    try {
      // 1. 메시지 불러오기
      const { data: messages, error: messagesError } = await getMessages(sessionId)
      
      if (messagesError) {
        throw new Error(`메시지 불러오기 실패: ${messagesError.message}`)
      }

      // 2. 연결된 이미지 정보 찾기
      const { data: mediaFiles, error: mediaError } = await supabase
        .from('media_files')
        .select('*')
        .eq('chat_session_id', sessionId)
        .limit(1)
        .single()

      if (mediaError && mediaError.code !== 'PGRST116') {
        console.error('미디어 파일 불러오기 실패:', mediaError)
      }

      this.state.messages = messages || []
      this.state.mediaFile = mediaFiles || null
      this.state.loading = false
      this.render()

    } catch (error) {
      console.error('세션 로드 실패:', error)
      this.state.error = error.message
      this.state.loading = false
      this.render()
    }
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return ''
    
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now - date) / (1000 * 60))
    
    if (diffInMinutes < 1) {
      return '방금 전'
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}분 전`
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}시간 전`
    } else {
      return date.toLocaleDateString('ko-KR') + ' ' + 
             date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }
  }

  generateCaption(fileId) {
    const captions = [
      "소중한 순간을 담았어요",
      "특별한 하루의 기록",
      "잊지 못할 추억",
      "마음속 깊이 새겨진 순간",
      "아름다운 기억 한 조각",
      "소소하지만 특별한 일상",
      "행복했던 그 순간",
      "시간이 멈춘 듯한 순간",
      "마음이 따뜻해지는 기억",
      "언제까지나 간직하고 싶은 순간",
      "웃음이 가득했던 하루",
      "감사한 마음이 든 순간",
      "평범하지만 소중한 일상",
      "기쁨이 넘쳤던 시간",
      "함께여서 더 빛났던 순간"
    ]
    
    // 안전한 파싱: fileId가 없거나 잘못된 경우 0을 기본값으로
    const safeId = fileId ? parseInt(fileId) : 0
    const index = isNaN(safeId) ? 0 : safeId % captions.length
    return captions[index]
  }

  formatMetadata(mediaFile) {
    if (!mediaFile || !mediaFile.metadata) {
      return ''
    }

    const metadata = mediaFile.metadata
    let dateStr = ''
    let timeOfDay = ''
    let season = ''

    // 날짜 정보 추출
    if (metadata.captureTime) {
      const { local, utc, timeOfDay: tod, season: seas } = metadata.captureTime
      timeOfDay = tod || ''
      season = seas || ''
      
      // 날짜 파싱 (local 우선, 없으면 utc)
      const dateToUse = local || utc
      if (dateToUse) {
        try {
          const date = new Date(dateToUse)
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            dateStr = `${year}.${month}.${day}.`
          }
        } catch (error) {
          console.error('날짜 파싱 오류:', error)
        }
      }
    }

    // created_at을 fallback으로 사용
    if (!dateStr && mediaFile.created_at) {
      try {
        const date = new Date(mediaFile.created_at)
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          dateStr = `${year}.${month}.${day}.`
        }
      } catch (error) {
        console.error('created_at 파싱 오류:', error)
      }
    }

    // 결과 조합
    const parts = [dateStr, timeOfDay, season].filter(part => part)
    return parts.join(' ')
  }

  goBack() {
    // 채팅 컴포넌트들 다시 보이기
    const chatInput = window.app?.chatInput
    if (chatInput) {
      chatInput.show()
    }

    // ChatBubbles는 라우터에서 자동 초기화됨
    
    // 홈으로 돌아가기
    window.location.hash = '#/'
  }

  render() {
    if (this.state.loading) {
      this.el.innerHTML = `
        <div class="chat-history-container">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>채팅 기록을 불러오는 중...</p>
          </div>
        </div>
      `
    } else if (this.state.error) {
      this.el.innerHTML = `
        <div class="chat-history-container">
          <div class="error-state">
            <p>채팅 기록을 불러오는데 실패했습니다.</p>
            <p class="error-message">${this.escapeHtml(this.state.error)}</p>
            <button class="retry-button">다시 시도</button>
          </div>
        </div>
      `
    } else {
      const { messages, mediaFile } = this.state
      
      this.el.innerHTML = `
        <div class="chat-history-container">
          ${mediaFile ? `
            <div class="chat-history-image">
              <img src="${mediaFile.file_url}" 
                   alt="${mediaFile.file_name}" 
                   class="history-image">
              <div class="image-info">
                <p class="image-name">${this.generateCaption(mediaFile.id || mediaFile.memory_index || 1)}</p>
                <p class="image-date">${this.formatMetadata(mediaFile)}</p>
              </div>
            </div>
          ` : ''}
          
          <div class="chat-messages">
            ${messages.length === 0 ? `
              <div class="empty-messages">
                <p>아직 대화가 없습니다.</p>
              </div>
            ` : `
              ${messages.map(message => `
                <div class="message-item ${message.sender_type === 'user' ? 'user-message' : 'ai-message'}">
                  <div class="message-content">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    <div class="message-time">${this.formatTimestamp(message.created_at)}</div>
                  </div>
                </div>
              `).join('')}
            `}
          </div>
        </div>
      `
    }

    // 이벤트 리스너 추가
    this.addEventListeners()
  }

  addEventListeners() {
    const retryButton = this.el.querySelector('.retry-button')
    if (retryButton) {
      retryButton.addEventListener('click', () => {
        if (this.state.sessionId) {
          this.loadSession(this.state.sessionId)
        }
      })
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}