class AiQuotaUsage < ApplicationRecord
  belongs_to :user

  # requirements.md F7: quota_dateはuser_idと複合UK。
  validates :quota_date, presence: true, uniqueness: { scope: :user_id }
  validates :consumed_at, presence: true
end
