class AutomationRule < ApplicationRecord
  belongs_to :device, inverse_of: :automation_rule

  # requirements.md ER図: DEVICES ||--o| AUTOMATION_RULES(デバイス1台につき0または1件)。
  validates :device_id, uniqueness: true
end
