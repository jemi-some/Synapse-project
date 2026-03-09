import { Component } from '../core'

export default class UserAvatar extends Component {
  constructor(user, onDropdownToggle) {
    super({
      tagName: 'div',
      state: { 
        user,
        showDropdown: false 
      }
    })
    
    this.onDropdownToggle = onDropdownToggle
    this.handleOutsideClick = this.handleOutsideClick.bind(this)
  }

  render() {
    const { user } = this.state
    const avatarUrl = user?.user_metadata?.avatar_url || ''
    const userName = user?.user_metadata?.full_name || user?.email || 'User'
    const initial = userName.charAt(0).toUpperCase()

    this.el.className = 'user-avatar-container'
    this.el.innerHTML = /* html */ `
      <button class="avatar-button" aria-label="사용자 메뉴 열기" title="${userName}">
        ${avatarUrl 
          ? `<img src="${avatarUrl}" alt="${userName}" class="avatar-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
             <div class="avatar-placeholder" style="display: none;">${initial}</div>`
          : `<div class="avatar-placeholder">${initial}</div>`
        }
      </button>
    `

    // 이벤트 리스너 추가 (화살표 함수로 this 바인딩 자동 처리)
    const avatarButton = this.el.querySelector('.avatar-button')
    avatarButton.addEventListener('click', (e) => {
      e.stopPropagation()
      this.state.showDropdown = !this.state.showDropdown
      
      if (this.state.showDropdown) {
        this.showDropdown()
        // 외부 클릭 감지를 위한 이벤트 리스너 추가
        setTimeout(() => {
          document.addEventListener('click', this.handleOutsideClick)
        }, 0)
      } else {
        this.hideDropdown()
      }
    })
  }


  handleOutsideClick(e) {
    // 드롭다운 외부 클릭 시 닫기
    if (!this.el.contains(e.target)) {
      this.hideDropdown()
      document.removeEventListener('click', this.handleOutsideClick)
    }
  }

  showDropdown() {
    if (this.onDropdownToggle) {
      this.onDropdownToggle(true, this.state.user)
    }
  }

  hideDropdown() {
    this.state.showDropdown = false
    if (this.onDropdownToggle) {
      this.onDropdownToggle(false)
    }
    document.removeEventListener('click', this.handleOutsideClick)
  }

  // 외부에서 드롭다운을 닫을 수 있도록 하는 메서드
  closeDropdown() {
    this.hideDropdown()
  }
}