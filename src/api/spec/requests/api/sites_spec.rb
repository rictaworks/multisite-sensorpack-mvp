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

# Issue #61: 拠点の作成。openapi.yaml createSite。
# 拠点はデバイス登録(F1)の前提であり、これが無いと「ログイン → 拠点作成 → デバイス登録」の
# 導線が通しで成立しない。
RSpec.describe "POST /api/v1/sites", type: :request do
  let!(:owner) { User.create!(google_sub: "site-create-owner-#{SecureRandom.hex(4)}") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  it "未認証の場合は401を返し、拠点を作らない" do
    expect { post "/api/v1/sites", params: { name: "倉庫A" } }.not_to change(Site, :count)

    expect(response).to have_http_status(:unauthorized)
  end

  context "認証済みユーザーの場合" do
    before { login_as(owner) }

    it "201とSiteスキーマの本文を返し、ログイン中のユーザーの拠点として作成する" do
      expect { post "/api/v1/sites", params: { name: "倉庫A" } }.to change(Site, :count).by(1)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body).to include(
        "name" => "倉庫A",
        "deviceCount" => 0,
        "onlineDeviceCount" => 0,
        "openAlertCount" => 0
      )
      expect(body["id"]).to be_present
      expect(body["createdAt"]).to be_present
      expect(Site.find(body["id"]).user).to eq(owner)
    end

    # 所有者はセッションから決める。リクエストの値で他人の拠点を作れてはならない
    # (.claude/OWASP10.md A01)。
    it "リクエストにuserIdを含めても、所有者はログイン中のユーザーになる" do
      other_user = User.create!(google_sub: "site-create-other-#{SecureRandom.hex(4)}")

      post "/api/v1/sites", params: { name: "乗っ取り", userId: other_user.id }

      expect(Site.find(JSON.parse(response.body)["id"]).user).to eq(owner)
    end

    it "作成した拠点は直後の一覧取得に現れる" do
      post "/api/v1/sites", params: { name: "実家" }

      get "/api/v1/sites"

      expect(JSON.parse(response.body)["sites"].map { |site| site["name"] }).to include("実家")
    end

    describe "バリデーション" do
      it "契約どおり100文字までのnameを受け付ける" do
        post "/api/v1/sites", params: { name: "あ" * 100 }

        expect(response).to have_http_status(:created)
      end

      it "101文字以上のnameは契約形状の400で拒否する(openapi.yaml maxLength: 100)" do
        expect { post "/api/v1/sites", params: { name: "あ" * 101 } }.not_to change(Site, :count)

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body).dig("error", "code")).to eq("validation_error")
      end

      it "nameが空文字の場合は400で拒否する" do
        expect { post "/api/v1/sites", params: { name: "" } }.not_to change(Site, :count)

        expect(response).to have_http_status(:bad_request)
      end

      it "nameが空白のみの場合も400で拒否する(見た目が空の拠点名を作らせない)" do
        expect { post "/api/v1/sites", params: { name: "   " } }.not_to change(Site, :count)

        expect(response).to have_http_status(:bad_request)
      end

      it "nameパラメータ自体が無い場合は400で拒否する" do
        expect { post "/api/v1/sites" }.not_to change(Site, :count)

        expect(response).to have_http_status(:bad_request)
      end
    end
  end
end

# Issue #61: 拠点の論理削除。openapi.yaml deleteSite(「配下デバイスも論理削除対象」)。
RSpec.describe "DELETE /api/v1/sites/:siteId", type: :request do
  let!(:owner) { User.create!(google_sub: "site-delete-owner-#{SecureRandom.hex(4)}") }
  let!(:other_user) { User.create!(google_sub: "site-delete-other-#{SecureRandom.hex(4)}") }
  let!(:site) { Site.create!(user: owner, name: "倉庫A") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  it "未認証の場合は401を返し、拠点を削除しない" do
    delete "/api/v1/sites/#{site.id}"

    expect(response).to have_http_status(:unauthorized)
    expect(site.reload.deleted).to be(false)
  end

  context "認証済みユーザーの場合" do
    it "204を返し、拠点を論理削除する(物理削除はしない)" do
      login_as(owner)

      expect { delete "/api/v1/sites/#{site.id}" }.not_to change(Site, :count)

      expect(response).to have_http_status(:no_content)
      expect(site.reload.deleted).to be(true)
    end

    it "削除した拠点は一覧に現れなくなる" do
      login_as(owner)

      delete "/api/v1/sites/#{site.id}"
      get "/api/v1/sites"

      expect(JSON.parse(response.body)["sites"]).to eq([])
    end

    # openapi.yaml: 「拠点を論理削除する（配下デバイスも論理削除対象）」
    it "配下のデバイスも論理削除する" do
      device, = Device.provision_for_site!(site)
      login_as(owner)

      delete "/api/v1/sites/#{site.id}"

      expect(device.reload.deleted).to be(true)
    end

    it "他の拠点のデバイスは巻き込まない" do
      other_own_site = Site.create!(user: owner, name: "実家")
      untouched_device, = Device.provision_for_site!(other_own_site)
      login_as(owner)

      delete "/api/v1/sites/#{site.id}"

      expect(untouched_device.reload.deleted).to be(false)
    end

    # 通信の再送やボタンの二度押しで500にならないようにする(DELETEは冪等)。
    it "既に削除済みの拠点への再削除も204を返す(冪等)" do
      login_as(owner)
      delete "/api/v1/sites/#{site.id}"

      delete "/api/v1/sites/#{site.id}"

      expect(response).to have_http_status(:no_content)
    end

    it "テナント分離: 他ユーザーの拠点は403で拒否し、削除しない" do
      login_as(other_user)

      delete "/api/v1/sites/#{site.id}"

      expect(response).to have_http_status(:forbidden)
      expect(site.reload.deleted).to be(false)
    end

    it "存在しないsiteIdは404を返す" do
      login_as(owner)

      delete "/api/v1/sites/#{Site.maximum(:id).to_i + 1}"

      expect(response).to have_http_status(:not_found)
    end
  end
end
