import { Component } from './core'
import MobileHeader from './components/MobileHeader'
import Sidebar from './components/Sidebar'
import ChatBubbles from './components/ChatBubbles'
import ChatInput from './components/ChatInput'
import Toast from './components/Toast'

import LoginScreen from './components/LoginScreen'
import { onAuthStateChange, getCurrentUser } from './services/supabase'

export default class App extends Component {
  constructor() {
    super()
    this.user = null
    this.currentSessionId = null
    this.initAuth()
    console.log('[App] Initialized with new layout')
  }

  // ============================================================
  // 인증 (기존 코드 유지)
  // ============================================================
  async initAuth() {
    const { user } = await getCurrentUser()

    if (!user) {
      this.loginScreen.show()
    } else {
      this.loginScreen.hide()
      this.user = user
      this.onAuthStateChanged(user)
    }

    onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        this.loginScreen.hide()
        this.user = session.user
        this.onAuthStateChanged(session.user)
      } else if (event === 'SIGNED_OUT') {
        this.user = null
        this.loginScreen.show()
      }
    })
  }

  onAuthStateChanged(user) {
    if (user) {
      console.log('User logged in:', user.email)
    }
  }

  // ============================================================
  // 스크롤 제어 (새로운 방식!)
  // ============================================================
  scrollToBottom(behavior = 'smooth') {
    setTimeout(() => {
      const main = this.el.querySelector('.app-main')
      if (main) {
        main.scrollTo({
          top: main.scrollHeight,
          behavior: behavior
        })
      }
    }, 100)
  }

  isUserScrolledUp() {
    const main = this.el.querySelector('.app-main')
    if (!main) return false

    const threshold = 100 // 100px 여유
    return main.scrollTop + main.clientHeight < main.scrollHeight - threshold
  }

  // ============================================================
  // 렌더링 (새로운 구조!)
  // ============================================================
  render() {
    // 컴포넌트 인스턴스 생성
    this.loginScreen = new LoginScreen()
    this.header = new MobileHeader()
    this.sidebar = new Sidebar()
    this.chatBubbles = new ChatBubbles()
    this.chatInput = new ChatInput()
    this.toast = new Toast()

    // 오버레이 생성
    this.sidebarOverlay = document.createElement('div')
    this.sidebarOverlay.className = 'sidebar-overlay'
    this.sidebarOverlay.addEventListener('click', () => {
      this.sidebar?.closeMobile()
    })

    // 전역 참조 (최소화)
    window.app = {
      sidebar: this.sidebar,
      sidebarOverlay: this.sidebarOverlay,
      chatBubbles: this.chatBubbles,
      chatInput: this.chatInput,
      toast: this.toast,
      user: this.user,
      currentSessionId: this.currentSessionId,
      scrollToBottom: (behavior) => this.scrollToBottom(behavior),
      isUserScrolledUp: () => this.isUserScrolledUp(),
      updateUser: (user) => {
        this.user = user
        this.onAuthStateChanged(user)
      },
      updateCurrentSessionId: (sessionId) => {
        this.currentSessionId = sessionId
        window.app.currentSessionId = sessionId
      },
      // 프리뷰 헬퍼 함수
      preview: (type) => {
        this.chatBubbles.setPreviewMode(type)
      }
    }

    // ===== DOM 구조 =====
    this.el.innerHTML = `
      <div class="app-header-placeholder"></div>
      <div class="app-sidebar-placeholder"></div>
      <div class="sidebar-overlay-placeholder"></div>
      <main class="app-main">
        <section class="chat-section"></section>
      </main>
      <div class="app-footer-placeholder"></div>
      <div class="app-toast-placeholder"></div>
    `

    // 컴포넌트 마운트
    this.el.querySelector('.app-header-placeholder').replaceWith(this.header.el)
    this.header.el.className = 'mobile-header'

    this.el.querySelector('.app-sidebar-placeholder').replaceWith(this.sidebar.el)
    this.sidebar.el.className = 'app-sidebar'

    this.el.querySelector('.sidebar-overlay-placeholder').replaceWith(this.sidebarOverlay)

    const chatSection = this.el.querySelector('.chat-section')
    chatSection.append(this.chatBubbles.el)

    this.el.querySelector('.app-footer-placeholder').replaceWith(this.chatInput.el)
    this.chatInput.el.className = 'app-footer'

    this.el.querySelector('.app-toast-placeholder').replaceWith(this.toast.el)

    // 로그인 화면 마운트 (초기에는 숨김, initAuth가 제어)
    this.el.appendChild(this.loginScreen.el)
    this.loginScreen.hide()

    // 사이드바 오버레이 동기화
    if (typeof this.sidebar.syncOverlayState === 'function') {
      this.sidebar.syncOverlayState()
    }
  }
}
