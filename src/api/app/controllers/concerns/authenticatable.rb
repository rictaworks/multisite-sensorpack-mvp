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

  # cookieのペイロードキー。Rails 8既定のJSON cookies_serializerで
  # ハッシュのまま安全にシリアライズされる。
  COOKIE_USER_ID_KEY = "userId".freeze
  COOKIE_TOKEN_VERSION_KEY = "tokenVersion".freeze

  # 暗号化cookie自体はRailsが改竄を検知するが、それだけでは「正当に発行されたcookieを
  # 窃取された」場合にサーバー側から無効化できない(有効期限まで有効なままになる)。
  # そのためユーザーIDに加えてsession_token_versionを載せ、DBの現在値と照合する。
  # ログアウト時にDB側を加算することで、発行済みcookieを一括失効させる
  # (User#revoke_all_sessions! / .claude/OWASP10.md A07)。
  def user_from_session_cookie
    payload = cookies.encrypted[SESSION_COOKIE_KEY]
    # 旧形式(ユーザーIDのみを格納していたcookie)は形式が一致しないため受け付けない。
    # 想定外の形状をフォールバックで解釈せず、再ログインを求める
    # (.claude/rules/coding-style.md: フォールバック処理を書かない)。
    return nil unless payload.is_a?(Hash)

    user_id = payload[COOKIE_USER_ID_KEY]
    token_version = payload[COOKIE_TOKEN_VERSION_KEY]
    return nil if user_id.blank? || token_version.nil?

    user = User.find_by(id: user_id)
    return nil unless user

    unless user.session_token_version == token_version
      Rails.logger.info(
        "[Authenticatable] rejected a revoked session cookie user_id=#{user.id} " \
        "cookie_version=#{token_version.inspect} current_version=#{user.session_token_version}"
      )
      return nil
    end

    user
  end

  def establish_session(user)
    cookies.encrypted[SESSION_COOKIE_KEY] = {
      value: {
        COOKIE_USER_ID_KEY => user.id,
        COOKIE_TOKEN_VERSION_KEY => user.session_token_version
      },
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: SESSION_TTL.from_now
    }
    @current_user = user
  end

  # ブラウザ側のcookie削除だけでは、窃取済みのcookieを無効化できない。
  # サーバー側でも発行済みセッションを失効させてから削除する。
  def clear_session
    current_user&.revoke_all_sessions!
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
