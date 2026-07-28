"""AI日次サマリー（F7）のLangChain連携部分（Issue #13）。

`src/shared/contracts/openapi.yaml` の `internal-ai` タグ（
`InternalAiSummaryRequest` / `InternalAiSummaryResponse`）を目標契約とし、
Pydanticモデルのフィールド名・型を手動で一致させている
（`src/shared/contracts/CONTRACT.md` FastAPI節を参照）。

設計上の注意（個人情報を扱わない）:
    このモジュールへ渡せる入力は `InternalAiSummaryRequest` に限定される。
    同モデルは `extra="forbid"` により契約外のフィールド（ユーザーID・拠点名・
    デバイス識別子等）を構造的に拒否するため、LLMへ渡すプロンプトに
    個人情報が混入する経路自体が存在しない（requirements.md 1.6 F7.2）。

設計上の注意（データ不足時の定型文分岐）:
    requirements.md F7.4「データが存在しない場合はLLMを呼ばず定型文を返す」は、
    統計値を集計するRails側の責務である（本サービスの入力契約 `stats` は
    必須の数値のみで「データなし」を表現できないため、Railsは元データが
    存在しない場合は本エンドポイントを呼び出さない設計になる）。
    本サービス自身のスコープ（LLM連携部分）における対応する定型文分岐は、
    「LLM APIキー未設定時はLLMを呼ばずfail closedで定型文を返す」である。
    これによりAPIキー未設定の開発環境でも安全に起動・動作でき、
    誤ってLLMへ空のクレデンシャルで到達しようとすることもない。
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.config import Settings

logger = logging.getLogger(__name__)

LLM_UNAVAILABLE_SUMMARY_TEXT = (
    "本日のAI要約は現在生成できません（AIサービスの設定が未完了です）。"
    "しばらくしてから再度お試しください。"
)
"""LLM APIキー未設定時にLLMを呼ばず返す定型文（日本語）。クォータは消費しない。"""


class _ApiModel(BaseModel):
    """契約(openapi.yaml)のcamelCaseフィールド名とPythonの命名規約を橋渡しする基底モデル。

    `extra="forbid"` により、契約に定義されていない未知フィールド
    （個人情報を含む可能性のあるもの）を構造的に拒否する。
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class ThresholdBreachMinutes(_ApiModel):
    """`InternalAiMetricStats.thresholdBreachMinutes` に対応。"""

    upper: float | None = None
    lower: float | None = None


class InternalAiMetricStats(_ApiModel):
    """`components.schemas.InternalAiMetricStats` に対応。"""

    min: float
    max: float
    avg: float
    threshold_breach_minutes: ThresholdBreachMinutes


class InternalAiStats(_ApiModel):
    """`components.schemas.InternalAiStats` に対応。"""

    temperature: InternalAiMetricStats
    humidity: InternalAiMetricStats


AlertTypeCode = Literal["upper_breach", "lower_breach", "offline"]
AlertSeverity = Literal["info", "warning", "critical"]


class InternalAiAlertSummary(_ApiModel):
    """`components.schemas.InternalAiAlertSummary` に対応。個人情報を含まない。

    `opened_at`/`closed_at` はISO 8601日時として厳密にバリデーションする
    （フリーテキストを許容すると、内部限定呼び出しとはいえLLMプロンプトへの
    プロンプトインジェクションの経路になり得るため。OWASP A03/A04対策の多層防御）。
    """

    alert_type: AlertTypeCode
    severity: AlertSeverity
    opened_at: datetime
    closed_at: datetime | None = None


class InternalAiSummaryRequest(_ApiModel):
    """`components.schemas.InternalAiSummaryRequest` に対応。

    統計値のみ（個人情報なし）のペイロード。未知フィールドはvalidationエラーになる。
    """

    stats: InternalAiStats
    alerts: list[InternalAiAlertSummary]


class InternalAiSummaryResponse(_ApiModel):
    """`components.schemas.InternalAiSummaryResponse` に対応。"""

    summary_text: str


