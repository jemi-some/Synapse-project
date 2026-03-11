# 🚀 프로젝트 리팩토링 기획안: Personal Memory Agent

## 1. 프로젝트 비전 (Vision)
**"나보다 나를 더 잘 이해하는 AI, 미래의 나를 위한 디지털 유산"**
단순히 사진을 저장하고 보여주는 앱을 넘어, 사용자의 파편화된 기록(사진, 메모, 감정)을 체계적으로 구조화합니다. 
이 데이터는 향후 퍼스널 로봇이나 고도화된 AI 에이전트가 사용자의 맥락과 선호도를 완벽히 이해하고 보좌할 수 있는 **핵심 지식 베이스(Knowledge Base)**가 됩니다.

## 2. 핵심 수정 사항 (Major Changes)

| 구분 | AS-IS (기존) | TO-BE (수정) |
|:---|:---|:---|
| **서비스 성격** | 사진 기반 대화 유도형 서비스 | 인텔리전트 메모리 에이전트 |
| **AI 역할** | 수동적 질문 생성기 | 능동적 의도 판별 및 실행기 (Agent) |
| **주요 기능** | 사진 업로드 및 메타데이터 추출 | 멀티모달 입력(사진+텍스트) 처리 및 시맨틱 검색 |
| **대화 방식** | 단발성 질문/답변 | 슬랙 스타일의 스레드 기반 멀티턴 대화 |

## 3. 상세 구현 계획 (Detailed Implementation Plan)

### 3.1. 백엔드 아키텍처 변경 (Backend Architecture)
- **기존**: `analyze-image` API가 모든 로직 처리.
- **변경**:
    - `analyze-image`: 사진 분석 및 벡터화 전담.
    - `message`: MCP 기반 대화 처리 (도구 호출: `save_memo`, `search_memories`).
    - `search`: 시맨틱 검색 API.

### 3.2. 프론트엔드 변경 (Frontend)
- **기존**: 사진 업로드 → 질문 생성 UI.
- **변경**:
    - 채팅 UI (슬랙 스타일).
    - 파일 첨부 기능 (사진 + 텍스트 동시 입력).
    - 검색창 (시맨틱 검색).

### 3.3. 벡터화 파이프라인 (Vectorization Pipeline)
- **기존**: `analyze-image`에서 Vision API 호출.
- **변경**: `analyze-image`에서 Vision API + Embedding API 호출, 결과를 `memories` 테이블에 저장.

### 3.4. 검색 기능 (Search Functionality)
- **기존**: 없음.
- **변경**: `match_memories` RPC를 통한 시맨틱 검색 (유사도 0.3 이상).

## 4. 기술 스택 (Tech Stack)
backend_implementation_plan.md의 기술 스택 참고.

## 5. 기대 효과 (Expected Impact)
- **사용자 경험**: 단순한 사진 갤러리를 넘어, AI가 사용자의 삶을 이해하고 기억하는 개인 비서 경험 제공.
- **데이터 가치**: 구조화된 메모와 사진 데이터는 향후 AI 에이전트의 핵심 자산으로 활용 가능.
- **확장성**: 슬랙 스타일의 대화 인터페이스로 다양한 AI 기능(캘린더 연동, 감정 분석 등) 확장 용이.

## 6. 핵심 아키텍처 (Core Architecture)

### 6.1 인텐트 라우팅 (Intent Routing)
사용자의 입력을 분석하여 AI가 스스로 다음 동작을 결정합니다. (MCP/Tool Calling 방식 도입)

- **저장(Save)**: 사진이나 메모를 분석하여 벡터 DB에 기록
- **검색(Search)**: 사용자의 모호한 질문(예: "나 그때 왜 그랬지?")에 대해 과거 기록 조회
- **답변(Response)**: 검색된 맥락을 바탕으로 사용자에게 개인화된 답변 제공

### 6.2 RAG (Retrieval-Augmented Generation) 파이프라인
- **Embedding**: OpenAI text-embedding-3-small을 사용하여 텍스트와 이미지 컨텍스트를 1536차원 벡터로 변환.
- **Vector DB**: Supabase pgvector와 HNSW 인덱스를 활용한 고속 유사도 검색.
- **Context Summary**: Vision API와 메타데이터를 결합해 AI가 생성한 '자연어 요약문'을 검색의 원천 데이터로 사용.

## 7. 데이터 모델링 (Data Modeling)
- Chat Sessions: 사용자당 고유한 메인 피드 유지.
- Knowledge Entries (Media Files): 사진, 일기, 메모를 통합 관리하며 각 항목은 고유한 임베딩 값을 가짐.
- Threaded Messages: 메인 컨텍스트를 해치지 않는 우측 패널 기반의 깊은 대화 구조.

## 8. 기술적 도전 과제 (Technical Challenges)
- 멀티모달 컨텍스트 통합: 사진의 시각 정보와 사용자의 감성 메모를 어떻게 하나의 벡터로 완벽히 융합할 것인가?
- 비동기 처리 최적화: 대량의 사진 업로드 시 Vision API 분석 및 임베딩 과정을 FastAPI의 비동기 로직으로 성능 저하 없이 처리.
- 데이터 재현성: 미래의 물리적 에이전트(로봇)가 활용할 수 있도록 데이터 구조의 정합성과 확장성 확보.

## 9. 미래 확장성 (Future Scalability)
- Embodied AI 연결: 축적된 개인 데이터를 로봇 OS와 연동하여 현실 세계에서의 맞춤형 서비스 제공.
- 라이프 패턴 분석: 장기적인 기록 데이터를 분석하여 사용자의 행동 패턴이나 심리적 변화 리포트 생성.