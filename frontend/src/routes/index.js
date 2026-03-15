import { createRouter } from '../core'
import Home from './Home'
import ChatHistory from './ChatHistory'
import Library from './Library'

export default createRouter([
  { path: '#/', component: Home },
  { path: '#/library', component: Library },
  { path: '#/chat/:sessionId', component: ChatHistory }
])