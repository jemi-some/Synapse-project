
import { Component } from '../core'

const THEME_KEY = 'app-theme'
const THEMES = {
  warm: { icon: '🌅', label: '따뜻한 우주' },
  cool: { icon: '🌌', label: '차가운 우주' }
}

export default class MobileHeader extends Component {
  constructor() {
    super({
      tagName: 'header',
      state: {
        isSidebarOpen: false,
        theme: localStorage.getItem(THEME_KEY) || 'warm',
      }
    })

    this.el.className = 'mobile-header'
    this.handleHamburgerClick = this.handleHamburgerClick.bind(this)
    this.handleThemeToggle = this.handleThemeToggle.bind(this)

    // 저장된 테마 즉시 적용
    this._applyTheme(this.state.theme)
  }

  _applyTheme(theme) {
    if (theme === 'cool') {
      document.documentElement.setAttribute('data-theme', 'cool')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }

  handleHamburgerClick() {
    const sidebar = window.app?.sidebar
    if (sidebar) {
      sidebar.toggleMobile()
    }
  }

  handleThemeToggle() {
    const nextTheme = this.state.theme === 'warm' ? 'cool' : 'warm'
    this.state = { ...this.state, theme: nextTheme }
    this._applyTheme(nextTheme)
    localStorage.setItem(THEME_KEY, nextTheme)
    this.render()
  }

  render() {
    const { theme } = this.state
    const next = theme === 'warm' ? THEMES.cool : THEMES.warm

    this.el.innerHTML = /* html */ `
      <div class="header-top-row">
        <button class="hamburger-button" aria-label="메뉴 열기">
          <span class="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        <div class="app-title-container">
          <svg class="constellation-title" viewBox="0 0 100 38" xmlns="http://www.w3.org/2000/svg" aria-label="Synapse">
            <!-- 연결선 -->
            <g stroke="var(--color-primary)" stroke-width="0.6" opacity="0.35" fill="none">
              <!-- 중앙 → 1차 노드 -->
              <line x1="50" y1="16" x2="50" y2="3"/>
              <line x1="50" y1="16" x2="30" y2="8"/>
              <line x1="50" y1="16" x2="70" y2="6"/>
              <line x1="50" y1="16" x2="24" y2="22"/>
              <line x1="50" y1="16" x2="76" y2="23"/>
              <!-- 1차 → 2차 노드 -->
              <line x1="30" y1="8"  x2="16" y2="4"/>
              <line x1="70" y1="6"  x2="84" y2="10"/>
              <line x1="24" y1="22" x2="12" y2="27"/>
              <line x1="76" y1="23" x2="88" y2="17"/>
              <!-- 크로스 연결 (네트워크 느낌) -->
              <line x1="30" y1="8"  x2="50" y2="3"/>
              <line x1="70" y1="6"  x2="76" y2="23"/>
              <line x1="16" y1="4"  x2="24" y2="22"/>
            </g>
            <!-- 2차 노드 (작은 별) -->
            <circle class="const-star" cx="16" cy="4"  r="1.0" fill="var(--color-primary)"/>
            <circle class="const-star" cx="84" cy="10" r="1.0" fill="var(--color-primary)"/>
            <circle class="const-star" cx="12" cy="27" r="0.9" fill="var(--color-primary)"/>
            <circle class="const-star" cx="88" cy="17" r="1.0" fill="var(--color-primary)"/>
            <!-- 1차 노드 -->
            <circle class="const-star-bright" cx="50" cy="3"  r="1.4" fill="var(--color-primary)" style="animation-delay:0.3s"/>
            <circle class="const-star-bright" cx="30" cy="8"  r="1.6" fill="var(--color-primary)" style="animation-delay:1.2s"/>
            <circle class="const-star-bright" cx="70" cy="6"  r="1.5" fill="var(--color-primary)" style="animation-delay:2.0s"/>
            <circle class="const-star-bright" cx="24" cy="22" r="1.5" fill="var(--color-primary)" style="animation-delay:0.7s"/>
            <circle class="const-star-bright" cx="76" cy="23" r="1.6" fill="var(--color-primary)" style="animation-delay:1.6s"/>
            <!-- 중앙 시냅스 노드 (메인) -->
            <circle class="const-center" cx="50" cy="16" r="2.6" fill="var(--color-primary)"/>
            <!-- 텍스트 -->
            <text x="50" y="34"
              text-anchor="middle"
              fill="var(--color-text-default)"
              font-size="7"
              font-family="inherit"
              letter-spacing="3"
              font-weight="400"
              opacity="0.6">SYNAPSE</text>
          </svg>
        </div>

        <button class="theme-toggle-btn" aria-label="테마 전환" title="${next.label}로 전환">
          <span class="theme-icon">${next.icon}</span>
        </button>
      </div>
    `

    this.attachEventListeners()
  }

  attachEventListeners() {
    const hamburgerButton = this.el.querySelector('.hamburger-button')
    if (hamburgerButton) {
      hamburgerButton.addEventListener('click', () => this.handleHamburgerClick())
    }

    const themeBtn = this.el.querySelector('.theme-toggle-btn')
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.handleThemeToggle())
    }

  }
}
