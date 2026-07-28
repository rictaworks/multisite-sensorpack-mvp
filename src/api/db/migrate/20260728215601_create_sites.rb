class CreateSites < ActiveRecord::Migration[8.1]
  # requirements.md 1.4: 拠点名はユーザーが自由入力するラベル(住所入力は促さない)。
  # deleted: 論理削除(削除コマンド生成禁止のCLAUDE.md方針に対応する論理削除フラグ)。
  def change
    create_table :sites do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.boolean :deleted, null: false, default: false

      t.timestamps
    end
  end
end
