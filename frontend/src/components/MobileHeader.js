
import { Component } from '../core'

export default class MobileHeader extends Component {
  constructor() {
    super({
      tagName: 'header',
      state: {
        isSidebarOpen: false
      }
    })

    this.el.className = 'mobile-header'
    this.handleHamburgerClick = this.handleHamburgerClick.bind(this)
  }

  handleHamburgerClick() {
    // 사이드바 토글
    const sidebar = window.app?.sidebar
    if (sidebar) {
      sidebar.toggleMobile()
    }
  }

  render() {
    this.el.innerHTML = /* html */ `
      <button class="hamburger-button" aria-label="메뉴 열기">
        <span class="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
    `

    this.attachEventListeners()
  }

  attachEventListeners() {
    const hamburgerButton = this.el.querySelector('.hamburger-button')
    if (hamburgerButton) {
      hamburgerButton.addEventListener('click', this.handleHamburgerClick)
    }
  }
}