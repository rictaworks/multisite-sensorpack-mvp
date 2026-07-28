require "rails_helper"

# F7 AI日次サマリー クォータ制御API(requirements.md 1.6 generate_daily_summary、Issue #14)。
#
# 認証はIssue #7のGoogleログインセッション(Authenticatable)を再利用する
# (development/test限定のデバッグヘッダー等のプレースホルダー認証は新設しない)。
# 実際のFastAPI(internal-ai)呼び出しはDailySummaryService::InternalAiClientをモックし、
# ネットワークには到達しない。
RSpec.describe "Api::Summaries", type: :request do
  let(:user) { User.create!(google_sub: "summaries-spec-user") }
  let(:site) { Site.create!(user: user, name: "倉庫A") }
  let(:device) { Device.create!(site: site, device_token_digest: "summaries-spec-device", status_code: "online") }

  def login_as(target_user)
    allow(GoogleIdTokenVerifier).to receive(:verify_sub).and_return(target_user.google_sub)
    post "/auth/session", params: { idToken: "valid.jwt", recaptchaToken: "recaptcha-token" }
  end

  def create_reading(seq:, recorded_at:)
    TelemetryReading.create!(
      device: device, seq: seq, temperature_c: 24.5, humidity_pct: 55.0, recorded_at: recorded_at
    )
  end

  before do
    fake_client = instance_double(DailySummaryService::InternalAiClient)
    allow(fake_client).to receive(:generate_summary).and_return("本日は安定していました。")
    allow(DailySummaryService::InternalAiClient).to receive(:new).and_return(fake_client)
  end

  describe "GET /api/ai-summaries/today" do
    it "認証していなければ401を返す" do
      get "/api/ai-summaries/today"

      expect(response).to have_http_status(:unauthorized)
    end

    it "当日分が未生成であれば204を返す" do
      login_as(user)

      get "/api/ai-summaries/today"

      expect(response).to have_http_status(:no_content)
    end

    it "当日分が生成済みであれば契約形状(camelCase)で再表示する" do
      login_as(user)
      create_reading(seq: 1, recorded_at: Time.current - 1.hour)
      post "/api/ai-summaries"

      get "/api/ai-summaries/today"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body).to include("quotaDate", "summaryText", "generatedAt", "dataSufficient")
      expect(body["dataSufficient"]).to be(true)
    end
  end

  describe "POST /api/ai-summaries" do
    it "認証していなければ401を返す" do
      post "/api/ai-summaries"

      expect(response).to have_http_status(:unauthorized)
    end

    it "初回はテレメトリ統計を集計しFastAPI経由で201・生成済みサマリーを返す" do
      login_as(user)
      create_reading(seq: 1, recorded_at: Time.current - 1.hour)

      post "/api/ai-summaries"

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["summaryText"]).to eq("本日は安定していました。")
      expect(body["dataSufficient"]).to be(true)
    end

    it "同一クォータ日の2回目は429と既存サマリーを返す" do
      login_as(user)
      create_reading(seq: 1, recorded_at: Time.current - 1.hour)
      post "/api/ai-summaries"
      first_body = JSON.parse(response.body)

      post "/api/ai-summaries"

      expect(response).to have_http_status(:too_many_requests)
      body = JSON.parse(response.body)
      expect(body["error"]["code"]).to eq("quota_exceeded")
      expect(body["existingSummary"]["summaryText"]).to eq(first_body["summaryText"])
    end

    it "過去24hにテレメトリが無ければデータ不足の定型文を201で返し、クォータを消費しない" do
      login_as(user)

      post "/api/ai-summaries"

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["dataSufficient"]).to be(false)
      expect(body["summaryText"]).to eq(DailySummaryService::INSUFFICIENT_DATA_SUMMARY_TEXT)

      # クォータ未消費のため、同日中でも再度呼び出せる(データが後から揃うケース)。
      create_reading(seq: 1, recorded_at: Time.current - 1.hour)
      post "/api/ai-summaries"
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["dataSufficient"]).to be(true)
    end

    it "テナント分離: 他ユーザーのクォータ消費に影響されず自分のサマリーを生成できる" do
      other_user = User.create!(google_sub: "summaries-spec-other-user")
      other_site = Site.create!(user: other_user, name: "倉庫B")
      other_device = Device.create!(
        site: other_site, device_token_digest: "summaries-spec-other-device", status_code: "online"
      )
      TelemetryReading.create!(
        device: other_device, seq: 1, temperature_c: 24.5, humidity_pct: 55.0, recorded_at: Time.current - 1.hour
      )
      login_as(other_user)
      post "/api/ai-summaries"
      expect(response).to have_http_status(:created)

      login_as(user)
      create_reading(seq: 1, recorded_at: Time.current - 1.hour)

      post "/api/ai-summaries"

      expect(response).to have_http_status(:created)
    end
  end
end
