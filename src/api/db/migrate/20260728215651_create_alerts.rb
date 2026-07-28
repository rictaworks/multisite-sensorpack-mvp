class CreateAlerts < ActiveRecord::Migration[8.1]
  # requirements.md F8: open -> acknowledged -> closed、または open -> closed(自動)。
  def change
    create_table :alerts do |t|
      t.references :device, null: false, foreign_key: true
      t.string :alert_type_code, null: false
      t.string :severity_code, null: false
      t.string :status, null: false, default: "open"
      t.datetime :opened_at, null: false
      t.datetime :acknowledged_at
      t.datetime :closed_at

      t.foreign_key :alert_types, column: :alert_type_code, primary_key: :code
      t.foreign_key :alert_severities, column: :severity_code, primary_key: :code

      t.timestamps
    end

    add_index :alerts, :alert_type_code
    add_index :alerts, :severity_code
    add_index :alerts, :status
  end
end
