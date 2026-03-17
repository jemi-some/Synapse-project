import { Component } from '../core'

export default class Home extends Component {
  constructor() {
    super()
    console.log('[Home] 메인 화면 로드 - 채팅이 메인 콘텐츠')
  }

  render() {
    // ChatGPT처럼 채팅이 메인!
    // router-view는 비어있고, chat-section이 표시됨
    this.el.innerHTML = ''
  }
}
