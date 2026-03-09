import { Component } from '../core'
import CameraButton from '../components/CameraButton'
import { imageStore } from '../store/images'
import { analyzeImage, analyzeImageWithMetadata } from '../services/openai'
import { supabase, addMessage, updateChatSession } from '../services/supabase'

export default class Home extends Component {
  constructor() {
    super({
      state: {
        currentImage: null
      }
    })
    this.cameraButton = null
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
    // 중복 호출 방지
    if (this.isAnalyzing) {
      console.log('⚠️ AI 분석 이미 진행 중 - 함수 내부에서 스킵')
      return
    }

    // 즉시 플래그 설정으로 중복 호출 방지
    this.isAnalyzing = true
    console.log('🚀 AI 분석 시작:', imageUrl, imageObject)
    
    // ChatInput은 나중에 사진 컨텍스트와 함께 활성화됨
    const chatInput = window.app?.chatInput

    // ChatBubbles 가져오기
    const chatBubbles = window.app?.chatBubbles
    if (!chatBubbles) {
      console.error('❌ ChatBubbles를 찾을 수 없습니다')
      this.isAnalyzing = false // 플래그 해제
      return
    }

    console.log('📱 로딩 버블 표시 준비')
    // 이미지 로드 완료를 기다린 후 로딩 버블 표시
    this.waitForImageLoad(() => {
      // 로딩 버블 표시 전 한번 더 체크
      if (this.isAnalyzing) {
        console.log('⏳ 로딩 버블 표시')
        chatBubbles.showLoadingBubble()
      } else {
        console.log('⚠️ 분석이 이미 완료되어 로딩 버블 스킵')
      }
    })

    try {
      // 메타데이터와 함께 이미지 분석
      if (imageObject?.aesthetic) {
        console.log('🧠 메타데이터와 함께 AI 분석 실행')
        console.log('📤 Edge Function으로 전달할 메타데이터:', imageObject.aesthetic)
        const analysisResult = await analyzeImageWithMetadata(imageUrl, imageObject.aesthetic)
        console.log('✅ AI 분석 완료:', analysisResult)
        
        // 분석 결과에서 AI 응답과 문맥 정보 추출
        const description = analysisResult.description || analysisResult.response || ''
        const question = analysisResult.question || ''
        const contextInfo = analysisResult.context
        
        // description과 첫 번째 질문만 합쳐서 AI 응답 생성
        let aiResponse = description
        if (question) {
          aiResponse += '\n\n' + question
        }
        
        console.log('💬 생성된 AI 응답:', aiResponse)
        
        // 문맥 정보를 DB에 저장
        if (contextInfo && imageObject.chatSessionId) {
          await this.saveContextToDatabase(imageObject.chatSessionId, contextInfo, analysisResult)
        }
        
        // AI 응답을 채팅 메시지로 저장
        if (imageObject.chatSessionId && aiResponse) {
          await this.saveAIMessage(imageObject.chatSessionId, aiResponse)
        }
        
        // ChatInput에 사진 컨텍스트 정보 전달
        if (chatInput && imageObject.chatSessionId) {
          const photoContext = {
            metadata: imageObject.aesthetic,
            firstAnalysis: analysisResult,
            imageUrl: imageUrl
          }
          chatInput.enableChatting(imageObject.chatSessionId, photoContext)
        }

        // 새 채팅 세션이 생성되었으므로 사이드바 목록 갱신
        const sidebar = window.app?.sidebar
        if (sidebar) {
          sidebar.refreshChatSessions()
        }
        
        // 로딩 버블을 실제 AI 응답으로 교체
        console.log('🎬 AI 응답 스트리밍 시작')
        chatBubbles.hideLoadingAndStartResponse(aiResponse)
        
      } else {
        console.log('🧠 기본 AI 분석 실행 (메타데이터 없음)')
        // 기존 방식 (메타데이터 없을 때)
        const analysisPrompt = "이 이미지를 보고 짧게 설명해주세요. 그리고 이 사진에 대해 물어볼 수 있는 질문도 제안해주세요."
        const analysis = await analyzeImage(imageUrl, analysisPrompt)
        console.log('✅ 기본 AI 분석 완료:', analysis)
        
        // 로딩 버블을 실제 AI 응답으로 교체
        console.log('🎬 AI 응답 스트리밍 시작 (기본)')
        chatBubbles.hideLoadingAndStartResponse(analysis)
      }
      
    } catch (error) {
      console.error('❌ 이미지 분석 실패:', error)
      
      // 오류 시 기본 메시지로 교체
      const fallbackMessage = "멋진 사진이네요! 이 사진에 대해 이야기해보고 싶어요. 어떤 순간인지 알려주세요!"
      console.log('🔄 폴백 메시지 표시:', fallbackMessage)
      chatBubbles.hideLoadingAndStartResponse(fallbackMessage)
    } finally {
      // AI 분석 완료 - 플래그 해제
      this.isAnalyzing = false
      console.log('🔓 AI 분석 완료 - 플래그 해제')
    }
  }

  // 분석된 문맥 정보를 DB에 저장
  async saveContextToDatabase(chatSessionId, contextInfo, analysisResult) {
    try {
      // media_files 테이블에서 해당 채팅 세션의 파일 찾기
      const { data: mediaFiles, error: findError } = await supabase
        .from('media_files')
        .select('id')
        .eq('chat_session_id', chatSessionId)
        .limit(1)
      
      if (findError) {
        console.error('미디어 파일 찾기 실패:', findError)
        return
      }
      
      if (mediaFiles && mediaFiles.length > 0) {
        const mediaFile = mediaFiles[0]
        const normalizedQuestions = Array.isArray(analysisResult.questions)
          ? analysisResult.questions
          : analysisResult.question
            ? [analysisResult.question]
            : []

        const aiAnalysisData = {
          description: analysisResult.description,
          context: contextInfo,
          questions: normalizedQuestions,
          analysis_timestamp: new Date().toISOString()
        }
        
        // ai_analysis 필드 업데이트
        const { error: updateError } = await supabase
          .from('media_files')
          .update({ ai_analysis: aiAnalysisData })
          .eq('id', mediaFile.id)
        
        if (updateError) {
          console.error('AI 분석 결과 저장 실패:', updateError)
        }
      }
    } catch (error) {
      console.error('AI 분석 결과 저장 중 오류:', error)
    }
  }

  // AI 메시지를 데이터베이스에 저장
  async saveAIMessage(chatSessionId, content) {
    try {
      // AI 메시지 저장
      const { data, error } = await addMessage(
        chatSessionId, 
        content, 
        'text', 
        'assistant'
      )
      
      if (error) {
        console.error('AI 메시지 저장 실패:', error)
        return
      }

      // 채팅 세션의 last_message_at 업데이트
      await updateChatSession(chatSessionId, {
        last_message_at: new Date().toISOString()
      })

    } catch (error) {
      console.error('AI 메시지 저장 중 오류:', error)
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
      // 이미지가 없을 때 - 기본 홈 화면
      this.el.innerHTML = `
        <div class="home-container">
          <div class="camera-area">
            <!-- CameraButton 컴포넌트가 여기에 추가됨 -->
          </div>
        </div>
      `
      
      // CameraButton 컴포넌트 생성 및 추가
      const cameraArea = this.el.querySelector('.camera-area')
      if (cameraArea) {
        this.cameraButton = new CameraButton()
        cameraArea.appendChild(this.cameraButton.el)
      }
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
