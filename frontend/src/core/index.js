////// Component //////
export class Component {
  constructor(payload = {}) {
    const {
      tagName = 'div',
      state = {},
      props = {}
    } = payload
    this.el = document.createElement(tagName)
    this.state = state
    this.props = props
    this.render()
  }
  render() {
  }
}

////// Router //////
function routeRender(routes) {
  if (!location.hash) {
    history.replaceState(null, '', '/#/')
  }

  const routerView = document.querySelector('router-view')
  const [hash, queryString = ''] = location.hash.split('?')

  const query = queryString.split('&').reduce((acc, cur) => {
    const [key, value] = cur.split('=')
    acc[key] = value
    return acc
  }, {})
  history.replaceState(query, '')

  // OAuth 리디렉트 URL 처리: access_token이 포함된 해시는 기본 라우트로 처리
  let routeHash = hash
  if (hash.includes('access_token') || hash.includes('refresh_token')) {
    routeHash = '#/'
  }

  // URL 파라미터 처리를 위한 라우트 매칭
  let currentRoute = null
  let params = {}

  for (const route of routes) {
    const routePattern = route.path.replace(/:([^\/]+)/g, '([^\/]+)')
    const routeRegex = new RegExp(`^${routePattern}/?$`)
    const match = routeHash.match(routeRegex)

    if (match) {
      currentRoute = route

      // 파라미터 추출
      const paramNames = route.path.match(/:([^\/]+)/g)
      if (paramNames) {
        paramNames.forEach((paramName, index) => {
          const key = paramName.substring(1) // ':' 제거
          params[key] = match[index + 1]
        })
      }
      break
    }
  }

  // 라우트 변경 시 현재 세션 AI 분석 트리거 (비동기 실행)
  triggerSessionAnalysis(routeHash).catch(error => {
    console.error('세션 분석 트리거 실패:', error)
  })

  // 모든 라우트 변경 시 채팅 버블 완전 초기화
  const chatBubbles = window.app?.chatBubbles
  if (chatBubbles) {
    chatBubbles.hideBubbles()
    chatBubbles.stopLoadingMessages() // 로딩 메시지도 정리
  }

  // 홈 페이지가 아닌 다른 화면으로 이동할 때 분석 버튼 숨김
  // const analyzeButton = window.app?.analyzeButton
  // if (analyzeButton && routeHash !== '#/') {
  //   analyzeButton.hide()
  // }

  // 이전 컴포넌트 정리
  const existingComponents = routerView.children
  if (existingComponents.length > 0) {
    Array.from(existingComponents).forEach(element => {
      // 컴포넌트 인스턴스가 있다면 destroy 메서드 호출
      if (element._componentInstance && typeof element._componentInstance.destroy === 'function') {
        element._componentInstance.destroy()
      }
    })
  }

  routerView.innerHTML = ''

  if (currentRoute && currentRoute.component) {
    const componentInstance = new currentRoute.component()

    // 컴포넌트 인스턴스를 DOM 요소에 참조로 저장
    componentInstance.el._componentInstance = componentInstance

    // 파라미터가 있으면 컴포넌트에 전달
    if (Object.keys(params).length > 0) {
      componentInstance.params = params

      // ChatHistory 컴포넌트의 경우 세션 로드
      if (currentRoute.component.name === 'ChatHistory' && params.sessionId) {
        setTimeout(() => {
          componentInstance.loadSession(params.sessionId)
        }, 0)
      }
    }

    // mount() 메서드가 있는 모든 컴포넌트는 자동으로 호출
    if (componentInstance.mount && typeof componentInstance.mount === 'function') {
      setTimeout(() => {
        componentInstance.mount()
      }, 0)
    }

    routerView.append(componentInstance.el)
  } else {
    // 라우트를 찾을 수 없는 경우 기본 라우트로 리디렉트  
    console.warn('Route not found:', hash, 'Available routes:', routes.map(r => r.path))
    const defaultRoute = routes[0]
    if (defaultRoute) {
      history.replaceState(null, '', defaultRoute.path)
      routerView.append(new defaultRoute.component().el)
    } else {
      routerView.innerHTML = '<h1>페이지를 찾을 수 없습니다</h1>'
    }
  }

  // 이전 라우트 업데이트
  previousRoute = routeHash || window.location.hash || '#/'

  window.scrollTo(0, 0)
}

// 이전 라우트를 저장하기 위한 변수
let previousRoute = window.location.hash || '#/'


