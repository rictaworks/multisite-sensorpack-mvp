require "rails_helper"

# config/initializers/filter_parameter_logging.rb の検証。
#
# .claude/OWASP10.md A09(セキュリティログとモニタリングの失敗)対策として、秘密情報が
# リクエストパラメータのログへ平文で残らないことを保証する。特にクレームコード(`code`)は
# 15分間有効な秘密情報であり(requirements.md F1)、POST /api/v1/devices/claim の
# リクエストパラメータとして送られてくるため、ログへの露出を防ぐ必要がある。
RSpec.describe "リクエストパラメータのログフィルタ" do
  subject(:filter) { ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters) }

  # 各エンドポイントが実際に受け取るパラメータ名(src/shared/contracts/openapi.yaml準拠)を
  # そのまま指定し、「フィルタ設定に値が入っていること」ではなく
  # 「その名前の値が実際に伏せられること」を検証する。
  {
    "code" => "POST /api/v1/devices/claim のクレームコード(requirements.md F1)",
    "idToken" => "POST /auth/session のGoogle IDトークン",
    "recaptchaToken" => "POST /auth/session・/api/v1/claim-codes のreCAPTCHAトークン",
    "password" => "管理画面BASIC認証のパスワード"
  }.each do |param_name, description|
    it "#{param_name} を伏せる(#{description})" do
      expect(filter.filter(param_name => "s3cr3t-value")[param_name]).to eq("[FILTERED]")
    end
  end

  it "秘密情報でないパラメータ(siteId)はそのまま残しデバッグトレースを妨げない" do
    expect(filter.filter("siteId" => 42)["siteId"]).to eq(42)
  end
end
