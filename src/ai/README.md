# src/ai — AI日次サマリー（F7）サービス（ひな形）

`requirements.md` 1.3節・F7に基づく、AI日次サマリー生成用のFastAPI（+LangChain）サービス。

**現時点のスコープ（Issue #3）はひな形+CIのみ。** クォータ制御・LLM呼び出し本体・
LangSmith観測の実配線は今後のIssueで実装する。

## セットアップ

```bash
cd src/ai
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # 必要に応じて値を編集
```

## 起動（開発）

```bash
.venv/bin/uvicorn app.main:app --reload
```

`GET /health` にアクセスすると `{"status": "ok", "environment": "development"}` が返る。

## テスト

```bash
.venv/bin/python -m pytest tests/ -v
```

## 環境変数

`.env.example` を参照。実際の値は `.env`（gitignore対象）またはデプロイ先
プラットフォームの環境変数に設定し、コードにハードコードしない。

- `APP_ENV`: development / test / production（未設定・不明値はfail closedでproduction扱い）
- `OPENAI_API_KEY`, `LANGCHAIN_*`: 今後のLLM連携・LangSmith観測用（現時点では未使用）

## 本番でのAPIドキュメント非公開について

`APP_ENV=production`（または未設定）の場合、`/docs` `/redoc` `/openapi.json` は
自動的に無効化される（OWASP A05: セキュリティ設定ミス対策）。