////// AI 세션 분석 트리거 함수 //////
async function triggerSessionAnalysis(newRoute) {
  console.log('🔍 AI 분석 트리거 체크:', {
    previousRoute: previousRoute,
    newRoute: newRoute,
    condition: (previousRoute === '#/' || previousRoute === '') && newRoute !== '#/' && newRoute !== ''
  })

  // 홈에서 다른 페이지로 이동할 때 분석
  if ((previousRoute === '#/' || previousRoute === '') && newRoute !== '#/' && newRoute !== '') {
    const currentSessionId = window.app?.currentSessionId
    console.log('📍 현재 세션 ID:', currentSessionId)

    if (currentSessionId) {
      console.log('🚀 세션 분석 시작:', currentSessionId)

      try {
        // 현재 세션의 메시지 수 확인
        const { getMessages } = await import('../services/supabase')
        const { data: allMessages, error } = await getMessages(currentSessionId, { includeAnalysis: true })

        if (error) {
          console.error('메시지 로드 오류:', error)
          return
        }



        const textMessages = allMessages?.filter(msg => msg.message_type === 'text') || []
        const analysisMessages = (allMessages || []).filter(msg =>
          msg.sender_type === 'system' &&
          (msg.metadata?.analysis === true ||
            msg.message_type === 'analysis' ||
            msg.content.includes('감정 분석') ||
            msg.content.includes('분위기') ||
            msg.content.includes('추억의 의미'))
        )

        const messageCount = textMessages?.length || 0
        const totalCount = messageCount

        console.log('💬 메시지 개수:', messageCount)
        console.log('📊 총 콘텐츠 개수:', totalCount)

        // 총 콘텐츠가 2개 이상 있고, AI 분석이 아직 없는 경우에만 분석
        if (totalCount >= 2) {
          const hasAnalysis = analysisMessages.length > 0

          console.log('🔎 기존 분석 존재 여부:', hasAnalysis)

          if (!hasAnalysis) {
            console.log('✨ AI 분석 실행 중...')
            const result = await performSessionAnalysis(currentSessionId, textMessages)
            if (result) {
              console.log('✅ AI 분석 성공!')
            } else {
              console.log('❌ AI 분석 실패')
            }
          } else {
            console.log('⏭️ 이미 분석 완료된 세션')
          }
        } else {
          console.log('⚠️ 메시지가 충분하지 않음 (최소 2개 필요)')
        }
      } catch (error) {
        console.error('세션 분석 실패:', error)
      }
    } else {
      console.log('⚠️ 현재 세션 ID가 없음')
    }
  } else {
    console.log('⏭️ 분석 조건 불만족')
  }
}

////// 실제 AI 분석 수행 //////
async function performSessionAnalysis(sessionId, messages) {
  const { addMessage, updateChatSession, supabase } = await import('../services/supabase')
  const { generateSessionSummary } = await import('../services/openai')

  const conversationMessages = []

  messages.forEach(msg => {
    if (msg.sender_type === 'user') {
      conversationMessages.push({ role: 'user', content: msg.content })
    } else if (msg.sender_type === 'assistant') {
      conversationMessages.push({ role: 'assistant', content: msg.content })
    }
  })



  if (conversationMessages.length === 0) {
    console.warn('세션 분석을 위한 대화 내용이 없습니다.')
    return null
  }
  let photoContext = null
  let mediaFileId = null
  let existingAIAnalysis = null
  try {
    const { data: mediaFile } = await supabase
      .from('media_files')
      .select('id, metadata, ai_analysis')
      .eq('chat_session_id', sessionId)
      .maybeSingle()

    if (mediaFile) {
      mediaFileId = mediaFile.id || null
      existingAIAnalysis = mediaFile.ai_analysis || null
      photoContext = {
        metadata: mediaFile.metadata || null,
        firstAnalysis: mediaFile.ai_analysis || null
      }
    }
  } catch (error) {
    console.error('사진 컨텍스트 로드 실패:', error)
  }

  try {
    const summary = await generateSessionSummary(conversationMessages, photoContext)

    const emotionText = summary.emotions.length > 0
      ? `[${summary.emotions.join(', ')}]`
      : '[감정 정보 부족]'

    const rawAtmosphere = summary.summaryText?.trim() || ''
    const atmosphereText = rawAtmosphere || '전체적인 분위기를 파악하지 못했어요.'

    const rawMainContent = summary.topics.length > 0
      ? summary.topics.join(', ')
      : summary.interests.length > 0
        ? summary.interests.join(', ')
        : ''
    const mainContentText = rawMainContent || '주요 내용을 파악하기 위해 더 많은 이야기가 필요해요.'

    const rawMemoryMeaning = summary.photoPreferences || summary.emotionalTone || ''
    const memoryMeaningText = rawMemoryMeaning || '이 순간이 어떤 의미인지 조금 더 들려주세요.'

    const analysisLines = [
      `**감정 분석:** ${emotionText}`,
      `**전체적인 분위기:** ${atmosphereText}`,
      `**주요 내용:** ${mainContentText}`,
      `**추억의 의미:** ${memoryMeaningText}`
    ]

    const analysisResult = analysisLines.join('\n')

    const deriveTitle = () => {
      const candidates = [
        summary.topics[0],
        summary.interests[0],
        summary.summaryText
      ].filter(Boolean)

      for (const candidate of candidates) {
        const trimmed = candidate.replace(/\s+/g, ' ').trim()
        if (trimmed.length > 0) {
          return trimmed.slice(0, 10)
        }
      }

      return '새로운 추억'
    }

    const title = deriveTitle()

    await updateChatSession(sessionId, {
      title,
      last_message_at: new Date().toISOString()
    })

    await addMessage(sessionId, analysisResult, 'text', 'system', {
      analysis: true,
      summary
    })

    if (mediaFileId) {
      const existing = (existingAIAnalysis && typeof existingAIAnalysis === 'object') ? existingAIAnalysis : {}
      const normalizedQuestions = Array.isArray(summary.questions) && summary.questions.length > 0
        ? summary.questions
        : Array.isArray(existing.questions) ? existing.questions : []

      const contextText = rawAtmosphere || existing.context || summary.summaryText || ''
      const descriptionText = rawMemoryMeaning || rawMainContent || summary.summaryText || existing.description || ''

      const aiAnalysisPayload = {
        context: contextText,
        questions: normalizedQuestions,
        description: descriptionText,
        analysis_timestamp: new Date().toISOString()
      }

      try {
        const { error: mediaUpdateError } = await supabase
          .from('media_files')
          .update({ ai_analysis: aiAnalysisPayload })
          .eq('id', mediaFileId)

        if (mediaUpdateError) {
          console.error('AI 분석 결과 media_files 업데이트 실패:', mediaUpdateError)
        }
      } catch (mediaError) {
        console.error('AI 분석 결과 media_files 저장 중 오류:', mediaError)
      }
    }

    console.log('세션 분석 완료:', sessionId, '제목:', title)
    return analysisResult
  } catch (error) {
    console.error('AI 분석 실패:', error)
    return null
  }
}

