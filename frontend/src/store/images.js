import { Store } from '../core'
// Supabase 연동 비활성화
// import { supabase } from '../services/supabase'
// import { createChatSessionWithImage } from '../services/supabase'

const imageStore = new Store({
  images: [],
  currentImage: null,
  isUploading: false,
  uploadProgress: 0
})

// 이미지 업로드 처리 (Supabase 없이 로컬 전용)
imageStore.uploadImage = async function (file, metadata = null) {
  // 허용되는 이미지 타입
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml'
  ]

  if (!file) {
    throw new Error('파일을 선택해주세요.')
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error('지원하지 않는 파일 형식입니다.\n허용 형식: JPG, PNG, GIF, WebP, BMP, SVG')
  }

  const uploadSignature = `${file.name || 'unknown'}-${file.size}-${file.lastModified || 0}`

  if (!this._pendingUploads) {
    this._pendingUploads = new Map()
  }

  if (this._pendingUploads.has(uploadSignature)) {
    console.log('⚠️ 동일한 파일 업로드가 감지되어 기존 작업을 재사용합니다:', uploadSignature)
    return this._pendingUploads.get(uploadSignature)
  }

  const uploadTask = (async () => {
    this.state.isUploading = true
    this.state.uploadProgress = 0

    // 1. 이미지 압축 (큰 이미지의 경우 자동 압축)
    let processedFile = file
    console.log(`원본 파일 크기: ${(file.size / 1024 / 1024).toFixed(2)}MB`)

    if (file.size > 500 * 1024) { // 500KB 이상이면 압축
      console.log('이미지 압축 중...')
      processedFile = await this.compressImage(file)
      console.log(`압축 후 파일 크기: ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`)
    }

    // 2. 압축 후에도 크기가 큰 경우 추가 압축
    if (processedFile.size > 2 * 1024 * 1024) {
      console.log('추가 압축 중...')
      processedFile = await this.compressImage(processedFile, 0.5, 0.6)
      console.log(`최종 파일 크기: ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`)
    }

    // 3. 최종 크기 검사
    if (processedFile.size > 3 * 1024 * 1024) {
      throw new Error('이미지가 너무 큽니다. 다른 이미지를 선택해주세요.')
    }

    // 로컬 Blob URL 생성 (Supabase 없이 로컬 미리보기용)
    const localUrl = URL.createObjectURL(file)

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    this.state.uploadProgress = 50

    // Supabase Storage 업로드 비활성화 - 로컬 URL 사용
    console.log('[Stub] Supabase Storage 업로드 비활성화 - 로컬 URL 사용')

    this.state.uploadProgress = 90

    const imageObj = {
      id: Date.now().toString(),
      url: localUrl, // 로컬 Blob URL 사용
      localUrl: localUrl,
      file: file,
      fileName: fileName,
      uploadedAt: new Date(),
      metadata: {
        size: file.size,
        type: file.type,
        name: file.name
      },
      uploadSignature,
      aesthetic: metadata?.aesthetic || null
    }

    // Supabase 채팅 세션 생성 비활성화
    // let sessionRecord = null
    // if (metadata) { ... }

    // 이미지 배열에 추가
    this.state.images = [...this.state.images, imageObj]
    this.state.uploadProgress = 100

    // 현재 이미지로 설정 (Observer 패턴 사용)
    this.setCurrentImage(imageObj)

    return {
      imageObj,
      session: null  // Supabase 세션 없음
    }
  })()

  this._pendingUploads.set(uploadSignature, uploadTask)

  try {
    return await uploadTask
  } catch (error) {
    console.error('이미지 업로드 실패:', error)
    throw error
  } finally {
    this._pendingUploads.delete(uploadSignature)
    this.state.isUploading = false
  }
}

// 이미지 설정
imageStore.setCurrentImage = function (imageData) {
  console.log('🔄 setCurrentImage 호출됨:', {
    입력데이터: imageData?.url || imageData,
    현재이미지: this.state.currentImage?.url || 'null',
    스택트레이스: new Error().stack.split('\n').slice(1, 4).map(line => line.trim())
  })

  let imageToSet = null

  if (typeof imageData === 'string') {
    const image = this.state.images.find(img => img.id === imageData)
    if (image) {
      imageToSet = image
    }
  } else if (imageData && typeof imageData === 'object') {
    imageToSet = imageData
  }

  if (this.state.currentImage !== imageToSet) {
    console.log('📢 이미지 상태 변경 - Observer들에게 알림 전송')
    this.state.currentImage = imageToSet

    if (Array.isArray(this.observers['currentImage'])) {
      console.log('📤 Observer 개수:', this.observers['currentImage'].length)
      this.observers['currentImage'].forEach((observer, index) => {
        console.log(`📨 Observer ${index} 호출 중...`)
        observer(imageToSet)
      })
    }
  } else {
    console.log('⏭️ 동일한 이미지 - 상태 변경 없음')
  }
}

// 이미지 초기화
imageStore.clearCurrentImage = function () {
  if (this.state.currentImage !== null) {
    this.state.currentImage = null

    if (Array.isArray(this.observers['currentImage'])) {
      this.observers['currentImage'].forEach(observer => observer(null))
    }
  }
}

// 이미지 삭제 (Supabase 없이 로컬만)
imageStore.deleteImage = async function (imageId) {
  const imageIndex = this.state.images.findIndex(img => img.id === imageId)
  if (imageIndex !== -1) {
    const image = this.state.images[imageIndex]

    // 로컬 Blob URL 해제
    if (image.localUrl && image.localUrl.startsWith('blob:')) {
      URL.revokeObjectURL(image.localUrl)
    }

    // Supabase Storage 삭제 비활성화
    // if (image.fileName) { ... }

    // 배열에서 제거
    this.state.images = this.state.images.filter(img => img.id !== imageId)

    // 현재 표시 중인 이미지라면 초기화
    if (this.state.currentImage?.id === imageId) {
      this.clearCurrentImage()
    }
  }
}

// 이미지 압축 함수
imageStore.compressImage = function (file, maxSizeMB = 1, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      let maxDimension = 1200
      if (file.size > 5 * 1024 * 1024) {
        maxDimension = 800
      } else if (file.size > 2 * 1024 * 1024) {
        maxDimension = 1000
      }

      let { width, height } = img

      if (width > height && width > maxDimension) {
        height = (height * maxDimension) / width
        width = maxDimension
      } else if (height > maxDimension) {
        width = (width * maxDimension) / height
        height = maxDimension
      }

      canvas.width = width
      canvas.height = height

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('이미지 압축에 실패했습니다.'))
            return
          }

          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now()
          })

          resolve(compressedFile)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      reject(new Error('이미지 로드에 실패했습니다.'))
    }

    img.src = URL.createObjectURL(file)
  })
}

export { imageStore }
