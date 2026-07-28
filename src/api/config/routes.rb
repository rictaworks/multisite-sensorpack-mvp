Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # アプリケーション独自のヘルスチェック(実行環境情報を含むJSONを返す)。
  # CI・監視サービス・以降のバックエンド機能issueの疎通確認に使用する。
  get "health" => "health#show"

  # Defines the root path route ("/")
  # root "posts#index"
end
