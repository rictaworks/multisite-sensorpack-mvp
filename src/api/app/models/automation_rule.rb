class AutomationRule < ApplicationRecord
  belongs_to :device, inverse_of: :automation_rule

  # requirements.md ER図: DEVICES ||--o| AUTOMATION_RULES(デバイス1台につき0または1件)。
  validates :device_id, uniqueness: true

  # requirements.md F5 受け入れ条件: 手動コマンド発行後30分間は同一アクチュエータへの
  # 自動ルール発行を抑止する(手動優先のオーバーライドウィンドウ)。
  MANUAL_OVERRIDE_WINDOW = 30.minutes

  # 指定アクチュエータ種別(例: "fan"/"led")に対して、直近MANUAL_OVERRIDE_WINDOW以内に
  # 手動コマンド(origin: "manual")が発行されていれば真を返す。
  #
  # automation_rulesテーブルのmanual_override_untilカラムはデバイス単位の単一値だが、
  # 受け入れ条件は「同一アクチュエータへの」抑止(アクチュエータ単位)を求めているため、
  # 実際の抑止判定はcommandsテーブルの実データ(command_type経由のactuator_type_code)から
  # その都度導出する。manual_override_untilはopenapi.yaml AutomationRule契約に含まれる
  # 参考表示用フィールドとして#register_manual_override!で別途更新する。
  def manual_override_active?(actuator_type_code)
    device.commands
          .joins(:command_type)
          .where(origin: "manual", command_types: { actuator_type_code: actuator_type_code })
          .where("issued_at >= ?", MANUAL_OVERRIDE_WINDOW.ago)
          .exists?
  end

  # requirements.md F5 手順1: 手動コマンド発行のたびに呼び出す。
  # openapi.yaml AutomationRule.manualOverrideUntil(デバイス単位の参考表示用フィールド)を更新する。
  def register_manual_override!
    update!(manual_override_until: MANUAL_OVERRIDE_WINDOW.from_now)
    Rails.logger.info("[AutomationRule##{id}] manual_override_until updated to #{manual_override_until}")
  end
end
