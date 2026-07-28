# requirements.md 1.6 F1 claim_device 手順1-2 / openapi.yaml POST /claim-codes (issueClaimCode)。
# ユーザーがダッシュボードの「デバイス追加」からreCAPTCHAを通過し、拠点を指定してクレームコード
# 発行を要求するエンドポイント。
module Api
  class ClaimCodesController < ApplicationController
    # コード発行のIP単位レート制限(openapi.yaml 429: reCAPTCHA検証失敗、またはコード発行のレート制限超過)。
    RATE_LIMIT_LIMIT = 10
    RATE_LIMIT_PERIOD = 10.minutes

    # requirements.md 1.3: reCAPTCHAのテスト用キー。本番はENV["RECAPTCHA_SECRET_KEY"]経由で
    # Google reCAPTCHA siteverify APIを呼び出す(値のハードコード禁止・シークレットは環境変数から取得)。
    RECAPTCHA_TEST_SUCCESS_TOKEN = "test-recaptcha-success"

    def create
      user = bridge_current_user
      return render_error(status: :unauthorized, code: "unauthorized", message: "Authentication is required.") unless user

      site = user.sites.find_by(id: claim_code_params[:siteId])
      unless site
        return render_error(status: :forbidden, code: "forbidden",
                             message: "The requested site does not belong to the authenticated user.")
      end

      if rate_limiter.exceeded?(request.remote_ip)
        return render_error(status: :too_many_requests, code: "rate_limited",
                             message: "Too many claim code issuance requests from this IP address.")
      end

      unless recaptcha_verified?(claim_code_params[:recaptchaToken])
        return render_error(status: :too_many_requests, code: "recaptcha_failed",
                             message: "reCAPTCHA verification failed.")
      end

      claim_code = ClaimCode.issue!(user: user, site: site)
      render json: { code: claim_code.code, expiresAt: claim_code.expires_at.iso8601 }, status: :created
    rescue ActionController::ParameterMissing => e
      render_error(status: :bad_request, code: "validation_error", message: e.message)
    end

    private

    def claim_code_params
      params.require(:siteId)
      params.require(:recaptchaToken)
      params.permit(:siteId, :recaptchaToken)
    end

    def rate_limiter
      ClaimDeviceService::RateLimiter.new(scope: "claim_code_issue", limit: RATE_LIMIT_LIMIT, period: RATE_LIMIT_PERIOD)
    end

    # 暫定実装: Issue #7(Google OAuth・テナント分離基盤)がcurrent_user解決を提供するまでの橋渡し。
    # environment.md準拠(fail closed): production環境ではこの分岐は絶対に到達させず、
    # 実認証(#7)が導入されるまでこのエンドポイントは常に401を返す。
    # メソッド名をあえて`current_user`にせず、#7実装後の置き換え漏れ・意図しない上書きを避ける。
    def bridge_current_user
      return nil if Rails.env.production?

      user_id = request.headers["X-User-Id"]
      return nil if user_id.blank?

      User.find_by(id: user_id)
    end

    # reCAPTCHA検証。openapi.yaml Errorスキーマのcodeでi18nキーを解決する設計のため、
    # ここでのmessageは開発者向け英語の固定文言でよい(CONTRACT.md「エラーレスポンスの形状」参照)。
    def recaptcha_verified?(token)
      return false if token.blank?

      if Rails.env.production?
        verify_recaptcha_with_google(token)
      else
        # テスト・開発環境ではネットワーク呼び出しをせず、テスト用トークンでの検証を可能にする
        # (requirements.md 1.3: 「reCAPTCHA検証をテスト用キーで検証可能にする」)。
        token == RECAPTCHA_TEST_SUCCESS_TOKEN
      end
    end

    def verify_recaptcha_with_google(token)
      secret_key = ENV.fetch("RECAPTCHA_SECRET_KEY")

      uri = URI("https://www.google.com/recaptcha/api/siteverify")
      response = Net::HTTP.post_form(uri, "secret" => secret_key, "response" => token)
      JSON.parse(response.body)["success"] == true
    rescue KeyError, StandardError => e
      Rails.logger.error("[ClaimCodesController] reCAPTCHA verification failed: #{e.class}: #{e.message}")
      false
    end

    def render_error(status:, code:, message:)
      render json: { error: { code: code, message: message } }, status: status
    end
  end
end
