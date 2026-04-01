import { Component } from '../core'
import { fetchRelatedMemories } from '../services/openai'

export default class RelatedMemoriesPanel extends Component {
  constructor() {
    super()
    this._memoryId = null
    this._userId = null
    this.render()
  }

  open(memoryId, userId) {
    this._memoryId = memoryId
    this._userId = userId
    this.el.classList.add('is-open')
    this._renderLoading()
    this._fetch()
  }

  close() {
    this.el.classList.remove('is-open')
  }

  async _fetch() {
    try {
      const result = await fetchRelatedMemories(this._memoryId, this._userId)
      if (result && result.total > 0) {
        this._renderResults(result)
      } else {
        this._renderEmpty()
      }
    } catch {
      this._renderEmpty()
    }
  }

  _renderLoading() {
    const body = this.el.querySelector('.related-panel-body')
    body.innerHTML = `
      <div class="related-panel-loading">
        <div class="related-panel-spinner"></div>
        <span>기억을 찾고 있어요...</span>
      </div>
    `
  }

  _renderEmpty() {
    const body = this.el.querySelector('.related-panel-body')
    body.innerHTML = `
      <div class="related-panel-empty">
        <span class="material-symbols-outlined">search_off</span>
        <p>비슷한 기억이 없어요</p>
      </div>
    `
  }

  _renderResults({ photos = [], memos = [] }) {
    const body = this.el.querySelector('.related-panel-body')

    const photosHtml = photos.length > 0 ? `
      <div class="related-section">
        <div class="related-section-title">사진</div>
        <div class="related-photo-grid">
          ${photos.map(p => {
            const dateStr = p.takenAt
              ? new Date(p.takenAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
              : ''
            return `
            <div class="related-photo-card">
              <img src="${p.imageUrl}" alt="${p.imageCaption ? this._escape(p.imageCaption) : ''}" class="related-photo-img" />
              <div class="related-photo-info">
                ${p.userText ? `<div class="related-photo-caption">${this._escape(p.userText)}</div>` : ''}
                ${dateStr ? `<div class="related-photo-date">${dateStr}</div>` : ''}
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
    ` : ''

    const memosHtml = memos.length > 0 ? `
      <div class="related-section">
        <div class="related-section-title">텍스트 기억</div>
        ${memos.map(m => {
          const dateStr = m.createdAt
            ? new Date(m.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
            : ''
          const text = m.userText || m.combinedText || ''
          return `
            <div class="related-memo-card">
              <div class="related-memo-text">${this._escape(text)}</div>
              ${dateStr ? `<div class="related-memo-date">${dateStr}</div>` : ''}
            </div>
          `
        }).join('')}
      </div>
    ` : ''

    body.innerHTML = photosHtml + memosHtml
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  render() {
    this.el.className = 'related-panel-overlay'
    this.el.innerHTML = `
      <div class="related-panel">
        <div class="related-panel-header">
          <span class="related-panel-title">비슷한 기억</span>
          <button class="related-panel-close" aria-label="닫기">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="related-panel-body"></div>
      </div>
    `
    this.el.querySelector('.related-panel-close').addEventListener('click', () => this.close())
    this.el.addEventListener('click', e => {
      if (e.target === this.el) this.close()
    })
  }
}
