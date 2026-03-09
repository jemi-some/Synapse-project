import { Component } from '../core'
import LibraryScreen from '../components/LibraryScreen'

export default class Library extends Component {
  constructor() {
    super({
      tagName: 'div'
    })
    
    this.el.className = 'library-route'
  }

  render() {
    // 이미 생성된 LibraryScreen 인스턴스가 있으면 재사용
    if (!this.libraryScreen) {
      this.libraryScreen = new LibraryScreen()
    }
    
    // DOM이 비어있을 때만 추가 (중복 추가 방지)
    if (!this.el.contains(this.libraryScreen.el)) {
      this.el.append(this.libraryScreen.el)
    }
    
    // 채팅 입력창과 채팅 버블 숨기기
    this.hideChatComponents()
    
    // 컴포넌트가 렌더링된 후에 초기화 보장
    setTimeout(() => {
      if (this.libraryScreen && this.libraryScreen.initialize) {
        this.libraryScreen.initialize()
      }
    }, 10)
  }
  
  hideChatComponents() {
    const hideComponents = () => {
      // 채팅 입력창 숨기기 - ChatInput의 hide() 메서드 사용
      const chatInput = window.app?.chatInput
      if (chatInput && chatInput.hide) {
        chatInput.hide()
      }

      // 채팅 버블은 라우터에서 이미 초기화됨
      const chatBubbles = window.app?.chatBubbles
      if (chatBubbles) {
        chatBubbles.el.style.display = 'none' // 라이브러리에서는 완전 숨김
      }
    }

    // 즉시 실행
    hideComponents()

    // 약간의 지연 후에도 다시 실행 (DOM 업데이트 확실히 하기 위해)
    setTimeout(hideComponents, 50)
    setTimeout(hideComponents, 200)
  }
  
  // 컴포넌트가 제거될 때 채팅 컴포넌트들 다시 표시 및 정리
  destroy() {

    // 채팅 컴포넌트들 다시 표시 - ChatInput의 show() 메서드 사용
    const chatInput = window.app?.chatInput
    if (chatInput && chatInput.show) {
      chatInput.show()
    }

    const chatBubbles = window.app?.chatBubbles
    if (chatBubbles) {
      chatBubbles.el.style.display = ''
    }

    // LibraryScreen 인스턴스 정리 (필요시 구독 해제 등)
    if (this.libraryScreen && this.libraryScreen.destroy) {
      this.libraryScreen.destroy()
    }
    this.libraryScreen = null
  }
}