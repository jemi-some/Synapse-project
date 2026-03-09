import { Component } from '../core'
import { imageStore } from '../store/images'
import exifr from 'exifr'
import { extractForAestheticAI } from '../utils/metadataProcessor'

export default class CameraButton extends Component {
  constructor() {
    super({
      tagName: 'div',
      state: {
        isUploading: imageStore.state?.isUploading || false,
        uploadProgress: imageStore.state?.uploadProgress || 0,
        showOptions: false
      }
    })

    this.el.className = 'camera-button-container'
    this.handleFileSelect = this.handleFileSelect.bind(this)
    this.handleButtonClick = this.handleButtonClick.bind(this)
    this.handleCameraCapture = this.handleCameraCapture.bind(this)
    this.handleFileUpload = this.handleFileUpload.bind(this)
    this.toggleOptions = this.toggleOptions.bind(this)
    this.hideOptions = this.hideOptions.bind(this)
    this.handleOptionsContainerClick = this.handleOptionsContainerClick.bind(this)
    this.handleGlobalClick = this.handleGlobalClick.bind(this)
    this.isMobile = this.detectMobile()
    
    // 이미지 스토어 구독
    imageStore.subscribe('isUploading', (isUploading) => {
      if (this.state && this.state.isUploading !== isUploading) {
        this.state.isUploading = isUploading
        this.render()
      }
    })
    
    imageStore.subscribe('uploadProgress', (progress) => {
      if (this.state && this.state.uploadProgress !== progress) {
        this.state.uploadProgress = progress
        this.render()
      }
    })
  }

