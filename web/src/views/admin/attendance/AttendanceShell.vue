<script setup lang="ts">
// Khung chung của 3 tab Chấm công: tiêu đề, nút Chốt công ở Bảng lương, thanh tab; nội dung tab ở <RouterView>.
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAttendanceSummary } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';

const route = useRoute();
const period = usePeriodStore();
const month = computed(() => period.month);
const { data: summary } = useLoad(
  () => getAttendanceSummary(month.value),
  () => month.value
);

const TABS = [
  ['', 'Bảng công'],
  ['hom-nay', 'Hôm nay'],
  ['gio-ot', 'Giờ OT']
];
const tabTo = (key?) => ({
  path: key ? `/admin/cham-cong/${key}` : '/admin/cham-cong',
  query: { thang: route.query.thang }
});
</script>

<template>
  <div class="title">
    <div>
      <h1>Chấm công</h1>
      <p v-if="summary && !summary.empty">
        <b>{{ summary.forgot }} ngày</b> quên Check-in/out phải xử lý · {{ summary.reconcile }} ngày nên đối soát ·
        {{ summary.late }} lượt đi trễ
      </p>
      <p v-else-if="summary">Chưa có dữ liệu chấm công của tháng này</p>
    </div>
    <div class="acts">
      <RouterLink
        v-if="summary && !summary.empty"
        class="btn"
        :to="{ path: '/admin/bang-luong', query: { thang: route.query.thang } }"
      >
        <Icon name="lock" />Chốt công ở Bảng lương
      </RouterLink>
    </div>
  </div>

  <div class="tabs">
    <RouterLink v-for="[key, label] in TABS" :key="key" :to="tabTo(key)" class="tab" exact-active-class="on">
      {{ label }}
      <small v-if="key === 'hom-nay' && summary && !summary.empty">{{ summary.inShift }} đang trong ca</small>
    </RouterLink>
  </div>

  <RouterView />
</template>
