# ESP32デバイス側の認証を行うconcern。
#
# Googleセッションcookie(app/controllers/concerns/authenticatable.rb、ユーザー向け)とは別物で、
# src/shared/contracts/openapi.yaml securitySchemes.deviceBearerToken準拠の長寿命デバイストークンを
# `Authorization: Bearer <token>`ヘッダーから検証する。生トークンはDBに保存されていないため
# (Device#device_token_digestにSHA-256ダイジェストのみ保持、requirements.md F1手順4)、
# 受け取ったトークンを同じ方式でダイジェスト化して照合する。
#
# 無効なトークン(該当デバイスなし)は401、論理削除済みデバイスは410を返す
# (requirements.md F2手順2、Issue #9受け入れ条件)。
module DeviceAuthenticatable
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_device!
  end

  private

  def authenticate_device!
    device = device_from_bearer_token

    unless device
      Rails.logger.warn("[DeviceAuthenticatable] invalid device token path=#{request.path}")
      render json: { error: { code: "invalid_device_token", message: I18n.t("errors.invalid_device_token") } },
             status: :unauthorized
      return
    end

    if device.deleted?
      Rails.logger.warn("[DeviceAuthenticatable] deleted device attempted access device_id=#{device.id}")
      render json: { error: { code: "device_deleted", message: I18n.t("errors.device_deleted") } },
             status: :gone
      return
    end

    @current_device = device
  end

  def current_device
    @current_device
  end

  def bearer_token
    header = request.headers["Authorization"]
    return nil if header.blank?

    scheme, token = header.split(" ", 2)
    return nil unless scheme&.casecmp?("Bearer") && token.present?

    token
  end

  def device_from_bearer_token
    token = bearer_token
    return nil if token.blank?

    Device.find_by(device_token_digest: Device.digest_for_token(token))
  end
end
