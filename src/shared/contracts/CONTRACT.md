# API契約（`src/shared/contracts/`）

このディレクトリは、Web（Next.js）・Rails API・FastAPI（AIサマリー）・ESP32ファームウェアの
**すべてが参照するAPI契約のsingle source of truth**です。`requirements.md` 1.6節（関数ロジック v3・最終版）を
正とし、その内容をOpenAPI 3.1形式で定義しています。

このIssue（#5）は他の12件のissueから参照される基盤issueです。エンドポイント・スキーマの追加や変更を行う際は、
必ずこのファイルとテストを最新に保ってください。

## ディレクトリ構成

```
src/shared/contracts/
├── openapi.yaml       # 契約本体（OpenAPI 3.1）。変更の起点は必ずこのファイル。
├── CONTRACT.md         # このファイル。参照方針・運用ルール。
├── redocly.yaml        # lintルール設定（@redocly/cli）
├── package.json        # lint / 型生成 / 契約テストのスクリプト一式
├── tsconfig.json        # 生成型のコンパイル検証用
├── types/
│   └── api.ts           # openapi.yamlから自動生成されたTypeScript型（手編集禁止）
└── tests/
    └── contract.test.mjs # 受け入れ条件を検証する回帰テスト（node:test）
```

## 各サービスからの参照方針

### Next.js（Web）

- `src/shared/contracts/types/api.ts` の `paths` / `components["schemas"]` 型を、`fetch` ラッパーの型引数として
  直接importして使う。API形状をコンポーネント側で再定義しない。
- 例：
  ```ts
  import type { paths } from "../../../shared/contracts/types/api";

  type TelemetryIngestResponse =
    paths["/telemetry"]["post"]["responses"]["200"]["content"]["application/json"];
  ```
- モノレポ内の相対importが煩雑になる場合は、Next.js側の `tsconfig.json` に `paths` エイリアス
  （例：`@contracts/*` → `src/shared/contracts/types/*`）を設定してよい。
- 型は`npm run generate:types`で生成されたものをそのままコミットして参照する（web側でのopenapi-typescript再実行は不要）。

### Rails API（バックエンド）

- Rubyは`types/api.ts`を直接使えないため、`openapi.yaml` そのものを実装の正とする。
- リクエスト/レスポンスの形状検証は、`committee` や `openapi_first` など実績あるgemを用いて
  RSpecのrequest specでopenapi.yamlに対して検証することを推奨する（車輪の再発明をしない／architecture.md準拠）。
- シリアライザ（ActiveModelSerializer等）のフィールド名は、`openapi.yaml` の `components.schemas` の
  プロパティ名（camelCase）と一致させる。DB上のカラム名（snake_case）とAPIレスポンスのキー名（camelCase）が
  異なる点に注意する。
- `internal-ai` タグのエンドポイント（`/internal/ai/summaries`）は、RailsがFastAPIへ送信する
  リクエストの形状として扱う（Rails視点ではHTTPクライアント側の契約）。

### FastAPI（AIサマリー内部サービス）

- FastAPIはPydanticモデルから自身のOpenAPIスキーマ（`/openapi.json`）を実行時に自動生成する。
  本ファイルの `internal-ai` タグ配下（`InternalAiSummaryRequest` / `InternalAiSummaryResponse` /
  `/internal/ai/summaries`）は、FastAPI側が実装すべき **目標契約** である。
- FastAPI実装時は、Pydanticモデルのフィールド名・型をこの契約に合わせて手動で一致させること。
- 個人情報（ユーザーID・拠点名・デバイス識別子等）を一切含めない統計値のみのペイロードである点を
  Pydanticモデルのdocstring／コメントにも明記する（requirements.md 1.4節・1.6 F7.2）。
- 将来的な改善として、FastAPI起動時に自身の`/openapi.json`とこの`openapi.yaml`の`internal-ai`タグ部分を
  diffするCIチェックの追加を検討する（FastAPIサブプロジェクト作成時にissue化する）。

### ESP32ファームウェア（Arduino/C++）

- 型生成・スキーマ検証ツールチェーンは適用しない。ファームウェア実装者は`openapi.yaml`
  （またはこの節の表）を直接読み、JSONペイロードのフィールド名・値域・ステータスコードを確認する。
- 関係するエンドポイントは次の3つのみ：
  - `POST /devices/claim`（`claim`タグ）: クレームコード送信、デバイストークン受領。
  - `POST /telemetry`（`telemetry`タグ）: `Authorization: Bearer <deviceToken>` ヘッダ必須。
    `seq` は再送検知用の単調増加連番。`temperatureC`は-40〜85、`humidityPct`は0〜100の範囲を厳守する
    （範囲外は破棄されデバイス統計にのみ記録される。エラーにはならないが送信側でのセンサー異常検知に活用できる）。
    レスポンスの`commands`配列（最大5件）をLED/ファン駆動に反映し、実行後は次回送信の`commandAcks`に
    `idempotencyKey`を同梱してACKする。
  - コマンドの`commandType`は `LED_ON` / `LED_OFF` / `FAN_ON` / `FAN_OFF` の4値のみ。

