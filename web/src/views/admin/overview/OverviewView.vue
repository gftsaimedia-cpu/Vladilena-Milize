<script setup lang="ts">
// Tổng quan (tong-quan) trên dữ liệu giả: chỉ số chính, chấm công, kỳ lương, việc cần duyệt, bảng lương.
// Duyệt / từ chối: useShellStore().decide bỏ việc khỏi nguồn chung và tăng version, màn tự tải lại, rồi báo bằng toast.
import { useRoute } from 'vue-router';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { ALREADY_HANDLED, decisionText, getOverview } from '@/services/admin-main';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import { monthNo } from '@/views/admin/requests/helpers';
import ApprovalsCard from './parts/ApprovalsCard.vue';
import AttendanceCard from './parts/AttendanceCard.vue';
import KpiRow from './parts/KpiRow.vue';
import PayrollTable from './parts/PayrollTable.vue';
import PeriodCard from './parts/PeriodCard.vue';

const route = useRoute();
const linkTo = (path: string) => ({ path, query: route.query.thang ? { thang: route.query.thang } : {} });
const period = usePeriodStore();
const shell = useShellStore();
const { data } = useLoad(
  () => getOverview(period.month),
  () => `${period.month}|${shell.version}`
);

const deciding = new Set<string>();
async function decide(id: string, approve: boolean) {
  if (deciding.has(id)) return;
  deciding.add(id);
  try {
    const hit = await shell.decide(id, approve ? 'approve' : 'reject');
    if (hit) toast.ok(decisionText(approve ? 'approve' : 'reject', hit.name));
    else toast.error(ALREADY_HANDLED);
  } finally {
    deciding.delete(id);
  }
}
</script>

<template>
  <div v-if="data">
    <div class="title">
      <div>
        <h1>Tổng quan</h1>
        <p>
          Còn <b>{{ data.headline.blocking }} việc</b> phải xong trước khi chốt lương tháng {{ monthNo(data.month) }} ·
          hạn {{ data.headline.closeOn }}, còn {{ data.headline.daysLeft }} ngày
        </p>
      </div>
      <div class="acts">
        <RouterLink :to="linkTo('/admin/bang-luong')" class="btn pri"> <Icon name="cash" />Mở bảng lương </RouterLink>
      </div>
    </div>

    <KpiRow :kpis="data.kpis" />

    <div class="trio">
      <AttendanceCard :attendance="data.attendance" />
      <PeriodCard :period="data.period" />
      <ApprovalsCard :approvals="data.approvals" @approve="decide($event, true)" @reject="decide($event, false)" />
    </div>

    <PayrollTable :payroll="data.payroll" :slips="data.period.slips" />
  </div>
</template>

<style scoped>
.title {
  flex-wrap: wrap;
}
.title p {
  font-size: 14px;
}
.trio {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 24px;
  align-items: start;
  margin-bottom: 24px;
}
</style>
