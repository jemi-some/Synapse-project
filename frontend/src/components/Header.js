import { Component } from '../core'
import { authStore } from '../store/auth'
import { signInWithGoogle } from '../services/supabase'
import UserAvatar from './UserAvatar'
import LogoutDropdown from './LogoutDropdown'
import Sidebar from './Sidebar'

export default class Header extends Component {
  constructor() {
    super({
      tagName: 'header',
      state: { 
        isLoading: false,
        user: null,
        isAuthenticated: false,
        dropdownComponent: null,
        avatarComponent: null,
        sidebarComponent: null
      }
    })
    
    this.handleLogin = this.handleLogin.bind(this)
    this.handleDropdownToggle = this.handleDropdownToggle.bind(this)
    this.handleSidebarToggle = this.handleSidebarToggle.bind(this)
    this._isRendering = false
    
    // 안전한 render 호출
    this.safeRender = () => {
      if (!this._isRendering) {
        this._isRendering = true
        setTimeout(() => {
          this.render()
          this._isRendering = false
        }, 0)
      }
    }
    
    // 인증 상태 구독
    authStore.subscribe('user', (user) => {
      if (this.state.user !== user) {
        this.state.user = user
        this.state.isAuthenticated = !!user
        this.safeRender()
      }
    })
    
    authStore.subscribe('isLoading', (isLoading) => {
      if (this.state.isLoading !== isLoading) {
        this.state.isLoading = isLoading
        this.safeRender()
      }
    })
    
    // 사이드바 컴포넌트 생성
    this.state.sidebarComponent = new Sidebar()
    document.body.appendChild(this.state.sidebarComponent.el)
  }

  render() {
    const { user, isAuthenticated, isLoading } = this.state
    
    // 기존 컴포넌트들 정리
    if (this.state.avatarComponent) {
      this.state.avatarComponent = null
    }
    if (this.state.dropdownComponent) {
      this.hideDropdown()
    }
    
    this.el.innerHTML = /* html */ `
      <button class="sidebar-button" aria-label="사이드바 열기">☰</button>
      <div class="auth-section" style="position: relative;">
        ${isAuthenticated && user ? '' : this.renderLoginButton(isLoading)}
      </div>
    `

    const authSection = this.el.querySelector('.auth-section')

    if (isAuthenticated && user) {
      // 사용자 아바타 컴포넌트 생성 및 추가
      this.state.avatarComponent = new UserAvatar(user, this.handleDropdownToggle)
      authSection.appendChild(this.state.avatarComponent.el)
    } else {
      // 로그인 버튼 이벤트 리스너 추가
      const loginBtn = this.el.querySelector('.btn-login')
      if (loginBtn) {
        loginBtn.addEventListener('click', this.handleLogin)
      }
    }

    // 사이드바 버튼 이벤트 리스너 추가
    const sidebarBtn = this.el.querySelector('.sidebar-button')
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', () => {
        this.handleSidebarToggle()
      })
    }
  }

  renderLoginButton(isLoading) {
    return /* html */ `
      <button class="btn-login" aria-label="구글 로그인" ${isLoading ? 'disabled' : ''}>
        <span class="login-text">${isLoading ? '로그인 중...' : '로그인'}</span>
      </button>
    `
  }

  async handleLogin() {
    if (authStore.state.isLoading) return
    
    authStore.state.isLoading = true
    
    try {
      const { error } = await signInWithGoogle()
      if (error) {
        console.error('로그인 실패:', error)
        alert('로그인에 실패했습니다. 다시 시도해주세요.')
      }
    } catch (error) {
      console.error('로그인 오류:', error)
      alert('로그인 중 오류가 발생했습니다.')
    } finally {
      authStore.state.isLoading = false
    }
  }

  handleDropdownToggle(isVisible, user = null) {
    if (isVisible && user) {
      // 드롭다운 표시
      this.showDropdown(user)
    } else {
      // 드롭다운 숨기기
      this.hideDropdown()
    }
  }

  showDropdown(user) {
    // 기존 드롭다운이 있다면 제거
    if (this.state.dropdownComponent) {
      this.hideDropdown()
    }
    
    // 새 드롭다운 생성
    this.state.dropdownComponent = new LogoutDropdown(user, () => {
      this.hideDropdown()
      if (this.state.avatarComponent) {
        this.state.avatarComponent.closeDropdown()
      }
    })
    
    // 드롭다운을 auth-section에 추가
    const authSection = this.el.querySelector('.auth-section')
    authSection.appendChild(this.state.dropdownComponent.el)
    
    
    // 드롭다운 표시
    this.state.dropdownComponent.show()
  }

  hideDropdown() {
    if (this.state.dropdownComponent) {
      // hide() 메서드 호출하지 않고 직접 처리
      this.state.dropdownComponent.state.isVisible = false
      this.state.dropdownComponent.el.classList.remove('visible')
      
      // 애니메이션 후 DOM에서 제거
      setTimeout(() => {
        if (this.state.dropdownComponent && this.state.dropdownComponent.el.parentNode) {
          this.state.dropdownComponent.el.remove()
          this.state.dropdownComponent = null
        }
      }, 200) // CSS transition 시간과 일치
    }
  }

  handleSidebarToggle() {
    console.log('handleSidebarToggle called', this, this.state)
    if (this.state && this.state.sidebarComponent) {
      if (this.state.sidebarComponent.state.isVisible) {
        this.state.sidebarComponent.hide()
      } else {
        this.state.sidebarComponent.show()
      }
    } else {
      console.error('sidebarComponent not found in state')
    }
  }

  // App.js에서 호출할 사용자 업데이트 메서드
  updateUser(user) {
    this.state.user = user
    this.state.isAuthenticated = !!user
    
    // authStore도 업데이트
    authStore.state.user = user
    authStore.state.isAuthenticated = !!user
    
    this.safeRender()
  }
}