class CreateHourlyAggregates < ActiveRecord::Migration[8.1]
  # requirements.md F6: 7日を超えた生データを日次で1時間粒度に集約する。
  def change
    create_table :hourly_aggregates do |t|
      t.references :device, null: false, foreign_key: true
      t.string :sensor_type_code, null: false
      t.datetime :hour_bucket, null: false
      t.decimal :min_value, precision: 5, scale: 2, null: false
      t.decimal :max_value, precision: 5, scale: 2, null: false
      t.decimal :avg_value, precision: 5, scale: 2, null: false

      t.foreign_key :sensor_types, column: :sensor_type_code, primary_key: :code

      t.timestamps
    end

    add_index :hourly_aggregates, [ :device_id, :sensor_type_code, :hour_bucket ],
              unique: true, name: "index_hourly_aggregates_on_device_sensor_hour"
  end
end
