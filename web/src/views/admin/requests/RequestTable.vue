<script setup lang="ts">
// Bảng yêu cầu dùng chung (thiết kế duyet / yc-moi-thang): cột đầu tuỳ chọn (ô tick), Nhân sự, Loại yêu cầu, Chi tiết,
// một cột riêng (Cảnh báo AI / Ảnh hưởng / Ghi chú / Kết quả) và cột thao tác.
// widths: độ rộng từng cột theo thứ tự hiển thị ('' = tự giãn).  heads: tiêu đề của 4 cột (không tính cột tick và cột thao tác).
// Slot: #head-lead, #lead="{ r }", #extra="{ r }", #act="{ r }"; hàng được chọn truyền qua selected (mảng id).
import { roleLine, sentLabel } from './helpers';
import { dmy, initials } from '@/utils/format';

defineProps({
  items: { type: Array as () => any[], required: true },
  heads: { type: Array as () => any[], required: true },
  widths: { type: Array as () => any[], required: true },
  lead: { type: Boolean, default: false },
  selected: { type: Array as () => any[], default: () => [] },
  extraClass: { type: String, default: '' }
});
</script>

<template>
  <table class="q">
    <colgroup>
      <col v-for="(w, i) in widths" :key="i" :style="w ? { width: w + 'px' } : null" />
    </colgroup>
    <thead>
      <tr>
        <th v-if="lead" class="cbc"><slot name="head-lead" /></th>
        <th v-for="h in heads" :key="h">{{ h }}</th>
        <th />
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in items" :key="r.id" :class="{ sel: selected.includes(r.id) }">
        <td v-if="lead" class="cbc"><slot name="lead" :r="r" /></td>
        <td>
          <div class="who">
            <span class="av">{{ initials(r.name) }}</span>
            <div>
              <div class="t">{{ r.name }}</div>
              <div class="s">{{ roleLine(r) }}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="k">{{ r.kind }}</div>
          <div class="ks">{{ dmy(r.date) }}</div>
        </td>
        <td>
          <div>{{ r.detail }}</div>
          <div class="ks">{{ sentLabel(r.sentAt) }}</div>
        </td>
        <td :class="extraClass"><slot name="extra" :r="r" /></td>
        <td class="act"><slot name="act" :r="r" /></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.q {
  table-layout: fixed;
}
.q td {
  height: 64px;
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q .k {
  font-weight: 500;
}
.q .ks {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.q td.act {
  text-align: right;
}
.q th.cbc,
.q td.cbc {
  padding-right: 0;
}
</style>
