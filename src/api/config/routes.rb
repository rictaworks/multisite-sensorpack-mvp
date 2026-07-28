Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # アプリケーション独自のヘルスチェック(実行環境情報を含むJSONを返す)。
  # CI・監視サービス・以降のバックエンド機能issueの疎通確認に使用する。
  get "health" => "health#show"

  namespace :api do
    # F8 アラート管理API(一覧・未対応件数・ack)。src/shared/contracts/openapi.yamlの
    # listAlerts/acknowledgeAlertに対応する(Issue #15)。
    get "alerts" => "alerts#index"
    get "alerts/unread_count" => "alerts#unread_count"
    post "alerts/:alertId/ack" => "alerts#ack", as: :ack_alert
  end

  # Defines the root path route ("/")
  # root "posts#index"
end
