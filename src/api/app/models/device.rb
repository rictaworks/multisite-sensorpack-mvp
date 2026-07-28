class Device < ApplicationRecord
  # requirements.md 6.1状態遷移図: provisioning -> online -> offline -> online
  STATUS_PROVISIONING = "provisioning".freeze
  STATUS_ONLINE = "online".freeze
  STATUS_OFFLINE = "offline".freeze

  # requirements.md F4 detect_offline 手順2: 期待送信間隔x3+猶予30秒を超えたらオフライン
  OFFLINE_INTERVAL_MULTIPLIER = 3
  OFFLINE_GRACE_PERIOD_SECONDS = 30

  # requirements.md 1.7マスタ: アラート種別「オフライン」、重要度は「警告」を採用する
  OFFLINE_ALERT_TYPE_CODE = "offline".freeze
  OFFLINE_ALERT_SEVERITY_CODE = "warning".freeze

  belongs_to :site
  belongs_to :device_status, foreign_key: :status_code, primary_key: :code, inverse_of: :devices

  has_many :telemetry_readings, dependent: :restrict_with_exception
  has_many :hourly_aggregates, dependent: :restrict_with_exception
  has_many :thresholds, dependent: :restrict_with_exception
  has_many :alerts, dependent: :restrict_with_exception
  has_many :commands, dependent: :restrict_with_exception
  has_one :automation_rule, dependent: :restrict_with_exception

  validates :device_token_digest, presence: true, uniqueness: true
  validates :expected_interval_sec, presence: true,
            numericality: { only_integer: true, greater_than: 0 }

  # requirements.md F4 手順1・6: オフライン検知ジョブが走査する対象は
  # 論理削除されていない・現在online状態のデバイスのみ。
  # provisioning(登録直後・テレメトリ未受信)は対象外(受け入れ条件どおり)。
  scope :online_candidates_for_offline_check, -> { where(deleted: false, status_code: STATUS_ONLINE) }

  # requirements.md F4 手順2: 現在時刻がこの時刻を超えたらオフライン。
  # テレメトリを一度も受信していない(last_seen_atがnil)デバイスは判定対象外のためnilを返す。
  def offline_deadline_at
    return nil if last_seen_at.nil?

    last_seen_at + (expected_interval_sec * OFFLINE_INTERVAL_MULTIPLIER) + OFFLINE_GRACE_PERIOD_SECONDS
  end

  # requirements.md F4 手順2 / 1.9 Cカテゴリ: 境界値ちょうどは正常、厳密な超過のみオフラインとみなす。
  def offline_due?(as_of = Time.current)
    return false if last_seen_at.nil?

    as_of > offline_deadline_at
  end

  # requirements.md F4 手順4: デバイス状態をofflineにし、オフラインアラートをopenする(open中は重複生成しない)。
  # 呼び出し元(OfflineDetectionJob)がトランザクション内で最新のlast_seen_atを再読込した上で
  # このメソッドを呼ぶ前提。
  def mark_offline!
    transaction do
      update!(status_code: STATUS_OFFLINE) unless status_code == STATUS_OFFLINE
      open_offline_alert! unless open_offline_alert_exists?
    end
    Rails.logger.info("[Device##{id}] offline判定によりofflineへ遷移しました(last_seen_at=#{last_seen_at.inspect})")
  end

  # requirements.md F4 手順5 / クラス図 Device#markOnline(): テレメトリ受信時にonlineへ復帰し、
  # オフラインアラートを自動closeする。呼び出し箇所(#9 ingest_telemetry)は本Issueのスコープ外。
  def mark_online!
    transaction do
      update!(status_code: STATUS_ONLINE) unless status_code == STATUS_ONLINE
      close_open_offline_alerts!
    end
    Rails.logger.info("[Device##{id}] onlineへ復帰しました")
  end

  private

  def open_offline_alert_exists?
    alerts.open.exists?(alert_type_code: OFFLINE_ALERT_TYPE_CODE)
  end

  def open_offline_alert!
    alerts.create!(
      alert_type_code: OFFLINE_ALERT_TYPE_CODE,
      severity_code: OFFLINE_ALERT_SEVERITY_CODE,
      status: "open",
      opened_at: Time.current
    )
  end

  def close_open_offline_alerts!
    alerts.open.where(alert_type_code: OFFLINE_ALERT_TYPE_CODE).find_each(&:auto_close!)
  end
end