  render() {
    const { isUploading = false, uploadProgress = 0, showOptions = false } = this.state || {}

    if (!this.el) {
      console.error('Element not available for CameraButton')
      return
    }

    if (this.isMobile) {
      // 모바일에서는 선택 옵션과 함께 렌더링
      this.el.innerHTML = `
        <div class="mobile-camera-container">
          <button class="camera-button ${isUploading ? 'uploading' : ''}"
                  aria-label="사진 옵션"
                  ${isUploading ? 'disabled' : ''}>
            <span class="material-symbols-outlined camera-icon">
              ${isUploading ? 'hourglass_empty' : 'photo_camera'}
            </span>
          </button>

          ${showOptions ? `
            <div class="camera-options" data-options-container="true">
              <div class="options-menu">
                <button class="option-btn camera-capture-btn">
                  <span class="material-symbols-outlined">photo_camera</span>
                  <span>카메라로 촬영</span>
                </button>
                <button class="option-btn file-upload-btn">
                  <span class="material-symbols-outlined">upload</span>
                  <span>파일에서 선택</span>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- 카메라 촬영용 input -->
          <input type="file"
                 class="camera-input"
                 accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                 capture="camera"
                 style="display: none;">

          <!-- 파일 선택용 input -->
          <input type="file"
                 class="file-input"
                 accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                 style="display: none;">
        </div>
      `
    } else {
      // 웹에서는 기존 방식 유지
      this.el.innerHTML = `
        <button class="camera-button ${isUploading ? 'uploading' : ''}"
                aria-label="사진 업로드"
                ${isUploading ? 'disabled' : ''}>
          <span class="material-symbols-outlined camera-icon">
            ${isUploading ? 'hourglass_empty' : 'photo_camera'}
          </span>
        </button>
        <input type="file"
               class="file-input"
               accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
               style="display: none;">
      `
    }
    
    // 다음 틱에서 이벤트 리스너 추가
    setTimeout(() => {
      const button = this.el?.querySelector('.camera-button')

      if (button) {
        // 기존 이벤트 리스너 제거 (중복 방지)
        button.removeEventListener('click', this.handleButtonClick)
        button.addEventListener('click', this.handleButtonClick)
      }

      if (this.isMobile) {
        // 모바일 전용 이벤트 리스너
        const cameraInput = this.el?.querySelector('.camera-input')
        const fileInput = this.el?.querySelector('.file-input')
        const cameraCaptureBtn = this.el?.querySelector('.camera-capture-btn')
        const fileUploadBtn = this.el?.querySelector('.file-upload-btn')
        const optionsContainer = this.el?.querySelector('[data-options-container]')

        if (cameraInput) {
          cameraInput.removeEventListener('change', this.handleFileSelect)
          cameraInput.addEventListener('change', this.handleFileSelect)
        }

        if (fileInput) {
          fileInput.removeEventListener('change', this.handleFileSelect)
          fileInput.addEventListener('change', this.handleFileSelect)
        }

        if (cameraCaptureBtn) {
          cameraCaptureBtn.removeEventListener('click', this.handleCameraCapture)
          cameraCaptureBtn.addEventListener('click', this.handleCameraCapture)
        }

        if (fileUploadBtn) {
          fileUploadBtn.removeEventListener('click', this.handleFileUpload)
          fileUploadBtn.addEventListener('click', this.handleFileUpload)
        }

      } else {
        // 웹 전용 이벤트 리스너
        const fileInput = this.el?.querySelector('.file-input')

        if (fileInput) {
          fileInput.removeEventListener('change', this.handleFileSelect)
          fileInput.addEventListener('change', this.handleFileSelect)
        }
      }
    }, 0)
  }

  handleButtonClick() {
    if (this.state?.isUploading) return

    if (this.isMobile) {
      // 모바일에서는 옵션 토글
      this.toggleOptions()
    } else {
      // 웹에서는 바로 파일 선택
      const fileInput = this.el?.querySelector('.file-input')
      if (fileInput) {
        fileInput.click()
      }
    }
  }

  toggleOptions() {
    this.state.showOptions = !this.state.showOptions
    this.render()

    // 옵션이 열렸을 때 전역 클릭 이벤트 등록
    if (this.state.showOptions) {
      setTimeout(() => {
        document.addEventListener('click', this.handleGlobalClick)
      }, 0)
    } else {
      document.removeEventListener('click', this.handleGlobalClick)
    }
  }

  hideOptions() {
    if (this.state.showOptions) {
      this.state.showOptions = false
      this.render()
      document.removeEventListener('click', this.handleGlobalClick)
    }
  }

  handleCameraCapture() {
    this.hideOptions()
    const cameraInput = this.el?.querySelector('.camera-input')
    if (cameraInput) {
      cameraInput.click()
    }
  }

  handleFileUpload() {
    this.hideOptions()
    const fileInput = this.el?.querySelector('.file-input')
    if (fileInput) {
      fileInput.click()
    }
  }

  handleOptionsContainerClick(event) {
    // 옵션 메뉴 자체를 클릭한 경우가 아니라면 메뉴 닫기
    if (event.target === event.currentTarget) {
      this.hideOptions()
    }
  }

  handleGlobalClick(event) {
    // 카메라 버튼이나 옵션 메뉴 내부를 클릭한 경우가 아니라면 메뉴 닫기
    const cameraButton = this.el?.querySelector('.camera-button')
    const optionsMenu = this.el?.querySelector('.options-menu')

    if (cameraButton && cameraButton.contains(event.target)) {
      return // 카메라 버튼 클릭은 toggleOptions에서 처리
    }

    if (optionsMenu && optionsMenu.contains(event.target)) {
      return // 옵션 메뉴 내부 클릭은 무시
    }

    // 외부 클릭이므로 메뉴 닫기
    this.hideOptions()
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform))
  }

  async handleFileSelect(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
      // 이미지 메타데이터 추출
      const metadata = await this.extractImageMetadata(file)
        // 메타데이터와 함께 이미지 업로드
      const result = await imageStore.uploadImage(file, metadata)
      
      // 성공 피드백
      this.showSuccessFeedback()
      
      // 채팅 세션이 생성되었으면 필요시 추가 처리
      if (result.session) {
        // 필요시 페이지 이동이나 상태 업데이트
        // 예: window.location.hash = `#/chat/${result.session.id}`
      }
      
      // 사진 분석 및 AI 첫 메시지 시작
      // this.startAIConversation(file)
      // OpenAI 분석은 Home.js에서 자동으로 처리됨
      // (imageStore.subscribe에서 analyzeImageWithAI 호출)
    } catch (error) {
      console.error('업로드 실패:', error)
      alert(error.message || '이미지 업로드에 실패했습니다.')
    } finally {
      // 파일 입력 초기화
      event.target.value = ''
    }
  }

  async extractImageMetadata(file) {
    const basicInfo = {
      name: file.name,
      file_name: file.name,
      fileName: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified),
    }

    // EXIF 데이터 추출
    const exifData = await this.extractEXIFData(file)
    
    // 전체 메타데이터를 extractForAestheticAI로 처리
    const combinedData = {
      ...basicInfo,
      ...exifData,
      raw_metadata: exifData // raw 데이터 보존
    }
    
    // AI용 메타데이터 추출 (비동기)
    const aestheticMetadata = await extractForAestheticAI(combinedData)
    
    return {
      ...combinedData,
      aesthetic: aestheticMetadata
    }
  }

  async extractEXIFData(file) {
    try {
      // exifr로 모든 EXIF 데이터 추출
      const exifData = await exifr.parse(file, true)
      
      if (!exifData) {
        console.log('EXIF 데이터가 없습니다.')
        return {}
      }
      
      
      // 주요 EXIF 데이터 정리
      const exifInfo = {
        // 카메라 정보
        camera: {
          make: exifData.Make || null,
          model: exifData.Model || null,
          lens: exifData.LensModel || null,
        },
        
        // 촬영 설정
        settings: {
          iso: exifData.ISO || null,
          aperture: exifData.FNumber || null,
          shutterSpeed: exifData.ExposureTime || null,
          focalLength: exifData.FocalLength || null,
          flash: exifData.Flash || null,
        },
        
        // 시간 정보
        dateTime: {
          original: exifData.DateTimeOriginal || exifData.DateTime || exifData.CreateDate || null,
          digitized: exifData.DateTimeDigitized || null,
        },
        
        // 이미지 정보
        image: {
          width: exifData.ExifImageWidth || exifData.ImageWidth || null,
          height: exifData.ExifImageHeight || exifData.ImageHeight || null,
          orientation: exifData.Orientation || null,
          colorSpace: exifData.ColorSpace || null,
        },
        
        // GPS 정보 (exifr은 이미 변환된 좌표 제공)
        gps: {
          latitude: exifData.latitude || null,
          longitude: exifData.longitude || null,
          altitude: exifData.GPSAltitude || null,
        },
        
        // 전체 메타데이터 (디버깅용)
        raw: exifData
      }
      
      // GPS 좌표 처리
      const processedGPS = this.processGPSDataExifr(exifInfo.gps)
      exifInfo.location = processedGPS
      
      console.log('EXIF 데이터:', exifInfo)
      return exifInfo
      
    } catch (error) {
      console.error('EXIF 데이터 추출 오류:', error)
      return {}
    }
  }

  processGPSDataExifr(gpsData) {
    if (!gpsData.latitude || !gpsData.longitude) {
      return { hasLocation: false }
    }

    try {
      return {
        hasLocation: true,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        coordinates: `${gpsData.latitude.toFixed(6)}, ${gpsData.longitude.toFixed(6)}`,
        altitude: gpsData.altitude || null,
        // 추후 Reverse Geocoding API로 주소 변환 가능
        address: null
      }
    } catch (error) {
      console.error('GPS 데이터 처리 오류:', error)
      return { hasLocation: false }
    }
  }

  // 기존 함수도 유지 (호환성을 위해)
  // processGPSData(gpsData) {
  //   if (!gpsData.latitude || !gpsData.longitude) {
  //     return { hasLocation: false }
  //   }

  //   try {
  //     // GPS 좌표를 10진수로 변환
  //     const lat = this.convertDMSToDD(gpsData.latitude, gpsData.latitudeRef)
  //     const lng = this.convertDMSToDD(gpsData.longitude, gpsData.longitudeRef)
      
  //     if (lat === null || lng === null) {
  //       return { hasLocation: false }
  //     }

  //     return {
  //       hasLocation: true,
  //       latitude: lat,
  //       longitude: lng,
  //       coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
  //       // 추후 Reverse Geocoding API로 주소 변환 가능
  //       address: null
  //     }
  //   } catch (error) {
  //     console.error('GPS 데이터 처리 오류:', error)
  //     return { hasLocation: false }
  //   }
  // }

  // convertDMSToDD(dms, ref) {
  //   if (!dms || dms.length !== 3) return null
    
  //   try {
  //     let dd = dms[0] + dms[1]/60 + dms[2]/3600
  //     if (ref === "S" || ref === "W") dd = dd * -1
  //     return dd
  //   } catch (error) {
  //     return null
  //   }
  // }

  showSuccessFeedback() {
    const button = this.el?.querySelector('.camera-button')
    if (button) {
      const icon = button.querySelector('.camera-icon')
      if (icon) {
        icon.textContent = 'check_circle'
        setTimeout(() => {
          icon.textContent = 'photo_camera'
        }, 1000)
      }
    }
  }
}
