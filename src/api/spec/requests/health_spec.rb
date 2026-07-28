require "rails_helper"

RSpec.describe "GET /health", type: :request do
  it "ステータスコード200で応答する" do
    get "/health"

    expect(response).to have_http_status(:ok)
  end

  it "JSON形式でokステータスと現在の実行環境を返す" do
    get "/health"

    body = JSON.parse(response.body)

    expect(body["status"]).to eq("ok")
    expect(body["environment"]).to eq(Rails.env)
  end

  it "Content-TypeがJSONである" do
    get "/health"

    expect(response.content_type).to match(%r{application/json})
  end
end
