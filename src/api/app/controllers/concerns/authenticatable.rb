# Googleログインセッション(httpOnlyのsession_id cookie)からcurrent_userを解決するconcern。
#
# src/shared/contracts/openapi.yaml securitySchemes.googleSessionCookie準拠。
# セッションはDBに永続化せず、Rails標準の暗号化cookie(ActionDispatch::Cookies)に
# 内部ユーザーIDのみを保持する(独自の署名/暗号化実装は行わない)。
module Authenticatable
  extend ActiveSupport::Concern

  SESSION_COOKIE_KEY = :session_id
  SESSION_TTL = 30.days

  included do
    before_action :authenticate_user!
  end

  private

  def authenticate_user!
    return if current_user

    Rails.logger.info("[Authenticatable] unauthenticated request path=#{request.path}")
    render json: { error: { code: "unauthorized", message: I18n.t("errors.unauthorized") } },
           status: :unauthorized
  end

  def current_user
    @current_user ||= user_from_session_cookie || development_bypass_user
  end

  def user_from_session_cookie
    user_id = cookies.encrypted[SESSION_COOKIE_KEY]
    return nil if user_id.blank?

    User.find_by(id: user_id)
  end

  def establish_session(user)
    cookies.encrypted[SESSION_COOKIE_KEY] = {
      value: user.id,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: SESSION_TTL.from_now
    }
    @current_user = user
  end

  def clear_session
    cookies.delete(SESSION_COOKIE_KEY)
    @current_user = nil
  end

  # .claude/rules/environment.md: 開発環境に限り「認証済み」へ自動分岐してよい
  # (テスト・開発の容易性のため)。ただしRails.envはRAILS_ENVを単一の情報源として
  # 解決される値であり、production環境ではdevelopment?が真になることは絶対にない
  # (fail closed)。本番UIにこのバイパスを露出する導線も一切存在しない。
  def development_bypass_user
    return nil unless Rails.env.development?

    Rails.logger.warn("[Authenticatable] development-only auto authentication bypass engaged")
    User.first || User.create!(google_sub: "dev-bypass-sub")
  end
end
