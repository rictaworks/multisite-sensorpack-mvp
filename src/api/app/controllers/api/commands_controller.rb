# requirements.md 1.6 F5 dispatch_command 手順1(手動発行) / openapi.yaml POST
# /devices/{deviceId}/commands(operationId createCommand)。
#
# ユーザーがダッシュボード(F5遠隔手動制御)からLED/ファンの手動制御コマンドを発行するエンドポイント。
# ピギーバック配信・ACK処理・自動ルール発火はCommandDispatchService#piggyback!(TelemetryIngestService
# 経由でESP32のテレメトリ応答時に呼び出される)側の責務であり、本コントローラは手動発行(enqueue)のみを扱う。
#
# 認証・テナント分離はIssue #7で整備された Authenticatable/TenantScoped concern に委譲する
# (自前のユーザー識別・所有権チェックを再実装しない。.claude/rules/architecture.md準拠)。
module Api
  class CommandsController < ApplicationController
    include Authenticatable
    include TenantScoped

    # POST /api/v1/devices/:deviceId/commands
    def create
      device = authorize_owner!(Device.find(params[:deviceId]))

      command = CommandDispatchService.new(device: device).enqueue_manual!(command_type_code: command_params[:commandType])

      Rails.logger.info(
        "[Api::CommandsController#create] user_id=#{current_user.id} device_id=#{device.id} " \
        "command_type=#{command.command_type_code} idempotency_key=#{command.idempotency_key}"
      )
      render json: serialize(command), status: :created
    rescue ActionController::ParameterMissing => e
      render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error",
                   details: { message: e.message })
    rescue CommandDispatchService::InvalidCommandTypeError => e
      Rails.logger.info("[Api::CommandsController#create] validation_error user_id=#{current_user&.id} #{e.message}")
      render_error(status: :bad_request, code: "validation_error", i18n_key: "errors.validation_error",
                   details: { message: e.message })
    end

    private

    def command_params
      params.require(:commandType)
      params.permit(:commandType)
    end

    def serialize(command)
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

    def render_error(status:, code:, i18n_key:, details: nil)
      render json: { error: { code: code, message: I18n.t(i18n_key), details: details } }, status: status
    end
  end
end
