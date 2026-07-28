class CreateAutomationRules < ActiveRecord::Migration[8.1]
  # requirements.md F5: デバイス1台につき自動制御ルールは0または1件(0..1)。
  # manual_override_untilは手動操作から30分の抑止ウィンドウ。
  def change
    create_table :automation_rules do |t|
      t.references :device, null: false, foreign_key: true, index: { unique: true }
      t.boolean :fan_on_temp_alert, null: false, default: false
      t.boolean :led_on_alert, null: false, default: false
      t.datetime :manual_override_until

      t.timestamps
    end
  end
end
