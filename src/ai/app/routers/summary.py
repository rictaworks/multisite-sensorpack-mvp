"""AI日次サマリー生成の内部エンドポイント（Issue #13）。

`src/shared/contracts/openapi.yaml` の `internal-ai` タグ、
`POST /internal/ai/summaries` を実装する。RailsからServer-to-Server限定で
呼び出され、`X-Internal-Api-Key` ヘッダ（`internalServiceKey`セキュリティスキーム）
による認証が必須。
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import Settings, get_settings
from app.services.langchain_summary import (
    InternalAiSummaryRequest,
    InternalAiSummaryResponse,
    generate_daily_summary_text,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _unauthorized(code: str, message: str) -> HTTPException:
    """契約(`components.schemas.Error`)の形状に沿った401エラーを組み立てる。"""
    return HTTPException(
        status_code=401,
        detail={"error": {"code": code, "message": message}},
    )


def require_internal_service_key(
    x_internal_api_key: str | None = Header(default=None, alias="X-Internal-Api-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    """`internalServiceKey`セキュリティスキームを検証する依存関数。

    OWASP A05（セキュリティ設定ミス）対策：内部サービスキーが未設定の場合、
    「認証をスキップして通す」という誤ったフォールバックを行わず、
    fail closedで全リクエストを拒否する。
    """
    expected_key = (settings.internal_ai_api_key or "").strip()
    if not expected_key:
        logger.error(
            "INTERNAL_AI_API_KEY is not configured; rejecting all "
            "/internal/ai/summaries requests (fail closed)."
        )
        raise _unauthorized(
            "internal_api_key_not_configured",
            "Internal API key is not configured on this server.",
        )

    provided_key = x_internal_api_key or ""
    # タイミング攻撃対策として定数時間比較を用いる（OWASP A02: 暗号化の失敗）。
    if not hmac.compare_digest(provided_key, expected_key):
        logger.warning("Rejected /internal/ai/summaries request: invalid internal API key.")
        raise _unauthorized(
            "invalid_internal_api_key",
            "Internal API key is missing or invalid.",
        )


@router.post(
    "/internal/ai/summaries",
    response_model=InternalAiSummaryResponse,
    dependencies=[Depends(require_internal_service_key)],
)
def post_internal_summary(
    payload: InternalAiSummaryRequest,
    settings: Settings = Depends(get_settings),
) -> InternalAiSummaryResponse:
    """統計値・アラート概要から日次サマリー本文を生成して返す。

    Args:
        payload: 個人情報を含まない統計値のみのリクエスト
            （`InternalAiSummaryRequest`、契約に定義されたフィールドのみ許可）。
        settings: `.env`／デプロイ先環境変数から読み込んだ設定。

    Returns:
        InternalAiSummaryResponse: 日本語の自然言語サマリー本文。
    """
    summary_text = generate_daily_summary_text(payload, settings)
    return InternalAiSummaryResponse(summary_text=summary_text)
