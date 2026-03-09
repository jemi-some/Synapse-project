import { Component } from '../core'

export default class LoadingSpinner extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isVisible: false,
        message: '처리 중...',
        progress: 0,
        stage: '',
        showProgress: false
      }
    })

    this.el.className = 'loading-spinner-container'
  }

  show(message = '처리 중...', showProgress = false) {
    this.state.isVisible = true
    this.state.message = message
    this.state.showProgress = showProgress
    this.state.progress = 0
    this.state.stage = ''
    this.render()
  }

  hide() {
    this.state.isVisible = false
    this.render()
  }

  updateProgress(progress, stage = '') {
    this.state.progress = Math.max(0, Math.min(100, progress))
    this.state.stage = stage
    this.render()
  }

  updateMessage(message) {
    this.state.message = message
    this.render()
  }

  render() {
    if (!this.state.isVisible) {
      this.el.innerHTML = ''
      this.el.style.display = 'none'
      return
    }

    this.el.style.display = 'flex'
    
    this.el.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="spinner-wrapper">
            <div class="spinner"></div>
          </div>
          
          <div class="loading-text">
            <div class="loading-message">${this.state.message}</div>
            ${this.state.stage ? `<div class="loading-stage">${this.state.stage}</div>` : ''}
          </div>
          
          ${this.state.showProgress ? `
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${this.state.progress}%"></div>
              </div>
              <div class="progress-text">${Math.round(this.state.progress)}%</div>
            </div>
          ` : ''}
        </div>
      </div>
    `
  }
}