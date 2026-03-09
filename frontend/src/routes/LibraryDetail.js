import { Component } from '../core'
import { supabase } from '../services/supabase'
import { authStore } from '../store/auth'
import { parseMarkdown } from '../utils/markdown'

export default class LibraryDetail extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        session: null,
        messages: [],
        isLoading: true,
        error: null,
        user: null,
        isAuthenticated: false
      }
    })

    this.el.className = 'library-detail-screen'

    // 인증 상태 확인
    this.state.user = authStore.state.user
    this.state.isAuthenticated = authStore.state.isAuthenticated
  }


  async mount() {
    // 채팅 컴포넌트 숨기기
    this.hideChatComponents()

    // URL에서 세션 ID 가져오기
    const sessionId = this.params?.sessionId

    if (sessionId) {
      await this.loadSessionDetail(sessionId)
    } else {
      this.state.error = '세션 ID가 없습니다.'
      this.render()
    }
  }

  async loadSessionDetail(sessionId) {
    try {
      this.state.isLoading = true
      this.state.error = null
      this.render()

      // 세션 정보 가져오기
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select(`
          id,
          title,
          created_at,
          last_message_at,
          is_public,
          user_id,
          users!chat_sessions_user_id_fkey (
            display_name,
            is_anonymous
          ),
          media_files (
            id,
            file_url,
            file_name,
            metadata
          )
        `)
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError

      // 일반 채팅 메시지와 분석 메시지 모두 가져오기
      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_session_id', sessionId)
        .order('created_at', { ascending: true })

      if (messagesError) throw messagesError



      // 메시지와 일기를 시간 순으로 합치기
      const allContent = []

      // 메시지 추가
      if (messages) {
        messages.forEach(msg => {
          allContent.push({
            ...msg,
            type: 'message',
            timestamp: new Date(msg.created_at).getTime()
          })
        })
      }



      // 시간순으로 정렬
      allContent.sort((a, b) => a.timestamp - b.timestamp)

      this.state.session = session
      this.state.messages = allContent
      this.state.isLoading = false
      this.render()

    } catch (error) {
      console.error('세션 로드 실패:', error)
      this.state.error = error.message || '세션을 불러오는데 실패했습니다.'
      this.state.isLoading = false
      this.render()
    }
  }

  getAuthorName(session) {
    if (session?.users) {
      if (session.users.is_anonymous) {
        return '익명사용자'
      }
      if (session.users.display_name) {
        return session.users.display_name
      }
    }
    return '익명사용자'
  }

  formatDate(dateString) {
    if (!dateString) return '날짜 없음'

    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}.${month}.${day}`
  }

  getAIAnalysis() {
    // AI 분석 내용 찾기 (message_type이 'analysis'인 것만)
    const aiMessages = this.state.messages.filter(msg =>
      msg.sender_type === 'system' &&
      (msg.metadata?.analysis === true ||
        msg.message_type === 'analysis' ||
        msg.content.includes('감정 분석') ||
        msg.content.includes('분위기') ||
        msg.content.includes('추억의 의미'))
    )
    if (aiMessages.length === 0) return null

    // 분석 내용 파싱
    const analysis = {
      emotions: [],
      atmosphere: '',
      mainContent: '',
      memoryMeaning: '',
      description: '',
      fullText: ''
    }

    aiMessages.forEach(msg => {
      const content = msg.content
      analysis.fullText += content + '\n\n'

      // 감정 분석 추출 - **감정 분석:** [텍스트] 형식
      if (content.includes('감정 분석:')) {
        const emotionLine = content.split('\n').find(line => line.includes('감정 분석:'))
        if (emotionLine) {
          // **감정 분석:** 이후의 텍스트 추출
          const emotionText = emotionLine.replace(/\*\*감정 분석:\*\*/g, '').replace(/감정 분석:/g, '').trim()
          // [대괄호] 안의 내용 추출
          const bracketMatch = emotionText.match(/\[([^\]]+)\]/)
          if (bracketMatch) {
            // 쉼표나 슬래시로 구분된 감정들을 배열로 변환
            const emotionsArray = bracketMatch[1]
              .split(/[,，、\/]/)
              .map(e => e.trim())
              .filter(e => e.length > 0)
            analysis.emotions = [...new Set([...analysis.emotions, ...emotionsArray])]
          } else {
            // 대괄호가 없는 경우 쉼표로 구분
            const emotionsArray = emotionText
              .split(/[,，、]/)
              .map(e => e.trim())
              .filter(e => e.length > 0 && e.length < 10) // 너무 긴 텍스트는 제외
            analysis.emotions = [...new Set([...analysis.emotions, ...emotionsArray])]
          }
        }
      }

      // 전체적인 분위기 추출
      if (content.includes('전체적인 분위기:') || content.includes('분위기:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('전체적인 분위기:') || line.includes('분위기:')) {
            analysis.atmosphere = line
              .replace(/\*\*전체적인 분위기:\*\*/g, '')
              .replace(/\*\*분위기:\*\*/g, '')
              .replace(/전체적인 분위기:/g, '')
              .replace(/분위기:/g, '')
              .trim()
          }
        })
      }

      // 주요 내용 추출
      if (content.includes('주요 내용:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('주요 내용:')) {
            analysis.mainContent = line
              .replace(/\*\*주요 내용:\*\*/g, '')
              .replace(/주요 내용:/g, '')
              .trim()
          }
        })
      }

      // 추억의 의미 추출
      if (content.includes('추억의 의미:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('추억의 의미:')) {
            analysis.memoryMeaning = line
              .replace(/\*\*추억의 의미:\*\*/g, '')
              .replace(/추억의 의미:/g, '')
              .trim()
          }
        })
      }

      // 첫 번째 AI 메시지를 설명으로 사용 (분석 섹션들을 제외한 나머지)
      if (!analysis.description && msg.content) {
        let description = msg.content
          .split('\n')
          .filter(line =>
            !line.includes('감정 분석:') &&
            !line.includes('분위기:') &&
            !line.includes('주요 내용:') &&
            !line.includes('추억의 의미:')
          )
          .join(' ')
          .trim()

        if (description) {
          analysis.description = description
        }
      }
    })

    return analysis.emotions.length > 0 || analysis.atmosphere || analysis.mainContent || analysis.memoryMeaning || analysis.description ? analysis : null
  }

  getEmotionType(emotion) {
    // 감정에 따른 타입 분류 (색상 테마용)
    const happyEmotions = ['행복', '기쁨', '즐거움', '신남', '흥분', '웃음', '희열', '만족', '상쾌', '활기']
    const loveEmotions = ['사랑', '애정', '그리움', '설렘', '로맨틱', '포근', '따뜻', '설레임']
    const calmEmotions = ['평온', '고요', '편안', '안정', '여유', '휴식', '평화', '차분']
    const sadEmotions = ['슬픔', '우울', '외로움', '그리움', '아쉬움', '서글픔', '먼먼', '아련']
    const nostalgicEmotions = ['추억', '향수', '회상', '옛날', '그때', '옆날', '잘추', '획고']

    if (happyEmotions.some(e => emotion.includes(e))) return 'happy'
    if (loveEmotions.some(e => emotion.includes(e))) return 'love'
    if (calmEmotions.some(e => emotion.includes(e))) return 'calm'
    if (sadEmotions.some(e => emotion.includes(e))) return 'sad'
    if (nostalgicEmotions.some(e => emotion.includes(e))) return 'nostalgic'

    return 'default'
  }

  render() {
    const { session, messages, isLoading, error } = this.state

    // AI 분석 가져오기 (session이 있을 때만)
    const analysis = session ? this.getAIAnalysis() : null

    this.el.innerHTML = /* html */ `
      <div class="detail-container">
        <!-- 뒤로가기 버튼 -->
        <button class="back-button" onclick="window.location.hash = '#/library'">
          <span class="material-symbols-outlined">arrow_back</span>
          앨범으로 돌아가기
        </button>

        ${error ? `
          <div class="error-container">
            <div class="error-message">
              <span class="material-symbols-outlined">error</span>
              <p>${error}</p>
            </div>
          </div>
        ` : ''}

        ${isLoading ? `
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>게시물을 불러오는 중...</p>
          </div>
        ` : session ? `
          <div class="detail-content">
            <!-- 왼쪽: 이미지 영역 -->
            <div class="detail-image-section">
              ${session.media_files && session.media_files.length > 0 ? `
                <div class="detail-image-wrapper">
                  <img src="${session.media_files[0].file_url}" 
                       alt="${session.media_files[0].file_name || '업로드된 이미지'}"
                       class="detail-image">
                </div>
              ` : `
                <div class="no-image-placeholder">
                  <span class="material-symbols-outlined">image</span>
                  <p>이미지가 없습니다</p>
                </div>
              `}
            </div>

            <!-- 오른쪽: 정보 영역 -->
            <div class="detail-info-section">
              <!-- 헤더: 작성자 정보 -->
              <div class="detail-header">
                <div class="author-info">
                  <span class="author-name">${this.getAuthorName(session)}</span>
                  <span class="separator">|</span>
                  <span class="post-date">${this.formatDate(session.created_at)}</span>
                </div>
                ${analysis && analysis.emotions && analysis.emotions.length > 0 ? `
                  <div class="emotion-bookmark" data-emotion="${this.getEmotionType(analysis.emotions[0])}">
                    <span class="emotion-label">${analysis.emotions[0]}</span>
                  </div>
                ` : ''}
              </div>

              <!-- 제목 -->
              <div class="detail-title">
                <h2>${session.title || '제목 없음'}</h2>
              </div>

              <!-- AI 분석 내용 -->
              ${analysis ? `
                <div class="ai-analysis">
                  <div class="analysis-content">
                    ${analysis.emotions && analysis.emotions.length > 0 ? `
                      <div class="emotion-tags">
                        ${analysis.emotions.map(emotion =>
      `<span class="emotion-tag">${emotion}</span>`
    ).join('')}
                      </div>
                    ` : ''}
                    ${analysis.atmosphere ? `
                      <div class="atmosphere">
                        <strong>요약:</strong> ${parseMarkdown(analysis.atmosphere)}
                      </div>
                    ` : ''}
                    ${analysis.mainContent ? `
                      <div class="atmosphere">
                        <strong>주요 내용:</strong> ${parseMarkdown(analysis.mainContent)}
                      </div>
                    ` : ''}
                    ${analysis.memoryMeaning ? `
                      <div class="atmosphere">
                        <strong>추억의 의미:</strong> ${parseMarkdown(analysis.memoryMeaning)}
                      </div>
                    ` : ''}
                    ${analysis.description ? `
                      <div class="description">
                        ${parseMarkdown(analysis.description)}
                      </div>
                    ` : ''}
                  </div>
                </div>
              ` : ''}

              <!-- 채팅 히스토리 -->
              <div class="chat-history">
                <div class="messages-container">
                  ${messages && messages.length > 0 ? messages
          .filter(msg =>
            (msg.message_type === 'text' || msg.message_type === 'diary' || msg.message_type === 'analysis') &&
            !(msg.sender_type === 'system' && (msg.metadata?.analysis === true || msg.message_type === 'analysis'))
          )
          .map(msg => `
                      <div class="message ${msg.sender_type} ${msg.message_type === 'diary' ? 'diary' : ''}">
                        <div class="message-bubble ${msg.message_type === 'diary' ? 'diary-bubble' : ''}">
                          ${msg.content}
                        </div>
                      </div>
                    `).join('') : `
                    <p class="no-messages">대화 내용이 없습니다.</p>
                  `}
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `

    this.attachEventListeners()
  }

  hideChatComponents() {
    const hideComponents = () => {
      // 채팅 입력창 숨기기 - ChatInput의 hide() 메서드 사용
      const chatInput = window.app?.chatInput
      if (chatInput && chatInput.hide) {
        chatInput.hide()
      }

      // 채팅 버블 숨기기
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.el.style.display = 'none'
      }
    }

    // 즉시 실행
    hideComponents()

    // 약간의 지연 후에도 다시 실행 (DOM 업데이트 확실히 하기 위해)
    setTimeout(hideComponents, 50)
    setTimeout(hideComponents, 200)
  }

  attachEventListeners() {
    // 이미지 클릭 시 확대 기능 (추후 구현 가능)
    const detailImage = this.el.querySelector('.detail-image')
    if (detailImage) {
      detailImage.addEventListener('click', () => {
        // 이미지 확대 모달 구현
        console.log('Image clicked')
      })
    }
  }

  // 컴포넌트가 제거될 때 채팅 컴포넌트들 다시 표시
  destroy() {
    // 채팅 컴포넌트들 다시 표시 - ChatInput의 show() 메서드 사용
    const chatInput = window.app?.chatInput
    if (chatInput && chatInput.show) {
      chatInput.show()
    }

    const chatBubbles = window.app?.chatBubbles
    if (chatBubbles) {
      chatBubbles.el.style.display = ''
    }
  }
}
