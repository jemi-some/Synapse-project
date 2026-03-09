import { createRouter } from '../core'
import Home from './Home'
import ChatHistory from './ChatHistory'
import Library from './Library'
import LibraryDetail from './LibraryDetail'

export default createRouter([
  { path: '#/', component: Home },
  { path: '#/library', component: Library },
  { path: '#/library/:sessionId', component: LibraryDetail },
  { path: '#/chat/:sessionId', component: ChatHistory }
])