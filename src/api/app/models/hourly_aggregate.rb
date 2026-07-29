class HourlyAggregate < ApplicationRecord
  # requirements.md 1.6 F6.5: telemetry_readingsの温度・湿度は同一行に同居しているため、
  # 集約対象のセンサー種別ごとに参照する生データのカラムをここで対応づける。
  SENSOR_COLUMNS = { "temperature" => :temperature_c, "humidity" => :humidity_pct }.freeze

  belongs_to :device
  belongs_to :sensor_type, foreign_key: :sensor_type_code, primary_key: :code, inverse_of: :hourly_aggregates

  validates :hour_bucket, presence: true,
            uniqueness: { scope: [ :device_id, :sensor_type_code ] }
  validates :min_value, presence: true
  validates :max_value, presence: true
  validates :avg_value, presence: true

  # requirements.md 1.6 F6.5 / ダッシュボード7d表示: 拠点デバイス詳細画面が常に
  # hourly_aggregatesから参照できるよう、指定デバイス・センサー種別・期間の集約点を古い順に返す。
  scope :in_range, lambda { |device:, sensor_type_code:, since:|
    where(device: device, sensor_type_code: sensor_type_code)
      .where("hour_bucket >= ?", since)
      .order(:hour_bucket)
  }

  # requirements.md 1.6 F6.5: 7日超の生データを日次で1時間粒度(min/max/avg)に集約する。
  #
  # `before`時刻ちょうどを含む・それ以降の時間バケットは「集計未確定の進行中バケット」として
  # 対象外にする(HourlyAggregationJobが cutoff = as_of.beginning_of_hour を渡す前提)。
  # 既に集約済みのバケット(device_id+sensor_type_code+hour_bucketの一意制約対象)は
  # 再集約しない(冪等・再実行安全。requirements.mdのフォールバック禁止方針に基づき、
  # 未知のsensor_type_codeはデフォルト値へ逃がさず明示的にArgumentErrorとして拒否する)。
  #
  # 戻り値: 新規作成した集約バケット件数。
  def self.aggregate_pending_hours!(device:, sensor_type_code:, before:)
    column = SENSOR_COLUMNS.fetch(sensor_type_code) do
      raise ArgumentError, "unsupported sensor_type_code for aggregation: #{sensor_type_code.inspect}"
    end

    already_aggregated = where(device: device, sensor_type_code: sensor_type_code)
                            .pluck(:hour_bucket).map(&:to_i).to_set

    readings = device.telemetry_readings.where("recorded_at < ?", before).order(:recorded_at)
    created_count = 0

    readings.group_by { |reading| reading.recorded_at.beginning_of_hour }.each do |hour_bucket, bucket_readings|
      next if already_aggregated.include?(hour_bucket.to_i)

      values = bucket_readings.map { |reading| reading.public_send(column) }
      create!(
        device: device,
        sensor_type_code: sensor_type_code,
        hour_bucket: hour_bucket,
        min_value: values.min,
        max_value: values.max,
        avg_value: (values.sum / values.size).round(2)
      )
      created_count += 1
      Rails.logger.info(
        "[HourlyAggregate.aggregate_pending_hours!] device_id=#{device.id} sensor_type_code=#{sensor_type_code} " \
        "hour_bucket=#{hour_bucket} readings=#{values.size}"
      )
    end

    created_count
  end
end
