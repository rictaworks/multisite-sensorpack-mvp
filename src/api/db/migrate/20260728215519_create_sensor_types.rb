class CreateSensorTypes < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: センサー種別マスタ(2件: temperature, humidity)
  def change
    create_table :sensor_types, id: :string, primary_key: :code do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
