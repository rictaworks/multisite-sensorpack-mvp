# requirements.md 1.6 F1 claim_device 手順3-6 / openapi.yaml POST /devices/claim (claimDevice)。
# ESP32がAPモード経由で取得したクレームコードを送信し、成立すれば長寿命デバイストークンを受け取る。
# 認証は不要(openapi.yaml security: [])。ESP32はまだトークンを持っていないため。
module Api
  class DeviceClaimsController < ApplicationController
    def create
      code = device_claim_params.require(:code)
      result = ClaimDeviceService.new(code: code, ip: request.remote_ip).call

      render json: { deviceId: result.device.id, deviceToken: result.raw_token }, status: :created
    rescue ClaimDeviceService::RateLimitedError => e
      render_error(status: :too_many_requests, code: "rate_limited", message: e.message)
    rescue ClaimDeviceService::InvalidCodeError => e
      render_error(status: :unauthorized, code: e.error_code, message: e.message)
    rescue ActionController::ParameterMissing => e
      render_error(status: :bad_request, code: "validation_error", message: e.message)
    end

    private

    def device_claim_params
      params.permit(:code)
    end

    def render_error(status:, code:, message:)
      render json: { error: { code: code, message: message } }, status: status
    end
  end
end
