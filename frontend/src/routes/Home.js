import { Component } from '../core'
import { imageStore } from '../store/images'
import { vectorize } from '../services/openai'
import { supabase } from '../services/supabase'

export default class Home extends Component {
  constructor() {
    super({
      state: {
        currentImage: null
      }
    })
    this.isAnalyzing = false // AI 분석 중복 방지 플래그
    this.lastAnalyzedImageUrl = null // 마지막으로 분석한 이미지 URL 저장

    // Home 컴포넌트가 로드될 때 채팅창 다시 보이기
    setTimeout(() => {
      const chatInput = window.app?.chatInput
      if (chatInput) {
        chatInput.show()
      }
    }, 0)

    // 이미지 스토어 구독 (중복 방지)
    this.imageSubscriptionCallback = (image) => {
      console.log('📢 imageSubscriptionCallback 호출됨:', {
        새로운이미지: image?.url || 'null',
        현재이미지: this.state.currentImage?.url || 'null',
        isAnalyzing: this.isAnalyzing,
        lastAnalyzedImageUrl: this.lastAnalyzedImageUrl,
        스택트레이스: new Error().stack.split('\n').slice(1, 4).map(line => line.trim())
      })

      if (this.state.currentImage !== image) {
        this.state.currentImage = image
        this.render()

        // 새 이미지가 업로드되면 AI 분석 시작 (백그라운드에서)
        if (image && image.url && !this.isAnalyzing && this.lastAnalyzedImageUrl !== image.url) {
          console.log('🔒 AI 분석 시작 (중복 방지 체크 통과)')
          this.lastAnalyzedImageUrl = image.url
          this.analyzeImageWithAI(image.url, image)
        } else if (this.isAnalyzing) {
          console.log('⚠️ AI 분석 이미 진행 중 - 스킵')
        } else if (image && image.url && this.lastAnalyzedImageUrl === image.url) {
          console.log('⚠️ 이미 분석된 이미지 - 스킵:', image.url)
        }

        // 이미지가 null로 초기화된 경우 (새채팅 시작)
        if (!image) {
          console.log('🔄 이미지 초기화 - 분석 상태 리셋')
          this.resetAnalysisState()
        }
      } else {
        console.log('⏭️ 동일한 이미지로 상태 변경 없음')
      }
    }

    imageStore.subscribe('currentImage', this.imageSubscriptionCallback)
  }

  // 분석 기록 초기화 메서드
  resetAnalysisState() {
    this.isAnalyzing = false
    this.lastAnalyzedImageUrl = null
    console.log('🔄 AI 분석 상태 초기화')
  }

  async analyzeImageWithAI(imageUrl, imageObject) {
    if (this.isAnalyzing) {
      console.log('⚠️ AI 분석 이미 진행 중 - 함수 내부에서 스킵')
      return
    }

    this.isAnalyzing = true
    console.log('🚀 AI 분석 시작:', imageUrl, imageObject)

    const chatInput = window.app?.chatInput
    const chatBubbles = window.app?.chatBubbles

    if (!chatBubbles) {
      console.error('❌ ChatBubbles를 찾을 수 없습니다')
      this.isAnalyzing = false
      return
    }

    try {
      const memoryId = imageObject?.memoryId || null
      const metadata = imageObject?.aesthetic || {}

      // AI 응답: 메타데이터에서 추출한 장소와 날짜만 즉시 표시
      const locationText = metadata?.gps?.shortAddress || metadata?.gps?.address || '위치 정보 없음'
      const dateText = metadata?.dateTime?.original
        ? new Date(metadata.dateTime.original).toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '시간 정보 없음'

      const aiResponse = `📍 ${locationText}\n🕒 ${dateText}`

      // 메타데이터 기반 응답을 즉시 표시 (로딩 없이)
      console.log('💬 메타데이터 기반 응답 즉시 표시')
      chatBubbles.showAIMessage(aiResponse)

      if (chatInput && imageObject.chatSessionId) {
        const photoContext = {
          metadata: metadata,
          firstAnalysis: null, // 백그라운드에서 처리될 예정
          imageUrl: imageUrl
        }
        chatInput.enableChatting(imageObject.chatSessionId, photoContext)
      }

      const sidebar = window.app?.sidebar
      if (sidebar) {
        sidebar.refreshChatSessions()
      }

      // 백엔드 벡터화는 백그라운드에서 비동기로 실행 (응답을 기다리지 않음)
      console.log('🧠 백엔드 벡터화 파이프라인 백그라운드 실행')
      vectorize(imageUrl, memoryId, metadata, '').then(vectorResult => {
        console.log('✅ 백엔드 분석 완료 (백그라운드):', vectorResult)
      }).catch(error => {
        console.error('⚠️ 백엔드 벡터화 실패 (백그라운드):', error)
      })

    } catch (error) {
      console.error('❌ 이미지 분석 실패:', error)
      const fallbackMessage = "작업 처리 중 문제가 발생했습니다."
      chatBubbles.hideLoadingAndStartResponse(fallbackMessage)
    } finally {
      this.isAnalyzing = false
      console.log('🔓 AI 분석 완료 - 플래그 해제')
    }
  }

  waitForImageLoad(callback) {
    // render()가 완료된 후에 이미지 로드 상태 확인
    setTimeout(() => {
      const imgElement = this.el.querySelector('.full-view-image')
      if (imgElement) {
        if (imgElement.complete && imgElement.naturalHeight !== 0) {
          // 이미지가 이미 로드된 경우 즉시 콜백 실행
          callback()
        } else {
          // 이미지 로드 대기
          imgElement.onload = () => {
            callback()
          }
          // 로드 실패 시에도 콜백 실행
          imgElement.onerror = () => {
            callback()
          }
        }
      } else {
        // imgElement가 없는 경우 약간 더 기다렸다가 재시도
        setTimeout(() => {
          callback()
        }, 100)
      }
    }, 50) // DOM 업데이트 대기
  }

  render() {
    const { currentImage } = this.state

    if (currentImage) {
      // 이미지가 있을 때 - router-view 전체에 이미지 표시
      this.el.innerHTML = `
        <div class="image-display-container">
          <div class="background-blur" style="background-image: url('${currentImage.url}')"></div>
          <img src="${currentImage.url}" 
               alt="업로드된 이미지" 
               class="full-view-image">
        </div>
      `
    } else {
      // 이미지가 없으면 별도의 컨테이너를 렌더링하지 않아 채팅 레이아웃이 전체 화면을 사용하도록 유지
      this.el.innerHTML = ''
    }
  }

  // 컴포넌트 파괴 시 구독 해제
  destroy() {
    if (this.imageSubscriptionCallback) {
      imageStore.unsubscribe('currentImage', this.imageSubscriptionCallback)
      console.log('🔌 Home 컴포넌트 구독 해제 완료')
    }
  }
}
