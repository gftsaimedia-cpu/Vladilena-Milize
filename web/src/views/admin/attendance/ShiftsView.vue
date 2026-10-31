<script setup>
// Tab Ca làm: 6 ca cố định và số người của từng ca; bên phải là những người chưa có ca. Admin gán ca, nhân viên không tự chọn.
import { computed } from 'vue';
import { useLoad } from '@/composables/useLoad.js';
import { getShiftOverview } from '@/services/admin-attendance.js';
import { initials } from '@/utils/format.js';
import { LINKS } from './links.js';

const { data } = useLoad(() => getShiftOverview());
const shifts = computed(() => data.value?.shifts || []);
const unassigned = computed(() => data.value?.unassigned || []);
const maxCount = computed(() => Math.max(1, ...shifts.value.map(s => s.count)));
</script>

<template>
  <div v-if="data" class="grid2">
    <section class="card">
      <div class="card-h">
        <h2>{{ shifts.length }} ca cố định</h2>
        <span class="cap"
          >{{ data.assigned }} người đã có ca · Admin gán ca cho từng người, nhân viên không tự chọn</span
        >
        <RouterLink class="r link" :to="LINKS.shifts">Sửa ca trong Cài đặt</RouterLink>
      </div>
      <table class="tbl">
        <colgroup>
          <col style="width: 140px" />
          <col style="width: 210px" />
          <col style="width: 110px" />
          <col style="width: 90px" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Ca</th>
            <th>Giờ</th>
            <th>Loại</th>
            <th class="n">Số người</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in shifts" :key="s.code">
            <td class="b">{{ s.name }}</td>
            <td>{{ s.hours }}</td>
            <td>{{ s.type }}</td>
            <td class="n">{{ s.count }}</td>
            <td style="width: 180px">
              <div class="bar"><i :style="{ width: `${(s.count / maxCount) * 100}%` }" /></div>
            </td>
          </tr>
        </tbody>
      </table>
      <div style="height: 8px" />
    </section>

    <section class="card unas">
      <div class="card-h">
        <h2>Chưa có ca</h2>
        <span class="cap">{{ unassigned.length }} người</span>
      </div>
      <div v-for="p in unassigned" :key="p.username" class="row">
        <div>
          <div class="who">
            <span class="av">{{ initials(p.name) }}</span>
            <div>
              <div class="t">{{ p.name }}</div>
              <div class="s">{{ p.sub }}</div>
            </div>
          </div>
        </div>
        <RouterLink class="btn sm" :to="{ path: '/admin/nhan-su', query: { loc: 'chua-co-ca' } }">Gán ca</RouterLink>
      </div>
      <div class="foot">Chưa có ca thì Check-in/out chưa tính ra giờ công. Gán cho nhiều người cùng lúc ở Nhân sự.</div>
    </section>
  </div>
</template>

<style scoped>
.tbl td {
  height: 56px;
}
.tbl td.b {
  font-weight: 600;
}
.grid2 {
  align-items: start;
}
.unas .row {
  grid-template-columns: 1fr auto;
  height: 64px;
}
.unas .row .s {
  color: var(--muted);
  font-size: 12px;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: #efefef;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: #bdbdbd;
}
</style>
