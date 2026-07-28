class CreateAlertTypes < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: アラート種別マスタ(3件: 上限超過/下限逸脱/オフライン)
  def change
    create_table :alert_types, id: :string, primary_key: :code do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
