# ヘルスチェック用エンドポイントを提供するコントローラー。
#
# ロードバランサ・監視サービス・CI等からの死活監視に使用する。
# 認証を必要とせず、実行環境(development/test/production)とステータスのみを返す。
class HealthController < ApplicationController
  # GET /health
  #
  # アプリケーションが正常に応答できる状態かどうかを返す。
  # 想定外の例外はここで握りつぶさず、そのまま呼び出し元(Rails標準のエラーハンドリング)に委ねる。
  def show
    Rails.logger.info("[HealthController#show] health check requested environment=#{Rails.env}")

    render json: { status: "ok", environment: Rails.env }, status: :ok
  end
end
