import { Store } from '../core'
import { onAuthStateChange, getCurrentUser } from '../services/supabase'

// 인증 관련 전역 상태 관리
export const authStore = new Store({
  user: null,
  isLoading: true, // true로 변경 (초기화 기다림)
  isAuthenticated: false,
  error: null
})

// 인증 상태 초기화
export const initAuth = async () => {
  authStore.state.isLoading = true

  try {
    const { user, error } = await getCurrentUser()

    if (error) {
      authStore.state.error = error.message
      authStore.state.user = null
      authStore.state.isAuthenticated = false
    } else {
      authStore.state.user = user
      authStore.state.isAuthenticated = !!user
      authStore.state.error = null
    }

    onAuthStateChange((event, session) => {
      authStore.state.user = session?.user || null
      authStore.state.isAuthenticated = !!session?.user
      authStore.state.error = null
      authStore.state.isLoading = false

      if (event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
        setTimeout(() => {
          window.history.replaceState({}, document.title, '#/')
        }, 500)
      }
    })

  } catch (error) {
    console.error('Auth initialization error:', error)
    authStore.state.error = error.message
    authStore.state.user = null
    authStore.state.isAuthenticated = false
  } finally {
    authStore.state.isLoading = false
  }
}

// 인증 관련 헬퍼 함수들
export const getAuthUser = () => authStore.state.user
export const isAuthenticated = () => authStore.state.isAuthenticated
export const isAuthLoading = () => authStore.state.isLoading

