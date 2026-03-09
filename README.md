# Synapse(가제)

이 프로젝트는 사진과 대화를 중심으로 사용자의 추억을 기록하고 되돌아볼 수 있도록 돕는 애플리케이션입니다. 사진을 업로드하면 메타데이터를 활용해 자연스러운 질문을 생성해 대화를 시작합니다.

## 주요 특징
- **AI 사진 분석**: 업로드한 이미지를 Supabase Edge Function을 통해 GPT-4o로 분석하여 설명, 질문, 감정 등 대화 시작점을 자동 생성합니다.
- **대화형 추억 기록**: 사용자는 AI와의 채팅과 일기 모드를 오가며 텍스트를 남길 수 있고, 모든 메시지는 Supabase에 저장됩니다.
- **메타데이터 기반 컨텍스트**: 위치·시간·촬영 정보 등을 추출해 대화 컨텍스트로 활용하고, 필요 시 역지오코딩으로 주소를 보강합니다.
- **커뮤니티/라이브러리 뷰**: 생성된 세션을 개인 라이브러리로 정리하거나 공개 세션을 커뮤니티 탭에서 탐색할 수 있는 구조를 제공할 준비가 되어 있습니다.
- **익명 인증 플로우**: 최초 방문자는 자동으로 익명 로그인되며, 필요 시 Google OAuth로 전환할 수 있습니다.

## 기술 스택
- **프론트엔드**: Parcel 2, 바닐라 JavaScript 기반 커스텀 컴포넌트/라우터/상태관리(`src/core`)
- **백엔드**: Supabase Auth · Postgres · Storage · Edge Functions, OpenAI API (gpt-4o/mini)
- **기타 라이브러리**: `exifr`(EXIF 추출), `html2canvas`(이미지 캡쳐), `@supabase/supabase-js`, `openai`, `buffer`

## 디렉터리 구조
```
├── src
│   ├── components/        # Sidebar, ChatInput, ChatBubbles 등 UI 컴포넌트
│   ├── routes/            # Home, Library, Community 등 화면 단위 라우트
│   ├── services/          # Supabase, OpenAI, Geocoding API 연동
│   ├── store/             # auth, image 전역 상태 관리
│   └── utils/             # 메타데이터 처리, Markdown 렌더링 등 공통 유틸
├── supabase/functions/    # Edge Functions (analyze-image, openai-chat)
├── database/              # Supabase 테이블/정책 스키마 SQL
├── dist/                  # Parcel 빌드 결과 (배포용)
└── index.html             # 앱 엔트리 포인트
```

## 데이터 모델 & Supabase 구성
- **Auth**: 익명 로그인(`signInAnonymously`)과 Google OAuth 지원, `users` 테이블 트리거로 프로필 생성 (`database/chat.sql`).
- **테이블**
  - `chat_sessions`: 사용자별 채팅 세션 메타데이터 및 공개 여부 관리.
  - `chat_messages`: 채팅 메시지/AI 분석 기록(`message_type='analysis'`) 저장.
  - `diary_entries`: 채팅 기반 일기 저장, mood·tags 필드 포함.
  - `media_files`: 업로드 이미지 정보, 추출 메타데이터 및 AI 분석 내용 유지.
- **Storage**: `images` 버킷(이미지 업로드) 및 필요 시 `media` 버킷 사용.
- **Edge Functions**
  - `analyze-image`: GPT-4o를 호출해 이미지 설명·감정·문맥 분석을 수행, 메타데이터 기반 프롬프트 구성.
  - `openai-chat`: 사진 맥락을 반영한 gpt-4o 대화 응답 생성 및 대화 요약/임베딩 생성 지원.
- **RLS 정책**: 모든 주요 테이블에 대해 사용자 별 행 수준 보안을 적용, `is_public` 플래그가 true인 세션에 한해 커뮤니티 조회 허용 (`database/rls_policies.sql`).

## 환경 변수 & 설정
### 프론트엔드 (.env)
프로젝트 루트에 `.env` 혹은 Parcel이 인식할 수 있는 환경 파일을 생성하여 Supabase 정보를 주입합니다.
```
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```
Parcel은 `process.env.*` 값을 번들 타임에 주입하므로 개발/배포 환경에 동일한 변수 설정이 필요합니다.

### Supabase Edge Function 시크릿
Edge Function에서 OpenAI API를 호출하므로 Supabase 프로젝트에 아래 시크릿을 등록해야 합니다.
```
supabase secrets set OPENAI_API_KEY=sk-...
```
필요 시 추가 API (예: Google Geocoding)를 사용할 경우 별도 시크릿을 등록한 뒤 `supabase/functions` 코드에서 참조하도록 확장할 수 있습니다.

## 개발 환경 설정
1. **필수 요구사항**: Node.js 18 이상 권장, npm 9 이상. Supabase CLI(선택) 및 Deno 1.37+ (Edge Function 로컬 테스트용).
2. **의존성 설치**
   ```bash
   npm install
   ```
3. **환경 변수 설정**: `.env` 작성 후 Parcel을 재시작합니다.
4. **개발 서버 실행**
   ```bash
   npm run dev
   ```
   기본적으로 `http://localhost:1234`에서 앱을 확인할 수 있습니다.

## 빌드 & 배포
- **빌드**: `npm run build` → `dist/`에 정적 파일 생성, Vercel/Netlify/Supabase Hosting 등 정적 호스팅에 업로드 가능.
- **Vercel 템플릿**: `vercel.json`에 dev/build 명령이 정의되어 있어 Vercel에서 자동으로 Parcel 빌드가 동작합니다.

## 추가 참고 사항
- **역지오코딩**: `src/services/geocoding.js`는 OpenStreetMap Nominatim API를 사용하며, User-Agent 지정이 필요합니다. 대량 요청 시 자체 프록시나 캐싱을 고려하세요.
- **대화 요약/임베딩**: `openai-chat` 함수는 `taskType` 파라미터로 대화 요약과 임베딩 생성을 지원하여 향후 RAG 확장에 활용할 수 있습니다.
- **이미지 처리 주의**: `imageStore.compressImage`가 브라우저 Canvas API에 의존하므로 모바일/저사양 환경 테스트가 필요합니다.
