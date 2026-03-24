
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
        theme: localStorage.getItem(THEME_KEY) || 'warm'
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
      <button class="hamburger-button" aria-label="메뉴 열기">
        <span class="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      <button class="theme-toggle-btn" aria-label="테마 전환" title="${next.label}로 전환">
        <span class="theme-icon">${next.icon}</span>
      </button>
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