////// 수동 AI 분석을 위한 전역 함수 //////
window.manualAnalysis = async (sessionId) => {
  try {
    console.log('수동 AI 분석 시작:', sessionId)

    // 세션의 메시지들과 일기 엔트리 가져오기
    const { getMessages } = await import('../services/supabase')
    const { data: allMessages, error } = await getMessages(sessionId, { includeAnalysis: true })

    if (error) {
      console.error('메시지 로드 실패:', error)
      return false
    }



    const textMessages = allMessages?.filter(msg => msg.message_type === 'text') || []
    const analysisMessages = (allMessages || []).filter(msg =>
      msg.sender_type === 'system' &&
      (msg.metadata?.analysis === true ||
        msg.message_type === 'analysis' ||
        msg.content.includes('감정 분석') ||
        msg.content.includes('분위기') ||
        msg.content.includes('추억의 의미'))
    )

    const messageCount = textMessages.length
    const totalCount = messageCount

    console.log('💬 메시지 개수:', messageCount)
    console.log('📊 총 콘텐츠 개수:', totalCount)

    if (totalCount < 2) {
      console.log('분석할 콘텐츠가 충분하지 않습니다. (최소 2개 필요)')
      return false
    }

    // 이미 분석이 있는지 확인
    const hasAnalysis = analysisMessages.length > 0

    if (hasAnalysis) {
      console.log('이미 AI 분석이 존재합니다.')
      return false
    }

    // AI 분석 실행
    const result = await performSessionAnalysis(sessionId, textMessages)

    if (result) {
      console.log('AI 분석 결과:', result)
      return true
    } else {
      console.log('AI 분석 실패')
      return false
    }

  } catch (error) {
    console.error('수동 분석 오류:', error)
    return false
  }
}


export function createRouter(routes) {
  return function () {
    window.addEventListener('popstate', () => {
      routeRender(routes)
    })
    routeRender(routes)
  }
}

////// Store //////
export class Store {
  constructor(state) {
    this.state = {}
    this.observers = {}
    for (const key in state) {
      Object.defineProperty(this.state, key, {
        get: () => state[key],
        set: (val) => {
          if (state[key] !== val) {
            state[key] = val
            if (Array.isArray(this.observers[key])) {
              this.observers[key].forEach(observer => observer(val))
            }
          }
        }
      })
    }
  }
  subscribe(key, cb) {
    Array.isArray(this.observers[key])
      ? this.observers[key].push(cb)
      : this.observers[key] = [cb]
  }

  unsubscribe(key, cb) {
    if (Array.isArray(this.observers[key])) {
      const index = this.observers[key].indexOf(cb)
      if (index > -1) {
        this.observers[key].splice(index, 1)
      }
    }
  }
}
