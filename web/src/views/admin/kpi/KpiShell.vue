<script setup>
// Khung chung của Đánh giá KPI: tiêu đề, công thức tổng điểm (5 thành phần × tỉ lệ), 4 số tổng, thanh tab.
// Nội dung tab (nhập điểm / lịch sử sửa điểm) ở <RouterView>; số liệu đầu trang chia sẻ cho tab qua provide('kpiSummary').
import { computed, provide } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { getKpiSummary } from '@/services/admin-kpi.js';
import { usePeriodStore } from '@/stores/period.js';
import { vnd } from '@/utils/format.js';
import { LINKS } from '@/views/admin/attendance/links.js';

const route = useRoute();
const period = usePeriodStore();
const month = computed(() => period.month);
const monthNo = computed(() => Number(month.value.slice(5)));
const { data: summary, reload } = useLoad(
  () => getKpiSummary(month.value),
  () => month.value
);
provide('kpiSummary', summary);
provide('kpiReload', reload);

const query = computed(() => ({ thang: route.query.thang }));
</script>

<template>
  <div class="title">
    <div>
      <h1>Đánh giá KPI</h1>
      <p v-if="summary && !summary.empty">
        Tháng {{ monthNo }} · <b>{{ summary.passed }} người</b> đạt, <b>{{ summary.incomplete }} người</b> chưa chấm đủ
        <template v-if="summary.scoreWindow">· điểm thường có từ {{ summary.scoreWindow }}</template>
      </p>
      <p v-else-if="summary">Chưa có dữ liệu KPI của tháng này</p>
    </div>
    <div class="acts">
      <RouterLink class="btn" :to="LINKS.kpiRules"><Icon name="sliders" />Điều kiện nhận lương KPI</RouterLink>
    </div>
  </div>

  <template v-if="summary">
    <div class="wts" aria-label="Điểm tổng bằng 5 thành phần nhân tỉ lệ">
      <template v-for="(w, i) in summary.weights" :key="w.key">
        <div v-if="i" class="op">+</div>
        <div>
          <div class="l">{{ w.label }}</div>
          <div class="v">{{ w.pct }}%</div>
          <div class="n">{{ w.note || ' ' }}</div>
        </div>
      </template>
      <div class="op">=</div>
      <div class="lead">
        <div class="l">Tổng điểm</div>
        <div class="v">{{ summary.example ? `${summary.example.total}%` : '100%' }}</div>
        <div class="n">{{ summary.example ? summary.example.text : ' ' }}</div>
      </div>
    </div>

    <div v-if="!summary.empty" class="kpis">
      <div class="kpi">
        <div class="l">Đạt</div>
        <div class="v">{{ summary.passed }}</div>
        <div class="n">Base Wework từ 75 và tổng điểm đạt mốc</div>
      </div>
      <div class="kpi">
        <div class="l">Chưa chấm đủ</div>
        <div class="v">{{ summary.incomplete }}</div>
        <div class="n">Chưa tính được lương KPI</div>
      </div>
      <div class="kpi">
        <div class="l">Chưa đạt</div>
        <div class="v">{{ summary.failed }}</div>
        <div class="n">{{ summary.failedNote }}</div>
      </div>
      <div class="kpi">
        <div class="l">Lương KPI tháng {{ monthNo }}</div>
        <div class="v est-u">{{ vnd(summary.salaryTotal) }}<span class="unit">₫</span></div>
        <div class="n">{{ summary.salaryNote }}</div>
      </div>
    </div>

    <div class="tabs">
      <RouterLink class="tab" :to="{ path: '/admin/kpi', query }" exact-active-class="on">
        Nhập điểm <small v-if="!summary.empty">{{ summary.tabs.scores }}</small>
      </RouterLink>
      <RouterLink class="tab" :to="{ path: '/admin/kpi/lich-su', query }" exact-active-class="on">
        Lịch sử sửa điểm <small v-if="!summary.empty && summary.tabs.history != null">{{ summary.tabs.history }}</small>
      </RouterLink>
      <span class="tab" aria-disabled="true">OKR <small>Sắp có</small></span>
    </div>
  </template>

  <RouterView />
</template>

<style scoped>
.wts {
  display: grid;
  grid-template-columns: 1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr 20px 1.6fr;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 18px 24px;
  margin-bottom: var(--gap);
}
.wts .op {
  color: #9e9e9e;
  font-size: 20px;
  text-align: center;
}
.wts .l {
  color: var(--muted);
  font-size: 13px;
}
.wts .v {
  font-size: 22px;
  line-height: 28px;
  font-weight: 600;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.wts .n {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.wts .lead .v {
  font-size: 22px;
}
</style>
