# F9 開発者向け管理画面の共通コントローラ(Issue #16)。
#
# 一般消費者向けダッシュボードのGoogleログイン(Authenticatable, セッションcookie)とは
# 完全に別物のBASIC認証で保護する(.claude/rules/environment.md: 「開発者向け管理画面の
# BASIC認証は、一般消費者向けダッシュボードのGoogleログイン導線とは別物であり混同しない」)。
# 認証ロジック自体はRails標準のActionController::HttpAuthentication::Basicに委譲し、
# 自前実装しない(.claude/rules/architecture.md: 車輪の再発明を避ける)。ApplicationControllerは
# ActionController::API継承のためHttpAuthentication/Layoutsモジュールは既定で含まれず、
# ここで明示的にincludeする。
#
# 認証情報はADMIN_BASIC_AUTH_USER/ADMIN_BASIC_AUTH_PASSWORD(環境変数、.env経由)からのみ
# 取得し、コードにハードコードしない。リクエストごとにENVを参照するため、値が未設定の場合は
# 常に認証を拒否する(fail closed。config/initializers/admin_basic_auth.rbは本番起動時にも
# 未設定を検知しFail Fastする)。
#
# 開発者用管理画面(F9)は日本語のみでよい(.claude/rules/i18n.md)ため、Accept-Languageに
# 関わらずロケールを:jaに固定する(I18n.with_localeでスレッドローカルな漏れを防ぐ)。
module Admin
  class BaseController < ApplicationController
    include ActionController::HttpAuthentication::Basic::ControllerMethods

    # ApplicationControllerはActionController::API継承のため、ActionView::Layouts
    # (ひいてはERBテンプレート描画本体であるActionView::Rendering)が既定で含まれない
    # (ActionController::API は基本的にJSON/XMLレンダラーのみを想定するため)。
    # F9管理画面はHTML画面を描画する必要があるため、ここで明示的に含める。
    include ActionView::Layouts

    layout "admin"

    around_action :use_japanese_locale
    before_action :authenticate_admin!
    before_action :verify_same_origin_for_state_changing_requests

    private

    def use_japanese_locale
      I18n.with_locale(:ja) { yield }
    end

    def authenticate_admin!
      authenticate_or_request_with_http_basic("SensorPack Admin") do |given_name, given_password|
        Rails.logger.info("[Admin::BaseController] BASIC auth attempt path=#{request.path} user=#{given_name}")
        valid_admin_credentials?(given_name, given_password)
      end
    end

    # secure_compareは長さが異なる文字列を比較すると例外を送出するため、
    # 固定長のSHA-256ダイジェスト同士を比較しタイミング攻撃・例外の両方を避ける(OWASP10 A02/A07)。
    def valid_admin_credentials?(given_name, given_password)
      expected_name = ENV["ADMIN_BASIC_AUTH_USER"]
      expected_password = ENV["ADMIN_BASIC_AUTH_PASSWORD"]

      return false if expected_name.blank? || expected_password.blank?

      name_match = ActiveSupport::SecurityUtils.secure_compare(
        Digest::SHA256.hexdigest(given_name.to_s), Digest::SHA256.hexdigest(expected_name)
      )
      password_match = ActiveSupport::SecurityUtils.secure_compare(
        Digest::SHA256.hexdigest(given_password.to_s), Digest::SHA256.hexdigest(expected_password)
      )

      name_match & password_match
    end

    # BASIC認証はブラウザがキャッシュした認証情報を同一originの以後のリクエストへ自動付与するため、
    # セッションcookieを使わない構成であってもクロスサイトの状態変更リクエスト(CSRF類似)の
    # リスクが残る。APIモードのためRailsのCSRFトークン基盤(ActionController::RequestForgeryProtection)
    # は使えないので、状態を変更するリクエストに限りリクエスト元originの一致を追加の防御層として確認する。
    #
    # 判定できない場合(Origin・Refererのいずれも無い)は許可せず拒否する(fail closed:
    # .claude/rules/environment.md、.claude/rules/coding-style.md のフォールバック禁止)。
    # ブラウザはPOSTを含むクロスサイトのリクエストにOriginを必ず付与するため、Originを
    # 省略できる経路を残すとCSRF対策そのものが迂回可能になる。F9管理画面の状態変更は
    # HTMLフォームからの操作のみを想定しており、この制約で運用上の不足は生じない。
    def verify_same_origin_for_state_changing_requests
      return if request.get? || request.head?

      expected_origin = "#{request.scheme}://#{request.host_with_port}"
      actual_origin = request_origin

      return if actual_origin.present? && actual_origin == expected_origin

      Rails.logger.warn(
        "[Admin::BaseController] rejected state-changing request without verified same origin " \
        "path=#{request.path} origin=#{actual_origin.inspect} expected=#{expected_origin}"
      )
      render plain: "Forbidden", status: :forbidden
    end

    # Originヘッダーを優先し、無い場合のみRefererのorigin部分にフォールバックする
    # (Refererはブラウザ設定やReferrer-Policyで欠落しうるため、あくまで補助)。
    # いずれも取得できない場合はnilを返し、呼び出し側で拒否させる。
    def request_origin
      origin = request.origin
      return origin if origin.present?

      referer = request.referer
      return nil if referer.blank?

      parsed = URI.parse(referer)
      return nil if parsed.scheme.blank? || parsed.host.blank?

      parsed.port == parsed.default_port ? "#{parsed.scheme}://#{parsed.host}" : "#{parsed.scheme}://#{parsed.host}:#{parsed.port}"
    rescue URI::InvalidURIError => e
      Rails.logger.warn("[Admin::BaseController] unparsable Referer path=#{request.path} error=#{e.message}")
      nil
    end
  end
end
