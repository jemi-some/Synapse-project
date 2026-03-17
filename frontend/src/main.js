import App from './App'
import { initAuth } from './store/auth'

const root = document.querySelector('#root')
root.append(new App().el)

// 인증 시스템 초기화
initAuth()