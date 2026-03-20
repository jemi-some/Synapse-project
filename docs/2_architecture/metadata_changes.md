# 사진 메타데이터 추출 변경 사항

본 문서는 프론트엔드에서 사진을 업로드할 때 추출하여 AI 백엔드로 전송하는 **메타데이터(Metadata) 추출 파이프라인의 AS-IS / TO-BE 비교**를 문서화한 것입니다.

## 1. 개요 (Overview)
과거에는 `exifr`를 통해 추출된 방대한 메타데이터 전체나 가공되지 않은 데이터를 백엔드로 넘겼거나 불필요한 정보가 혼재되어 있었습니다.
이번 **Memory Moments** 개편을 통해, AI가 과거의 추억을 맥락 기반으로 검색(Semantic Search)할 수 있도록 **꼭 필요한 정보만 정제하고, 외부 API(날씨, 비전)를 연동하여 벡터라이제이션(Vectorization)에 특화된 풍부한 컨텍스트 JSON** 형태의 TO-BE 아키텍처를 구성합니다.

---
## 날 것의 메타데이터 구조

```json
{
  "fileName": "IMG_1234.HEIC",
  "size": 3145728,
  "type": "image/heic",
  "exif": {
    "Make": "Apple",
    "Model": "iPhone 13 Pro",
    "Orientation": 1,
    "XResolution": 72,
    "YResolution": 72,
    "Software": "16.1.1",
    "DateTime": "2023-10-15T14:30:22.000Z",
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 33, 59.99],
    "GPSLongitudeRef": "E",
    "GPSLongitude": [126, 58, 40.52],
    ... (수십 개의 불필요한 카메라 센서/렌즈 데이터 포함)
  }
}
```

---

## 2. 구조 비교 요약 (AS-IS vs TO-BE)

| 구분 | AS-IS (과거 레거시/현재 구현 구조) | TO-BE (Vector/RAG 기반 융합 아키텍처) |
| :--- | :--- | :--- |
| **목적** | AI가 첫 질문을 생성할때 참고하는 데이터 | 데이터베이스 벡터화를 위한 완벽한 "자연어 맥락 설명(Context Document)" 생성 |
| **추출 주체** | 오직 **프론트엔드** (`exifr`, `geocoding.js`) | **프론트엔드**(EXIF, 위치 정보) + **백엔드**(AI 비전, 날씨 API) 융합 |
| **시각적 맥락** | 이미지 업로드 시점에는 알 수 없음(이미지 업로드 후에 AI를 통해 시각적 맥락 추출) | AI Vision 모델을 통해 **사진 속 객체(말, 해바라기), 사람 여부, 주요 색상**을 `visionTags`로 획득 |
| **환경 정보** | 알 수 없음 | 위치 좌표와 시간을 기반으로 과거 날씨 API 등을 조회하여 `environment` 데이터 획득 |
| **벡터화 품질** | 단순히 키워드 나열 수준이라 유사도 검색시 정확도 저하 | 시간, 장소, 날씨, 인물 수, 감정, 사진 분위기를 종합한 하나의 완성된 텍스트로 변환하여 임베딩 시 높은 검색 정확성 확보 |

---

## 3. AS-IS (변경 전 현재 구조)
기존 프론트엔드 파이프라인(`exifr` → `metadataProcessor.js` → `geocoding.js`)을 거쳐 생성되던 메타데이터 형태입니다.

**추출 과정 (프론트엔드 파이프라인):**
1. `exifr`를 통한 EXIF 정보 원본 추출
2. `metadataProcessor.js`의 `extractForAestheticAI()` 함수가 원본 데이터를 의미 있는 단위(날짜, 카메라, 환경)로 파싱
3. `geocoding.js`가 좌표를 받아 주소로 맵핑(역지오코딩, 캐싱 포함)
4. 최종 가공된 데이터를 `images.js` (`uploadImage`)로 전달

