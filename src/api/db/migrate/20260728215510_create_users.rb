class CreateUsers < ActiveRecord::Migration[8.1]
  # requirements.md 1.4: Googleログインのopaqueなsub値のみ保持する。
  # メールアドレス・氏名・生年月日・住所・電話番号は一切保存しない。
  def change
    create_table :users do |t|
      t.string :google_sub, null: false

      t.timestamps
    end

    add_index :users, :google_sub, unique: true
  end
end
