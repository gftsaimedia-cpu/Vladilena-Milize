<script setup lang="ts">
// Tổng quan (tong-quan) trên dữ liệu giả: chỉ số chính, chấm công, kỳ lương, việc cần duyệt, bảng lương.
// Duyệt / từ chối: useShellStore().decide bỏ việc khỏi nguồn chung và tăng version, màn tự tải lại, rồi báo bằng toast.
import { useRoute } from 'vue-router';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { ALREADY_HANDLED, decisionText, getOverview } from '@/services/admin-main';
import { useRealtimeReload } from '@/composables/useRealtimeReload';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import { monthNo } from '@/utils/format';
import ApprovalsCard from './parts/ApprovalsCard.vue';
import AttendanceCard from './parts/AttendanceCard.vue';
import KpiRow from './parts/KpiRow.vue';
import PayrollTable from './parts/PayrollTable.vue';
import PeriodCard from './parts/PeriodCard.vue';

const route = useRoute();
const linkTo = (path: string) => ({ path, query: route.query.thang ? { thang: route.query.thang } : {} });
const period = usePeriodStore();
const shell = useShellStore();
const { data, error, reload } = useLoad(
  () => getOverview(period.month),
  () => `${period.month}|${shell.version}`
);
useRealtimeReload(reload);

const deciding = new Set<string>();
async function decide(id: string, approve: boolean) {
  if (deciding.has(id)) return;
  deciding.add(id);
  try {
    // Tên người nộp lấy từ danh sách đang hiện: lần đọc chuông chưa có thì kết quả của BE chỉ có mã đơn.
    const shown = data.value?.approvals.items.find(i => i.id === id)?.name;
    const hit = await shell.decide(id, approve ? 'approve' : 'reject');
    if (hit) toast.ok(decisionText(approve ? 'approve' : 'reject', shown || hit.name));
    else toast.error(ALREADY_HANDLED);
  } catch {
    /* máy chủ từ chối hoặc mạng rớt: resolveRequest đã hiện thông báo */
  } finally {
    deciding.delete(id);
  }
}
</script>

<template>
  <PageLoadError v-if="error" what="tổng quan" :error="error" @retry="reload" />
  <div v-else-if="data">
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
      <ApprovalsCard :approvals="data.approvals" @approve="decide($event, true)" />
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
/* Ba thẻ một hàng, ba cột bằng nhau; thẻ Việc cần duyệt cao theo hai thẻ kia (danh sách cuộn bên trong).
   Mốc 1280px của cửa sổ: thanh bên (248px) + lề + khe chiếm 304px, còn 976px cho ba cột, mỗi cột ≥ 309px (đủ 300px).
   Dưới mốc đó xếp một cột; ApprovalsCard dùng cùng mốc để giới hạn danh sách cao 420px. */
.trio {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}
@media (max-width: 1280px) {
  .trio {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
