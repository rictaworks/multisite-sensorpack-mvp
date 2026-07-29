# F6 ダッシュボード集計API・デバイス向け参照エンドポイント(requirements.md 1.6 F6 render_dashboard 手順3)。
#
# デバイス詳細(閾値・自動ルール)、直近24h/7dの時系列グラフ、コマンド履歴を返す。
# src/shared/contracts/openapi.yamlのlistDevices/getDevice/getDeviceTelemetrySeries/listCommandsに
# 対応する(POST /devices/:deviceId/commandsはIssue #11のCommandsController#createが担当し、
# 本コントローラは参照系のみを扱う)。
#
# テナント分離はcurrent_user.sitesを起点にしたクエリ絞り込み(#index)と、
# TenantScoped#authorize_owner!によるレコード単位の所有権チェック(#show以降)の
# 二段構えで行い、他ユーザーのデバイスは一覧にも詳細参照にも構造的に現れない
# (requirements.md F6-1 / .claude/OWASP10.md A01対応)。
module Api
  class DevicesController < ApplicationController
    include Authenticatable
    include TenantScoped

    VALID_RANGES = %w[24h 7d].freeze
    RAW_SERIES_WINDOW = 24.hours
    AGGREGATED_SERIES_WINDOW = 7.days

    before_action :set_device, only: [ :show, :telemetry_series, :commands ]

    # GET /api/v1/devices?siteId=
    #
    # 自分の拠点配下の全デバイス一覧を取得する。siteIdクエリで絞り込めるが、
    # 他ユーザーが所有する拠点IDを指定してもcurrent_user.sitesとの積集合により
    # 常に空配列を返す(越境参照不可)。
    def index
      owned_site_ids = current_user.sites.where(deleted: false).select(:id)
      devices = Device.where(site_id: owned_site_ids, deleted: false)
      devices = devices.where(site_id: params[:siteId]) if params[:siteId].present?
      devices = devices.order(:id)

      Rails.logger.info(
        "[Api::DevicesController#index] user_id=#{current_user.id} site_id_filter=#{params[:siteId].inspect} " \
        "count=#{devices.size}"
      )

      render json: { devices: devices.map { |device| serialize_device(device) } }, status: :ok
    end

    # GET /api/v1/devices/:deviceId
    def show
      render json: serialize_device_detail(@device), status: :ok
    end

    # GET /api/v1/devices/:deviceId/telemetry-series?range=24h|7d&sensorType=temperature|humidity
    #
    # requirements.md F6.5: 直近24hは生データ(telemetry_readings)、7日を超える範囲は
    # 日次1時間粒度の集約データ(hourly_aggregates)を返す。7d表示は生データの保持期間
    # (14日)や削除ジョブの実行有無に関わらず常にhourly_aggregatesから参照するため、
    # 生データ削除後も参照が壊れない(1.9 Iカテゴリ「生データ削除後の集約参照」)。
    def telemetry_series
      range = params[:range]
      sensor_type_code = params[:sensorType]

      return render_validation_error("range must be one of #{VALID_RANGES.join(', ')}") unless VALID_RANGES.include?(range)
      unless SensorType.exists?(code: sensor_type_code)
        return render_validation_error("sensorType is invalid: #{sensor_type_code.inspect}")
      end

      points = range == "24h" ? raw_series_points(sensor_type_code) : aggregated_series_points(sensor_type_code)
      thresholds = @device.thresholds.where(sensor_type_code: sensor_type_code).order(:direction)

      Rails.logger.info(
        "[Api::DevicesController#telemetry_series] user_id=#{current_user.id} device_id=#{@device.id} " \
        "range=#{range} sensor_type_code=#{sensor_type_code} point_count=#{points.size}"
      )

      render json: { points: points, thresholds: thresholds.map { |threshold| serialize_threshold(threshold) } },
             status: :ok
    end

    # GET /api/v1/devices/:deviceId/commands
    def commands
      commands = @device.commands.order(issued_at: :desc)
      render json: { commands: commands.map { |command| serialize_command(command) } }, status: :ok
    end

    private

    def set_device
      @device = authorize_owner!(Device.find(params[:deviceId]))
    end

    def raw_series_points(sensor_type_code)
      readings = @device.telemetry_readings.where("recorded_at >= ?", RAW_SERIES_WINDOW.ago).order(:recorded_at)

      readings.map do |reading|
        {
          timestamp: reading.recorded_at.iso8601,
          temperatureC: sensor_type_code == "temperature" ? reading.temperature_c.to_f : nil,
          humidityPct: sensor_type_code == "humidity" ? reading.humidity_pct.to_f : nil,
          isAggregated: false
        }
      end
    end

    def aggregated_series_points(sensor_type_code)
      aggregates = HourlyAggregate.in_range(
        device: @device, sensor_type_code: sensor_type_code, since: AGGREGATED_SERIES_WINDOW.ago
      )

      aggregates.map do |aggregate|
        {
          timestamp: aggregate.hour_bucket.iso8601,
          temperatureC: sensor_type_code == "temperature" ? aggregate.avg_value.to_f : nil,
          humidityPct: sensor_type_code == "humidity" ? aggregate.avg_value.to_f : nil,
          isAggregated: true
        }
      end
    end

    def serialize_device(device)
      {
        id: device.id,
        siteId: device.site_id,
        status: device.status_code,
        expectedIntervalSec: device.expected_interval_sec,
        lastSeenAt: device.last_seen_at&.iso8601,
        createdAt: device.created_at.iso8601
      }
    end

    def serialize_device_detail(device)
      serialize_device(device).merge(
        thresholds: device.thresholds.order(:direction).map { |threshold| serialize_threshold(threshold) },
        automationRule: device.automation_rule ? serialize_automation_rule(device.automation_rule) : nil
      )
    end

    def serialize_threshold(threshold)
      {
        sensorType: threshold.sensor_type_code,
        direction: threshold.direction,
        triggerValue: threshold.trigger_value.to_f,
        deadband: threshold.deadband.to_f,
        breachState: threshold.breach_state
      }
    end

    def serialize_automation_rule(rule)
      {
        fanOnTempAlert: rule.fan_on_temp_alert,
        ledOnAlert: rule.led_on_alert,
        manualOverrideUntil: rule.manual_override_until&.iso8601
      }
    end

    def serialize_command(command)
      {
        id: command.id,
        deviceId: command.device_id,
        commandType: command.command_type_code,
        idempotencyKey: command.idempotency_key,
        origin: command.origin,
        status: command.status,
        issuedAt: command.issued_at.iso8601,
        expiresAt: command.expires_at.iso8601
      }
    end

    def render_validation_error(message)
      render json: { error: { code: "validation_error", message: I18n.t("errors.validation_error"), details: { message: message } } },
             status: :bad_request
    end
  end
end
