"""本番環境でAPIドキュメント（Swagger UI等）を公開しないことのテスト。

OWASP A05（セキュリティ設定ミス）対策：本番でopenapi.json/docs/redocが
露出すると内部API構成の偵察に利用されうるため、production環境では
必ず無効化されていることを保証する。
"""

import importlib
import os


def _reload_app_with_env(app_env: str | None):
    """指定したAPP_ENVでapp.mainを再読込し、生成されたappを返す。"""
    original = os.environ.get("APP_ENV")
    try:
        if app_env is None:
            os.environ.pop("APP_ENV", None)
        else:
            os.environ["APP_ENV"] = app_env

        from app import config as config_module
        from app import main as main_module

        config_module.get_settings.cache_clear()
        importlib.reload(main_module)
        return main_module.app
    finally:
        if original is None:
            os.environ.pop("APP_ENV", None)
        else:
            os.environ["APP_ENV"] = original


def test_docs_disabled_when_app_env_is_production() -> None:
    app = _reload_app_with_env("production")

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


def test_docs_disabled_when_app_env_is_unset_fail_closed() -> None:
    app = _reload_app_with_env(None)

    assert app.docs_url is None


def test_docs_enabled_in_development() -> None:
    app = _reload_app_with_env("development")

    assert app.docs_url == "/docs"
