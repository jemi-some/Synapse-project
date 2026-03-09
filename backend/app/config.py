import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# OpenAI 설정
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# CORS 설정
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:1234")

# 서버 설정
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# OpenAI 모델 설정
DEFAULT_VISION_MODEL = "gpt-4o"
DEFAULT_CHAT_MODEL = "gpt-4o-mini"
DEFAULT_EMBEDDING_MODEL = "text-embedding-ada-002"
IMAGE_DETAIL = "low"  # 저화질로 속도 향상
REQUEST_TIMEOUT = 30  # 초
