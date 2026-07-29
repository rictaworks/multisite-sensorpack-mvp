Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # アプリケーション独自のヘルスチェック(実行環境情報を含むJSONを返す)。
  # CI・監視サービス・以降のバックエンド機能issueの疎通確認に使用する。
  get "health" => "health#show"

  # Issue #7: Googleログインセッション(src/shared/contracts/openapi.yaml /auth/session)。
  post "auth/session" => "sessions#create"
  get "auth/session" => "sessions#show"
  delete "auth/session" => "sessions#destroy"

  # 注記(Issue #8): src/web/components/claim/api.ts(Issue #19)が`/api/v1/claim-codes`を
  # 直接fetchしている実績があるため、F1関連の2ルートのみ`/api/v1`配下に置く。
  # Issue #15の`namespace :api`配下(`/api/alerts`)はopenapi.yamlのservers(`/api/v1`)と
  # 厳密には食い違っており、`/api/v1`への統一は別issueでの整理が必要(WORK報告に記載)。
  namespace :api do
    # F8 アラート管理API(一覧・未対応件数・ack)。src/shared/contracts/openapi.yamlの
    # listAlerts/acknowledgeAlertに対応する(Issue #15)。
    get "alerts" => "alerts#index"
    get "alerts/unread_count" => "alerts#unread_count"
    post "alerts/:alertId/ack" => "alerts#ack", as: :ack_alert

    # F7 AI日次サマリー クォータ制御API。src/shared/contracts/openapi.yamlの
    # getTodaySummary/generateDailySummaryに対応する(Issue #14)。
    get "ai-summaries/today" => "summaries#today"
    post "ai-summaries" => "summaries#create"
  end

  # src/shared/contracts/openapi.yaml servers: /api/v1 を基準パスとする。
  # コントローラは Api::* 名前空間(app/controllers/api/)に配置し、URLパスにはv1を含めるが
  # コントローラのモジュール名には含めない(将来の/api/v2導入時にコントローラ側の破壊的変更を避ける)。
  scope "api/v1", module: "api" do
    # F1 デバイス登録(クレームコード方式)
    post "claim-codes" => "claim_codes#create"
    post "devices/claim" => "device_claims#create"

    # F2+F3 テレメトリ受信・閾値判定(ヒステリシス)。認証はセッションcookieではなく
    # デバイストークン(Authorization: Bearer)、Api::TelemetryController内のDeviceAuthenticatable参照(Issue #9)。
    post "telemetry" => "telemetry#create"

    # F5 遠隔手動制御(LED/ファンコマンド発行)。src/shared/contracts/openapi.yamlのcreateCommandに
    # 対応する(Issue #11)。ユーザー側APIのためGoogleセッションcookie認証(Authenticatable/TenantScoped)。
    post "devices/:deviceId/commands" => "commands#create"
  end

  # F9 開発者向け管理画面(Issue #16)。BASIC認証(Admin::BaseController)で保護され、
  # 一般消費者向けGoogleログイン導線(/auth/session)とは完全に分離している
  # (.claude/rules/environment.md)。日本語のみのUIでよい(.claude/rules/i18n.md)。
  namespace :admin do
    root to: "devices#index"
    resources :devices, only: [ :index ]
    resources :ai_quota_usages, only: [ :index, :create ]
  end

  # Defines the root path route ("/")
  # root "posts#index"
end
