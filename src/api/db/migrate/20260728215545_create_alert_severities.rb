class CreateAlertSeverities < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: アラート重要度マスタ(3件: info/warning/critical)
  def change
    create_table :alert_severities, id: :string, primary_key: :code do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
