"""環境設定（Settings）。

CLAUDE.md／.claude/rules/environment.md の方針に従い、実行環境
（development / test / production）の判定は環境変数 `APP_ENV` を
単一の情報源（single source of truth）とする。

- 値は `.env`（またはデプロイ先プラットフォームの環境変数）から読み込み、
  コードにハードコードしない。
- `APP_ENV` が未設定・不明な値の場合は fail closed で production 扱いとし、
  開発向けの挙動（詳細エラー表示等）を誤って本番に露出させない。
- LLM APIキー・LangSmith観測用のキーも同様に環境変数経由で読み込む。
  ひな形の段階ではキー自体を必須にせず、未設定でも起動・ヘルスチェックが
  可能な構成にする（実際のLLM呼び出し機能は今後の拡張スコープ）。
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """アプリケーションの実行環境。"""

    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """`.env` から読み込むアプリケーション設定。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "production"
    """実行環境。development / test / production のいずれか。
    未設定・不明値はfail closedでproductionとして扱う。"""

    # F7 AI日次サマリー用。値はハードコードせず、必ず.envまたはデプロイ先の環境変数から供給する。
    openai_api_key: str | None = None
    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str | None = None

    # Rails→FastAPI内部呼び出し用の共有シークレット（X-Internal-Api-Keyヘッダで照合、Issue #13）。
    # 未設定の場合はfail closedで /internal/ai/summaries への全リクエストを拒否する
    # （「未設定＝認証無効」という誤ったフォールバックを防ぐため）。
    internal_ai_api_key: str | None = None

    @property
    def environment(self) -> Environment:
        """`app_env` を判定済みのEnvironmentへ変換する（fail closed）。"""
        try:
            return Environment(self.app_env.strip().lower())
        except ValueError:
            # 不明な値は本番として扱い、開発用の挙動を誤って有効化しない。
            return Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    """Settingsのシングルトンを返す（起動ごとに.envを再読込しない）。"""
    return Settings()
