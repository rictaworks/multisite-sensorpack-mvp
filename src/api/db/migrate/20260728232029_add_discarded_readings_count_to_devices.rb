class AddDiscardedReadingsCountToDevices < ActiveRecord::Migration[8.1]
  # requirements.md F2 手順4: 値域外(温度-40〜85℃・湿度0〜100%)テレメトリは破棄し、
  # 破棄件数をデバイス統計に記録する(Issue #9)。
  def change
    add_column :devices, :discarded_readings_count, :integer, null: false, default: 0
  end
end
