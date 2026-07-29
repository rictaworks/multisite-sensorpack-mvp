require "rails_helper"

# requirements.md 1.9 Dカテゴリ(デバイス登録)のうち、コード発行(issueClaimCode)側のケースを検証する。
# ESP32からの照合(claimDevice)側のケースは spec/services/claim_device_service_spec.rb を参照。
#
# 認証・テナント分離はIssue #7で整備された Authenticatable/TenantScoped concern を利用する。
# ログインは実際のセッション確立エンドポイント(POST /auth/session)を通し、
# spec/requests/tenant_scoping_spec.rbと同様にGoogleIdTokenVerifierをスタブして検証する。
RSpec.describe "Api::ClaimCodesController", type: :request do
  let(:user) { User.create!(google_sub: "claim-codes-request-user") }
  let(:other_user) { User.create!(google_sub: "claim-codes-other-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:success_recaptcha_token) { RecaptchaVerifier::TEST_SUCCESS_TOKEN }

  after { ClaimDeviceService::RateLimiter.reset_all! }

  def login_as(logging_in_user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(logging_in_user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }, as: :json
  end

  def issue_claim_code(params:, ip: "198.51.100.20")
    post "/api/v1/claim-codes", params: params, headers: { "REMOTE_ADDR" => ip }, as: :json
  end

  describe "正常系" do
    it "8桁英数字のクレームコードを有効期限15分で発行する" do
      login_as(user)

      issue_claim_code(params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body["code"]).to match(/\A[A-Z0-9]{8}\z/)
      expect(Time.zone.parse(body["expiresAt"])).to be_within(5.seconds).of(15.minutes.from_now)

      claim_code = ClaimCode.find_by(code: body["code"])
      expect(claim_code.user).to eq(user)
      expect(claim_code.site).to eq(site)
    end
  end

  describe "未認証" do
    it "ログインしていなければ401を返す(Authenticatable concern)" do
      issue_claim_code(params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("unauthorized")
    end
  end

  describe "他ユーザー横取り(D: 他ユーザー横取り)" do
    it "他ユーザーの拠点に対するコード発行は403で拒否される(テナント分離、TenantScoped concern)" do
      login_as(other_user)

      issue_claim_code(params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body.dig("error", "code")).to eq("forbidden")
      expect(ClaimCode.where(site: site)).to be_empty
    end
  end

  describe "存在しない拠点" do
    it "404を返す(TenantScoped concern)" do
      login_as(user)

      issue_claim_code(params: { siteId: 999_999_999, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "reCAPTCHA失敗(D: reCAPTCHA失敗)" do
    it "reCAPTCHA検証に失敗すると429で拒否される" do
      login_as(user)

      issue_claim_code(params: { siteId: site.id, recaptchaToken: "wrong-token" })

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("recaptcha_failed")
      expect(ClaimCode.where(site: site)).to be_empty
    end
  end

  describe "コード発行のレート制限" do
    it "同一IPからの発行要求が上限を超えると429で拒否される" do
      login_as(user)
      limit = Api::ClaimCodesController::RATE_LIMIT_LIMIT
      ip = "198.51.100.99"

      limit.times do
        issue_claim_code(params: { siteId: site.id, recaptchaToken: success_recaptcha_token }, ip: ip)
      end

      issue_claim_code(params: { siteId: site.id, recaptchaToken: success_recaptcha_token }, ip: ip)

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("rate_limited")
    end
  end
end
