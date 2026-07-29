require "rails_helper"

# Issue #16 (F9 開発者向け管理画面): デバイス一覧参照はRails製BASIC認証で保護される。
#
# .claude/rules/environment.md: 「開発者向け管理画面(F9)のBASIC認証は、一般消費者向け
# ダッシュボードのGoogleログイン導線とは別物であり、混同しない」を検証する。
# BASIC認証の認証情報はハードコードせず環境変数(ADMIN_BASIC_AUTH_USER/PASSWORD)から
# 取得し、未設定の場合はfail closed(常に拒否)であることもあわせて確認する。
RSpec.describe "Admin devices (F9)", type: :request do
  let(:admin_user) { "admin-user" }
  let(:admin_password) { "s3cr3t-passw0rd" }

  around do |example|
    original_user = ENV["ADMIN_BASIC_AUTH_USER"]
    original_password = ENV["ADMIN_BASIC_AUTH_PASSWORD"]
    ENV["ADMIN_BASIC_AUTH_USER"] = admin_user
    ENV["ADMIN_BASIC_AUTH_PASSWORD"] = admin_password
    example.run
  ensure
    ENV["ADMIN_BASIC_AUTH_USER"] = original_user
    ENV["ADMIN_BASIC_AUTH_PASSWORD"] = original_password
  end

  def basic_auth_header(user, password)
    { "HTTP_AUTHORIZATION" => ActionController::HttpAuthentication::Basic.encode_credentials(user, password) }
  end

  describe "GET /admin/devices" do
    context "認証情報が付与されていない場合" do
      it "401を返しWWW-Authenticateヘッダーを含む" do
        get "/admin/devices"

        expect(response).to have_http_status(:unauthorized)
        expect(response.headers["WWW-Authenticate"]).to match(/Basic/)
      end
    end

    context "誤った認証情報の場合" do
      it "401を返す" do
        get "/admin/devices", headers: basic_auth_header(admin_user, "wrong-password")

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "一般消費者向けGoogleログインのセッションcookieのみを持つ場合" do
      it "BASIC認証情報がなければ401を返す(管理画面のログイン導線は分離されている)" do
        allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return("google-sub-user-1")
        post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }
        expect(response).to have_http_status(:ok)

        get "/admin/devices"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "正しいBASIC認証情報の場合" do
      let!(:site) { Site.create!(user: User.create!(google_sub: "owner-sub"), name: "本社倉庫") }
      let!(:device) do
        device, = Device.provision_for_site!(site)
        device.update!(status_code: Device::STATUS_ONLINE, last_seen_at: Time.zone.parse("2026-07-28 09:00:00"))
        device
      end

      it "200を返し、拠点名・状態・last_seenを含む日本語のみのデバイス一覧を表示する" do
        get "/admin/devices", headers: basic_auth_header(admin_user, admin_password)

        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("text/html")
        expect(response.body).to include("本社倉庫")
        expect(response.body).to include("オンライン")
      end
    end

    context "ADMIN_BASIC_AUTH_USER/PASSWORDが未設定の場合(fail closed)" do
      it "それらしい認証情報を送っても401を返す" do
        ENV["ADMIN_BASIC_AUTH_USER"] = nil
        ENV["ADMIN_BASIC_AUTH_PASSWORD"] = nil

        get "/admin/devices", headers: basic_auth_header(admin_user, admin_password)

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
