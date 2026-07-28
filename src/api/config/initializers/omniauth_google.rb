# Google OAuth 2.0 / OpenID Connect まわりの設定(Issue #7)。
#
# 命名は元Issueの想定(config/initializers/omniauth*.rb)を踏襲しているが、実体は
# omniauth-google-oauth2 gem ではない。Next.js側が既にGoogle OAuth 2.0/OpenID Connect
# フローを完了させてIDトークン(JWT)を取得する構成(src/shared/contracts/openapi.yaml の
# /auth/session 参照)のため、Railsはサーバー主導のリダイレクトフローを行わず、
# 受け取ったIDトークンをGoogle公式のgoogleauth (Google::Auth::IDTokens.verify_oidc) で
# 検証するのみでよい。omniauth-google-oauth2はリダイレクトフロー前提のgemであり本構成に
# 合わないため採用していない(.claude/rules/architecture.md: 実績のあるOSSを優先しつつ、
# 実際の構成に適合しないライブラリを無理に使わない)。
#
# 検証本体は app/services/google_id_token_verifier.rb に実装する。
require "googleauth"
require "googleauth/id_tokens"

Rails.application.config.x.google_oauth_client_id = ENV["GOOGLE_OAUTH_CLIENT_ID"].presence

if Rails.env.production? && Rails.application.config.x.google_oauth_client_id.blank?
  # 本番でクライアントIDが未設定のままGoogleログインを提供することはできないため、
  # 起動時に即座に失敗させる(フォールバック禁止・Fail Fast)。
  raise "GOOGLE_OAUTH_CLIENT_ID is not set. Google login cannot be verified in production."
end

if Rails.application.config.x.google_oauth_client_id.blank?
  Rails.logger.warn(
    "[omniauth_google initializer] GOOGLE_OAUTH_CLIENT_ID is not set. " \
    "Google ID token verification will fail unless GoogleIdTokenVerifier is stubbed in tests."
  )
end
