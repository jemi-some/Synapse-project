import { Component } from '../core'
import { authStore } from '../store/auth'
import { supabase } from '../services/supabase'
import html2canvas from 'html2canvas'

export default class LibraryScreen extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isLoading: false,
        mediaFiles: [],
        user: null,
        isAuthenticated: false,
        selectedFilter: 'all', // all, images, videos
        sortBy: 'memory_desc', // memory_desc, memory_asc
        viewMode: 'grid', // grid, single
        currentPhotoIndex: 0, // 현재 보고 있는 사진 인덱스
        isCardFlipped: false, // 카드 뒤집기 상태
        currentSessionMessages: [], // 현재 세션의 메시지들
        currentSessionAnalysis: null, // 현재 세션의 AI 분석
        currentSessionTitle: null // 현재 세션의 제목
      }
    })

    // 모바일 감지
    this.isMobile = this.detectMobile()
    
    this.el.className = 'library-screen'
    
    // 현재 인증 상태 즉시 확인
    this.initializeAuthState()
    
    // 인증 상태 구독 - 모든 관련 상태 변화 감지
    authStore.subscribe('user', (user) => {
      this.state.user = user
      this.state.isAuthenticated = !!user
      if (user) {
        this.loadMediaFiles()
      } else {
        this.state.mediaFiles = []
      }
      this.render()
    })

    authStore.subscribe('isAuthenticated', (isAuth) => {
      this.state.isAuthenticated = isAuth
      if (isAuth && this.state.user) {
        this.loadMediaFiles()
      } else {
        this.state.mediaFiles = []
      }
      this.render()
    })

    authStore.subscribe('isLoading', (loading) => {
      if (!loading) {
        // 로딩이 완료되면 상태 다시 확인
        this.initializeAuthState()
        this.render()
      }
    })
  }

  initializeAuthState() {
    // authStore에서 현재 사용자 상태를 가져와서 즉시 설정
    const currentUser = authStore.state.user
    const isLoading = authStore.state.isLoading

    this.state.user = currentUser
    this.state.isAuthenticated = authStore.state.isAuthenticated
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
  }

  async loadMediaFiles() {
    if (!this.state.isAuthenticated || !this.state.user) return

    try {
      this.state.isLoading = true
      this.render()

      // 현재 사용자의 미디어 파일만 불러오기
      const { data: mediaFiles, error } = await supabase
        .from('media_files')
        .select(`
          *,
          chat_sessions!inner (
            id,
            title,
            created_at,
            user_id
          )
        `)
        .eq('chat_sessions.user_id', this.state.user.id)
        .order('created_at', { ascending: false })  // 최신순으로 정렬

      if (error) {
        console.error('미디어 파일 로드 실패:', error)
        this.state.mediaFiles = []
      } else {
        this.state.mediaFiles = mediaFiles || []
      }

      this.state.isLoading = false
      this.render()
    } catch (error) {
      console.error('미디어 파일 로드 중 오류:', error)
      this.state.isLoading = false
      this.state.mediaFiles = []
      this.render()
    }
  }

  getFilteredAndSortedFiles() {
    let files = [...this.state.mediaFiles]

    // 필터 적용
    if (this.state.selectedFilter === 'images') {
      files = files.filter(file => file.file_type?.startsWith('image/'))
    } else if (this.state.selectedFilter === 'videos') {
      files = files.filter(file => file.file_type?.startsWith('video/'))
    }

    // 정렬 적용
    files.sort((a, b) => {
      switch (this.state.sortBy) {
        case 'memory_desc':
          return (b.memory_index || 0) - (a.memory_index || 0)
        case 'memory_asc':
          return (a.memory_index || 0) - (b.memory_index || 0)
        case 'name_asc':
          return (a.file_name || '').localeCompare(b.file_name || '')
        case 'name_desc':
          return (b.file_name || '').localeCompare(a.file_name || '')
        default:
          return (b.memory_index || 0) - (a.memory_index || 0)
      }
    })

    return files
  }

  formatDate(dateString) {
    if (!dateString) return '날짜 없음'
    
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return `${year}.${month}.${day}.`
  }

  formatFileSize(bytes) {
    if (!bytes) return '알 수 없음'
    
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
    return (bytes / 1073741824).toFixed(1) + ' GB'
  }

  isImageFile(file) {
    // 파일 타입으로 먼저 체크
    if (file.file_type?.startsWith('image/')) {
      return true
    }
    
    // 파일 확장자로도 체크 (fallback)
    if (file.file_name) {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']
      const fileName = file.file_name.toLowerCase()
      return imageExtensions.some(ext => fileName.endsWith(ext))
    }
    
    // file_url에서도 체크
    if (file.file_url) {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']
      const url = file.file_url.toLowerCase()
      return imageExtensions.some(ext => url.includes(ext))
    }
    
    return false
  }

  generateCaption(fileId) {
    const captions = [
      "소중한 순간을 담았어요",
      "특별한 하루의 기록",
      "잊지 못할 추억",
      "마음속 깊이 새겨진 순간",
      "아름다운 기억 한 조각",
      "소소하지만 특별한 일상",
      "행복했던 그 순간",
      "시간이 멈춘 듯한 순간",
      "마음이 따뜻해지는 기억",
      "언제까지나 간직하고 싶은 순간",
      "웃음이 가득했던 하루",
      "감사한 마음이 든 순간",
      "평범하지만 소중한 일상",
      "기쁨이 넘쳤던 시간",
      "함께여서 더 빛났던 순간"
    ]
    
    // 안전한 파싱: fileId가 없거나 잘못된 경우 0을 기본값으로
    const safeId = fileId ? parseInt(fileId) : 0
    const index = isNaN(safeId) ? 0 : safeId % captions.length
    return captions[index]
  }

  render() {
    const { isLoading, isAuthenticated, selectedFilter, sortBy } = this.state

    // authStore가 아직 로딩 중이면 로딩 화면 표시
    if (authStore.state.isLoading) {
      this.el.innerHTML = /* html */ `
        <div class="library-screen-content">
          <div class="library-header">
            <h1>앨범</h1>
            <p>인증 상태를 확인하는 중...</p>
          </div>
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>잠시만 기다려주세요...</p>
          </div>
        </div>
      `
      return
    }

    if (!isAuthenticated) {
      this.el.innerHTML = /* html */ `
        <div class="library-screen-content">
          <div class="library-header">
            <h1>앨범</h1>
            <p>로그인하여 저장된 이미지와 채팅 기록을 확인하세요.</p>
          </div>
          <div class="auth-prompt">
            <div class="auth-card">
              <h2>Google 계정으로 로그인</h2>
              <p>앨범에 액세스하려면 로그인이 필요합니다.</p>
            </div>
          </div>
        </div>
      `
      return
    }

    const filteredFiles = this.getFilteredAndSortedFiles()

    this.el.innerHTML = /* html */ `
      <div class="library-screen-content">
        <div class="library-header">
          <h1>앨범</h1>
        </div>
        
        <div class="library-controls">
          <div class="left-controls">
            <div class="filter-controls">
              <label>필터:</label>
              <select class="filter-select">
                <option value="all" ${selectedFilter === 'all' ? 'selected' : ''}>전체</option>
                <option value="images" ${selectedFilter === 'images' ? 'selected' : ''}>이미지</option>
                <option value="videos" ${selectedFilter === 'videos' ? 'selected' : ''}>비디오</option>
              </select>
            </div>
            
            <div class="sort-controls">
              <label>정렬:</label>
              <select class="sort-select">
                <option value="memory_desc" ${sortBy === 'memory_desc' ? 'selected' : ''}>최근 기억순</option>
                <option value="memory_asc" ${sortBy === 'memory_asc' ? 'selected' : ''}>오래된 기억순</option>
              </select>
            </div>
          </div>
          
          <div class="view-controls">
            <button class="view-mode-button ${this.state.viewMode === 'grid' ? 'active' : ''}" 
                    data-view="grid" title="그리드 보기">
              <span class="material-symbols-outlined">grid_view</span>
            </button>
            <button class="view-mode-button ${this.state.viewMode === 'single' ? 'active' : ''}" 
                    data-view="single" title="단일 보기">
              <span class="material-symbols-outlined">imagesmode</span>
            </button>
          </div>
        </div>

        <div class="library-content">
          ${isLoading ? `
            <div class="loading-state">
              <div class="loading-spinner"></div>
              <p>파일을 불러오는 중...</p>
            </div>
          ` : filteredFiles.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">📷</div>
              <h3>저장된 파일이 없습니다</h3>
              <p>이미지를 업로드하고 채팅을 시작해 보세요!</p>
            </div>
          ` : this.state.viewMode === 'grid' ? `
            <div class="media-grid">
              ${filteredFiles.map(file => {
                // 각 아이템에 랜덤 회전 각도 생성 (-8도 ~ 8도 사이)
                const rotation = (Math.random() - 0.5) * 16
                return `
                <div class="media-item" data-file-id="${file.id}" data-session-id="${file.chat_session_id}" 
                     style="transform: rotate(${rotation}deg); --random-rotation: ${rotation}deg">
                  <!-- 폴라로이드 테이프 -->
                  <div class="tape tape-top-left"></div>
                  <div class="tape tape-bottom-right"></div>
                  
                  <div class="media-thumbnail">
                    <img src="${file.file_url}" 
                         alt="${file.file_name}" 
                         loading="lazy"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-icon" style="display: none;">
                      ${this.isImageFile(file) ? `
                        <span class="material-symbols-outlined">broken_image</span>
                        <p>이미지 로드 실패</p>
                      ` : `
                        <span class="material-symbols-outlined">description</span>
                        <p>파일</p>
                      `}
                    </div>
                  </div>
                  <div class="media-info">
                    <h4 class="media-memory-id">기억#${String(file.memory_index || '00').padStart(2, '0')}</h4>
                    <p class="media-caption">${this.generateCaption(file.id || file.memory_index || 1)}</p>
                    <p class="media-date">${this.formatDate(file.created_at)}</p>
                  </div>
                  <div class="media-actions">
                    <button class="action-button share-button" data-action="share" data-file-id="${file.id}" title="공유">
                      <span class="material-symbols-outlined">share</span>
                    </button>
                    <button class="action-button download-button" data-action="download" data-file-id="${file.id}" title="다운로드">
                      <span class="material-symbols-outlined">download</span>
                    </button>
                    <button class="action-button delete-button" data-action="delete" data-file-id="${file.id}" title="삭제">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
                `
              }).join('')}
            </div>
          ` : `
            <div class="photo-viewer">
              ${filteredFiles.length > 0 ? `
                <div class="viewer-container">
                  <!-- 네비게이션 버튼 -->
                  <button class="photo-nav-button prev ${this.state.currentPhotoIndex === 0 ? 'disabled' : ''}" 
                          ${this.state.currentPhotoIndex === 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">chevron_left</span>
                  </button>
                  
                  <button class="photo-nav-button next ${this.state.currentPhotoIndex >= filteredFiles.length - 1 ? 'disabled' : ''}"
                          ${this.state.currentPhotoIndex >= filteredFiles.length - 1 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">chevron_right</span>
                  </button>
                  
                  <!-- 메인 카드 -->
                  <div class="photo-card ${this.state.isCardFlipped ? 'flipped' : ''}" data-file-id="${filteredFiles[this.state.currentPhotoIndex].id}">
                    <!-- 앞면 (사진) -->
                    <div class="card-front">
                      <img class="card-image" src="${filteredFiles[this.state.currentPhotoIndex].file_url}" 
                           alt="${filteredFiles[this.state.currentPhotoIndex].file_name}" 
                           loading="lazy"
                           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                      <div class="fallback-icon" style="display: none;">
                        <span class="material-symbols-outlined">broken_image</span>
                        <p>이미지 로드 실패</p>
                      </div>
                    </div>
                    
                    <!-- 뒷면 (정보) -->
                    <div class="card-back">
                      <div class="card-back-content">
                        <!-- 왼쪽: 정보 영역 -->
                        <div class="card-back-info">
                          <!-- 헤더 -->
                          <div class="card-back-header">
                            <h3>기억 #${String(filteredFiles[this.state.currentPhotoIndex].memory_index || '00').padStart(2, '0')}</h3>
                            <p class="card-date">${this.formatDate(filteredFiles[this.state.currentPhotoIndex].created_at)}</p>
                          </div>
                          
                          <!-- 제목 -->
                          ${this.state.currentSessionTitle ? `
                            <div class="card-title">
                              <h4>${this.state.currentSessionTitle}</h4>
                            </div>
                          ` : ''}
                          
                          <!-- AI 분석 -->
                          ${this.state.currentSessionAnalysis ? `
                            <div class="card-ai-analysis">
                              ${this.state.currentSessionAnalysis.emotions && this.state.currentSessionAnalysis.emotions.length > 0 ? `
                                <div class="card-emotion-tags">
                                  ${this.state.currentSessionAnalysis.emotions.map(emotion => 
                                    `<span class="card-emotion-tag">${emotion}</span>`
                                  ).join('')}
                                </div>
                              ` : ''}
                              
                              ${this.state.currentSessionAnalysis.atmosphere ? `
                                <div class="card-atmosphere">
                                  <strong>요약:</strong> ${this.state.currentSessionAnalysis.atmosphere}
                                </div>
                              ` : ''}
                              
                              ${this.state.currentSessionAnalysis.mainContent ? `
                                <div class="card-atmosphere">
                                  <strong>주요 내용:</strong> ${this.state.currentSessionAnalysis.mainContent}
                                </div>
                              ` : ''}
                              
                              ${this.state.currentSessionAnalysis.memoryMeaning ? `
                                <div class="card-atmosphere">
                                  <strong>추억의 의미:</strong> ${this.state.currentSessionAnalysis.memoryMeaning}
                                </div>
                              ` : ''}
                              
                              ${this.state.currentSessionAnalysis.description ? `
                                <div class="card-description">
                                  ${this.state.currentSessionAnalysis.description}
                                </div>
                              ` : ''}
                            </div>
                          ` : `
                            <div class="card-caption">
                              ${this.generateCaption(filteredFiles[this.state.currentPhotoIndex].id || filteredFiles[this.state.currentPhotoIndex].memory_index || 1)}
                            </div>
                          `}
                          
                          <!-- 삭제 버튼만 남김 -->
                          <div class="card-back-actions">
                            <button class="card-action-button delete-button" data-action="delete" data-file-id="${filteredFiles[this.state.currentPhotoIndex].id}">
                              <span class="material-symbols-outlined">delete</span>
                              <span>삭제</span>
                            </button>
                          </div>
                        </div>
                        
                        <!-- 오른쪽: 채팅 영역 -->
                        <div class="card-back-chat">
                          <h4 class="card-chat-title">
                            <span class="material-symbols-outlined">chat</span>
                            대화
                          </h4>
                          <div class="card-messages-container">
                            ${this.state.currentSessionMessages.filter(msg => !(msg.sender_type === 'system' && (msg.metadata?.analysis === true || msg.message_type === 'analysis'))).length > 0 ? 
                              this.state.currentSessionMessages
                                .filter(msg => !(msg.sender_type === 'system' && (msg.metadata?.analysis === true || msg.message_type === 'analysis')))
                                .map(msg => `
                                  <div class="card-message ${msg.sender_type === 'user' ? 'user' : 'ai'}">
                                    <div class="card-message-bubble">
                                      ${msg.content}
                                    </div>
                                  </div>
                                `).join('')
                              : `
                                <p class="card-no-messages">대화 내용이 없습니다</p>
                              `
                            }
                          </div>
                        </div>
                      </div>
                      
                      <!-- 뒤집기 힌트 제거 -->
                    </div>
                    </div>
                  </div>
                  
                  <!-- 사진 카운터 -->
                  <div class="photo-counter">
                    ${this.state.currentPhotoIndex + 1} / ${filteredFiles.length}
                  </div>
                  
                  <!-- 플립 힌트 -->
                  <div class="flip-hint">
                    클릭해서 뒤집기
                  </div>
                </div>
              ` : `
                <div class="empty-viewer">
                  <span class="material-symbols-outlined">photo_library</span>
                  <p>사진이 없습니다</p>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    `

    this.attachEventListeners()
  }

  attachEventListeners() {
    // 필터 선택 변경
    const filterSelect = this.el.querySelector('.filter-select')
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.state.selectedFilter = e.target.value
        this.render()
      })
    }

    // 정렬 선택 변경
    const sortSelect = this.el.querySelector('.sort-select')
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value
        // 유효한 정렬 옵션인지 확인 (업로드 순 제거됨)
        const validSortOptions = ['memory_desc', 'memory_asc', 'name_asc', 'name_desc']
        if (validSortOptions.includes(selectedValue)) {
          this.state.sortBy = selectedValue
        } else {
          this.state.sortBy = 'memory_desc' // 기본값으로 설정
        }
        this.render()
      })
    }

    // 뷰 모드 변경
    const viewModeButtons = this.el.querySelectorAll('.view-mode-button')
    viewModeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const viewMode = button.getAttribute('data-view')
        this.state.viewMode = viewMode
        // 단일 모드로 변경할 때 상태 초기화
        if (viewMode === 'single') {
          this.state.currentPhotoIndex = 0
          this.state.isCardFlipped = false
        }
        this.render()
      })
    })

    // 미디어 아이템 액션 버튼
    const actionButtons = this.el.querySelectorAll('.action-button, .single-action-button, .back-action-button, .card-action-button')
    actionButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation() // 이벤트 전파 방지
        const action = button.getAttribute('data-action')
        const fileId = button.getAttribute('data-file-id')
        const sessionId = button.getAttribute('data-session-id')
        
        this.handleMediaAction(action, fileId, sessionId)
      })
    })

    // 포토 뷰어 이벤트 리스너
    if (this.state.viewMode === 'single') {
      this.attachPhotoViewerListeners()
    }

    // 미디어 아이템 클릭 (상세페이지로 이동)
    const mediaItems = this.el.querySelectorAll('.media-item')
    mediaItems.forEach(item => {
      item.addEventListener('click', (e) => {
        // 액션 버튼 클릭은 제외
        if (e.target.closest('.action-button')) {
          return
        }
        
        const fileId = item.getAttribute('data-file-id')
        const sessionId = item.getAttribute('data-session-id')
        
        // 세션 ID가 있으면 상세페이지로 이동, 없으면 기존 미리보기
        if (sessionId) {
          window.location.hash = `#/library/${sessionId}`
        } else {
          this.handleMediaAction('view', fileId)
        }
      })
    })
  }

  // 포토 뷰어 이벤트 리스너들
  attachPhotoViewerListeners() {
    // 네비게이션 버튼
    const prevButton = this.el.querySelector('.photo-nav-button.prev')
    const nextButton = this.el.querySelector('.photo-nav-button.next')
    
    if (prevButton) {
      prevButton.addEventListener('click', (e) => {
        e.preventDefault()
        this.navigatePhoto(-1)
      })
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', (e) => {
        e.preventDefault()
        this.navigatePhoto(1)
      })
    }

    // 카드 뒤집기 (모바일에서는 비활성화)
    const photoCard = this.el.querySelector('.photo-card')
    if (photoCard && !this.isMobile) {
      photoCard.addEventListener('click', (e) => {
        // 액션 버튼 클릭은 제외
        if (!e.target.closest('.back-action-button') && !e.target.closest('.card-action-button')) {
          this.flipCard()
        }
      })
    }

    // 키보드 네비게이션
    document.addEventListener('keydown', this.handleKeyNavigation.bind(this))

    // 터치/스와이프 이벤트
    this.attachSwipeListeners()
  }

  // 사진 네비게이션
  navigatePhoto(direction) {
    const filteredFiles = this.getFilteredAndSortedFiles()
    const newIndex = this.state.currentPhotoIndex + direction
    
    if (newIndex >= 0 && newIndex < filteredFiles.length) {
      this.state.currentPhotoIndex = newIndex
      this.state.isCardFlipped = false // 새 사진으로 이동 시 카드를 앞면으로
      this.render()
    }
  }

  // 카드 뒤집기
  async flipCard() {
    this.state.isCardFlipped = !this.state.isCardFlipped
    
    // 카드를 뒤집을 때 현재 사진의 세션 메시지 로드
    if (this.state.isCardFlipped) {
      const filteredFiles = this.getFilteredAndSortedFiles()
      const currentFile = filteredFiles[this.state.currentPhotoIndex]
      if (currentFile && currentFile.chat_session_id) {
        await this.loadSessionMessages(currentFile.chat_session_id)
      }
    }
    
    this.render()
  }

  // 세션 메시지 로드
  async loadSessionMessages(sessionId) {
    try {
      // 세션 정보 가져오기 (제목 포함)
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('title')
        .eq('id', sessionId)
        .single()
      
      if (!sessionError && session) {
        this.state.currentSessionTitle = session.title
      }
      
      // 메시지 가져오기
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_session_id', sessionId)
        .order('created_at', { ascending: true })

      if (!error && messages) {
        this.state.currentSessionMessages = messages
        
        // AI 분석 찾기
        const analysisMessages = messages.filter(msg => 
          msg.sender_type === 'system' &&
          (msg.metadata?.analysis === true ||
            msg.message_type === 'analysis' ||
            msg.content.includes('감정 분석') ||
            msg.content.includes('분위기') ||
            msg.content.includes('추억의 의미'))
        )
        
        if (analysisMessages.length > 0) {
          this.state.currentSessionAnalysis = this.parseAIAnalysis(analysisMessages)
        } else {
          this.state.currentSessionAnalysis = null
        }
      }
    } catch (error) {
      console.error('세션 메시지 로드 실패:', error)
    }
  }

  // AI 분석 파싱
  parseAIAnalysis(analysisMessages) {
    const analysis = {
      emotions: [],
      atmosphere: '',
      mainContent: '',
      memoryMeaning: '',
      description: '',
      fullText: ''
    }

    analysisMessages.forEach(msg => {
      const content = msg.content
      analysis.fullText += content + '\n\n'

      // 감정 분석 추출 - **감정 분석:** [텍스트] 형식
      if (content.includes('감정 분석:')) {
        const emotionLine = content.split('\n').find(line => line.includes('감정 분석:'))
        if (emotionLine) {
          // **감정 분석:** 이후의 텍스트 추출
          const emotionText = emotionLine.replace(/\*\*감정 분석:\*\*/g, '').replace(/감정 분석:/g, '').trim()
          // [대괄호] 안의 내용 추출
          const bracketMatch = emotionText.match(/\[([^\]]+)\]/)
          if (bracketMatch) {
            // 쉼표나 슬래시로 구분된 감정들을 배열로 변환
            const emotionsArray = bracketMatch[1]
              .split(/[,，、\/]/)
              .map(e => e.trim())
              .filter(e => e.length > 0)
            analysis.emotions = [...new Set([...analysis.emotions, ...emotionsArray])]
          } else {
            // 대괄호가 없는 경우 쉼표로 구분
            const emotionsArray = emotionText
              .split(/[,，、]/)
              .map(e => e.trim())
              .filter(e => e.length > 0 && e.length < 10) // 너무 긴 텍스트는 제외
            analysis.emotions = [...new Set([...analysis.emotions, ...emotionsArray])]
          }
        }
      }

      // 전체적인 분위기 추출
      if (content.includes('전체적인 분위기:') || content.includes('분위기:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('전체적인 분위기:') || line.includes('분위기:')) {
            analysis.atmosphere = line
              .replace(/\*\*전체적인 분위기:\*\*/g, '')
              .replace(/\*\*분위기:\*\*/g, '')
              .replace(/전체적인 분위기:/g, '')
              .replace(/분위기:/g, '')
              .trim()
          }
        })
      }

      // 주요 내용 추출
      if (content.includes('주요 내용:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('주요 내용:')) {
            analysis.mainContent = line
              .replace(/\*\*주요 내용:\*\*/g, '')
              .replace(/주요 내용:/g, '')
              .trim()
          }
        })
      }

      // 추억의 의미 추출
      if (content.includes('추억의 의미:')) {
        const lines = content.split('\n')
        lines.forEach(line => {
          if (line.includes('추억의 의미:')) {
            analysis.memoryMeaning = line
              .replace(/\*\*추억의 의미:\*\*/g, '')
              .replace(/추억의 의미:/g, '')
              .trim()
          }
        })
      }

      // 첫 번째 AI 메시지를 설명으로 사용 (분석 섹션들을 제외한 나머지)
      if (!analysis.description && msg.content) {
        let description = msg.content
          .split('\n')
          .filter(line => 
            !line.includes('감정 분석:') && 
            !line.includes('분위기:') &&
            !line.includes('주요 내용:') &&
            !line.includes('추억의 의미:')
          )
          .join(' ')
          .trim()
        
        if (description) {
          analysis.description = description
        }
      }
    })

    return analysis.emotions.length > 0 || analysis.atmosphere || analysis.mainContent || analysis.memoryMeaning || analysis.description ? analysis : null
  }

  // 키보드 네비게이션
  handleKeyNavigation(e) {
    if (this.state.viewMode !== 'single') return

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        this.navigatePhoto(-1)
        break
      case 'ArrowRight':
        e.preventDefault()
        this.navigatePhoto(1)
        break
      case ' ':
      case 'Enter':
        e.preventDefault()
        // 모바일에서는 카드 뒤집기 비활성화
        if (!this.isMobile) {
          this.flipCard()
        }
        break
      case 'Escape':
        e.preventDefault()
        this.state.viewMode = 'grid'
        this.render()
        break
    }
  }

  // 스와이프 이벤트
  attachSwipeListeners() {
    const photoCard = this.el.querySelector('.photo-card')
    if (!photoCard) return

    let startX = 0
    let startY = 0
    let isSwipe = false

    photoCard.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      isSwipe = false
    }, { passive: true })

    photoCard.addEventListener('touchmove', (e) => {
      if (!isSwipe) {
        const currentX = e.touches[0].clientX
        const currentY = e.touches[0].clientY
        const diffX = Math.abs(currentX - startX)
        const diffY = Math.abs(currentY - startY)
        
        // 수평 스와이프가 수직 스와이프보다 크면 스와이프로 인식
        if (diffX > diffY && diffX > 30) {
          isSwipe = true
          e.preventDefault()
        }
      }
    }, { passive: false })

    photoCard.addEventListener('touchend', (e) => {
      if (isSwipe) {
        const endX = e.changedTouches[0].clientX
        const diffX = startX - endX

        if (Math.abs(diffX) > 50) { // 최소 스와이프 거리
          if (diffX > 0) {
            // 왼쪽으로 스와이프 = 다음 사진
            this.navigatePhoto(1)
          } else {
            // 오른쪽으로 스와이프 = 이전 사진
            this.navigatePhoto(-1)
          }
        }
      }
    }, { passive: true })
  }

  handleMediaAction(action, fileId, sessionId) {

    switch (action) {
      case 'view':
        this.viewMediaFile(fileId)
        break
      case 'share':
        this.shareMediaFile(fileId)
        break
      case 'download':
        this.downloadMediaFile(fileId)
        break
      case 'chat':
        if (sessionId) {
          this.openChatSession(sessionId)
        }
        break
      case 'delete':
        this.deleteMediaFile(fileId)
        break
    }
  }

  viewMediaFile(fileId) {
    const file = this.state.mediaFiles.find(f => f.id === fileId)
    if (!file) return

    // 모달로 이미지 크게 보기 구현 (향후 개선)
    if (file.file_type?.startsWith('image/')) {
      window.open(file.file_url, '_blank')
    }
  }

  async shareMediaFile(fileId) {
    const file = this.state.mediaFiles.find(f => f.id === fileId)
    if (!file) return

    try {
      // 폴라로이드 카드 이미지 생성
      const polaroidBlob = await this.capturePolaroidCard(fileId)
      
      // 웹 공유 API 지원 확인
      if (navigator.share && navigator.canShare && polaroidBlob) {
        const polaroidFile = new File([polaroidBlob], `memory-${file.memory_index || file.id}.png`, {
          type: 'image/png'
        })
        
        if (navigator.canShare({ files: [polaroidFile] })) {
          await navigator.share({
            title: `기억 #${String(file.memory_index || '00').padStart(2, '0')}`,
            text: `MemoryMoments에서 공유한 소중한 기억`,
            files: [polaroidFile]
          })
          return
        }
      }

      // 대안: 이미지 다운로드
      this.downloadPolaroidCard(polaroidBlob, file)
      
    } catch (error) {
      console.error('폴라로이드 공유 실패:', error)
      // 기존 방식으로 fallback
      this.fallbackShare(file)
    }
  }

  fallbackShare(file) {
    // 클립보드에 URL 복사
    if (navigator.clipboard) {
      navigator.clipboard.writeText(file.file_url).then(() => {
        alert('이미지 URL이 클립보드에 복사되었습니다!')
      }).catch(() => {
        this.manualShare(file)
      })
    } else {
      this.manualShare(file)
    }
  }

  manualShare(file) {
    // 수동 공유 (URL 표시)
    const shareText = `이미지 URL을 복사하여 공유하세요:\n${file.file_url}`
    if (confirm(shareText)) {
      // 새 창에서 이미지 열기
      window.open(file.file_url, '_blank')
    }
  }

  async downloadMediaFile(fileId) {
    const file = this.state.mediaFiles.find(f => f.id === fileId)
    if (!file) return

    try {
      // 폴라로이드 카드 이미지 생성
      const polaroidBlob = await this.capturePolaroidCard(fileId)
      
      if (polaroidBlob) {
        this.downloadPolaroidCard(polaroidBlob, file)
      } else {
        // 원본 이미지 다운로드 (fallback)
        await this.downloadOriginalFile(file)
      }
      
    } catch (error) {
      console.error('폴라로이드 다운로드 실패:', error)
      // 원본 이미지 다운로드 (fallback)
      await this.downloadOriginalFile(file)
    }
  }

  async downloadOriginalFile(file) {
    try {
      const response = await fetch(file.file_url)
      const blob = await response.blob()
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.file_name || `download-${file.id}`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      window.URL.revokeObjectURL(url)
      
    } catch (error) {
      console.error('원본 파일 다운로드 실패:', error)
      window.open(file.file_url, '_blank')
    }
  }

  openChatSession(sessionId) {
    if (sessionId) {
      // 채팅 세션으로 이동
      window.location.hash = `#/chat/${sessionId}`
    }
  }

  async deleteMediaFile(fileId) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return

    try {
      // 1. 먼저 미디어 파일의 채팅 세션 ID 조회
      const { data: mediaFile, error: fetchError } = await supabase
        .from('media_files')
        .select('chat_session_id')
        .eq('id', fileId)
        .single()

      if (fetchError) {
        console.error('미디어 파일 조회 실패:', fetchError)
        alert('파일 정보를 가져오는데 실패했습니다.')
        return
      }

      // 2. 연관된 채팅 세션을 비공개로 변경
      if (mediaFile?.chat_session_id) {
        const { error: updateError } = await supabase
          .from('chat_sessions')
          .update({ is_public: false })
          .eq('id', mediaFile.chat_session_id)

        if (updateError) {
          console.error('채팅 세션 비공개 변경 실패:', updateError)
          // 경고만 표시하고 계속 진행
          console.warn('채팅 세션을 비공개로 변경하지 못했지만 파일 삭제를 계속합니다.')
        }
      }

      // 3. 미디어 파일 삭제
      const { error } = await supabase
        .from('media_files')
        .delete()
        .eq('id', fileId)

      if (error) {
        console.error('파일 삭제 실패:', error)
        alert('파일 삭제에 실패했습니다.')
      } else {
        // 현재 파일 인덱스 저장
        const currentIndex = this.state.currentPhotoIndex
        
        // 로컬 상태에서 제거
        this.state.mediaFiles = this.state.mediaFiles.filter(f => f.id !== fileId)
        
        // 단일보기 모드에서 인덱스 조정
        if (this.state.viewMode === 'single') {
          const filteredFiles = this.getFilteredAndSortedFiles()
          
          // 삭제 후 파일이 없으면 그리드 모드로 전환
          if (filteredFiles.length === 0) {
            this.state.viewMode = 'grid'
            this.state.currentPhotoIndex = 0
            this.state.isCardFlipped = false
          } else {
            // 현재 인덱스가 범위를 벗어나면 조정
            if (currentIndex >= filteredFiles.length) {
              this.state.currentPhotoIndex = filteredFiles.length - 1
            }
            // 카드가 뒤집혀 있었다면 앞면으로 되돌리기
            this.state.isCardFlipped = false
            this.state.currentSessionMessages = []
            this.state.currentSessionAnalysis = null
            this.state.currentSessionTitle = null
          }
        }
        
        this.render()
      }
    } catch (error) {
      console.error('파일 삭제 중 오류:', error)
      alert('파일 삭제에 실패했습니다.')
    }
  }

  // 폴라로이드 카드를 이미지로 캡처하는 함수
  async capturePolaroidCard(fileId) {
    try {
      // 해당 미디어 아이템 DOM 요소 찾기
      const mediaItem = this.el.querySelector(`[data-file-id="${fileId}"]`)
      if (!mediaItem) {
        console.error('미디어 아이템을 찾을 수 없습니다:', fileId)
        return null
      }

      // 캡처용 임시 요소 생성 (정방향, 테이프 없음)
      const captureElement = this.createCaptureElement(fileId)
      document.body.appendChild(captureElement)

      // html2canvas로 캡처
      const canvas = await html2canvas(captureElement, {
        backgroundColor: '#FBE8D3', // sunset-beige 배경색
        scale: 2, // 고해상도
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: 340, // 고정 너비 (늘림)
        height: 420, // 고정 높이
        scrollX: 0,
        scrollY: 0,
        windowWidth: 340,
        windowHeight: 420,
        ignoreElements: (element) => false // 모든 요소 렌더링
      })

      // 임시 요소 제거
      document.body.removeChild(captureElement)

      // Canvas를 Blob으로 변환
      return new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png', 0.9)
      })

    } catch (error) {
      console.error('폴라로이드 캡처 실패:', error)
      return null
    }
  }

  // 캡처용 깔끔한 폴라로이드 요소 생성
  createCaptureElement(fileId) {
    const file = this.state.mediaFiles.find(f => f.id === fileId)
    if (!file) return null

    const captureDiv = document.createElement('div')
    captureDiv.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 340px;
      height: 420px;
      background: radial-gradient(circle at center, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.15) 70%, rgba(255, 255, 255, 0.08) 100%);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0px;
      overflow: visible;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3);
      transform: rotate(0deg);
      box-sizing: border-box;
    `

    captureDiv.innerHTML = `
      <div style="
        position: relative;
        width: 100%;
        height: 240px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 0px;
        backdrop-filter: blur(5px);
      ">
        <img src="${file.file_url}" 
             alt="${file.file_name}" 
             style="
               width: 100%;
               height: 100%;
               object-fit: cover;
             ">
      </div>
      
      <div style="
        padding: 18px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        min-height: 80px;
        border-radius: 0px;
        box-sizing: border-box;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        justify-content: center;
      ">
        <h4 style="
          font-size: 15px;
          font-weight: 700;
          color: #87BFFF;
          line-height: 1.2;
          font-family: 'Courier New', monospace;
          letter-spacing: 0.5px;
          margin: 0;
          text-align: center;
        ">기억#${String(file.memory_index || '00').padStart(2, '0')}</h4>
        
        <p style="
          font-size: 14px;
          color: #333333;
          line-height: 1.4;
          font-style: italic;
          opacity: 0.9;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
        ">${this.generateCaption(file.id || file.memory_index || 1)}</p>
        
        <p style="
          font-size: 14px;
          color: #666666;
          margin: 0;
          line-height: 1.3;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
        ">${this.formatDate(file.created_at)}</p>
      </div>
      
      <div style="
        position: absolute;
        bottom: 12px;
        left: 0;
        right: 0;
        text-align: center;
        padding: 0 20px;
        box-sizing: border-box;
      ">
        <div style="
          font-size: 11px;
          color: #666666;
          opacity: 0.6;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-weight: 300;
        ">MemoryMoments</div>
      </div>
    `

    return captureDiv
  }

  // 폴라로이드 이미지 다운로드
  downloadPolaroidCard(blob, file) {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `memory-${String(file.memory_index || '00').padStart(2, '0')}-polaroid.png`
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    window.URL.revokeObjectURL(url)
  }

  // 외부에서 호출할 수 있는 새로고침 메소드
  refresh() {
    if (this.state.isAuthenticated) {
      this.loadMediaFiles()
    }
  }

  // 컴포넌트 초기화 (mount 메서드 대신)
  initialize() {
    // 초기화 시 인증 상태 다시 확인하고 데이터 로드
    this.initializeAuthState()
    if (this.state.isAuthenticated) {
      this.loadMediaFiles()
    }
  }
}
