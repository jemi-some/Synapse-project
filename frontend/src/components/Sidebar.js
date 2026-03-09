import { Component } from '../core'
import { authStore } from '../store/auth'
import { imageStore } from '../store/images'
import { getMessages, supabase, signInWithGoogle, signOut } from '../services/supabase'

export default class Sidebar extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isVisible: true, // 항상 표시
        isExpanded: false, // 축소/확장 상태
        isMobileOpen: false, // 모바일에서 사이드바 열림 상태
        user: null,
        isAuthenticated: false,
        showLogoutPopup: false, // 로그아웃 팝업 표시 상태
        currentPath: window.location.hash || '#/' // 현재 경로 추적
      }
    })

    this.el.className = 'sidebar'
    this.handleClose = this.handleClose.bind(this)
    this.handleOverlayClick = this.handleOverlayClick.bind(this)
    this.toggleExpanded = this.toggleExpanded.bind(this)
    this.toggleMobile = this.toggleMobile.bind(this)
    this.closeMobile = this.closeMobile.bind(this)
    this.handleOutsideClick = this.handleOutsideClick.bind(this)

    // 인증 상태 구독
    authStore.subscribe('user', (user) => {
      if (this.state.user !== user) {
        this.state.user = user
        this.state.isAuthenticated = !!user
        this.render()
      }
    })

    // 경로 변화 감지
    this.setupPathTracking()
  }

  setupPathTracking() {
    // 초기 경로 설정
    this.updateCurrentPath()

    // 경로 변화 감지
    window.addEventListener('hashchange', () => {
      this.updateCurrentPath()
    })

    // popstate 이벤트도 감지 (뒤로가기/앞으로가기)
    window.addEventListener('popstate', () => {
      this.updateCurrentPath()
    })
  }

  updateCurrentPath() {
    const newPath = window.location.hash || '#/'
    if (this.state.currentPath !== newPath) {
      this.state.currentPath = newPath
      this.render()

      // 라이브러리 화면일 때 채팅 입력창 숨기기
      this.toggleChatInputVisibility()
    }
  }

  toggleChatInputVisibility() {
    const chatInput = window.app?.chatInput
    const chatBubbles = window.app?.chatBubbles

    if (this.state.currentPath === '#/library') {
      // 라이브러리 화면에서는 채팅 관련 요소들 숨기기
      if (chatInput) {
        chatInput.el.style.display = 'none'
      }
      if (chatBubbles) {
        chatBubbles.el.style.display = 'none'
      }
    } else {
      // 다른 화면에서는 채팅 관련 요소들 표시
      if (chatInput) {
        chatInput.el.style.display = ''
      }
      if (chatBubbles) {
        chatBubbles.el.style.display = ''
      }
    }
  }



  formatDate(dateString) {
    if (!dateString) return '날짜 없음'

    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))

    if (diffInDays === 0) {
      return '오늘'
    } else if (diffInDays === 1) {
      return '어제'
    } else if (diffInDays < 7) {
      return `${diffInDays}일 전`
    } else if (diffInDays < 30) {
      return `${Math.floor(diffInDays / 7)}주 전`
    } else {
      return date.toLocaleDateString('ko-KR')
    }
  }

  render() {
    const { user, isAuthenticated, isExpanded, currentPath, isMobileOpen } = this.state
    console.log('Sidebar render - isAuthenticated:', isAuthenticated, 'user:', user, 'isExpanded:', isExpanded, 'currentPath:', currentPath)

    // 모바일에서 열림 상태에 따라 클래스 추가
    this.el.className = `sidebar ${isMobileOpen ? 'mobile-open' : ''}`

    this.el.innerHTML = /* html */ `
      <div class="sidebar-content ${isExpanded ? 'expanded' : 'collapsed'}">
        <div class="sidebar-header">
          <button class="toggle-button" aria-label="${isExpanded ? '사이드바 축소' : '사이드바 확장'}">
            <span class="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
        <div class="sidebar-body">
          <nav class="sidebar-nav">
            <div class="nav-section">
              <ul>
                <li>
                  <a href="#new-chat" class="nav-item new-chat-button">
                    <span class="nav-icon material-symbols-outlined">edit_square</span>
                    ${(isExpanded || isMobileOpen) ? '<span class="nav-text">새 채팅</span>' : ''}
                  </a>
                </li>
                <li>
                  <a href="#library" class="nav-item library-button ${currentPath === '#/library' ? 'active' : ''}">
                    <span class="nav-icon material-symbols-outlined">photo_library</span>
                    ${(isExpanded || isMobileOpen) ? '<span class="nav-text">앨범</span>' : ''}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        
        <!-- 사용자 아바타 섹션 -->
        <div class="user-avatar-section">
          <div class="user-avatar-item">
            <div class="user-avatar-wrapper">
              ${isAuthenticated && user ? `
                ${user?.is_anonymous ? `
                  <!-- 익명 사용자 아이콘 -->
                  <div class="user-avatar-placeholder anonymous">
                    <span class="material-symbols-outlined">person</span>
                  </div>
                ` : `
                  <!-- Google 로그인 사용자 -->
                  <img src="${user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ''}" 
                       alt="사용자 아바타" 
                       class="user-avatar-img"
                       onerror="this.style.display='none'">
                  <div class="user-avatar-placeholder">
                    ${user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                  </div>
                `}
              ` : `
                <div class="user-avatar-placeholder">
                  <span class="material-symbols-outlined">person</span>
                </div>
              `}
            </div>
            ${(isExpanded || isMobileOpen) ? `
              <div class="user-info">
                ${isAuthenticated && user ? `
                  ${user?.is_anonymous ? `
                    <div class="user-name">익명 사용자</div>
                    <div class="user-email">클릭하여 Google 로그인</div>
                  ` : `
                    <div class="user-name">${user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}</div>
                    <div class="user-email">${user?.email || ''}</div>
                  `}
                ` : `
                  <div class="user-name">로딩 중...</div>
                  <div class="user-email">자동 로그인 진행 중</div>
                `}
              </div>
            ` : ''}
          </div>
        </div>
        
        ${(isExpanded || isMobileOpen) ? `
          <div class="sidebar-footer">
            <p>&copy; 2025 MemoryMoments</p>
          </div>
        ` : ''}
      </div>
      
      <!-- 로그아웃 팝업 -->
      ${this.state.showLogoutPopup ? `
        <div class="logout-popup-overlay">
          <div class="logout-popup">
            <div class="popup-header">
              <h3>로그아웃</h3>
            </div>
            <div class="popup-content">
              <p>정말 로그아웃하시겠습니까?</p>
            </div>
            <div class="popup-actions">
              <button class="cancel-button">취소</button>
              <button class="confirm-button">로그아웃</button>
            </div>
          </div>
        </div>
      ` : ''}
    `

    this.attachEventListeners()
  }

  attachEventListeners() {
    // 토글 버튼 이벤트
    const toggleButton = this.el.querySelector('.toggle-button')
    if (toggleButton) {
      toggleButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        console.log('토글 버튼 클릭!')

        // 모바일에서는 사이드바 토글, 웹에서는 확장/축소
        if (window.innerWidth <= 768 && this.state.isMobileOpen) {
          this.closeMobile()
        } else {
          this.toggleExpanded()
        }
      })
    }

    // 오버레이 제거됨

    // 사이드바 컨텐츠 클릭 이벤트 처리 제거

    // 네비게이션 클릭 이벤트
    const navItems = this.el.querySelectorAll('.nav-item')
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault()
        const href = item.getAttribute('href')
        console.log('네비게이션 클릭:', href) // 디버깅용 로그 추가

        // 네비게이션 처리
        this.handleNavigation(href, item)

        // 모바일에서 메뉴 클릭 시 사이드바 닫기
        if (this.state.isMobileOpen) {
          setTimeout(() => {
            this.closeMobile()
          }, 100)
        }
      })
    })

    // 사용자 아바타 클릭 이벤트
    const userAvatarItem = this.el.querySelector('.user-avatar-item')
    if (userAvatarItem) {
      userAvatarItem.addEventListener('click', (e) => {
        e.preventDefault()
        console.log('사용자 아바타 클릭') // 디버깅용 로그 추가

        // 사용자 클릭 처리
        this.handleUserClick()
      })
    }

    // 로그아웃 팝업 이벤트
    const logoutPopupOverlay = this.el.querySelector('.logout-popup-overlay')
    if (logoutPopupOverlay) {
      // 오버레이 클릭으로 팝업 닫기
      logoutPopupOverlay.addEventListener('click', (e) => {
        if (e.target === logoutPopupOverlay) {
          this.hideLogoutPopup()
        }
      })
    }

    const cancelButton = this.el.querySelector('.cancel-button')
    if (cancelButton) {
      cancelButton.addEventListener('click', (e) => {
        e.preventDefault()
        this.hideLogoutPopup()
      })
    }

    const confirmButton = this.el.querySelector('.confirm-button')
    if (confirmButton) {
      confirmButton.addEventListener('click', (e) => {
        e.preventDefault()
        this.handleLogout()
      })
    }
  }

  toggleExpanded() {
    console.log('toggleExpanded 호출됨, 현재 상태:', this.state.isExpanded)
    this.state.isExpanded = !this.state.isExpanded
    console.log('새로운 상태:', this.state.isExpanded)
    this.render()
  }

  toggleMobile() {
    console.log('toggleMobile 호출됨, 현재 상태:', this.state.isMobileOpen)
    this.state.isMobileOpen = !this.state.isMobileOpen

    if (this.state.isMobileOpen) {
      // 모바일에서 사이드바가 열릴 때 외부 클릭 이벤트 리스너 추가
      setTimeout(() => {
        document.addEventListener('click', this.handleOutsideClick)
      }, 100)
    } else {
      // 사이드바가 닫힐 때 외부 클릭 이벤트 리스너 제거
      document.removeEventListener('click', this.handleOutsideClick)
    }

    this.render()
  }

  closeMobile() {
    if (this.state.isMobileOpen) {
      this.state.isMobileOpen = false
      // 외부 클릭 이벤트 리스너 제거
      document.removeEventListener('click', this.handleOutsideClick)
      this.render()
    }
  }

  show() {
    this.state.isVisible = true
    this.render()
  }

  hide() {
    this.state.isVisible = false
    this.render()
  }

  handleClose() {
    this.hide()
  }

  handleOverlayClick(e) {
    // 오버레이 제거됨
  }

  handleOutsideClick(e) {
    // 모바일에서 사이드바가 열려있을 때만 처리
    if (!this.state.isMobileOpen || window.innerWidth > 768) {
      return
    }

    // 클릭된 요소가 사이드바 내부나 모바일 헤더 내부인지 확인
    const sidebar = this.el
    const mobileHeader = document.querySelector('.mobile-header')

    if (sidebar && !sidebar.contains(e.target) &&
      mobileHeader && !mobileHeader.contains(e.target)) {
      // 사이드바와 모바일 헤더 외부를 클릭한 경우 사이드바 닫기
      this.closeMobile()
    }
  }

  handleNavigation(href, element = null) {
    console.log('Navigate to:', href)

    // 새 채팅 버튼 클릭
    if (href === '#new-chat') {
      // ChatBubbles 완전 초기화
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.resetToInitialState()
      }

      // 홈으로 이동
      window.location.hash = '#/'

      // 현재 이미지 초기화하고 새 채팅 시작
      imageStore.clearCurrentImage()

      // ChatInput 완전 초기화
      const chatInput = window.app?.chatInput
      if (chatInput) {
        chatInput.resetToInitialState()
      }

      return
    }

    // 라이브러리 버튼 클릭
    if (href === '#library') {
      console.log('라이브러리 페이지로 이동')
      // 라이브러리 라우트로 이동
      window.location.hash = '#/library'
      return
    }

    // 채팅 세션 클릭 - 새 라우트로 이동
    if (href.startsWith('#chat-') && element) {
      const sessionId = element.getAttribute('data-session-id')
      if (sessionId) {
        // 새 라우트로 이동
        window.location.hash = `#/chat/${sessionId}`
      }
    }
  }

  async loadChatSession(sessionId) {
    try {
      console.log('Loading chat session:', sessionId)

      // 1. 해당 세션의 메시지들 불러오기
      const { data: messages, error: messagesError } = await getMessages(sessionId)

      if (messagesError) {
        console.error('메시지 불러오기 실패:', messagesError)
        return
      }

      // 2. 연결된 이미지 정보 찾기 (media_files 테이블에서)
      const { data: mediaFiles, error: mediaError } = await supabase
        .from('media_files')
        .select('*')
        .eq('chat_session_id', sessionId)
        .limit(1)
        .single()

      if (mediaError && mediaError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('미디어 파일 불러오기 실패:', mediaError)
      }

      // 3. 화면에 표시
      this.displayChatSession(sessionId, messages, mediaFiles)

    } catch (error) {
      console.error('채팅 세션 로드 실패:', error)
    }
  }

  displayChatSession(sessionId, messages = [], mediaFile = null) {
    try {
      // 같은 페이지 내에서 채팅 전환 시 이전 채팅 버블 초기화 필요
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.hideBubbles()
      }

      // 이미지가 있으면 표시
      if (mediaFile?.file_url) {
        const imageStore = window.app?.imageStore
        if (imageStore) {
          // 이미지 객체 재구성
          const imageObj = {
            id: `session-${sessionId}`,
            url: mediaFile.file_url,
            fileName: mediaFile.file_name,
            chatSessionId: sessionId,
            aesthetic: mediaFile.metadata // 저장된 메타데이터
          }

          // 이미지 스토어에 설정 (화면에 표시)
          imageStore.setCurrentImage(imageObj)
        }
      }

      // ChatInput 활성화
      const chatInput = window.app?.chatInput
      if (chatInput) {
        // 메타데이터가 있으면 컨텍스트와 함께 활성화
        const photoContext = mediaFile?.metadata ? {
          metadata: mediaFile.metadata,
          firstAnalysis: mediaFile.ai_analysis,
          imageUrl: mediaFile.file_url
        } : null

        chatInput.enableChatting(sessionId, photoContext)
      }

      // 메시지 내역 표시
      if (messages && messages.length > 0) {
        setTimeout(() => {
          if (chatBubbles) {
            this.displayMessages(messages, chatBubbles)
          }
        }, 500) // 이미지 로드 후 메시지 표시
      }

    } catch (error) {
      console.error('채팅 세션 표시 실패:', error)
    }
  }

  displayMessages(messages, chatBubbles) {
    if (messages.length === 0) return

    // 마지막 사용자 메시지와 AI 응답 찾기
    let lastUserMessage = ''
    let lastAIMessage = ''

    // 역순으로 검색해서 가장 최근의 사용자 메시지와 AI 응답 찾기
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.sender_type === 'user' && !lastUserMessage) {
        lastUserMessage = message.content
      } else if (message.sender_type === 'assistant' && !lastAIMessage) {
        lastAIMessage = message.content
      }

      // 둘 다 찾으면 중단
      if (lastUserMessage && lastAIMessage) break
    }

    // 메시지 표시 (기존 ChatBubbles 메소드 활용)
    if (lastUserMessage && lastAIMessage) {
      // 사용자 메시지 먼저 표시
      chatBubbles.showUserMessage(lastUserMessage)

      // 약간의 딜레이 후 AI 응답 표시
      setTimeout(() => {
        chatBubbles.updateAIResponse(lastAIMessage)
      }, 500)
    } else if (lastAIMessage) {
      // AI 메시지만 있는 경우 (첫 번째 메시지가 AI인 경우)
      chatBubbles.state.currentAI = lastAIMessage
      chatBubbles.state.isVisible = true
      chatBubbles.render()
    }
  }

  async handleUserClick() {
    console.log('사용자 아바타 클릭됨')

    if (this.state.isAuthenticated && this.state.user) {
      if (this.state.user.is_anonymous) {
        // 익명 사용자 - 구글 로그인 제안
        console.log('익명 사용자 - 구글 로그인 제안')
        await this.handleGoogleLogin()
      } else {
        // Google 로그인 사용자 - 로그아웃 팝업 표시
        console.log('로그아웃 팝업 표시')
        this.showLogoutPopup()
      }
    } else {
      // 비로그인 상태 (드물게 발생) - 익명 로그인 시도
      console.log('비로그인 상태 - 익명 로그인 시도')
      await this.handleAnonymousLogin()
    }
  }

  async handleGoogleLogin() {
    console.log('구글 로그인 시작')
    try {
      const { data, error } = await signInWithGoogle()

      if (error) {
        console.error('로그인 실패:', error)
      } else {
        console.log('로그인 성공:', data)
      }
    } catch (error) {
      console.error('로그인 처리 중 오류:', error)
    }
  }

  async handleAnonymousLogin() {
    console.log('익명 로그인 시도')
    try {
      const { signInAnonymously } = await import('../services/supabase')
      const { data, error } = await signInAnonymously()

      if (error) {
        console.error('익명 로그인 실패:', error)
      } else {
        console.log('익명 로그인 성공:', data)
      }
    } catch (error) {
      console.error('익명 로그인 처리 중 오류:', error)
    }
  }

  showLogoutPopup() {
    this.state.showLogoutPopup = true
    this.render()
  }

  hideLogoutPopup() {
    this.state.showLogoutPopup = false
    this.render()
  }

  async handleLogout() {
    console.log('로그아웃 처리')
    try {
      await signOut()
      console.log('로그아웃 완료')
      this.hideLogoutPopup()
    } catch (error) {
      console.error('로그아웃 실패:', error)
      this.hideLogoutPopup()
    }
  }



  // ESC 키로 사이드바 닫기
  handleKeyPress(e) {
    if (e.key === 'Escape' && this.state.isVisible) {
      this.hide()
    }
  }

  mount() {
    // ESC 키 이벤트 리스너 추가
    document.addEventListener('keydown', (e) => this.handleKeyPress(e))
    return super.mount()
  }
}