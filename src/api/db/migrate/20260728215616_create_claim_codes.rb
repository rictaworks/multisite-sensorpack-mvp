class CreateClaimCodes < ActiveRecord::Migration[8.1]
  # requirements.md F1: 8桁英数字のクレームコード。有効期限15分、
  # 照合失敗が累計5回に達したら失効(fail_count)。
  def change
    create_table :claim_codes do |t|
      t.references :user, null: false, foreign_key: true
      t.references :site, null: false, foreign_key: true
      t.string :code, null: false
      t.integer :fail_count, null: false, default: 0
      t.datetime :expires_at, null: false
      t.datetime :used_at

      t.timestamps
    end

    add_index :claim_codes, :code, unique: true
  end
end
