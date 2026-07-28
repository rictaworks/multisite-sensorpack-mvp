"""LangChain日次サマリー生成サービス（app.services.langchain_summary）のテスト。

TDD方針（.claude/rules/testing.md）に基づき、実装より先にこのテストを red で用意する。
実LLM（OpenAI）へは一切接続せず、`_invoke_llm` をモック化してテストする
（Issue #13 受け入れ条件：「pytestでモックLLMを使った正常系・
データ不足時の定型文分岐のテストがある」）。

注記（データ不足分岐の解釈）:
requirements.md F7.4の「データが存在しない場合はLLMを呼ばず定型文を返す」は、
統計値を集計するRails側で判定される（本サービスの入力契約
`InternalAiSummaryRequest.stats` は必須の数値のみで「データなし」を表現できないため）。
本FastAPIサービス自身のスコープでの対応する定型文分岐は、
「LLM APIキー未設定時はLLMを呼ばずfail closedで定型文を返す」である
（.env未設定でもクォータを消費せず安全に動作させるため）。
"""

from __future__ import annotations

import os

import pytest

from app.config import Settings
from app.services import langchain_summary as target
from app.services.langchain_summary import (
    LLM_UNAVAILABLE_SUMMARY_TEXT,
    InternalAiAlertSummary,
    InternalAiMetricStats,
    InternalAiStats,
    InternalAiSummaryRequest,
    ThresholdBreachMinutes,
    build_summary_prompt,
    configure_langsmith_tracing,
    generate_daily_summary_text,
)


def _sample_request() -> InternalAiSummaryRequest:
    return InternalAiSummaryRequest(
        stats=InternalAiStats(
            temperature=InternalAiMetricStats(
                min=18.5,
                max=27.3,
                avg=22.1,
                thresholdBreachMinutes=ThresholdBreachMinutes(upper=12.0, lower=0.0),
            ),
            humidity=InternalAiMetricStats(
                min=40.0,
                max=65.2,
                avg=51.0,
                thresholdBreachMinutes=ThresholdBreachMinutes(upper=None, lower=None),
            ),
        ),
        alerts=[
            InternalAiAlertSummary(
                alertType="upper_breach",
                severity="warning",
                openedAt="2026-07-27T10:00:00Z",
                closedAt="2026-07-27T10:30:00Z",
            )
        ],
    )


# ---------------------------------------------------------------------------
# プロンプト設計: 個人情報の入力を前提としないことの確認
# ---------------------------------------------------------------------------


def test_request_model_rejects_personal_information_fields() -> None:
    """個人情報（userId/siteName/deviceId等）を含むペイロードは拒否される（extra="forbid"）。

    受け入れ条件「プロンプトが個人情報の入力を前提としない設計であることを
    テストで確認する」に対応。プロンプトへの入力経路がInternalAiSummaryRequestに
    限定され、かつそのモデルが未知フィールドを拒否することで、
    個人情報が構造的に混入できないことを保証する。
    """
    base = _sample_request().model_dump(by_alias=True)
    base["userId"] = "user-123"  # 個人情報を模した未知フィールド

    with pytest.raises(Exception):
        InternalAiSummaryRequest(**base)


def test_allowed_fields_contain_no_personal_identifiers() -> None:
    """契約上のフィールド名一覧に個人情報を示唆する語が含まれないことを確認する。"""
    forbidden_markers = ("user", "site", "device", "email", "name", "address")

    allowed_field_names = set(InternalAiSummaryRequest.model_fields.keys())
    allowed_field_names |= set(InternalAiStats.model_fields.keys())
    allowed_field_names |= set(InternalAiMetricStats.model_fields.keys())
    allowed_field_names |= set(InternalAiAlertSummary.model_fields.keys())

    for field_name in allowed_field_names:
        lowered = field_name.lower()
        for marker in forbidden_markers:
            assert marker not in lowered, f"{field_name} looks like PII"


def test_build_summary_prompt_contains_only_statistical_values() -> None:
    """生成されるプロンプトが統計値・アラート種別/重要度/時刻のみで構成される。"""
    request = _sample_request()

    prompt = build_summary_prompt(request.stats, request.alerts)

    assert "22.1" in prompt  # 平均気温
    assert "upper_breach" in prompt
    assert "warning" in prompt
    # 個人情報を示す文字列が紛れ込んでいないこと
    for marker in ("userId", "siteName", "deviceId", "email"):
        assert marker not in prompt


