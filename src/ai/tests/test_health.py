"""GET /health エンドポイントのテスト。

TDD方針（.claude/rules/testing.md）に基づき、実装前にこのテストを red で用意する。
FastAPIのTestClientを用いたブラックボックステスト。
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200_ok() -> None:
    """/health は常に200を返す（サービス生存確認用）。"""
    response = client.get("/health")

    assert response.status_code == 200


def test_health_returns_expected_payload() -> None:
    """/health のレスポンスにはstatusとenvironmentが含まれる。

    environmentは.envのAPP_ENVを単一の情報源として判定する
    （.claude/rules/environment.md）。
    """
    response = client.get("/health")
    payload = response.json()

    assert payload["status"] == "ok"
    assert payload["environment"] in ("development", "test", "production")


def test_health_does_not_leak_secrets() -> None:
    """/health のレスポンスにAPIキー等のシークレットが含まれないこと（OWASP A02/A05）。"""
    response = client.get("/health")
    body_text = response.text.lower()

    assert "key" not in body_text
    assert "secret" not in body_text
    assert "token" not in body_text
