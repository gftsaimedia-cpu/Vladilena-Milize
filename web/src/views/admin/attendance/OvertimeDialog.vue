<script setup lang="ts">
// Hộp thoại Giờ OT: OT nhân viên khai đối chiếu với lượt Check-in/out thực tế; duyệt hoặc từ chối có lý do.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { decideOvertime, getOvertimeRequests } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { initials } from '@/utils/format';

const emit = defineEmits(['close']);
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
const rows = computed(() => data.value?.rows || []);
</script>

<template>
  <AppModal
    title="Duyệt giờ OT thực tế"
    sub="OT khai được đối chiếu với lượt Check-in/out · chỉ trả OT khi có mặt đúng khoảng đã khai · từ chối phải ghi lý do"
    :width="820"
    :top="64"
    @close="emit('close')"
  >
    <div class="tools" style="padding: 12px 0 14px; border-bottom: 1px solid var(--rule)">
      <button
        v-for="c in chips"
        :key="c.key"
        type="button"
        class="chip"
        :class="{ on: c.key === status }"
        @click="status = c.key"
      >
        {{ c.label }} <small v-if="c.count != null">{{ c.count }}</small>
      </button>
    </div>

    <table v-if="rows.length" class="tbl">
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th>Ngày</th>
          <th>Ca</th>
          <th>OT đã khai</th>
          <th>Có mặt</th>
          <th>Trạng thái</th>
          <th v-if="status === 'pending'">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td>{{ r.cols[0] }}</td>
          <td>{{ r.cols[1] }}</td>
          <td>{{ r.cols[2] }}</td>
          <td>{{ r.cols[3] }}</td>
          <td>
            <span class="pill" :class="r.pill.cls">{{ r.pill.label }}</span>
          </td>
          <td v-if="status === 'pending'">
            <div v-if="r.canDecide" class="acts" style="display: flex; gap: 8px">
              <button type="button" class="btn sm pri" @click="onApprove(r)">Đồng ý</button>
              <button type="button" class="btn sm" @click="onReject(r)">Từ chối</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty">
      <div class="ico"><Icon name="clock" :size="20" /></div>
      <b>Không có lượt OT nào chờ đối chiếu</b>
      OT nhân viên khai sẽ hiện ở đây sau khi họ Check-out.
    </div>

    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
    </template>
  </AppModal>
</template>

<style scoped>
.empty {
  padding: 36px 24px 40px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  line-height: 20px;
}
.empty b {
  display: block;
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.empty .ico {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f1f1f1;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--muted);
}
.tbl td {
  height: 52px;
}
</style>