```json
{
  "derived": {
    "lightCondition": "normal",
    "motionBlurRisk": "low"
  },
  "location": {
    "alt": null,
    "lat": 33.41726111111111,
    "lon": 126.68105555555556,
    "poi": "렛츠런팜제주",
    "city": "제주시",
    "road": "남조로",
    "state": "제주특별자치도",
    "country": "대한민국",
    "district": null,
    "countryCode": "kr",
    "fullAddress": "렛츠런팜제주, 남조로, 교래리, 조천읍, 제주시, 제주특별자치도, 63346, 대한민국",
    "hasLocation": true,
    "shortAddress": "제주시",
    "neighbourhood": null
  },
  "captureTime": {
    "utc": "2018-07-31T08:31:39.000Z",
    "local": "2018-07-31T17:31:39.000+09:00",
    "season": "summer",
    "weekday": "Tue",
    "timeOfDay": "evening"
  }
}
```

(참고) AI가 사진을 분석한 결과 
```json
{
  "context": "여름 저녁, 제주시 근처의 해바라기 밭. 조명은 자연광으로 잘 보이고 있음.",
  "questions": [],
  "description": "저녁 무렵의 제주시에서 아름다운 해바라기 밭을 보고 계시네요. 활기찬 여름의 느낌과 싱그러운 자연을 만끽할 수 있는 풍경입니다.",
  "analysis_timestamp": "2025-10-23T12:12:39.068Z"
}
```

> [!NOTE] 
> **프론트엔드(클라이언트 사이드) 메타데이터 추출의 성능적 이점**
> 1. **초고속 EXIF 추출 (0.1초 미만):** 수 MB의 원본 이미지를 통째로 읽지 않고 파일 헤더만 파싱.
> 2. **지오코딩 병목 캐싱 해결:** 외부 API(Nominatim 등)를 통한 주소 변환(역지오코딩)은 수 백 밀리초 넘게 걸리는 무거운 네트워크 요청이지만, 프론트엔드 캐시로 중복 주소 변환(API 호출)을 0초로 단축.
> 3. **업로드 지연 해소:** 프론트엔드에서 먼저 정보를 뽑아내면, 무거운 이미지가 스토리지에 업로드되는 동안 백엔드는 **이미 추출된 이 가벼운 JSON 메타데이터를 먼저 넘겨받아 병렬 분석**을 시작할 수 있음.

---

## 4. TO-BE (변경 후 융합 구조) 
최종적으로 메타데이터 데이터베이스에 넣고, AI 채팅 프롬프트로 전달될 완성형 데이터 구조입니다.

**데이터 수집 프로세스:**
1. 프론트에서 사진의 메타데이터 파이프라인을 거쳐 `derived`, `location`, `captureTime`을 채움
2. **백엔드(AI)**가 Vision API를 통해 이미지 자체를 다시 한번 더 분석하여 `visionTags`를 채움
3. **백엔드**가 날씨 정보 API 등에 좌표/시간값을 넘겨 과거 환경인 `environment`를 (선택적으로) 채움
4. 완성된 JSON을 OpenAI 모델에 넘겨 "자연어 기반 풍부한 설명글"을 만듦
5. 이 설명글을 Text Embedding 모델을 통해 벡터(Vector) 배열로 변환
6. 데이터베이스(Supabase pgvector)에 저장하여 추후 검색(유사한 추억 보기, 채팅 텍스트 검색 등)에 대비

