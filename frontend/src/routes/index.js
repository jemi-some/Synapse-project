import { createRouter } from '../core'
import Home from './Home'
import Library from './Library'
// import Thread from './Thread'  // TODO: 스레드 컴포넌트 생성 예정

export default createRouter([
  { path: '#/', component: Home },  // 메인: 비어있음 (채팅이 메인)
  { path: '#/library', component: Library }  // 라이브러리: 사진 갤러리
  // { path: '#/thread/:id', component: Thread }  // TODO: 스레드 전체화면
])