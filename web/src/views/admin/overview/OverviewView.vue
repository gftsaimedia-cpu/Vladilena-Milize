<script setup lang="ts">
// Tổng quan (tong-quan) trên dữ liệu giả: chỉ số chính, chấm công, kỳ lương, việc cần duyệt, bảng lương.
// Duyệt / từ chối: bỏ yêu cầu khỏi danh sách giả, tải lại màn và số đếm của khung, rồi báo bằng toast.
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { approveRequest, getOverview, rejectRequest } from '@/services/admin-main';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import { monthNo } from '@/views/admin/requests/helpers';
import ApprovalsCard from './parts/ApprovalsCard.vue';
import AttendanceCard from './parts/AttendanceCard.vue';
import KpiRow from './parts/KpiRow.vue';
import PayrollTable from './parts/PayrollTable.vue';
import PeriodCard from './parts/PeriodCard.vue';

const period = usePeriodStore();
const shell = useShellStore();
const { data, reload } = useLoad(
  () => getOverview(period.month),
  () => period.month
);

const deciding = new Set<string>();
async function decide(id: string, approve: boolean) {
  if (deciding.has(id)) return;
  deciding.add(id);
  try {
    const hit = await (approve ? approveRequest(id) : rejectRequest(id));
    await Promise.all([reload(), shell.load()]);
    if (hit) toast.ok(`${approve ? 'Đã duyệt' : 'Đã từ chối'} yêu cầu của ${hit.name}.`);
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
        <RouterLink to="/admin/bang-luong" class="btn pri"> <Icon name="cash" />Mở bảng lương </RouterLink>
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
