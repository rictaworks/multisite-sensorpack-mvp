# F9 開発者向け管理画面(Issue #16)のBASIC認証情報に関する起動時チェック。
#
# 実際の認証判定(リクエストごとのENV参照)はapp/controllers/admin/base_controller.rbで
# 行う(fail closed: 値が空なら常に拒否)。この初期化処理はconfig/initializers/omniauth_google.rb
# と同じ方針で、production環境で認証情報が未設定のまま起動することを防ぐ(Fail Fast)。
#
# 認証情報はADMIN_BASIC_AUTH_USER/ADMIN_BASIC_AUTH_PASSWORD(.env)経由でのみ設定し、
# コードにハードコードしない(.claude/rules/environment.md, requirements.md F9受け入れ条件)。
if Rails.env.production? &&
   (ENV["ADMIN_BASIC_AUTH_USER"].blank? || ENV["ADMIN_BASIC_AUTH_PASSWORD"].blank?)
  raise "ADMIN_BASIC_AUTH_USER/ADMIN_BASIC_AUTH_PASSWORD is not set. " \
        "The F9 admin panel cannot start in production without BASIC auth credentials."
end

if ENV["ADMIN_BASIC_AUTH_USER"].blank? || ENV["ADMIN_BASIC_AUTH_PASSWORD"].blank?
  Rails.logger.warn(
    "[admin_basic_auth initializer] ADMIN_BASIC_AUTH_USER/ADMIN_BASIC_AUTH_PASSWORD is not set. " \
    "Requests to /admin will be rejected (401) until these are configured."
  )
end
