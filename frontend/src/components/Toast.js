// ============================================================
// Toast 알림 컴포넌트
// ============================================================

import { Component } from '../core'

export default class Toast extends Component {
  constructor() {
    super({
      state: {
        toasts: [], // { id, type, title, message, action, onAction }
      }
    })
    this.nextId = 1
  }

  /**
   * 토스트 표시
   * @param {Object} options - { type, title, message, action, onAction, duration }
   */
  show(options) {
    const {
      type = 'info', // 'success' | 'error' | 'warning' | 'info'
      title = '',
      message = '',
      action = null,
      onAction = null,
      duration = 5000,
    } = options

    const toast = {
      id: this.nextId++,
      type,
      title,
      message,
      action,
      onAction,
    }

    this.state.toasts.push(toast)
    this.render()

    // 자동 제거 (action이 없을 때만)
    if (!action && duration > 0) {
      setTimeout(() => {
        this.dismiss(toast.id)
      }, duration)
    }
  }

  /**
   * 성공 토스트
   */
  success(title, message, duration) {
    this.show({ type: 'success', title, message, duration })
  }

  /**
   * 에러 토스트
   */
  error(title, message, action, onAction) {
    this.show({ type: 'error', title, message, action, onAction, duration: 0 })
  }

  /**
   * 경고 토스트
   */
  warning(title, message, duration) {
    this.show({ type: 'warning', title, message, duration })
  }

  /**
   * 정보 토스트
   */
  info(title, message, duration) {
    this.show({ type: 'info', title, message, duration })
  }

  /**
   * 토스트 제거
   */
  dismiss(id) {
    this.state.toasts = this.state.toasts.filter(t => t.id !== id)
    this.render()
  }

  /**
   * 모든 토스트 제거
   */
  dismissAll() {
    this.state.toasts = []
    this.render()
  }

  render() {
    this.el.className = 'toast-container'

    const toastsHtml = this.state.toasts
      .map(toast => {
        const iconMap = {
          success: '✓',
          error: '✕',
          warning: '⚠',
          info: 'ℹ',
        }

        return `
        <div class="toast toast-${toast.type}" data-toast-id="${toast.id}">
          <div class="toast-icon">${iconMap[toast.type]}</div>
          <div class="toast-content">
            ${toast.title ? `<div class="toast-title">${this.escapeHtml(toast.title)}</div>` : ''}
            ${toast.message ? `<div class="toast-message">${this.escapeHtml(toast.message)}</div>` : ''}
          </div>
          <div class="toast-actions">
            ${
              toast.action
                ? `<button class="toast-action-btn" data-toast-id="${toast.id}">${this.escapeHtml(toast.action)}</button>`
                : ''
            }
            <button class="toast-close-btn" data-toast-id="${toast.id}">×</button>
          </div>
        </div>
      `
      })
      .join('')

    this.el.innerHTML = toastsHtml

    // 이벤트 리스너 재등록
    this.el.querySelectorAll('.toast-close-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const toastId = parseInt(e.target.dataset.toastId)
        this.dismiss(toastId)
      })
    })

    this.el.querySelectorAll('.toast-action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const toastId = parseInt(e.target.dataset.toastId)
        const toast = this.state.toasts.find(t => t.id === toastId)
        if (toast && toast.onAction) {
          toast.onAction()
        }
        this.dismiss(toastId)
      })
    })
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}
