<script setup lang="ts">
// Cài đặt › Quy tắc KPI: cách tính tổng điểm KPI (tỉ lệ năm thành phần), chỉ xem; sửa ở Cách tính lương › Lương KPI.
import { computed } from 'vue';
import { kpiRulesView } from '@/builders/api/settings-screens';
import { useLoad } from '@/composables/useLoad';
import { getSettings } from '@/services/settings-store';
import SettingsFrame from './SettingsFrame.vue';
import { PATHS } from './nav';

const { data: settings } = useLoad(() => getSettings());
const data = computed(() => (settings.value ? kpiRulesView(settings.value) : null));
</script>

<template>
  <SettingsFrame active="kpi5">
    <template #sub
      >Lương luôn tính kèm KPI · Admin nhập 5 điểm cho mỗi người mỗi tháng, nhân viên không tự chấm</template
    >

    <template v-if="data">
      <section class="card">
        <div class="card-h">
          <h2>Cách tính tổng điểm KPI</h2>
          <RouterLink :to="PATHS.bangLuong" class="r link">Mở Bảng lương</RouterLink>
        </div>
        <div class="wts">
          <template v-for="(w, i) in data.weights" :key="w.label">
            <div>
              <div class="l">{{ w.label }}</div>
              <div class="v">{{ w.percent }}%</div>
            </div>
            <div class="op">{{ (i as number) < data.weights.length - 1 ? '+' : '=' }}</div>
          </template>
          <div>
            <div class="l">Tổng điểm</div>
            <div class="v">{{ data.total }}%</div>
          </div>
        </div>
        <p class="edit">
          <RouterLink :to="`${PATHS.congThuc}?hop=luong-kpi`" class="link">Sửa trong Cách tính lương › Lương KPI</RouterLink>
        </p>
      </section>
    </template>
  </SettingsFrame>
</template>

<style scoped>
.wts {
  display: grid;
  grid-template-columns: 1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr 20px 0.8fr;
  align-items: center;
  margin: 4px 24px 0;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--raised);
}
.wts .op {
  color: #9e9e9e;
  font-size: 18px;
  text-align: center;
}
.wts .l {
  color: var(--muted);
  font-size: 12px;
}
.wts .v {
  font-size: 20px;
  line-height: 26px;
  font-weight: 600;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.edit {
  margin: 14px 24px 20px;
  font-size: 13px;
}
</style>
