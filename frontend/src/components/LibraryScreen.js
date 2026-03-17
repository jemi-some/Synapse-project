import { Component } from '../core'
import { authStore } from '../store/auth'
import { supabase } from '../services/supabase'

export default class LibraryScreen extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isLoading: false,
        memories: [],
        isAuthenticated: false,
        user: null
      }
    })

    this.el.className = 'library-screen'

    // Auth 상태 구독
    authStore.subscribe('isAuthenticated', (isAuth) => {
      this.state.isAuthenticated = isAuth
      if (isAuth) {
        this.state.user = authStore.state.user
        this.loadMemories()
      } else {
        this.state.memories = []
        this.render()
      }
    })

    this.initializeAuthState()
  }

  async initializeAuthState() {
    this.state.isAuthenticated = authStore.state.isAuthenticated
    this.state.user = authStore.state.user
    if (this.state.isAuthenticated) {
      await this.loadMemories()
    }
  }

  async loadMemories() {
    if (!this.state.isAuthenticated || !this.state.user) return

    try {
      this.state.isLoading = true
      this.render()

      // memories 테이블에서 파일이 있는 기록만 가져오기
      const { data, error } = await supabase
        .from('memories')
        .select('*')
        .not('file_url', 'is', null)

      if (error) {
        console.error('사진 불러오기 실패:', error)
        this.state.memories = []
      } else {
        this.state.memories = data || []
      }

    } catch (error) {
      console.error('사진 로드 중 오류:', error)
      this.state.memories = []
    } finally {
      this.state.isLoading = false
      this.render()
    }
  }

  // capture_time 또는 created_at 기반으로 그룹화
  getGroupedMemories() {
    const groups = {}

    const sortedMemories = [...this.state.memories].sort((a, b) => {
      const timeA = new Date(this.getMemoryDate(a)).getTime()
      const timeB = new Date(this.getMemoryDate(b)).getTime()
      return timeB - timeA // 최신순
    })

    sortedMemories.forEach(memory => {
      const dateStr = this.formatDate(this.getMemoryDate(memory))
      if (!groups[dateStr]) {
        groups[dateStr] = []
      }
      groups[dateStr].push(memory)
    })

    return groups
  }

  getMemoryDate(memory) {
    if (memory.selected_metadata && memory.selected_metadata.dateTime && memory.selected_metadata.dateTime.original) {
      return memory.selected_metadata.dateTime.original
    }
    return memory.created_at
  }

  formatDate(dateString) {
    if (!dateString) return '알 수 없는 날짜'
    const date = new Date(dateString)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`
  }

  render() {
    if (!this.state.isAuthenticated) {
      this.el.innerHTML = `
        <div class="library-empty-state">
          <span class="material-symbols-rounded">lock</span>
          <p>로그인 후 사진첩을 볼 수 있습니다.</p>
        </div>
      `
      return
    }

    if (this.state.isLoading) {
      this.el.innerHTML = `
        <div class="library-loading">
          <div class="loading-spinner"></div>
          <p>사진을 불러오는 중...</p>
        </div>
      `
      return
    }

    if (this.state.memories.length === 0) {
      this.el.innerHTML = `
        <div class="library-empty-state">
          <span class="material-symbols-rounded">photo_library</span>
          <p>아직 저장된 사진이 없습니다.</p>
          <p class="empty-subtext">사진을 찍어 일상을 기록해보세요!</p>
        </div>
      `
      return
    }

    const groupedMemories = this.getGroupedMemories()
    let galleryHtml = ''

    for (const [dateStr, memories] of Object.entries(groupedMemories)) {
      galleryHtml += `
        <div class="gallery-group">
          <h3 class="gallery-date-header">${this.escapeHtml(dateStr)}</h3>
          <div class="gallery-grid">
            ${memories.map(memory => `
              <div class="gallery-item">
                <img src="${memory.file_url}" alt="${this.escapeHtml(memory.file_name || '사진')}" loading="lazy" />
              </div>
            `).join('')}
          </div>
        </div>
      `
    }

    this.el.innerHTML = `
      <div class="library-container">
        <div class="library-header">
          <div class="library-header-top">
            <button class="library-back-button" aria-label="메인 피드로 돌아가기">
              <span class="material-symbols-rounded">arrow_back</span>
            </button>
            <h2>사진첩</h2>
          </div>
          <span class="photo-count">${this.state.memories.length}장의 사진</span>
        </div>
        <div class="library-gallery">
          ${galleryHtml}
        </div>
      </div>
    `

    const backButton = this.el.querySelector('.library-back-button')
    if (backButton) {
      backButton.addEventListener('click', () => {
        window.location.hash = '#/'
      })
    }
  }

  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  refresh() {
    if (this.state.isAuthenticated) {
      this.loadMemories()
    }
  }

  initialize() {
    this.initializeAuthState()
  }
}
