require "rails_helper"

# Issue #7 の受け入れ条件(テナント分離)を検証するための最小限プローブコントローラー。
# Site/Deviceの実運用リソースコントローラーは並行実装中の他issue(#8/#10/#15)が担当するため、
# ここでは Authenticatable / TenantScoped concern の振る舞いのみを、一時的なテスト専用ルートで検証する。
class TenantScopingProbeController < ApplicationController
  include Authenticatable
  include TenantScoped

  def show
    site = authorize_owner!(Site.find(params[:id]))
    render json: { id: site.id }, status: :ok
  end
end

# Device は user_id を直接持たず site 経由で所有者が決まる(record.site.user)ため、
# TenantScoped#resolve_tenant_owner のもう一方の分岐(#site フォールバック)を検証する。
class TenantScopingDeviceProbeController < ApplicationController
  include Authenticatable
  include TenantScoped

  def show
    device = authorize_owner!(Device.find(params[:id]))
    render json: { id: device.id }, status: :ok
  end
end

RSpec.describe "Tenant isolation (concerns/tenant_scoped.rb)", type: :request do
  around do |example|
    # 既存のルート(/auth/session等)を維持したまま、テスト専用ルートのみ追加する。
    # Rails.application.routes.draw はルート全体を置き換えてしまうため使わない。
    Rails.application.routes.append do
      get "__test/tenant_probe/:id", to: "tenant_scoping_probe#show"
      get "__test/tenant_probe_device/:id", to: "tenant_scoping_device_probe#show"
    end
    # 他specファイルの実行によりRouteSetが既にfinalize済みの場合、appendだけでは
    # 反映されない(ActionDispatch::Routing::RouteSet#finalize!は@finalized=trueだと
    # 早期returnするため)。テストコードに限定して明示的に再finalizeする。
    Rails.application.routes.instance_variable_set(:@finalized, false)
    Rails.application.routes.finalize!
    example.run
  ensure
    Rails.application.reload_routes!
  end

  let!(:owner) { User.create!(google_sub: "owner-sub") }
  let!(:other_user) { User.create!(google_sub: "other-sub") }
  let!(:owned_site) { Site.create!(user: owner, name: "倉庫A") }

  def login_as(user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: RecaptchaVerifier::TEST_SUCCESS_TOKEN }
  end

  context "未認証の場合" do
    it "401を返す" do
      get "/__test/tenant_probe/#{owned_site.id}"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "所有者本人が自分の拠点にアクセスする場合" do
    it "200を返す" do
      login_as(owner)

      get "/__test/tenant_probe/#{owned_site.id}"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["id"]).to eq(owned_site.id)
    end
  end

  context "他ユーザーが他人の拠点へアクセスしようとする場合" do
    it "構造的にアクセスできず403(Forbidden)を返す" do
      login_as(other_user)

      get "/__test/tenant_probe/#{owned_site.id}"

      expect(response).to have_http_status(:forbidden)
      body = JSON.parse(response.body)
      expect(body["error"]["code"]).to eq("forbidden")
    end

    it "他ユーザーのデータへのアクセスによってレコードが変更・削除されない" do
      login_as(other_user)

      expect do
        get "/__test/tenant_probe/#{owned_site.id}"
      end.not_to change { owned_site.reload.attributes }
    end
  end

  context "存在しないリソースIDが指定された場合" do
    it "404(NotFound)を返す" do
      login_as(owner)

      get "/__test/tenant_probe/999999999"

      expect(response).to have_http_status(:not_found)
      body = JSON.parse(response.body)
      expect(body["error"]["code"]).to eq("not_found")
    end
  end

  context "Deviceのようにsite経由で所有者が決まるリソースの場合" do
    let!(:owned_device) do
      Device.create!(site: owned_site, device_token_digest: SecureRandom.hex(20), status_code: "provisioning")
    end

    it "所有者本人は200でアクセスできる" do
      login_as(owner)

      get "/__test/tenant_probe_device/#{owned_device.id}"

      expect(response).to have_http_status(:ok)
    end

    it "他ユーザーは403(Forbidden)を返される" do
      login_as(other_user)

      get "/__test/tenant_probe_device/#{owned_device.id}"

      expect(response).to have_http_status(:forbidden)
    end
  end
end