def configure_langsmith_tracing(settings: Settings) -> None:
    """LangSmith観測用の環境変数を実プロセス環境(os.environ)へ反映する。

    pydantic-settingsは`.env`の値を`Settings`オブジェクトへ読み込むのみで、
    プロセスの`os.environ`を自動更新しない。LangChain本体のトレーサーは
    `os.environ`を直接参照するため、ここで明示的に反映しない限り
    LangSmithによる観測（requirements.md 1.3節）が有効化されない。

    値は`settings`（単一の情報源である.env／デプロイ先環境変数）から
    取得し、未設定・無効時は明示的に"false"を設定する
    （設定漏れによる意図しない有効化・無効化のフォールバックを避けるため）。
    """
    os.environ["LANGCHAIN_TRACING_V2"] = "true" if settings.langchain_tracing_v2 else "false"

    if settings.langchain_api_key:
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    if settings.langchain_project:
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project

    logger.debug(
        "langsmith tracing configured: tracing_v2=%s project=%s",
        settings.langchain_tracing_v2,
        settings.langchain_project,
    )


def build_summary_prompt(
    stats: InternalAiStats, alerts: list[InternalAiAlertSummary]
) -> str:
    """統計値・アラート概要のみから日本語サマリー生成用プロンプトを組み立てる。

    入力は`InternalAiStats`/`InternalAiAlertSummary`（統計値・アラート種別・
    重要度・時刻のみ）に限定されており、個人情報の入力を前提としない設計。
    """
    lines = [
        "以下は過去24時間のセンサー統計値です。個人情報は含まれていません。"
        "この情報のみをもとに、日本語で簡潔な状況サマリーを2〜3文で作成してください。",
        "",
        "[気温]",
        f"最小: {stats.temperature.min}C, 最大: {stats.temperature.max}C, "
        f"平均: {stats.temperature.avg}C",
        f"閾値超過時間(分) 上限:{stats.temperature.threshold_breach_minutes.upper} "
        f"下限:{stats.temperature.threshold_breach_minutes.lower}",
        "",
        "[湿度]",
        f"最小: {stats.humidity.min}%, 最大: {stats.humidity.max}%, "
        f"平均: {stats.humidity.avg}%",
        f"閾値超過時間(分) 上限:{stats.humidity.threshold_breach_minutes.upper} "
        f"下限:{stats.humidity.threshold_breach_minutes.lower}",
        "",
        "[アラート]",
    ]

    if alerts:
        for alert in alerts:
            closed_at_text = alert.closed_at.isoformat() if alert.closed_at else "未解消"
            lines.append(
                f"- 種別:{alert.alert_type} 重要度:{alert.severity} "
                f"発生:{alert.opened_at.isoformat()} 解消:{closed_at_text}"
            )
    else:
        lines.append("- アラートなし")

    return "\n".join(lines)


def _invoke_llm(prompt: str, settings: Settings) -> str:
    """LangChain経由でLLM(OpenAI)を呼び出し、生成テキストを返す。

    テストではこの関数をモック化し、実際のネットワーク呼び出し・
    LLM APIキーを必要とせずに正常系を検証する
    （Issue #13受け入れ条件：モックLLMによるpytest）。
    """
    # 遅延importにより、ひな形段階(Issue #3)のヘルスチェックのみのテストや
    # LLM未使用パス(fail closed分岐)ではlangchain_openaiの初期化コストを避ける。
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key)
    response = llm.invoke(prompt)
    return str(response.content)


def generate_daily_summary_text(
    request: InternalAiSummaryRequest, settings: Settings
) -> str:
    """統計値・アラート概要から日本語の日次サマリー本文を生成する。

    OPENAI_API_KEY未設定（空文字含む）の場合はLLMを呼ばず、fail closedで
    定型文(`LLM_UNAVAILABLE_SUMMARY_TEXT`)を返す。
    """
    configure_langsmith_tracing(settings)

    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        logger.warning(
            "OPENAI_API_KEY is not configured; returning fail-closed boilerplate "
            "summary without calling the LLM."
        )
        return LLM_UNAVAILABLE_SUMMARY_TEXT

    prompt = build_summary_prompt(request.stats, request.alerts)
    logger.debug("generated summary prompt (length=%d)", len(prompt))

    return _invoke_llm(prompt, settings)
