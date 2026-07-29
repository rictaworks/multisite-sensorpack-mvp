require "rails_helper"

# Issue #53 A-4 の付随対応: src/shared/contracts/openapi.yaml の listSites (GET /sites) が
# Rails側のルーティングに存在せず、Next.jsのクレーム画面(src/web/components/claim/api.ts が
# GET /api/v1/sites を呼ぶ)が404になっていた。
#
# レスポンス形状は getDashboardSitesSummary と同一(どちらも {sites: [Site]})であり、
# F6.1「自分が所有する拠点一覧を取得する(テナント分離必須)」に対応する。
RSpec.describe "GET /api/v1/sites", type: :request do
  let!(:owner) { User.create!(google_sub: "sites-owner-#{SecureRandom.hex(4)}") }
  let!(:other_user) { User.create!(google_sub: "sites-other-#{SecureRandom.hex(4)}") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  context "未認証の場合" do
    it "401を返す" do
      get "/api/v1/sites"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "認証済みユーザーの場合" do
    let!(:site_a) { Site.create!(user: owner, name: "倉庫A") }
    let!(:site_b) { Site.create!(user: owner, name: "実家") }
    let!(:other_site) { Site.create!(user: other_user, name: "他人の拠点") }

    it "自分の拠点のみを契約どおりの形状(Siteスキーマ)で返す" do
      device = Device.create!(site: site_a, device_token_digest: SecureRandom.hex(20))
      device.update_column(:status_code, Device::STATUS_ONLINE)

      login_as(owner)

      get "/api/v1/sites"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["sites"].map { |site| site["id"] }).to contain_exactly(site_a.id, site_b.id)

      serialized_a = body["sites"].find { |site| site["id"] == site_a.id }
      expect(serialized_a).to include(
        "name" => "倉庫A",
        "deviceCount" => 1,
        "onlineDeviceCount" => 1,
        "openAlertCount" => 0
      )
      expect(serialized_a["createdAt"]).to be_present
    end

    # .claude/OWASP10.md A01(アクセス制御の不備): 他ユーザーの拠点が混ざらないこと。
    it "テナント分離: 他ユーザーの拠点は一切含まれない" do
      login_as(owner)

      get "/api/v1/sites"

      names = JSON.parse(response.body)["sites"].map { |site| site["name"] }
      expect(names).not_to include("他人の拠点")
    end

    it "論理削除済みの拠点は含まれない" do
      site_b.update!(deleted: true)

      login_as(owner)

      get "/api/v1/sites"

      expect(JSON.parse(response.body)["sites"].map { |site| site["id"] }).to contain_exactly(site_a.id)
    end

    it "拠点が1件も無い場合は空配列を返す(404にしない)" do
      login_as(other_user)
      other_site.update!(deleted: true)

      get "/api/v1/sites"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["sites"]).to eq([])
    end
  end
end
