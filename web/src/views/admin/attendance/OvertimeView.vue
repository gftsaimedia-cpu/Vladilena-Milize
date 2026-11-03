<script setup lang="ts">
// Tab Giờ OT: OT nhân viên khai đối chiếu với lượt Check-in/out; chỉ trả OT khi có mặt đúng khoảng đã khai.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { decideOvertime, getOvertimeRequests } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import RequestTable from './RequestTable.vue';

const period = usePeriodStore();
const month = computed(() => period.month);
const status = ref('pending');
const { data, reload } = useLoad(
  () => getOvertimeRequests(month.value, { status: status.value }),
  () => month.value + status.value
);

async function onApprove(row: any) {
  try {
    await decideOvertime({
      sessionId: row.sessionId,
      version: row.version,
      action: 'approve'
    });
    toast.ok(`Đã đồng ý OT cho ${row.name || row.sub}`);
    reload();
  } catch (e: any) {
    toast.error(e.message);
  }
}

async function onReject(row: any) {
  const reason = window.prompt(`Lý do từ chối OT của ${row.name || row.sub}:`);
  if (reason === null) return;
  if (!reason.trim()) {
    toast.error('Cần ghi lý do từ chối');
    return;
  }
  try {
    await decideOvertime({
      sessionId: row.sessionId,
      version: row.version,
      action: 'reject',
      reason: reason.trim()
    });
    toast.ok(`Đã từ chối OT của ${row.name || row.sub}`);
    reload();
  } catch (e: any) {
    toast.error(e.message);
  }
}

const chips = computed(() => [
  { key: 'pending', label: 'Chờ xử lý', count: data.value?.counts?.pending ?? 0 },
  { key: 'approved', label: 'Đã đồng ý' },
  { key: 'rejected', label: 'Từ chối' }
]);
const EMPTY = {
  icon: 'clock',
  title: 'Không có lượt OT nào chờ đối chiếu',
  lines: ['OT nhân viên khai sẽ hiện ở đây sau khi họ Check-out.']
};
</script>

<template>
  <RequestTable
    title="Giờ OT thực tế"
    cap="OT khai được đối chiếu với lượt Check-in/out · chỉ trả OT khi có mặt đúng khoảng đã khai · từ chối phải ghi lý do"
    :chips="chips"
    :active="status"
    :columns="['Nhân sự', 'Ngày', 'Ca', 'OT đã khai', 'Có mặt', 'Trạng thái']"
    :rows="data?.rows || []"
    :empty="EMPTY"
    :show-actions="status === 'pending'"
    @select="status = $event"
    @approve="onApprove"
    @reject="onReject"
  />
</template>
