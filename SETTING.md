
## 🛠️ 설치 및 실행

### Prerequisites
- Python 3.11+
- Node.js 18+
- Supabase 프로젝트 (PostgreSQL + pgvector 활성화)
- OpenAI API Key

### 1. 백엔드 설정 (FastAPI)

```bash
cd backend

# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 의존성 설치 (uv 패키지 매니저 사용 시: uv pip install -r requirements.txt)
pip install -r requirements.txt

# 환경변수 설정
cp .env.example .env
# .env 파일 편집: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

# 서버 실행 (기본 포트: 8000)
uvicorn app.main:app --reload --port 8000
```

### 2. 프론트엔드 설정 (Vanilla JS + Parcel)

```bash
cd frontend

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일 편집: SUPABASE_URL, SUPABASE_ANON_KEY

# 개발 서버 실행
npm run dev  # 기본적으로 http://localhost:1234 에서 실행됨
```

### 3. Supabase 데이터베이스 설정
Supabase 웹 대시보드의 [SQL Editor] 메뉴에서 아래 파일의 내용을 순서대로 복사하여 실행

1. docs/00.schema.sql                  # 핵심 테이블 생성
2. docs/01.match_memories_fix.sql      # Vector 검색용 함수 생성
3. docs/02.add_action_data_column.sql  # action_data 컬럼 추가 (UI 복원용)


### 4. (선택사항) LangSmith 모니터링 연동
> LLM 호출 및 Agent 라우팅 과정을 추적(Tracing)하고 싶다면 설정합니다.

```bash
# backend/.env에 추가
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=Synapse
```

---