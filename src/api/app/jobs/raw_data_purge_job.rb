# requirements.md 1.6 F6.5: 生データ(telemetry_readings)は14日で削除する(無料枠のストレージ節約)。
# 14日超の生データは、HourlyAggregationJobにより既に1時間粒度で集約済みである前提
# (通常運用では日次実行のHourlyAggregationJobが先行するため、削除対象は既に集約済み)。
# 実際の日次スケジューリング設定(cron/solid_queue recurring)はデプロイ運用側のタスクとし、
# 本Issueのスコープはジョブのロジック本体とする。
class RawDataPurgeJob < ApplicationJob
  queue_as :default

  # requirements.md 1.6 F6.5: 生データの保持期間は14日。
  RAW_RETENTION = 14.days

  # as_of: テスト容易性のため基準時刻を注入可能にする(既定は実行時点の現在時刻)。
  def perform(as_of: Time.current)
    cutoff = as_of - RAW_RETENTION
    scope = TelemetryReading.where("recorded_at < ?", cutoff)
    target_count = scope.count

    Rails.logger.info(
      "[RawDataPurgeJob] start as_of=#{as_of} cutoff=#{cutoff} target_count=#{target_count}"
    )

    deleted_count = scope.delete_all

    Rails.logger.info("[RawDataPurgeJob] finished deleted_count=#{deleted_count}")
  end
end
