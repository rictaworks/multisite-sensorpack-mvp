# F6 ダッシュボード集計API(requirements.md 1.6 F6 render_dashboard 手順1-2)。
#
# 拠点一覧を、拠点ごとのデバイス数・オンライン数・openアラート数・最新温湿度つきで返す
# (30秒ポーリングでのダッシュボード表示を想定、src/shared/contracts/openapi.yaml
# getDashboardSitesSummary)。current_user.sitesのみを対象にするため、他ユーザーの拠点は
# クエリの起点から構造的に除外される(全クエリに認証ユーザーIDが必須条件として付与される、
# requirements.md F6-1 / .claude/OWASP10.md A01対応)。
#
# 拠点件数が増えてもクエリ数が線形に増えないよう、拠点ごとに個別クエリを発行せず
# SiteAggregates内でグループ集計クエリにまとめて発行する(N+1回避)。
module Api
  class SitesController < ApplicationController
    include Authenticatable
    include TenantScoped

    # GET /api/v1/sites (openapi.yaml listSites / requirements.md F6.1)
    #
    # 契約上のレスポンス形状は getDashboardSitesSummary と同一({sites: [Site]})のため、
    # 集計・シリアライズは dashboard_summary と同じ経路を通す(DRY)。
    # 用途が別のエンドポイントとして契約に定義されているため、ルーティングは分けたまま残す。
    def index
      render json: sites_payload("index"), status: :ok
    end

    # POST /api/v1/sites (openapi.yaml createSite)
    #
    # 所有者はセッションのcurrent_userから決める。リクエストのパラメータで所有者を
    # 指定させると、他ユーザー名義の拠点を作れてしまう(.claude/OWASP10.md A01)。
    def create
      site = current_user.sites.create!(name: site_params[:name])

      Rails.logger.info("[Api::SitesController#create] user_id=#{current_user.id} site_id=#{site.id}")

      # 作成直後は配下デバイスもアラートも無いが、契約上のSiteスキーマ(deviceCount等を含む)を
      # 満たすため一覧と同じシリアライザを通す。
      render json: serialize_site(site, SiteAggregates.new([ site.id ])), status: :created
    rescue ActiveRecord::RecordInvalid => e
      render_validation_error(e.record.errors.full_messages.join(", "))
    rescue ActionController::ParameterMissing => e
      render_validation_error(e.message)
    end

    # DELETE /api/v1/sites/:siteId (openapi.yaml deleteSite)
    #
    # 存在しなければ404、他ユーザーの拠点なら403(TenantScopedのrescue_fromが変換する)。
    def destroy
      site = authorize_owner!(Site.find(params[:siteId]))
      site.soft_delete!

      head :no_content
    end

    # GET /api/v1/dashboard/sites-summary
    def dashboard_summary
      render json: sites_payload("dashboard_summary"), status: :ok
    end

    private

    # 空白のみの名前は「見た目が空の拠点」を生むため、presence検証に掛かるよう先に整える。
    # 住所入力を促すような追加の制約は設けない(requirements.md 1.4)。
    def site_params
      name = params.require(:name)
      { name: name.is_a?(String) ? name.strip : name }
    end

    def render_validation_error(message)
      Rails.logger.info("[Api::SitesController] validation error: #{message}")
      render json: {
        error: { code: "validation_error", message: I18n.t("errors.validation_error"), details: { message: message } }
      }, status: :bad_request
    end

    # current_user.sites を起点にすることで、他ユーザーの拠点はクエリの構造上入り込まない
    # (.claude/OWASP10.md A01)。
    def sites_payload(action_name)
      sites = current_user.sites.where(deleted: false).order(:id).to_a
      aggregates = SiteAggregates.new(sites.map(&:id))

      Rails.logger.info(
        "[Api::SitesController##{action_name}] user_id=#{current_user.id} site_count=#{sites.size}"
      )

      { sites: sites.map { |site| serialize_site(site, aggregates) } }
    end

    def serialize_site(site, aggregates)
      latest_reading = aggregates.latest_reading_for(site.id)
      {
        id: site.id,
        name: site.name,
        deviceCount: aggregates.device_count_for(site.id),
        onlineDeviceCount: aggregates.online_device_count_for(site.id),
        openAlertCount: aggregates.open_alert_count_for(site.id),
        latestTemperatureC: latest_reading&.temperature_c&.to_f,
        latestHumidityPct: latest_reading&.humidity_pct&.to_f,
        createdAt: site.created_at.iso8601
      }
    end

    # 対象拠点群のデバイス数・オンライン数・openアラート数・最新テレメトリを、
    # 拠点件数によらず一定クエリ数で算出するための集計ヘルパー。
    class SiteAggregates
      def initialize(site_ids)
        @device_counts = Device.where(site_id: site_ids, deleted: false).group(:site_id).count
        @online_counts = Device.where(site_id: site_ids, deleted: false, status_code: Device::STATUS_ONLINE)
                                .group(:site_id).count
        @open_alert_counts = Alert.joins(:device)
                                   .where(status: "open", devices: { site_id: site_ids })
                                   .group("devices.site_id").count
        @latest_reading_by_site_id = compute_latest_readings(site_ids)
      end

      def device_count_for(site_id)
        @device_counts.fetch(site_id, 0)
      end

      def online_device_count_for(site_id)
        @online_counts.fetch(site_id, 0)
      end

      def open_alert_count_for(site_id)
        @open_alert_counts.fetch(site_id, 0)
      end

      def latest_reading_for(site_id)
        @latest_reading_by_site_id[site_id]
      end

      private

      # 拠点の「最新温湿度」は、その拠点配下の全デバイスのうち直近のテレメトリ読み取り
      # (温度・湿度が同一行に記録された1件)を採用する。
      #
      # デバイスごとに個別クエリを発行するとN+1になるため、(1)デバイスごとの最新
      # telemetry_reading idをGROUP BYで一括取得し、(2)そのidの集合をまとめて1回で
      # 取得してからRuby側で拠点単位に畳み込む、という2クエリ構成にしている。
      def compute_latest_readings(site_ids)
        device_id_to_site_id = Device.where(site_id: site_ids, deleted: false).pluck(:id, :site_id).to_h
        return {} if device_id_to_site_id.empty?

        latest_reading_ids = TelemetryReading.where(device_id: device_id_to_site_id.keys)
                                              .group(:device_id).maximum(:id).values
        return {} if latest_reading_ids.empty?

        TelemetryReading.where(id: latest_reading_ids).each_with_object({}) do |reading, acc|
          site_id = device_id_to_site_id.fetch(reading.device_id)
          current = acc[site_id]
          acc[site_id] = reading if current.nil? || reading.recorded_at > current.recorded_at
        end
      end
    end
  end
end
