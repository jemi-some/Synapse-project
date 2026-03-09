import { Component } from '../core'
import { signOut } from '../services/supabase'

export default class LogoutDropdown extends Component {
  constructor(user, onClose) {
    super({
      tagName: 'div',
      state: { 
        user, 
        isVisible: false,
        isLoggingOut: false
      }
    })
    
    this.onClose = onClose
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleLogoutClick = this.handleLogoutClick.bind(this)
    this._eventListenersAdded = false
  }

  render() {
    const { user, isLoggingOut } = this.state
    const userName = user?.user_metadata?.full_name || 'User'
    const userEmail = user?.email || ''

    this.el.className = `logout-dropdown ${this.state.isVisible ? 'visible' : ''}`
    this.el.innerHTML = /* html */ `
      <div class="dropdown-content">
        <div class="user-info">
          <div class="user-name">${userName}</div>
          <div class="user-email">${userEmail}</div>
        </div>
        <hr class="dropdown-divider" />
        <button class="logout-button" aria-label="로그아웃" ${isLoggingOut ? 'disabled' : ''}>
          <span>${isLoggingOut ? '로그아웃 중...' : '로그아웃'}</span>
        </button>
      </div>
    `

    // 이벤트 리스너는 한 번만 추가
    if (!this._eventListenersAdded) {
      // 로그아웃 버튼 클릭
      this.el.addEventListener('click', (e) => {
        e.stopPropagation()
        
        if (e.target.closest('.logout-button') && !this.state.isLoggingOut) {
          this.handleLogoutClick(e)
        }
      })
      
      // 키보드 접근성
      this.el.addEventListener('keydown', this.handleKeyDown)
      
      this._eventListenersAdded = true
    }
  }

  async handleLogoutClick(e) {
    
    if (this.state.isLoggingOut) {
      return
    }

    // 즉시 상태 설정
    this.state.isLoggingOut = true
    
    // 버튼 UI 업데이트
    const button = this.el.querySelector('.logout-button')
    if (button) {
      button.disabled = true
      const span = button.querySelector('span')
      if (span) {
        span.textContent = '로그아웃 중...'
      }
    }
    
    try {
      const { error } = await signOut()
      
      if (error) {
        console.error('로그아웃 실패:', error)
        // 상태 복원
        this.state.isLoggingOut = false
        if (button) {
          button.disabled = false
          const span = button.querySelector('span')
          if (span) {
            span.textContent = '로그아웃'
          }
        }
        alert('로그아웃에 실패했습니다.')
      } else {
        // authStore에서 자동으로 상태가 업데이트되고 Header가 재렌더링됨
        // onClose 콜백을 직접 호출 (hide() 대신)
        if (this.onClose) {
          this.onClose()
        }
      }
    } catch (error) {
      console.error('로그아웃 예외:', error)
      // 상태 복원
      this.state.isLoggingOut = false
      if (button) {
        button.disabled = false
        const span = button.querySelector('span')
        if (span) {
          span.textContent = '로그아웃'
        }
      }
      alert('로그아웃 중 오류가 발생했습니다.')
    }
  }

  handleKeyDown(e) {
    // ESC 키로 드롭다운 닫기
    if (e.key === 'Escape') {
      this.hide()
    }
  }

  show() {
    this.state.isVisible = true
    this.el.classList.add('visible')
    this.render()
    
    // 접근성을 위해 드롭다운에 포커스
    this.el.setAttribute('tabindex', '-1')
    this.el.focus()
  }

  hide() {
    this.state.isVisible = false
    this.el.classList.remove('visible')
    
    if (this.onClose) {
      this.onClose()
    }
  }

  // 외부에서 강제로 드롭다운을 닫을 수 있는 메서드
  forceClose() {
    this.hide()
  }
}