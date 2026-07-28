# ユーザーIDベースのテナント分離を提供するconcern。
#
# requirements.md F6-1 / .claude/OWASP10.md A01(アクセス制御の不備)対応。
# 他ユーザーが所有するリソース(拠点・デバイス等)へ構造的にアクセスできないことを保証する。
# 対象レコードが存在しない場合は404、存在するが他ユーザー所有の場合は403を返す
# (src/shared/contracts/openapi.yaml responses.Forbidden/NotFoundの区別に準拠)。
module TenantScoped
  extend ActiveSupport::Concern

  class TenantViolation < StandardError; end

  included do
    rescue_from ActiveRecord::RecordNotFound, with: :render_tenant_not_found
    rescue_from TenantScoped::TenantViolation, with: :render_tenant_forbidden
  end

  private

  # recordがcurrent_userの所有物であることを確認し、そうでなければ例外を送出する。
  # 想定外の未所有アクセスをフォールバックで握りつぶさず、明示的に例外化する。
  def authorize_owner!(record)
    owner = resolve_tenant_owner(record)

    unless owner == current_user
      raise TenantViolation,
            "user_id=#{current_user&.id} attempted #{record.class.name}##{record.id} " \
            "owned by user_id=#{owner&.id}"
    end

    record
  end

  def resolve_tenant_owner(record)
    return record.user if record.respond_to?(:user)
    return record.site.user if record.respond_to?(:site)

    raise NotImplementedError, "#{record.class} does not expose a tenant owner (#user or #site)"
  end

  def render_tenant_forbidden(exception)
    Rails.logger.warn("[TenantScoped] forbidden: #{exception.message}")
    render json: { error: { code: "forbidden", message: I18n.t("errors.forbidden") } },
           status: :forbidden
  end

  def render_tenant_not_found(exception)
    Rails.logger.info("[TenantScoped] not_found: #{exception.message}")
    render json: { error: { code: "not_found", message: I18n.t("errors.not_found") } },
           status: :not_found
  end
end
