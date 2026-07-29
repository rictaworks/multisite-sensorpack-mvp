# requirements.md 1.6 F7 `generate_daily_summary` / 4.3 シーケンス図(AI日次サマリー クォータ制御)。
#
# クォータ日(JSTの現在時刻から3時間引いた日付。JST03:00リセットと等価)ごとに1回のみ、
# 過去24hのテレメトリ統計(最小・最大・平均・閾値超過時間)とアラート履歴の「統計値のみ」
# (個人情報なし)をIssue #13のFastAPI(internal-ai)へ渡して日本語サマリーを生成・保存する。
# データが存在しない場合はLLMを呼ばずクォータを消費しない(requirements.md F7.4)。
class DailySummaryService
  # 同一クォータ日に既に生成済み(クォータ消費済み)の場合に送出する。
  # 呼び出し元(Api::SummariesController)が既存サマリーを添えて429を返せるよう保持する。
  class QuotaExceededError < StandardError
    attr_reader :existing_summary

    def initialize(existing_summary)
      @existing_summary = existing_summary
      super(
        "AI summary quota already consumed for user_id=#{existing_summary.user_id} " \
        "quota_date=#{existing_summary.quota_date}"
      )
    end
  end

  # requirements.md 8節「AI利用制限」: JST03:00自動リセット = JST現在時刻から3時間引いた日付。
  JST_ZONE = ActiveSupport::TimeZone["Asia/Tokyo"]
  QUOTA_RESET_LOOKBACK = 3.hours
  STATS_LOOKBACK = 24.hours

  # requirements.md F7.4: データ不足時の定型文。Issue #13 FastAPI側(langchain_summary.rb
  # LLM_UNAVAILABLE_SUMMARY_TEXT)と同様、AIサマリー本文は仕様上常に日本語で生成されるコンテンツ
  # であり、UI表示文言(config/locales、i18n.md対象)とは性質が異なるため、既存の前例に倣い
  # 固定の日本語文とする(UI言語ごとの翻訳対象はエラーメッセージ等の画面文言に限定される)。
  INSUFFICIENT_DATA_SUMMARY_TEXT =
    "過去24時間のテレメトリデータが存在しないため、AIサマリーを生成できませんでした。" \
    "デバイスが正常に稼働しているかご確認ください。"

  # requirements.md 1.6 F7.1 / 8節: クォータ日=JSTの現在時刻から3時間引いた日付
  # (JST03:00リセットと等価)。JSTにはDSTが存在しないため単純なオフセット計算でよい。
  def self.quota_date_for(now = Time.current)
    (now.in_time_zone(JST_ZONE) - QUOTA_RESET_LOOKBACK).to_date
  end

  def initialize(user, ai_client: InternalAiClient.new, now: Time.current)
    @user = user
    @ai_client = ai_client
    @now = now
  end

  # requirements.md F7.1-4を実装するエントリーポイント。
  #
  # 戻り値: 新規生成またはデータ不足時定型文で保存されたAiSummary
  # 例外: QuotaExceededError (同一クォータ日に既に消費済みの場合)
  def call
    quota_date = self.class.quota_date_for(@now)

    if AiQuotaUsage.consumed?(user: @user, quota_date: quota_date)
      raise QuotaExceededError, existing_summary_or_raise(quota_date)
    end

    stats, alerts = collect_stats_and_alerts

    if stats.nil?
      Rails.logger.info(
        "[DailySummaryService] insufficient telemetry data; quota not consumed " \
        "user_id=#{@user.id} quota_date=#{quota_date}"
      )
      return save_summary(quota_date, INSUFFICIENT_DATA_SUMMARY_TEXT)
    end

    summary_text = @ai_client.generate_summary(stats: stats, alerts: alerts)

    summary = nil
    ActiveRecord::Base.transaction do
      summary = save_summary(quota_date, summary_text)
      AiQuotaUsage.consume!(user: @user, quota_date: quota_date, consumed_at: @now)
    end

    Rails.logger.info(
      "[DailySummaryService] summary generated and quota consumed user_id=#{@user.id} quota_date=#{quota_date}"
    )
    summary
  end

  private

  # クォータ消費済みなら対応するAiSummaryが必ず存在する不変条件を守る(save_summaryとconsume!を
  # 同一トランザクションで実行しているため)。万一崩れていた場合はフォールバックで握りつぶさず
  # 例外化する(Fail Fast、.claude/rules/coding-style.md)。
  def existing_summary_or_raise(quota_date)
    AiSummary.find_by(user_id: @user.id, quota_date: quota_date) ||
      raise("data integrity violation: quota consumed for user_id=#{@user.id} " \
            "quota_date=#{quota_date} but no AiSummary record exists")
  end

  def save_summary(quota_date, text)
    summary = AiSummary.find_or_initialize_by(user_id: @user.id, quota_date: quota_date)
    summary.summary_text = text
    summary.save!
    summary
  end

  # 過去24hのテレメトリ統計とアラート履歴を集計する。対象は自ユーザーの拠点配下の
  # 全デバイス(テナント分離、requirements.md F6-1と同様の方針)。
  # 過去24hにテレメトリが1件も無い場合は[nil, nil]を返す(F7.4のデータ不足判定)。
  def collect_stats_and_alerts
    window_start = @now - STATS_LOOKBACK
    device_ids = Device.joins(:site).where(sites: { user_id: @user.id }).pluck(:id)
    return [ nil, nil ] if device_ids.empty?

    readings = TelemetryReading.where(device_id: device_ids, recorded_at: window_start..@now)
    return [ nil, nil ] if readings.none?

    stats = {
      temperature: metric_stats(:temperature_c, device_ids, window_start),
      humidity: metric_stats(:humidity_pct, device_ids, window_start)
    }

    [ stats, alert_history(device_ids, window_start) ]
  end

  def metric_stats(column, device_ids, window_start)
    readings = TelemetryReading.where(device_id: device_ids, recorded_at: window_start..@now)
    sensor_type_code = column == :temperature_c ? "temperature" : "humidity"

    {
      min: readings.minimum(column).to_f,
      max: readings.maximum(column).to_f,
      avg: readings.average(column).to_f.round(2),
      threshold_breach_minutes: threshold_breach_minutes(sensor_type_code, device_ids, window_start)
    }
  end

  # 現在BREACHED状態のThresholdについて、その最終状態遷移時刻(updated_at)を「超過開始時刻」の
  # 近似値として扱い、集計窓[window_start, now]との重なり時間(分)を方向(upper/lower)ごとに
  # 合算する。requirements.md ER図のThresholdモデルは現在状態(breach_state)のみを保持し、
  # 過去の超過区間の完全な履歴は保持しないため、これは意図的な近似である(フォールバックでは
  # なく明示的な設計判断としてコメントに残す)。
  def threshold_breach_minutes(sensor_type_code, device_ids, window_start)
    thresholds = Threshold.where(device_id: device_ids, sensor_type_code: sensor_type_code, breach_state: "BREACHED")

    {
      upper: breach_minutes_for(thresholds.where(direction: "upper"), window_start),
      lower: breach_minutes_for(thresholds.where(direction: "lower"), window_start)
    }
  end

  def breach_minutes_for(thresholds, window_start)
    thresholds.sum do |threshold|
      breach_started_at = [ threshold.updated_at, window_start ].max
      overlap_seconds = [ @now - breach_started_at, 0 ].max
      overlap_seconds / 60.0
    end.round(2)
  end

  # 過去24h窓内で開始したアラート、または現在もopen中(継続中)のアラートを履歴として集計する。
  # アラート種別コードはDBの命名(threshold_upper_breach等)からOpenAPI契約のAlertTypeCode
  # (upper_breach等)へ変換する。未知のコードはフォールバックで無視せず例外化する(Fail Fast)。
  def alert_history(device_ids, window_start)
    Alert.where(device_id: device_ids)
         .where("opened_at >= :window_start OR status = :open_status", window_start: window_start, open_status: "open")
         .order(:opened_at)
         .map do |alert|
           {
             alert_type: map_alert_type_code(alert.alert_type_code),
             severity: alert.severity_code,
             opened_at: alert.opened_at,
             closed_at: alert.closed_at
           }
         end
  end

  # DBのコードから契約のAlertTypeCodeへの変換はAlertモデルに集約している
  # (Api::AlertsControllerも同じ変換を必要とするため)。
  def map_alert_type_code(code)
    Alert.contract_alert_type_code(code)
  end

  # Issue #13のFastAPI(internal-ai)を呼び出す薄いHTTPクライアント。
  # src/shared/contracts/openapi.yaml internal-aiタグ・securitySchemes.internalServiceKey準拠。
  # ベースURL・共有シークレットは環境変数から読み込み、コードにハードコードしない
  # (.env/デプロイ先環境変数を単一の情報源とする)。
  class InternalAiClient
    class ConfigurationError < StandardError; end
    class RequestFailedError < StandardError; end

    def initialize(base_url: ENV["AI_SERVICE_BASE_URL"], api_key: ENV["INTERNAL_AI_API_KEY"])
      @base_url = base_url
      @api_key = api_key
    end

    def generate_summary(stats:, alerts:)
      validate_configuration!

      uri = URI.join(@base_url, "/internal/ai/summaries")
      response = post_json(uri, build_payload(stats, alerts))

      unless response.is_a?(Net::HTTPSuccess)
        Rails.logger.error(
          "[DailySummaryService::InternalAiClient] internal-ai request failed " \
          "status=#{response.code} body=#{response.body}"
        )
        raise RequestFailedError, "internal-ai request failed with status #{response.code}"
      end

      JSON.parse(response.body).fetch("summaryText")
    end

    private

    # 未設定を「認証・呼び出し先なしでスキップ」というフォールバックにせず、fail closedで
    # 例外化する(OWASP A05対策。Issue #13 FastAPI側のrequire_internal_service_keyと対称)。
    def validate_configuration!
      return unless @base_url.blank? || @api_key.blank?

      Rails.logger.error(
        "[DailySummaryService::InternalAiClient] AI_SERVICE_BASE_URL/INTERNAL_AI_API_KEY is not configured"
      )
      raise ConfigurationError, "AI_SERVICE_BASE_URL and INTERNAL_AI_API_KEY must be configured"
    end

    def post_json(uri, payload)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request["X-Internal-Api-Key"] = @api_key
      request.body = payload.to_json

      http.request(request)
    end

    def build_payload(stats, alerts)
      {
        stats: {
          temperature: metric_payload(stats[:temperature]),
          humidity: metric_payload(stats[:humidity])
        },
        alerts: alerts.map { |alert| alert_payload(alert) }
      }
    end

    def metric_payload(metric)
      {
        min: metric[:min],
        max: metric[:max],
        avg: metric[:avg],
        thresholdBreachMinutes: {
          upper: metric[:threshold_breach_minutes][:upper],
          lower: metric[:threshold_breach_minutes][:lower]
        }
      }
    end

    def alert_payload(alert)
      {
        alertType: alert[:alert_type],
        severity: alert[:severity],
        openedAt: alert[:opened_at].iso8601,
        closedAt: alert[:closed_at]&.iso8601
      }
    end
  end
end
