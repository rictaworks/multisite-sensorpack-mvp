class CreateCommandTypes < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: コマンド種別マスタ(4件: LED_ON/LED_OFF/FAN_ON/FAN_OFF)
  def change
    create_table :command_types, id: :string, primary_key: :code do |t|
      t.string :name, null: false
      t.string :actuator_type_code, null: false

      t.foreign_key :actuator_types, column: :actuator_type_code, primary_key: :code

      t.timestamps
    end

    add_index :command_types, :actuator_type_code
  end
end
