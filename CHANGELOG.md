# CHANGELOG.md — 변경 이력

이 문서는 프로젝트의 주요 변경 사항을 날짜별로 기록합니다.

---

## [2026-03-07] 기술 스택 변경: FastAPI 백엔드 추가

### 🏗️ 구조 변경 (Structure)
- 프로젝트를 `frontend/` + `backend/` 구조로 재편성
- 기존 프론트엔드 파일(`index.html`, `src/`, `package.json` 등)을 `frontend/`로 이동

### ✨ 추가 (Added)
- **FastAPI 백엔드 생성** (`backend/`)
  - `app/main.py` — FastAPI 앱 엔트리포인트 (CORS, 헬스 체크)
  - `app/config.py` — 환경변수, OpenAI 클라이언트 설정
  - `app/schemas/ai.py` — Pydantic 요청/응답 모델
  - `app/services/openai_service.py` — Edge Function 로직 Python 포팅
  - `app/routers/ai.py` — API 엔드포인트 4개
  - `requirements.txt` — 의존성 (fastapi, uvicorn, openai 등)

### 🔧 변경 (Changed)
- `frontend/src/services/openai.js` → Supabase Edge Function 대신 백엔드 API(`localhost:8000`) 호출로 변경

## [2026-03-07] 리팩토링: 커뮤니티 제거 & Supabase 비활성화

### 🗑️ 제거 (Removed)
- **커뮤니티 기능 전체 제거**
  - `src/routes/Community.js` 삭제
  - `src/routes/CommunityDetail.js` 삭제
  - `src/routes/index.js`에서 커뮤니티 라우트 제거 (`#/community`, `#/community/:sessionId`)
  - `src/components/Sidebar.js`에서 커뮤니티 네비게이션 버튼 및 클릭 핸들러 제거

### 🔧 변경 (Changed)
- **Supabase 연동 비활성화 (Stub 처리)**
  - `src/services/supabase.js` → 모든 함수를 빈 값 반환하는 stub으로 교체. 원본 코드는 파일 하단에 주석 보존.
  - `src/services/openai.js` → AI 분석/채팅 함수를 안내 메시지 반환하는 stub으로 교체. 원본 주석 보존.
  - `src/store/auth.js` → `initAuth()` 비활성화, 항상 미로그인 상태로 초기화.
  - `src/store/images.js` → Supabase Storage 업로드 제거, 로컬 Blob URL만 사용.
  - `src/App.js` → `initAuth()` 호출 제거, Supabase import 제거. `AnalyzeButton`, `AnalysisPopup` 주석 처리.

### 📝 문서 (Docs)
- `AGENT.md` 생성: AI 코딩 에이전트용 프로젝트 지시서
- `COMPONENTS.md` 생성: 컴포넌트 카탈로그
- `CHANGELOG.md` 생성: 변경 이력 문서

### 🐛 참고 (Notes)
- Parcel 캐시 오류 시 `rm -rf .parcel-cache dist` 후 재시작 필요
- Supabase 원본 코드는 각 파일 하단에 주석 블록(`/* ... */`)으로 보존되어 있어, 필요 시 복원 가능
