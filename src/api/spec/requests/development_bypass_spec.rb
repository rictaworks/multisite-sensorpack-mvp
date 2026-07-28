require "rails_helper"

# .claude/rules/environment.md:
# 「開発環境に限り認証済み状態に自動分岐してよい。ただしproduction環境ではこの分岐は
#   絶対に到達不可能でなければならない(fail closed)」を検証する。
#
# Rails.env は RAILS_ENV を単一の情報源として解決される値であり、本テストはその値そのものを
# 一時的に切り替えることで、development限定バイパス(Authenticatable#development_bypass_user)が
# 環境判定に正しく従うことを確認する。
RSpec.describe "Development-only auto authentication bypass", type: :request do
  around do |example|
    original_env_name = Rails.env.to_s
    Rails.env = env_name
    example.run
  ensure
    Rails.env = original_env_name
  end

  context "development環境の場合" do
    let(:env_name) { "development" }

    it "セッションcookieなしでも自動的に認証され、GET /auth/sessionが200を返す" do
      get "/auth/session"

      expect(response).to have_http_status(:ok)
    end
  end

  context "production環境の場合" do
    let(:env_name) { "production" }

    it "開発用バイパスは絶対に到達せず、セッションcookieなしでは401を返す(fail closed)" do
      get "/auth/session"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "test環境の場合(既定のテスト実行環境)" do
    let(:env_name) { "test" }

    it "development限定バイパスは適用されず、セッションcookieなしでは401を返す" do
      get "/auth/session"

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
