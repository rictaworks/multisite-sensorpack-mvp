class AiSummary < ApplicationRecord
  belongs_to :user

  # requirements.md F7: quota_date(JST-3hの日付)はuser_idと複合UK。当日中は再表示。
  validates :quota_date, presence: true, uniqueness: { scope: :user_id }
  validates :summary_text, presence: true

  # requirements.md F7.4: データ不足の日はLLMを呼ばずクォータを消費しない(Issue #14)。
  # dataSufficientは専用カラムとして永続化せず、「同一user_id+quota_dateでクォータが
  # 消費されているか」から導出する。DailySummaryServiceは、統計が十分な場合のみ
  # AiSummary保存とAiQuotaUsage.consume!を同一トランザクションで行うため、
  # 両者は常に表裏一体であり、この導出方法で整合性が保たれる(専用カラム追加によるスキーマ変更
  # を避け、Issue #14のEdit scope: app/models/ai_summary.rb (edit) の範囲に留める)。
  def data_sufficient?
    AiQuotaUsage.consumed?(user: user, quota_date: quota_date)
  end
end
