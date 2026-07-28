class CreateAiSummaries < ActiveRecord::Migration[8.1]
  # requirements.md F7: quota_date(JST-3hの日付)ごとに生成結果を保存し、
  # 当日中は保存済みサマリーを再表示する。
  def change
    create_table :ai_summaries do |t|
      t.references :user, null: false, foreign_key: true
      t.date :quota_date, null: false
      t.text :summary_text, null: false

      t.timestamps
    end

    add_index :ai_summaries, [ :user_id, :quota_date ], unique: true
  end
end
