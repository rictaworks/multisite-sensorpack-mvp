# requirements.md 1.6 F3 evaluate_thresholds:
# 保存済みの1件のテレメトリ読み取りを、そのデバイスに設定された全閾値(Threshold)に適用し、
# ヒステリシス状態機械(Threshold#register_reading!)の遷移結果に応じてアラート(Alert)を
# open/自動closeする。閾値未設定のメトリクス・方向は対象のThresholdレコード自体が存在しないため、
# 走査対象に含まれず自然に判定をスキップする(requirements.md F3 手順6)。
#
# TelemetryIngestService から、テレメトリ保存と同一トランザクション内で同期呼び出しされる想定
# (requirements.md F2 手順6「保存後、閾値判定を同期実行する」)。
class ThresholdEvaluationService
  # requirements.md 1.7マスタ: センサー種別は温度(temperature)・湿度(humidity)の2件のみ。
  METRIC_VALUE_READERS = {
    "temperature" => ->(reading) { reading.temperature_c },
    "humidity" => ->(reading) { reading.humidity_pct }
  }.freeze

  def initialize(device:, reading:)
    @device = device
    @reading = reading
  end

  def call
    @device.thresholds.find_each { |threshold| evaluate(threshold) }
  end

  private

  def evaluate(threshold)
    value = metric_value_for(threshold)
    transition = threshold.register_reading!(value)

    case transition
    when :breached
      open_alert!(threshold)
    when :released
      close_alert!(threshold)
    when nil
      nil
    else
      raise "unexpected threshold transition result: #{transition.inspect}"
    end
  end

  def metric_value_for(threshold)
    reader = METRIC_VALUE_READERS[threshold.sensor_type_code]
    raise "unsupported sensor_type_code on threshold##{threshold.id}: #{threshold.sensor_type_code.inspect}" unless reader

    reader.call(@reading).to_f
  end

  # requirements.md F3 手順5: BREACHED中は同一メトリクス×方向のアラートを重複生成しない
  # (Threshold側の状態機械上、通常はNORMALからしか:breachedへ遷移しないため二重生成は起きないはずだが、
  # フォールバックで握りつぶさず、要件通りの重複防止ガードとして明示的に確認する)。
  def open_alert!(threshold)
    alert_type_code = Alert.alert_type_code_for_threshold_direction(threshold.direction)
    return if @device.alerts.open.exists?(alert_type_code: alert_type_code)

    @device.alerts.create!(
      alert_type_code: alert_type_code,
      severity_code: Alert::THRESHOLD_BREACH_ALERT_SEVERITY_CODE,
      status: "open",
      opened_at: Time.current
    )
    Rails.logger.info(
      "[ThresholdEvaluationService] device_id=#{@device.id} threshold_id=#{threshold.id} " \
      "breach確定によりアラートをopenしました(alert_type_code=#{alert_type_code})"
    )
  end

  def close_alert!(threshold)
    alert_type_code = Alert.alert_type_code_for_threshold_direction(threshold.direction)
    @device.alerts.open.where(alert_type_code: alert_type_code).find_each(&:auto_close!)
    Rails.logger.info(
      "[ThresholdEvaluationService] device_id=#{@device.id} threshold_id=#{threshold.id} " \
      "解除確定によりアラートを自動closeしました(alert_type_code=#{alert_type_code})"
    )
  end
end
