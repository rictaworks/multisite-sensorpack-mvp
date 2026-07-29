require "active_support/core_ext/integer/time"

# Issue #53 A-1 / A-3: HTTPS強制・Hostヘッダ保護・信頼プロキシの設定値。
# 環境依存の値(許可Host・プロキシレンジ)はすべて環境変数から取得する(CLAUDE.md)。
# production.rbはeager load前に評価されるためautoloadに頼らずrequireする。
require_relative "../../lib/production_security"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Store uploaded files on the local file system (see config/storage.yml for options).
  config.active_storage.service = :local

  # デプロイ先(Railway)はTLS終端リバースプロキシ構成であり、アプリにはHTTPで到達する。
  # assume_sslを有効にしないと、force_sslが「まだHTTPだ」と判断し続けてリダイレクトループになる。
  # 両者は必ずセットで有効化する(Issue #53 A-1)。
  config.assume_ssl = true

  # HTTPS強制 + HSTS(Strict-Transport-Security) + secure cookie。
  config.force_ssl = true

  # ロードバランサ・監視サービスのヘルスチェック(/up・/health)は平文HTTPで到達しうるため、
  # HTTPSリダイレクトの対象から除外する(301を返すと監視が落ちる)。
  config.ssl_options = { redirect: { exclude: ProductionSecurity.health_check_exclusion } }

  # Issue #53 A-3: リバースプロキシ配下でX-Forwarded-Forを偽装したIPレート制限の回避を防ぐ。
  # TRUSTED_PROXY_IPSが未設定の場合はRails既定(ループバック・プライベートIPレンジ)を使う。
  trusted_proxies = ProductionSecurity.trusted_proxies
  config.action_dispatch.trusted_proxies = trusted_proxies if trusted_proxies

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  # config.cache_store = :mem_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # config.active_job.queue_adapter = :resque

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = { host: "example.com" }

  # Specify outgoing SMTP server. Remember to add smtp/* credentials via bin/rails credentials:edit.
  # config.action_mailer.smtp_settings = {
  #   user_name: Rails.application.credentials.dig(:smtp, :user_name),
  #   password: Rails.application.credentials.dig(:smtp, :password),
  #   address: "smtp.example.com",
  #   port: 587,
  #   authentication: :plain
  # }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # Issue #53 A-1: DNSリバインディング / Hostヘッダインジェクション対策。
  # 許可Hostは本番ドメイン(.claude/rules/deploy.md: rictaworks.jpのサブドメイン)に依存するため
  # RAILS_ALLOWED_HOSTS(カンマ区切り)で与える。未設定なら起動時に失敗させる(fail closed)。
  config.hosts = ProductionSecurity.allowed_hosts

  # ヘルスチェックはプラットフォーム内部のHost(例: *.railway.internal)で到達するため、
  # Host検証の対象から除外する。
  config.host_authorization = { exclude: ProductionSecurity.health_check_exclusion }
end
