# 本番環境のトランスポート層セキュリティ設定(Issue #53 A-1 / A-3)。
#
# config/environments/production.rb から呼ばれる。設定値そのものは
# .claude/rules/deploy.md「バックエンドのドメインは隠蔽する」および CLAUDE.md
# 「環境変数は必ず .env(またはデプロイ先のプラットフォーム環境変数)を参照する。
# 値をコードにハードコードしない」に従い、すべて環境変数から取得する。
#
# production.rb は Rails の起動シーケンス上 eager load / autoload より前に評価されるため、
# このファイルは app/ ではなく lib/ に置き、production.rb から require_relative で読み込む
# (autoload_lib 経由の定数解決に依存しない)。
#
# 判定不能・未設定の場合はフォールバックせず ConfigurationError で起動を止める
# (.claude/rules/coding-style.md フォールバック禁止 / .claude/rules/environment.md fail closed)。
module ProductionSecurity
  # 設定が不足している状態で本番を起動させないために送出する。
  class ConfigurationError < StandardError; end

  # ロードバランサ・監視サービスが認証もTLSリダイレクトも介さずに叩く必要があるパス。
  #   /up     … Rails標準のヘルスチェック(config/routes.rb rails_health_check)
  #   /health … 本プロジェクト独自のヘルスチェック(config/routes.rb health#show)
  # これらをHTTPS強制リダイレクトとHostヘッダ検証の双方から除外しないと、
  # Railway等のプラットフォームのヘルスチェックが 301 / 403 で落ちる。
  HEALTH_CHECK_PATHS = [ "/up", "/health" ].freeze

  # 許可するHostヘッダ(カンマ区切り)。例: "sensorpack-api.rictaworks.jp,.rictaworks.jp"
  # 先頭がドットのエントリはRailsの仕様によりサブドメインを含めて許可される。
  ALLOWED_HOSTS_ENV = "RAILS_ALLOWED_HOSTS".freeze

  # 信頼するリバースプロキシのIP/CIDR(カンマ区切り)。例: "100.64.0.0/10"
  # デプロイ先(Railway)が払い出すプロキシレンジを設定する。
  TRUSTED_PROXY_IPS_ENV = "TRUSTED_PROXY_IPS".freeze

  class << self
    # ヘルスチェックへのリクエストかどうか。
    # ActionDispatch::SSL / HostAuthorization の :exclude はいずれも
    # ActionDispatch::Request を受け取るlambdaを期待する。
    def health_check_request?(request)
      HEALTH_CHECK_PATHS.include?(request.path)
    end

    # config.ssl_options / config.host_authorization の :exclude にそのまま渡すlambda。
    def health_check_exclusion
      ->(request) { health_check_request?(request) }
    end

    # config.hosts に設定する許可Hostの配列。
    #
    # @param env [Hash] 環境変数(テストから差し替えるためだけに引数化している)
    # @raise [ConfigurationError] 本番で未設定の場合(DNSリバインディング防御が無効になるため)
    def allowed_hosts(env: ENV)
      hosts = split_csv(env[ALLOWED_HOSTS_ENV])

      if hosts.empty?
        raise ConfigurationError,
              "#{ALLOWED_HOSTS_ENV} is not set. Production cannot start without an explicit " \
              "Host allow-list (DNS rebinding / Host header injection protection)."
      end

      hosts
    end

    # config.action_dispatch.trusted_proxies に設定する値。
    #
    # ActionDispatch::RemoteIp は enumerable を渡すと既定の信頼プロキシ集合を
    # 「置き換える」仕様のため、既定値(ループバック・プライベートIPレンジ)に
    # 追加する形で返す。これを怠るとプラットフォーム内部の私設IPが信頼されなくなり、
    # 逆にクライアントIPの判定が壊れる。
    #
    # 未設定の場合はnilを返し、Rails既定の信頼プロキシ集合をそのまま使う。
    # 既定でもX-Forwarded-Forの偽装値は「信頼できないIP」として扱われるため、
    # 偽装によるレート制限回避は成立しない(spec/config/production_security_spec.rb で検証)。
    #
    # @raise [ConfigurationError] 値がIP/CIDRとして解釈できない場合
    def trusted_proxies(env: ENV)
      entries = split_csv(env[TRUSTED_PROXY_IPS_ENV])
      return nil if entries.empty?

      ActionDispatch::RemoteIp::TRUSTED_PROXIES + entries.map { |entry| parse_ip(entry) }
    end

    private

    def split_csv(value)
      value.to_s.split(",").map(&:strip).reject(&:empty?)
    end

    def parse_ip(entry)
      IPAddr.new(entry)
    rescue IPAddr::Error => e
      raise ConfigurationError,
            "#{TRUSTED_PROXY_IPS_ENV} contains an invalid IP/CIDR entry #{entry.inspect}: #{e.message}"
    end
  end
end
