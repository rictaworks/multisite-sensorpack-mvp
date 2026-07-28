class AiQuotaUsage < ApplicationRecord
  belongs_to :user

  # requirements.md F7: quota_dateはuser_idと複合UK。
  validates :quota_date, presence: true, uniqueness: { scope: :user_id }
  validates :consumed_at, presence: true

  # requirements.md F7.1: 指定ユーザー・クォータ日について既に消費済みかどうかを判定する。
  def self.consumed?(user:, quota_date:)
    exists?(user_id: user.id, quota_date: quota_date)
  end

  # requirements.md F7.2: LLM呼び出しに成功し、AiSummaryを保存できた場合のみ
  # クォータ消費を記録する(呼び出し元であるDailySummaryServiceがAiSummary保存と
  # 同一トランザクションで呼び出す)。
  def self.consume!(user:, quota_date:, consumed_at: Time.current)
    create!(user: user, quota_date: quota_date, consumed_at: consumed_at)
  end

  # requirements.md F7.5 / F9: 開発者が管理画面から任意ユーザーのクォータを手動リセットできる。
  # 管理画面コントローラー自体はF9issue(管理画面)の担当範囲だが、そこから再利用できるよう
  # リセット操作をモデルに切り出しておく(Issue #14ではモデル・サービスレベルで検証する)。
  def self.reset_for!(user:, quota_date:)
    Rails.logger.info("[AiQuotaUsage.reset_for!] user_id=#{user.id} quota_date=#{quota_date} manually reset")
    where(user_id: user.id, quota_date: quota_date).destroy_all
  end
end
