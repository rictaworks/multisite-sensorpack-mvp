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

    def create
      site = authorize_owner!(Site.find(claim_code_params[:siteId]))

      if rate_limiter.exceeded?(request.remote_ip)
        return render_error(status: :too_many_requests, code: "rate_limited", i18n_key: "errors.rate_limited")
      end

      unless RecaptchaVerifier.verify(claim_code_params[:recaptchaToken])
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

    def render_error(status:, code:, i18n_key:, details: nil)
      render json: { error: { code: code, message: I18n.t(i18n_key), details: details } }, status: status
    end
  end
end
