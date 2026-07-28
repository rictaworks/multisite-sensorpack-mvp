"""AI日次サマリー（F7）用FastAPIアプリケーションのエントリポイント。

- `GET /health` によるサービス生存確認
- 環境判定（development/test/production）の土台
- `POST /internal/ai/summaries`（Issue #13）：Rails→FastAPIのServer-to-Server限定で、
  統計値のみからLangChain経由でLLMを呼び出し日本語サマリーを生成する内部エンドポイント。

クォータ制御自体（requirements.md F7.1/F7.3/F7.5）はRails側の責務でありスコープ外。

起動方法（開発時）：
    uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI

from app.config import Environment, get_settings
from app.routers.health import router as health_router
from app.routers.summary import router as summary_router

settings = get_settings()

# OWASP A05（セキュリティ設定ミス）対策：
# 本番環境ではSwagger UI等のAPIドキュメントを公開しない。
_is_production = settings.environment is Environment.PRODUCTION

app = FastAPI(
    title="multisite-sensorpack-mvp AI Summary Service",
    description="F7 AI日次サマリー生成用のFastAPI（ひな形）",
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

app.include_router(health_router)
app.include_router(summary_router)
