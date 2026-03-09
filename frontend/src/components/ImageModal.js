import { Component } from '../core'
import { imageStore } from '../store/images'

export default class ImageModal extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isVisible: false,
        currentImage: null
      }
    })
    
    this.el.className = 'image-modal'
    this.handleClose = this.handleClose.bind(this)
    this.handleOverlayClick = this.handleOverlayClick.bind(this)
    this.handleKeyPress = this.handleKeyPress.bind(this)
    
    // 이미지 스토어 구독
    imageStore.subscribe('modalVisible', (visible) => {
      if (this.state.isVisible !== visible) {
        this.state.isVisible = visible
        if (visible) {
          this.show()
        } else {
          this.hide()
        }
      }
    })
    
    imageStore.subscribe('currentImage', (image) => {
      if (this.state.currentImage !== image) {
        this.state.currentImage = image
        this.render()
      }
    })
    
    // ESC 키 이벤트 리스너 추가
    document.addEventListener('keydown', this.handleKeyPress)
  }

  render() {
    const { isVisible, currentImage } = this.state
    
    if (!currentImage) {
      this.el.innerHTML = ''
      return
    }
    
    this.el.innerHTML = `
      <div class="modal-overlay ${isVisible ? 'visible' : ''}">
        <div class="modal-content">
          <button class="modal-close" aria-label="모달 닫기">×</button>
          <div class="image-container">
            <img src="${currentImage.url}" 
                 alt="업로드된 이미지"
                 class="modal-image">
          </div>
          <div class="image-info">
            <p class="image-name">${currentImage.metadata.name}</p>
            <p class="image-size">${this.formatFileSize(currentImage.metadata.size)}</p>
          </div>
        </div>
      </div>
    `
    
    // 이벤트 리스너 추가
    const overlay = this.el.querySelector('.modal-overlay')
    const closeButton = this.el.querySelector('.modal-close')
    
    if (overlay) {
      overlay.addEventListener('click', this.handleOverlayClick)
    }
    
    if (closeButton) {
      closeButton.addEventListener('click', this.handleClose)
    }
  }

  show() {
    this.render()
    this.el.style.display = 'block'
    document.body.style.overflow = 'hidden'
    
    // 포커스 설정
    setTimeout(() => {
      const closeButton = this.el.querySelector('.modal-close')
      if (closeButton) {
        closeButton.focus()
      }
    }, 100)
  }

  hide() {
    this.el.style.display = 'none'
    document.body.style.overflow = ''
  }

  handleClose() {
    imageStore.hideModal()
  }

  handleOverlayClick(event) {
    if (event.target.classList.contains('modal-overlay')) {
      this.handleClose()
    }
  }

  handleKeyPress(event) {
    if (event.key === 'Escape' && this.state.isVisible) {
      this.handleClose()
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}