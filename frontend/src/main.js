import App from './App'
import router from './routes'
import { initAuth } from './store/auth'

const root = document.querySelector('#root')
root.append(new App().el)

// 라우터 먼저 초기화
router()

// 인증 시스템 초기화 (라우터 초기화 후)
initAuth()