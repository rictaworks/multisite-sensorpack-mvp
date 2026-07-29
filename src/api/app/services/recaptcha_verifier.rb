# reCAPTCHAトークンをGoogle reCAPTCHA siteverify APIで検証するサービス。
#
# requirements.md 1.3節: ログイン導線(POST /auth/session)とクレームコード発行導線
# (POST /api/v1/claim-codes)の両方にreCAPTCHAを適用する。両者で同じ検証が必要になるため、
# コントローラごとに実装を重複させずここへ集約する(.claude/rules/architecture.md:
# 車輪の再発明を避ける / DRY)。
#
# 本サービスの設計上の要点は「設定漏れ」と「検証失敗」を混同しないことである。
#
#   - 検証失敗(トークンが不正・期限切れ・Bot判定)     -> false を返す(呼び出し元が429を返す)
#   - 設定漏れ(RECAPTCHA_SECRET_KEYが未設定)          -> ConfigurationError を送出する
#
# 両者をどちらもfalseに畳んでしまうと、本番で環境変数を設定し忘れたときに
# 「reCAPTCHAが常に失敗する」という形でしか症状が出ず、設定ミスだと気付けない
# (.claude/rules/coding-style.md: フォールバックで握りつぶさない・Fail Fast)。
class RecaptchaVerifier
  # RECAPTCHA_SECRET_KEYが未設定のまま検証を要求された場合に送出する。
  class ConfigurationError < StandardError; end

  SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify".freeze

  # requirements.md 1.3: 「reCAPTCHA検証をテスト用キーで検証可能にする」。
  # development/test環境でネットワークへ到達せずに正常系を検証するためのトークン。
  # production環境では一切通用しない(必ずGoogleのsiteverifyへ問い合わせる)。
  TEST_SUCCESS_TOKEN = "test-recaptcha-success".freeze

  HTTP_OPEN_TIMEOUT_SECONDS = 5
  HTTP_READ_TIMEOUT_SECONDS = 5

  def self.verify(token)
    new(token).verify
  end

  def initialize(token)
    @token = token
  end

  # 検証が成立したかどうかを返す。
  #
  # @raise [ConfigurationError] production環境でRECAPTCHA_SECRET_KEYが未設定の場合
  def verify
    return false if @token.blank?

    if Rails.env.production?
      verify_with_google
    else
      verify_with_test_token
    end
  end

  private

  # 環境判定はRails.envを単一の情報源とする(.claude/rules/environment.md)。
  # production以外でのみ到達するため、この分岐が本番のreCAPTCHAを迂回することはない。
  def verify_with_test_token
    matched = @token == TEST_SUCCESS_TOKEN
    Rails.logger.info("[RecaptchaVerifier] non-production verification result=#{matched}")
    matched
  end

  def verify_with_google
    response = post_siteverify(secret_key!)
    succeeded = JSON.parse(response.body)["success"] == true

    Rails.logger.info("[RecaptchaVerifier] siteverify responded success=#{succeeded}")
    succeeded
  rescue ConfigurationError
    # ConfigurationErrorはStandardErrorの子孫であり、下のrescueに捕まえさせると
    # 設定漏れが「検証失敗(false)」に化けてしまう。本サービスが区別すべき当の対象なので、
    # ここで明示的に素通しして呼び出し元へ伝播させる。
    raise
  rescue StandardError => e
    # ネットワーク障害・Google側の障害・レスポンスのJSONパース失敗など。
    # 検証できなかった以上fail closedで通過させないが、検証失敗(Bot判定)とは
    # 原因が異なるため、区別できるようERRORレベルで詳細を残す(OWASP A09)。
    Rails.logger.error(
      "[RecaptchaVerifier] reCAPTCHA siteverify call failed: #{e.class}: #{e.message}. " \
      "Failing closed (treating as not verified)."
    )
    false
  end

  def secret_key!
    secret_key = ENV["RECAPTCHA_SECRET_KEY"]
    return secret_key if secret_key.present?

    Rails.logger.error("[RecaptchaVerifier] RECAPTCHA_SECRET_KEY is not configured")
    raise ConfigurationError,
          "RECAPTCHA_SECRET_KEY is not set. reCAPTCHA cannot be verified in production."
  end

  # Net::HTTP.post_formはタイムアウトを指定できず、Googleが応答しない場合に
  # Pumaのスレッドを長時間占有してしまう(ログイン導線上の同期呼び出しであるため)。
  # 明示的にタイムアウトを設定できるNet::HTTP.startを使う。
  def post_siteverify(secret_key)
    uri = URI(SITEVERIFY_URL)

    Net::HTTP.start(
      uri.host, uri.port,
      use_ssl: true,
      open_timeout: HTTP_OPEN_TIMEOUT_SECONDS,
      read_timeout: HTTP_READ_TIMEOUT_SECONDS
    ) do |http|
      request = Net::HTTP::Post.new(uri)
      request.set_form_data("secret" => secret_key, "response" => @token)
      http.request(request)
    end
  end
end
