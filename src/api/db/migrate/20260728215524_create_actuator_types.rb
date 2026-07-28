class CreateActuatorTypes < ActiveRecord::Migration[8.1]
  # requirements.md 1.7: アクチュエータ種別マスタ(2件: LED, ファン)。
  # requirements.md 2節のER図には独立エンティティとして描かれていないが、
  # マスタデータ件数(1.7節・issue #6受け入れ条件)の内訳に「アクチュエータ種別2件」が
  # 明示されているため、command_types が分類として参照する正規化用マスタとして追加する。
  def change
    create_table :actuator_types, id: :string, primary_key: :code do |t|
      t.string :name, null: false

      t.timestamps
    end
  end
end
