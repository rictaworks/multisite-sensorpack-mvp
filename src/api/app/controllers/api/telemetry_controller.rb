# requirements.md 1.6 F2 ingest_telemetry / F3 evaluate_thresholds
# (src/shared/contracts/openapi.yaml POST /telemetry, operationId: ingestTelemetry)。
#
# コマンドのピギーバック同梱・ACK処理はIssue #11(F5)で追加される
# (TelemetryIngestServiceのコメント参照)。本Issue(#9)時点ではcommandsは常に空配列を返す
# (openapi.yaml TelemetryIngestResponseのcommandsは必須フィールドのため、契約上のキー自体は用意する)。
module Api
  class TelemetryController < ApplicationController
    # requirements.md 1.9 Eカテゴリ「巨大ペイロード」対策: ESP32が送る本来のペイロードは
    # 数十バイト程度のJSONであるため、明らかに逸脱するサイズのリクエストは
    # デバイスルックアップ・パラメータパースを行う前に早期拒否する(DoS・リソース枯渇対策、
    # OWASP A04 安全でない設計)。
    MAX_BODY_BYTES = 64.kilobytes

    before_action :reject_oversized_payload!
    include DeviceAuthenticatable

    # POST /api/v1/telemetry
    def create
      result = TelemetryIngestService.new(
        device: current_device,
        seq: telemetry_params[:seq],
        temperature_c: telemetry_params[:temperatureC],
        humidity_pct: telemetry_params[:humidityPct],
        device_reported_at: telemetry_params[:deviceReportedAt]
      ).call

      render json: serialize(result), status: :ok
    rescue TelemetryIngestService::ValidationError => e
      Rails.logger.info("[Api::TelemetryController#create] validation_error device_id=#{current_device&.id} #{e.message}")
      render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error",
                   details: { message: e.message })
    end

    private

    def telemetry_params
      params.permit(:seq, :temperatureC, :humidityPct, :deviceReportedAt)
    end

    def reject_oversized_payload!
      return if request.content_length.nil? || request.content_length <= MAX_BODY_BYTES

      Rails.logger.warn(
        "[Api::TelemetryController#reject_oversized_payload!] payload too large bytes=#{request.content_length} path=#{request.path}"
      )
      render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error",
                   details: { message: "request body exceeds #{MAX_BODY_BYTES} bytes" })
    end

    def serialize(result)
      {
        accepted: result.accepted,
        duplicate: result.duplicate,
        serverTime: result.server_time.iso8601,
        commands: []
      }
    end

    def render_error(status:, code:, i18n_key:, details: nil)
      render json: { error: { code: code, message: I18n.t(i18n_key), details: details } }, status: status
    end
  end
end
