class CreateTelemetryReadings < ActiveRecord::Migration[8.1]
  # requirements.md F2: 記録時刻はサーバー受信時刻(recorded_at)を採用する。
  # 端末申告時刻(device_reported_at)は参考値として保持のみ。
  # device_id + seq の組で重複排除するため複合UKを張る。
  def change
    create_table :telemetry_readings do |t|
      t.references :device, null: false, foreign_key: true
      t.integer :seq, null: false
      t.decimal :temperature_c, precision: 5, scale: 2, null: false
      t.decimal :humidity_pct, precision: 5, scale: 2, null: false
      t.datetime :recorded_at, null: false
      t.datetime :device_reported_at

      t.timestamps
    end

    add_index :telemetry_readings, [ :device_id, :seq ], unique: true
  end
end
