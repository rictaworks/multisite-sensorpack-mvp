"""ヘルスチェックエンドポイント。

サービスの生存確認用。認証を要求せず、シークレットや個人情報を
一切含まないレスポンスのみを返す（OWASP A05 セキュリティ設定ミス対策）。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings

router = APIRouter()


@router.get("/health")
def get_health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """サービスの生存確認と現在の実行環境を返す。

    Returns:
        dict: `status`（常に"ok"）と `environment`
            （development/test/productionのいずれか）。
    """
    return {
        "status": "ok",
        "environment": settings.environment.value,
    }
