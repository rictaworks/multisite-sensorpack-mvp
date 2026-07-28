class CreateThresholds < ActiveRecord::Migration[8.1]
  # requirements.md F3: 上限・下限の発報閾値とデッドバンド、ヒステリシス状態(NORMAL/BREACHED)、
  # 連続回数(consecutive_count)を保持する。
  def change
    create_table :thresholds do |t|
      t.references :device, null: false, foreign_key: true
      t.string :sensor_type_code, null: false
      t.string :direction, null: false
      t.decimal :trigger_value, precision: 6, scale: 2, null: false
      t.decimal :deadband, precision: 6, scale: 2, null: false, default: 0
      t.string :breach_state, null: false, default: "NORMAL"
      t.integer :consecutive_count, null: false, default: 0

      t.foreign_key :sensor_types, column: :sensor_type_code, primary_key: :code

      t.timestamps
    end

    add_index :thresholds, [ :device_id, :sensor_type_code, :direction ],
              unique: true, name: "index_thresholds_on_device_sensor_direction"
  end
end
