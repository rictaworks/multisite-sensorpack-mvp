# requirements.md 1.6 F4 detect_offline:
# 1分周期のバックグラウンドジョブとして全アクティブ(online)デバイスを走査し、
# 期待送信間隔x3+猶予30秒を超えて無応答のデバイスをオフライン判定する。
# 実際の1分周期スケジューリング設定(cron/solid_queue recurring)はデプロイ運用側のタスクとし、
# 本Issueのスコープはジョブのロジック本体とする。
class OfflineDetectionJob < ApplicationJob
  queue_as :default

  # as_of: テスト容易性のため判定基準時刻を注入可能にする(既定は実行時点の現在時刻)。
  def perform(as_of: Time.current)
    device_ids = Device.online_candidates_for_offline_check.pluck(:id)
    Rails.logger.info("[OfflineDetectionJob] #{device_ids.size}台のonlineデバイスを走査します(as_of=#{as_of})")

    device_ids.each { |device_id| evaluate_device(device_id, as_of) }
  end

  private

  # requirements.md F4 手順3: 判定直前にlast_seen_atをトランザクション内で再読込(行ロック付きの再取得)し、
  # 走査中に到着したテレメトリとの競合(誤発報)を排除する。
  def evaluate_device(device_id, as_of)
    Device.transaction do
      device = Device.lock.find_by(id: device_id)

      if device.nil?
        Rails.logger.warn(
          "[OfflineDetectionJob] device_id=#{device_id} は走査後に削除/変更されたためスキップします"
        )
        next
      end

      next unless device.status_code == Device::STATUS_ONLINE
      next unless device.offline_due?(as_of)

      device.mark_offline!
    end
  end
end
