<script setup lang="ts">
// Khung chung của Đánh giá KPI: tiêu đề, công thức tổng điểm (5 thành phần × tỉ lệ), 4 số tổng, thanh tab.
// Nội dung tab (nhập điểm / lịch sử sửa điểm) ở <RouterView>; số liệu đầu trang chia sẻ cho tab qua provide('kpiSummary').
import { computed, provide } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getKpiSummary } from '@/services/admin-kpi';
import { usePeriodStore } from '@/stores/period';
import { vnd } from '@/utils/format';
import { LINKS } from '@/views/admin/attendance/links';

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
    <div class="wts-inline" aria-label="Điểm tổng bằng 5 thành phần nhân tỉ lệ">
      <span class="lbl">Tỉ lệ điểm:</span>
      <template v-for="(w, i) in summary.weights" :key="w.key">
        <span v-if="i" class="op">+</span>
        <span class="wi">
          <b>{{ w.label }}</b> <span class="v">{{ w.pct }}%</span>
        </span>
      </template>
      <span class="op">=</span>
      <span class="wi lead">
        <b>Tổng điểm</b> <span class="v">{{ summary.example ? `${summary.example.total}%` : '100%' }}</span>
      </span>
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
    </div>
  </template>

  <RouterView />
</template>

<style scoped>
.wts-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 10px 16px;
  margin-bottom: var(--gap);
  font-size: 13px;
}
.wts-inline .lbl {
  color: var(--muted);
  font-weight: 500;
}
.wts-inline .op {
  color: #9e9e9e;
  font-weight: 600;
}
.wts-inline .wi {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.wts-inline .wi b {
  font-weight: 500;
  color: var(--text);
}
.wts-inline .wi .v {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--gold-dark, #b8860b);
}
.wts-inline .wi.lead .v {
  color: var(--text);
}
</style>
