<script setup lang="ts">
// Cài đặt › Đánh giá KPI: cách tính tổng điểm KPI (tỉ lệ các thành phần) và những chỗ khác đang dùng điểm KPI.
import { useLoad } from '@/composables/useLoad';
import { getKpiRules } from '@/services/admin-settings';
import SettingsFrame from './SettingsFrame.vue';
import { PATHS } from './nav';

const { data } = useLoad(() => getKpiRules());
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
          <RouterLink :to="PATHS.danhGiaKpi" class="r link">Mở Đánh giá KPI</RouterLink>
        </div>
        <div class="wts">
          <template v-for="(w, i) in data.weights" :key="w.label">
            <div>
              <div class="l">{{ w.label }}</div>
              <div class="v">{{ w.percent }}%</div>
              <div class="n">{{ w.note }}</div>
            </div>
            <div class="op">{{ (i as number) < data.weights.length - 1 ? '+' : '=' }}</div>
          </template>
          <div>
            <div class="l">Tổng điểm</div>
            <div class="v">{{ data.total }}%</div>
            <div class="n"></div>
          </div>
        </div>
        <div style="height: 20px"></div>
      </section>

      <section v-if="data.related.length" class="card">
        <div class="card-h">
          <h2>Liên quan</h2>
          <span class="cap">Những chỗ khác dùng điểm KPI</span>
        </div>
        <div v-for="r in data.related" :key="r.key" class="rel">
          <span class="k">{{ r.key }}</span>
          <span class="d">{{ r.desc }}</span>
          <RouterLink :to="r.to" class="link">{{ r.link }}</RouterLink>
        </div>
        <div style="height: 6px"></div>
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
.wts .n {
  color: var(--muted);
  font-size: 11px;
  margin-top: 2px;
  min-height: 14px;
}
.rel {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  gap: 16px;
  align-items: center;
  min-height: 56px;
  padding: 10px 24px;
  border-top: 1px solid var(--rule);
  font-size: 13px;
  line-height: 18px;
}
.rel .k {
  font-weight: 600;
}
.rel .d {
  color: var(--muted);
}
</style>