## 認証方式（`securitySchemes`）

| スキーム名 | 方式 | 用途 |
|---|---|---|
| `googleSessionCookie` | apiKey（cookie: `session_id`） | 一般消費者のGoogleログインセッション。Next.js↔Rails間。 |
| `deviceBearerToken` | http bearer | ESP32のテレメトリ送信。`claimDevice`成立時に発行される長寿命トークン。 |
| `internalServiceKey` | apiKey（header: `X-Internal-Api-Key`） | Rails→FastAPIのServer-to-Server呼び出し専用。外部非公開。 |
| `adminBasicAuth` | http basic | F9開発者用管理画面。一般消費者向けログインとは別物（environment.md準拠）。 |

開発環境の自動認証ショートカット（environment.md）は、この契約上のいかなるセキュリティスキームとしても
定義しない。本番到達不可能な分岐はRails側の実装・テストで保証する（本ファイルのスコープ外）。

## エラーレスポンスの形状

すべてのエラーは `components.schemas.Error` （`{ error: { code, message, details? } }`）で統一する。
requirements.mdに記載の主要ステータス：

| ステータス | 意味 | 主な発生箇所 |
|---|---|---|
| 401 | 認証情報が無効 | セッション無効、デバイストークン不正、内部サービスキー不正、クレームコード不正 |
| 403 | テナント分離違反 | 他ユーザーの拠点・デバイス・アラート等への越境アクセス |
| 404 | 存在しない／論理削除済み | 拠点・デバイス・アラート等が見つからない |
| 410 | デバイスGone | 論理削除済みデバイスへのテレメトリ送信 |
| 429 | レート制限／クォータ超過 | reCAPTCHA失敗によるレート制限、AI日次サマリーのクォータ超過 |

## 個人情報の取り扱い（requirements.md 1.4節）

- `components.schemas` にはメールアドレス・氏名・住所・電話番号・生年月日・Google `sub` 値そのものを
  含むフィールドは一切定義しない。`User`スキーマはopaqueな内部IDのみを持つ。
- 拠点名（`Site.name`）は自由入力ラベルであり、住所を意味するフィールド名・バリデーションを設けない。
- `tests/contract.test.mjs` の `個人情報らしきフィールドが見つかった` テストが、`components.schemas`配下の
  プロパティ名を静的に走査してこれを継続的に保証する。新しいフィールドを追加する際は、まずこのテストが
  green のままであることを確認すること。

## バージョニング方針

- 破壊的変更（既存フィールドの削除・型変更・必須化、エンドポイントのパス/メソッド変更等）は
  `/api/v1` → `/api/v2` のようにパスプレフィックスを分け、新しいissueで議論のうえ導入する。
- 後方互換な追加（新しい任意フィールド、新しいエンドポイント）は、このIssue後続のPRで直接`openapi.yaml`に
  追記してよい。ただし必ず`npm run validate`をgreenにしてからコミットする。

## ローカルでの検証方法

```bash
cd src/shared/contracts
npm install
npm run validate   # lint → 型生成 → 型コンパイル検証 → 契約テストを一括実行
```

個別に実行する場合：

```bash
npm run lint            # @redocly/cli lint によるOpenAPI構文・ベストプラクティス検証
npm run generate:types  # openapi-typescript による types/api.ts 再生成
npm run typecheck       # 生成された型がTypeScriptとしてコンパイル可能か検証
npm test                # requirements.md記載の受け入れ条件を検証する回帰テスト
```

`types/api.ts` は生成物としてリポジトリにコミットする。`openapi.yaml` を変更した場合は、
必ず `npm run generate:types` を再実行し、差分ごとコミットすること（CIでも整合性を検証する）。

## 既知の残課題（フォローアップ）

- `openapi-typescript@7.13.0` が内部で使用する `@redocly/openapi-core@1.34.17` は、さらに内部で
  `js-yaml@4.2.0`（既知の高深刻度脆弱性 GHSA-52cp-r559-cp3m を含む、YAMLのmerge-keyチェーンによる
  CPU消費DoS）に依存している。この脆弱性はビルド時にのみ・自分たちがコミットした信頼済みの
  `openapi.yaml` を解析する用途でのみ発生し、外部から供給される未信頼YAMLを処理する経路は存在しないため、
  本番runtimeへの影響はない（OWASP A06観点でのレビュー済み・許容リスクとして記録）。
  `js-yaml@5.x`へ強制アップグレードすると`openapi-typescript`が内部エラーで動作不能になることを確認済み
  （`js_yaml_1.types.merge`未定義エラー）。上流の`openapi-typescript`が`@redocly/openapi-core@2.x`系へ
  追従した時点で解消される見込み。定期的に`npm outdated`を確認し、追従され次第アップデートすること。
- FastAPI・Railsそれぞれのサブプロジェクト作成時に、実装側のスキーマ（Pydantic / RSpec request spec）と
  本契約の自動diffチェックを追加することを検討する（現時点ではサブプロジェクト未作成のため見送り）。
