# F9 開発者向け管理画面: デバイス一覧参照(Issue #16 / requirements.md F9受け入れ条件)。
#
# 「デバイス一覧(拠点・状態・last_seen等)を参照できる」を満たす読み取り専用画面。
# 論理削除済みデバイスも含めて表示する(開発者が全デバイスの状態を把握できることを優先し、
# 一般消費者向けダッシュボードのようにテナントスコープで絞り込む必要はない)。
module Admin
  class DevicesController < Admin::BaseController
    def index
      @devices = Device.includes(:site, :device_status).order(:id).to_a
      Rails.logger.info("[Admin::DevicesController#index] listed #{@devices.size} devices")
      # ApplicationControllerはActionController::API継承のため、既定のimplicit renderは
      # ActionController::BasicImplicitRender(常にhead :no_content)であり、
      # ActionController::Base流の「同名テンプレートを自動描画する」動作にはならない。
      # そのためテンプレート描画をここで明示する。
      render :index
    end
  end
end