```json
{
  "derived": {
    "lightCondition": "soft_golden_hour", 
    "motionBlurRisk": "low",
    "isOutdoor": true
  },
  "location": {
    "poi": "렛츠런팜제주",
    "city": "제주시",
    "district": "조천읍",
    "fullAddress": "제주특별자치도 제주시 조천읍 남조로 렛츠런팜제주",
    "coordinates": {
      "lat": 33.417261,
      "lon": 126.681055
    }
  },
  "captureTime": {
    "local": "2018-07-31T17:31:39.000+09:00",
    "season": "summer",
    "weekday": "Tuesday",
    "timeOfDay": "late_afternoon",
    "relative": {
      "yearsAgo": 8,
      "isAnniversary": false
    }
  },
  "environment": { // Weather API 연동 가정
    "weather": "sunny",
    "temp": "29°C",
    "description": "맑고 무더운 여름날"
  },
  "visionTags": { // 멀티 모달의 Vision API 결과
    "objects": ["말(horse)", "푸른 초원", "울타리", "해바라기"],
    "peopleCount": 2,
    "dominantColors": ["Green", "Blue", "Yellow"]
  }
}
```

---

## 5. 백엔드 연동 계획 (Next Action)

### Step 1: 프론트엔드 API 호출 (`/api/ai/vectorize`)
- 프론트엔드 메타데이터 코드는 이미 완벽하므로 건드리지 않습니다. 프론트엔드에서 AS-IS 포맷으로 백엔드에 그대로 던집니다.

### Step 2: (백엔드) 날씨 정보 획득 구현 (선택 사항)
- 백엔드(`/api/ai/vectorize`) 내에서 프론트가 넘겨준 `metadata.location.lat/lon`와 `captureTime.local`을 파싱합니다.
- `OpenWeatherMap API` (Historical API) 등에 서버-투-서버 통신을 보내 그 당시 날씨 정보를 받아 `environment` JSON 노드를 생성합니다.

### Step 3: (백엔드) Vision API 요청 구현
- 동일한 백엔드 라우터에서 `openai_client.chat.completions.create` 쪽에 이미지를 밀어넣고 멀티모달 프롬프트를 실행시킵니다.
- 프롬프트: *"다음 사진에서 보여지는 사물 목록(objects), 인원수(peopleCount), 주요 색상 3가지(dominantColors)를 추출해서 JSON으로 줘."* 
- 응답받은 값을 파싱하여 `visionTags` JSON 노드를 생성합니다.

### Step 4: 맥락 설명서 단일화 및 임베딩 (Vectorization)
- 기존 프론트엔드에서 넘어온 데이터에 Step 2/3에서 모은 새로운 노드들을 결합합니다.
- 이 완전체 데이터를 LLM 프롬프트에 담아 다음을 지시합니다: *"위 정보들을 전부 종합해서, 이 사진을 보지 않아도 구체적으로 장면을 상상하고 검색할 수 있도록 해설과 상황, 메타데이터 정보가 포함된 풍부한 시맨틱(Semantic) 요약 텍스트를 하나 생성해."*
- 완성된 맥락 요약문(String)을 OpenAI의 `text-embedding-3-small` 등의 모델을 사용해 다차원 벡터 배열 형식으로 변환합니다.
- 변환된 벡터와 원본 메타데이터/요약문을 Supabase의 벡터 타입 컬럼(`embedding vector(1536)`)에 백그라운드에서 조용히 저장합니다.

### Step 5: (채팅 아키텍처) 메인 피드와 스레드 라우팅 및 MCP 의도 파악
- 사용자의 텍스트 입력은 '메인 피드(단순 검색)'와 '스레드(멀티턴 대화)'로 계층화되어 운영됩니다.
- **의도 파악에는 단순 프롬프팅이 아닌 MCP(Model Context Protocol) / Tool Calling 방식 모델을 권장 및 적용합니다.**
  - LLM에게 `search_memories(query: str, filters: dict)` 툴을 제공하면, LLM이 결정론적으로 툴을 사용할지 텍스트로 답할지 결정하므로 **단순 검색**과 **일상 대화** 라우팅의 안정성이 비약적으로 상승합니다.
- 검색되어 나타난 메인 피드의 사진 카드에서 파생된 후속 질문들은 부모 ID(`parent_message_id`)를 가지는 **스레드(Thread) 데이터**로 별도 처리하여, 멀티턴 대화 시 메인 피드의 컨텍스트를 유지하면서 답변을 생성합니다.

