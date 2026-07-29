# requirements.md 1.6 F6.5: 時系列は7日を超えた生データを日次で1時間粒度に集約する
# (無料枠のストレージ節約・7d表示の高速化)。集約自体は完了済みの全時間バケットに対して
# 継続的に行い(hourly_aggregatesを常に最新まで積み上げておく)、7d範囲の参照は常に
# hourly_aggregatesから返せるようにする(DevicesController#telemetry_series参照)。
# 実際の日次スケジューリング設定(cron/solid_queue recurring)はデプロイ運用側のタスクとし、
# 本Issueのスコープはジョブのロジック本体とする(#10 OfflineDetectionJobと同様の方針)。
class HourlyAggregationJob < ApplicationJob
  queue_as :default

  # as_of: テスト容易性のため基準時刻を注入可能にする(既定は実行時点の現在時刻)。
  def perform(as_of: Time.current)
    cutoff = as_of.beginning_of_hour
    Rails.logger.info("[HourlyAggregationJob] start as_of=#{as_of} cutoff=#{cutoff}")

    total_created = 0
    Device.find_each do |device|
      HourlyAggregate::SENSOR_COLUMNS.each_key do |sensor_type_code|
        total_created += HourlyAggregate.aggregate_pending_hours!(
          device: device, sensor_type_code: sensor_type_code, before: cutoff
        )
      end
    end

    Rails.logger.info("[HourlyAggregationJob] finished created_buckets=#{total_created}")
  end
end
