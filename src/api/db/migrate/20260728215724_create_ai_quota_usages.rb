class CreateAiQuotaUsages < ActiveRecord::Migration[8.1]
  # requirements.md F7: quota_date(JST-3hの日付)はuser_idと複合UK。
  # 同一クォータ日に既に消費済みなら429で拒否する判定に用いる。
  def change
    create_table :ai_quota_usages do |t|
      t.references :user, null: false, foreign_key: true
      t.date :quota_date, null: false
      t.datetime :consumed_at, null: false

      t.timestamps
    end

    add_index :ai_quota_usages, [ :user_id, :quota_date ], unique: true
  end
end
