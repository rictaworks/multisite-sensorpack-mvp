# reCAPTCHA(requirements.md 1.3節)の設定に関する起動時チェック。
#
# 実際の検証はapp/services/recaptcha_verifier.rbがリクエストごとにENVを参照して行う
# (未設定ならConfigurationErrorを送出し、検証失敗として黙って通過させない)。
# この初期化処理はconfig/initializers/omniauth_google.rb・admin_basic_auth.rbと同じ方針で、
# production環境で設定が欠けたまま起動することを防ぐ(Fail Fast)。
#
# 未設定のまま本番稼働すると、ログイン導線とデバイス登録導線の両方が全ユーザーに対して
# 機能しなくなるため、起動時点で気付けるようにしておく必要がある。
if Rails.env.production? && ENV["RECAPTCHA_SECRET_KEY"].blank?
  raise "RECAPTCHA_SECRET_KEY is not set. " \
        "reCAPTCHA cannot be verified in production, which would block both the login " \
        "flow (POST /auth/session) and claim code issuance (POST /api/v1/claim-codes)."
end

if ENV["RECAPTCHA_SECRET_KEY"].blank?
  Rails.logger.warn(
    "[recaptcha initializer] RECAPTCHA_SECRET_KEY is not set. " \
    "Non-production environments verify against RecaptchaVerifier::TEST_SUCCESS_TOKEN instead, " \
    "so this is expected during local development and tests."
  )
end
