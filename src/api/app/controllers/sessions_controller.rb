# Googleログインセッションの確立・参照・破棄を担うコントローラー。
#
# src/shared/contracts/openapi.yaml paths./auth/session 準拠。
# Next.js側でGoogle OAuth 2.0/OpenID Connectフローを完了し取得したIDトークンを検証し、
# 成立時にhttpOnlyのセッションcookieを発行する。DBにはgoogle_sub(opaque値)のみを保持し、
# メールアドレス・氏名等は一切保存しない(requirements.md 1.4節)。
class SessionsController < ApplicationController
  include Authenticatable

  skip_before_action :authenticate_user!, only: :create

  # POST /auth/session
  def create
    id_token = session_params[:idToken]
    recaptcha_token = session_params[:recaptchaToken]

    return render_validation_error("idToken is required") if id_token.blank?
    return render_validation_error("recaptchaToken is required") if recaptcha_token.blank?

    # requirements.md 1.3節: ログイン導線にreCAPTCHAを適用する。
    # Bot対策として機能させるため、Google IDトークンの検証(外部通信を伴う)より前に判定する。
    # 設定漏れ(RecaptchaVerifier::ConfigurationError)はここで握りつぶさず、
    # 「検証失敗」に化けさせないまま送出させる(.claude/rules/coding-style.md)。
    unless RecaptchaVerifier.verify(recaptcha_token)
      Rails.logger.warn("[SessionsController#create] reCAPTCHA verification failed; rejecting login attempt")
      return render json: { error: { code: "recaptcha_failed", message: I18n.t("errors.recaptcha_failed") } },
                    status: :too_many_requests
    end

    sub = GoogleIdTokenVerifier.verify_sub(id_token)
    user = User.find_or_create_by!(google_sub: sub)
    establish_session(user)

    Rails.logger.info("[SessionsController#create] session established user_id=#{user.id}")
    render json: { user: serialize_user(user) }, status: :ok
  rescue GoogleIdTokenVerifier::VerificationFailed => e
    Rails.logger.warn("[SessionsController#create] google id token verification failed: #{e.message}")
    render json: { error: { code: "invalid_id_token", message: I18n.t("errors.unauthorized") } },
           status: :unauthorized
  end

  # GET /auth/session
  def show
    render json: { user: serialize_user(current_user) }, status: :ok
  end

  # DELETE /auth/session
  def destroy
    Rails.logger.info("[SessionsController#destroy] session destroyed user_id=#{current_user&.id}")
    clear_session
    head :no_content
  end

  private

  def session_params
    params.permit(:idToken, :recaptchaToken)
  end

  def render_validation_error(message)
    render json: { error: { code: "validation_error", message: I18n.t("errors.validation_error"), details: { message: message } } },
           status: :bad_request
  end

  # レスポンスには内部の不透明なユーザーID(DBの主キー)のみを含め、
  # google_sub・メールアドレス・氏名は一切含めない(requirements.md 1.4節)。
  def serialize_user(user)
    { id: user.id.to_s, createdAt: user.created_at.iso8601 }
  end
end
