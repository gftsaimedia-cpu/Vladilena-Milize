<script setup lang="ts">
// Tab Lịch sử sửa điểm: mỗi dòng là lần sửa gần nhất của một người; chi tiết từng lần nằm trong Nhật ký thay đổi (Cài đặt).
import { computed } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { getKpiHistory } from '@/services/admin-kpi';
import { usePeriodStore } from '@/stores/period';
import { dmy, initials } from '@/utils/format';
import PagerBar from '@/views/admin/attendance/PagerBar.vue';
import { LINKS } from '@/views/admin/attendance/links';

const period = usePeriodStore();
const month = computed(() => period.month);
const monthNo = computed(() => Number(month.value.slice(5)));
const { data } = useLoad(
  () => getKpiHistory(month.value),
  () => month.value
);
const rows = computed(() => data.value?.rows || []);
const when = (at?) => `${at.slice(11, 16)} ${dmy(at.slice(0, 10))}`;
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Lịch sử sửa điểm tháng {{ monthNo }}</h2>
      <span class="cap">Mỗi dòng là lần sửa gần nhất của một người · chi tiết từng lần có trong Nhật ký thay đổi</span>
    </div>
    <table class="tbl hs">
      <colgroup>
        <col style="width: 200px" />
        <col />
        <col style="width: 240px" />
        <col style="width: 220px" />
      </colgroup>
      <thead>
        <tr>
          <th>Lúc</th>
          <th>Nhân sự</th>
          <th>Người sửa</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="tm">{{ when(r.at) }}</td>
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="t2">{{ r.by.name }}</div>
            <div class="s2">{{ r.by.username }}</div>
          </td>
          <td style="text-align: right">
            <RouterLink class="link" :to="LINKS.auditLog">Xem điểm trước và sau</RouterLink>
          </td>
        </tr>
        <tr v-if="data && !rows.length">
          <td colspan="4" class="none">Chưa có lần sửa điểm nào trong tháng này</td>
        </tr>
      </tbody>
    </table>
    <PagerBar v-if="rows.length" :text="`${rows.length} người đã được sửa điểm trong tháng ${monthNo}`" />
  </section>
</template>

<style scoped>
.hs td {
  height: 56px;
}
.hs .tm {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.hs .s2 {
  color: var(--muted);
  font-size: 12px;
}
td.none {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
