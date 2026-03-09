"""
MemoryMoments 백엔드 — FastAPI 앱 엔트리포인트
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_URL, HOST, PORT
from app.routers.ai import router as ai_router

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="MemoryMoments API",
    description="사진 기반 AI 대화 백엔드",
    version="0.1.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:1234",      # Parcel 개발 서버
        "http://localhost:3000",      # 대체 포트
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(ai_router)


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "ok", "service": "memorymoments-api"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
