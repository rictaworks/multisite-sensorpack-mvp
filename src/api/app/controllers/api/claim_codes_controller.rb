# requirements.md 1.6 F1 claim_device 手順1-2 / openapi.yaml POST /claim-codes (issueClaimCode)。
# ユーザーがダッシュボードの「デバイス追加」からreCAPTCHAを通過し、拠点を指定してクレームコード
# 発行を要求するエンドポイント。
#
# 認証・テナント分離はIssue #7で整備された Authenticatable/TenantScoped concern に委譲する
# (自前のユーザー識別・所有権チェックを再実装しない。.claude/rules/architecture.md準拠)。
module Api
  class ClaimCodesController < ApplicationController
    include Authenticatable
    include TenantScoped

    # コード発行のIP単位レート制限(openapi.yaml 429: reCAPTCHA検証失敗、またはコード発行のレート制限超過)。
    RATE_LIMIT_LIMIT = 10
    RATE_LIMIT_PERIOD = 10.minutes

    # requirements.md 1.3: reCAPTCHAのテスト用キー。本番はENV["RECAPTCHA_SECRET_KEY"]経由で
    # Google reCAPTCHA siteverify APIを呼び出す(値のハードコード禁止・シークレットは環境変数から取得)。
    RECAPTCHA_TEST_SUCCESS_TOKEN = "test-recaptcha-success"

    def create
      site = authorize_owner!(Site.find(claim_code_params[:siteId]))

      if rate_limiter.exceeded?(request.remote_ip)
        return render_error(status: :too_many_requests, code: "rate_limited", i18n_key: "errors.rate_limited")
      end

      unless recaptcha_verified?(claim_code_params[:recaptchaToken])
        return render_error(status: :too_many_requests, code: "recaptcha_failed", i18n_key: "errors.recaptcha_failed")
      end

      claim_code = ClaimCode.issue!(user: current_user, site: site)
      render json: { code: claim_code.code, expiresAt: claim_code.expires_at.iso8601 }, status: :created
    rescue ActionController::ParameterMissing => e
      render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error", details: { message: e.message })
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

    # reCAPTCHA検証。openapi.yaml Errorスキーマのcodeでi18nキーを解決する設計のため、
    # messageはI18n(config/locales)経由で7言語ぶん用意している(CONTRACT.md「エラーレスポンスの形状」参照)。
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

    def render_error(status:, code:, i18n_key:, details: nil)
      render json: { error: { code: code, message: I18n.t(i18n_key), details: details } }, status: status
    end
  end
end
