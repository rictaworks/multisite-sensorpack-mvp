require "rails_helper"

# requirements.md 1.9 Dカテゴリ(デバイス登録)のうち、コード発行(issueClaimCode)側のケースを検証する。
# ESP32からの照合(claimDevice)側のケースは spec/services/claim_device_service_spec.rb を参照。
#
# 認証について: Issue #7(Google OAuth・テナント分離基盤)がまだ実装されていないため、
# このコントローラは暫定的に `X-User-Id` ヘッダでユーザーを識別する(本番では常に401、fail closed)。
# #7がマージされ次第、実際のセッションcookieベースのcurrent_user解決に置き換える。
RSpec.describe "Api::ClaimCodesController", type: :request do
  let(:user) { User.create!(google_sub: "claim-codes-request-user") }
  let(:other_user) { User.create!(google_sub: "claim-codes-other-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:success_recaptcha_token) { "test-recaptcha-success" }

  after { ClaimDeviceService::RateLimiter.reset_all! }

  def issue_claim_code(user_id:, params:, ip: "198.51.100.20")
    post "/api/v1/claim-codes",
      params: params,
      headers: { "X-User-Id" => user_id.to_s, "REMOTE_ADDR" => ip },
      as: :json
  end

  describe "正常系" do
    it "8桁英数字のクレームコードを有効期限15分で発行する" do
      issue_claim_code(user_id: user.id, params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body["code"]).to match(/\A[A-Z0-9]{8}\z/)
      expect(Time.zone.parse(body["expiresAt"])).to be_within(5.seconds).of(15.minutes.from_now)

      claim_code = ClaimCode.find_by(code: body["code"])
      expect(claim_code.user).to eq(user)
      expect(claim_code.site).to eq(site)
    end
  end

  describe "未認証(D関連: 認証なしでは拠点にアクセスできない)" do
    it "X-User-Idが無ければ401を返す" do
      post "/api/v1/claim-codes",
        params: { siteId: site.id, recaptchaToken: success_recaptcha_token },
        as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body.dig("error", "code")).to eq("unauthorized")
    end
  end

  describe "本番環境でのfail closed(environment.md準拠)" do
    it "production環境ではX-User-Idヘッダによる暫定認証が絶対に到達せず401になる(Issue #7が実認証を提供するまでの暫定措置)" do
      allow(Rails.env).to receive(:production?).and_return(true)

      issue_claim_code(user_id: user.id, params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "他ユーザー横取り(D: 他ユーザー横取り)" do
    it "他ユーザーの拠点に対するコード発行は403で拒否される(テナント分離)" do
      issue_claim_code(user_id: other_user.id, params: { siteId: site.id, recaptchaToken: success_recaptcha_token })

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body.dig("error", "code")).to eq("forbidden")
      expect(ClaimCode.where(site: site)).to be_empty
    end
  end

  describe "reCAPTCHA失敗(D: reCAPTCHA失敗)" do
    it "reCAPTCHA検証に失敗すると429で拒否される" do
      issue_claim_code(user_id: user.id, params: { siteId: site.id, recaptchaToken: "wrong-token" })

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("recaptcha_failed")
      expect(ClaimCode.where(site: site)).to be_empty
    end
  end

  describe "コード発行のレート制限" do
    it "同一IPからの発行要求が上限を超えると429で拒否される" do
      limit = Api::ClaimCodesController::RATE_LIMIT_LIMIT
      ip = "198.51.100.99"

      limit.times do
        issue_claim_code(user_id: user.id, params: { siteId: site.id, recaptchaToken: success_recaptcha_token }, ip: ip)
      end

      issue_claim_code(user_id: user.id, params: { siteId: site.id, recaptchaToken: success_recaptcha_token }, ip: ip)

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("rate_limited")
    end
  end
end
