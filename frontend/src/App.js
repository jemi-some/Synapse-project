import { Component } from './core'
import Sidebar from './components/Sidebar'
import MobileHeader from './components/MobileHeader'
import ChatInput from './components/ChatInput'
import ChatBubbles from './components/ChatBubbles'

import { onAuthStateChange, getCurrentUser, signInAnonymously } from './services/supabase'

export default class App extends Component {
  constructor() {
    super()
    this.user = null
    this.currentSessionId = null // 현재 채팅 세션 ID 추적
    this.initAuth()
    console.log('[Supabase] App initialized with auth')
  }

  // ============================================================
  // Supabase 인증 관련 코드
  // ============================================================
  async initAuth() {
    const { user, error } = await getCurrentUser()

    if (!user) {
      console.log('No user found, signing in anonymously...')
      const { data, error: anonError } = await signInAnonymously()
      if (anonError) {
        console.error('Anonymous sign in failed:', anonError)
        console.warn('Continuing without authentication...')
      } else {
        console.log('Anonymous sign in successful:', data)
        const { user: newUser } = await getCurrentUser()
        if (newUser) {
          this.user = newUser
          this.onAuthStateChanged(newUser)
        }
      }
    } else {
      this.user = user
      this.onAuthStateChanged(user)
    }

    onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session)

      if (event === 'SIGNED_IN' && session?.user) {
        this.user = session.user
        this.onAuthStateChanged(session.user)
      } else if (event === 'SIGNED_OUT') {
        this.user = null
        this.onAuthStateChanged(null)
        this.signInAnonymouslyAfterSignOut()
      }
    })
  }

  async signInAnonymouslyAfterSignOut() {
    console.log('Signing in anonymously after sign out...')
    const { data, error } = await signInAnonymously()
    if (error) {
      console.error('Anonymous sign in failed after sign out:', error)
    } else {
      console.log('Anonymous sign in successful after sign out:', data)
    }
  }

  onAuthStateChanged(user) {
    if (user) {
      console.log('User logged in:', user.email)
    } else {
      console.log('User logged out')
    }
  }

  render() {
    // Sidebar, ChatBubbles와 ChatInput 인스턴스 생성 및 전역 참조 저장
    this.sidebar = new Sidebar()
    this.mobileHeader = new MobileHeader()
    this.chatBubbles = new ChatBubbles()
    this.chatInput = new ChatInput()

    const routerView = document.createElement('router-view')

    // 메인 컨텐츠 래퍼 생성
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 사이드바 상태 동기화 함수
    this.updateMainContentClass = () => {
      if (this.sidebar?.state?.isExpanded) {
        mainContent.classList.add('sidebar-expanded')
      } else {
        mainContent.classList.remove('sidebar-expanded')
      }
    }

    // 사이드바 상태 변화 감지를 위한 옵저버 설정
    if (this.sidebar) {
      const originalSidebarRender = this.sidebar.render.bind(this.sidebar)
      this.sidebar.render = (...args) => {
        const result = originalSidebarRender(...args)
        setTimeout(() => this.updateMainContentClass(), 0)
        return result
      }
    }

    window.app = {
      sidebar: this.sidebar,
      chatBubbles: this.chatBubbles,
      chatInput: this.chatInput,
      user: this.user,
      currentSessionId: this.currentSessionId,
      updateUser: (user) => {
        this.user = user
        this.onAuthStateChanged(user)
      },
      updateCurrentSessionId: (sessionId) => {
        this.currentSessionId = sessionId
        window.app.currentSessionId = sessionId
      },
      updateMainContentClass: this.updateMainContentClass
    }

    // 메인 컨텐츠에 라우터와 채팅 관련 컴포넌트 추가
    mainContent.append(
      routerView,
      this.chatBubbles.el,
      this.chatInput.el
    )

    this.el.append(
      this.mobileHeader.el,
      this.sidebar.el,
      mainContent
    )

    // 초기 상태 설정
    this.updateMainContentClass()
  }
}