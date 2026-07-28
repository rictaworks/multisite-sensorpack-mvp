"""環境判定（Settings.environment）のテスト。

.claude/rules/environment.md：
「環境判定は環境変数を単一の情報源とし、複数箇所で独自に推測しない」
「判定できない・不明な場合は本番として扱う（fail closed）」
を検証する。
"""

import pytest

from app.config import Environment, Settings


def test_known_environment_values_are_mapped_correctly() -> None:
    assert Settings(app_env="development").environment is Environment.DEVELOPMENT
    assert Settings(app_env="test").environment is Environment.TEST
    assert Settings(app_env="production").environment is Environment.PRODUCTION


def test_unknown_environment_value_fails_closed_to_production() -> None:
    """未知の値（typo等）は開発扱いにせず、fail closedで本番として扱う。"""
    assert Settings(app_env="staging-typo").environment is Environment.PRODUCTION
    assert Settings(app_env="").environment is Environment.PRODUCTION


def test_default_environment_is_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """APP_ENV未設定時のデフォルトは本番扱い（fail closed）。

    CI・ローカルの実行環境自体に `APP_ENV` が設定されていても
    このテストの意図（未設定時の挙動）がぶれないよう、
    monkeypatchで明示的に環境変数を除去したうえで検証する。
    """
    monkeypatch.delenv("APP_ENV", raising=False)

    assert Settings().environment is Environment.PRODUCTION
