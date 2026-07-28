# requirements.md 1.6 F2 ingest_telemetry:
# ESP32から送信された連番seq・温度・湿度を検証・保存し、last_seen更新とF3(閾値判定)を
# 同一トランザクション内で同期実行する(requirements.md F2 手順6)。
#
# 認証(デバイストークン検証・無効/論理削除済みデバイスへの401/410判定)はコントローラ側
# (Api::TelemetryController + DeviceAuthenticatable concern)の責務であり、
# 本サービスは認証済みのDeviceを受け取る前提で動作する。
#
# コマンドのピギーバック同梱・ACK処理はIssue #11(F5 dispatch_command)の担当範囲であり、
# 本サービスの戻り値(Result)には含まない(Issue #11のEdit scopeが本ファイルの
# 追加編集として明記されている: "telemetry_ingest_service.rb (edit - コマンドピギーバック
# 同梱・ACK処理を追加)")。
class TelemetryIngestService
  # 必須フィールド欠損・型不正など、リクエスト自体が不正な場合に送出する
  # (コントローラ側で400 validation_errorにマッピングする)。
  class ValidationError < StandardError; end

  Result = Struct.new(:accepted, :duplicate, :server_time, :reading, keyword_init: true)

  def initialize(device:, seq:, temperature_c:, humidity_pct:, device_reported_at: nil)
    @device = device
    @seq = seq
    @temperature_c = temperature_c
    @humidity_pct = humidity_pct
    @device_reported_at = device_reported_at
  end

  def call
    seq = coerce_integer!(@seq, "seq")
    temperature_c = coerce_float!(@temperature_c, "temperatureC")
    humidity_pct = coerce_float!(@humidity_pct, "humidityPct")
    server_time = Time.current

    if duplicate_seq?(seq)
      Rails.logger.info(
        "[TelemetryIngestService] device_id=#{@device.id} seq=#{seq} は重複のため保存をスキップします"
      )
      return Result.new(accepted: false, duplicate: true, server_time: server_time, reading: nil)
    end

    unless TelemetryReading.within_range?(temperature_c: temperature_c, humidity_pct: humidity_pct)
      Rails.logger.warn(
        "[TelemetryIngestService] device_id=#{@device.id} seq=#{seq} は値域外のため破棄します " \
        "(temperature_c=#{temperature_c}, humidity_pct=#{humidity_pct})"
      )
      @device.record_discarded_reading!
      return Result.new(accepted: false, duplicate: false, server_time: server_time, reading: nil)
    end

    reading = persist_and_evaluate!(seq: seq, temperature_c: temperature_c, humidity_pct: humidity_pct, server_time: server_time)
    Result.new(accepted: true, duplicate: false, server_time: server_time, reading: reading)
  rescue ActiveRecord::RecordNotUnique
    # requirements.md 1.9 Fカテゴリ相当の競合対策: duplicate_seq?判定後、create!までの間に
    # 別リクエストが同じseqを先に保存した場合(再送の同時到達)もDB一意制約でここに落ちる。
    # フォールバックで握りつぶさず、重複として明示的に扱う。
    Rails.logger.info(
      "[TelemetryIngestService] device_id=#{@device.id} seq=#{seq} 保存直前の競合により重複と判定しました"
    )
    Result.new(accepted: false, duplicate: true, server_time: server_time, reading: nil)
  end

  private

  def duplicate_seq?(seq)
    @device.telemetry_readings.exists?(seq: seq)
  end

  def persist_and_evaluate!(seq:, temperature_c:, humidity_pct:, server_time:)
    reading = nil

    Device.transaction do
      reading = @device.telemetry_readings.create!(
        seq: seq,
        temperature_c: temperature_c,
        humidity_pct: humidity_pct,
        recorded_at: server_time,
        device_reported_at: coerce_reported_at(@device_reported_at)
      )

      # requirements.md F2 手順3: 記録時刻はサーバー受信時刻を採用する。last_seen_atも同様に
      # server_timeを用いる(端末申告時刻に依存すると、端末時計のずれで誤ってオフライン判定される
      # おそれがあるため)。
      @device.update!(last_seen_at: server_time)
      @device.mark_online!

      ThresholdEvaluationService.new(device: @device, reading: reading).call
    end

    reading
  end

  # requirements.md F2: 端末申告時刻(device_reported_at)は参考値として保持のみ。
  # パース不能な値であっても、テレメトリ受信自体は継続する(参考値の欠落は許容範囲であり、
  # リクエスト全体を失敗させるほどの不正ではないため)。ただしログには残し、追跡可能にする。
  def coerce_reported_at(value)
    return nil if value.blank?

    Time.zone.parse(value.to_s)
  rescue ArgumentError, TypeError
    Rails.logger.warn(
      "[TelemetryIngestService] device_id=#{@device.id} deviceReportedAtの形式が不正なため参考値なしとして扱います(#{value.inspect})"
    )
    nil
  end

  def coerce_integer!(value, field_name)
    raise ValidationError, "#{field_name} is required" if value.nil?

    Integer(value)
  rescue ArgumentError, TypeError
    raise ValidationError, "#{field_name} must be an integer"
  end

  def coerce_float!(value, field_name)
    raise ValidationError, "#{field_name} is required" if value.nil?

    Float(value)
  rescue ArgumentError, TypeError
    raise ValidationError, "#{field_name} must be a number"
  end
end
