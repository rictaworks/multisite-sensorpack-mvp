class AiSummary < ApplicationRecord
  belongs_to :user

  # requirements.md F7: quota_date(JST-3hの日付)はuser_idと複合UK。当日中は再表示。
  validates :quota_date, presence: true, uniqueness: { scope: :user_id }
  validates :summary_text, presence: true
end