# ---------------------------------------------------------------------------
# 正常系（モックLLM）
# ---------------------------------------------------------------------------


def test_generate_daily_summary_text_uses_mocked_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """APIキー設定済み・モックLLMで日本語サマリーが生成される（正常系）。"""
    monkeypatch.setattr(target, "_invoke_llm", lambda prompt, settings: "モックによる日本語サマリー")

    settings = Settings(openai_api_key="sk-test-dummy", app_env="test")
    request = _sample_request()

    result = generate_daily_summary_text(request, settings)

    assert result == "モックによる日本語サマリー"


# ---------------------------------------------------------------------------
# fail closed: LLM APIキー未設定時は定型文を返す（LLMを呼ばない）
# ---------------------------------------------------------------------------


def test_generate_daily_summary_text_fails_closed_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """OPENAI_API_KEY未設定時はLLMを呼ばずfail closedで定型文を返す。

    requirements.md F7.4の「データ不足時はLLMを呼ばず定型文を返す」と同じ設計思想を、
    本サービスのスコープ（LLM連携部分）に適用したもの：呼び出し不能な状態でLLMに
    到達しようとせず、明示的な定型文分岐を行う。
    """

    def _fail_if_called(prompt: str, settings: Settings) -> str:
        raise AssertionError("APIキー未設定時にLLMが呼び出されてはならない")

    monkeypatch.setattr(target, "_invoke_llm", _fail_if_called)

    settings = Settings(openai_api_key=None, app_env="test")
    request = _sample_request()

    result = generate_daily_summary_text(request, settings)

    assert result == LLM_UNAVAILABLE_SUMMARY_TEXT


def test_generate_daily_summary_text_fails_closed_with_blank_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """空文字のAPIキーも「未設定」として扱いfail closedする（空文字フォールバック防止）。"""

    def _fail_if_called(prompt: str, settings: Settings) -> str:
        raise AssertionError("空文字APIキーでLLMが呼び出されてはならない")

    monkeypatch.setattr(target, "_invoke_llm", _fail_if_called)

    settings = Settings(openai_api_key="   ", app_env="test")
    request = _sample_request()

    result = generate_daily_summary_text(request, settings)

    assert result == LLM_UNAVAILABLE_SUMMARY_TEXT


# ---------------------------------------------------------------------------
# LangSmith観測（requirements.md 1.3節）
# ---------------------------------------------------------------------------


def test_configure_langsmith_tracing_propagates_settings_to_environment() -> None:
    """settings（.env由来）の値がLangChainが参照するos.environへ確実に反映される。

    pydantic-settingsはSettingsオブジェクトへの読み込みのみでos.environを
    自動更新しないため、LangChain本体のトレーサーが読む実環境変数へ明示的に
    反映する必要がある（LangSmithによる観測を実際に有効化するため）。
    """
    original = {
        key: os.environ.get(key)
        for key in ("LANGCHAIN_TRACING_V2", "LANGCHAIN_API_KEY", "LANGCHAIN_PROJECT")
    }
    try:
        settings = Settings(
            langchain_tracing_v2=True,
            langchain_api_key="ls-test-key",
            langchain_project="multisite-sensorpack-mvp-test",
            app_env="test",
        )

        configure_langsmith_tracing(settings)

        assert os.environ["LANGCHAIN_TRACING_V2"] == "true"
        assert os.environ["LANGCHAIN_API_KEY"] == "ls-test-key"
        assert os.environ["LANGCHAIN_PROJECT"] == "multisite-sensorpack-mvp-test"
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_configure_langsmith_tracing_disabled_sets_explicit_false() -> None:
    """トレーシング無効時は"false"を明示的に設定する（未設定放置によるフォールバック禁止）。"""
    original = os.environ.get("LANGCHAIN_TRACING_V2")
    try:
        settings = Settings(langchain_tracing_v2=False, app_env="test")

        configure_langsmith_tracing(settings)

        assert os.environ["LANGCHAIN_TRACING_V2"] == "false"
    finally:
        if original is None:
            os.environ.pop("LANGCHAIN_TRACING_V2", None)
        else:
            os.environ["LANGCHAIN_TRACING_V2"] = original
