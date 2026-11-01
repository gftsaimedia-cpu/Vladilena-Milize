<script setup lang="ts">
// Nhóm Giải trình của Yêu cầu: giải trình của tháng đang xem, Admin đồng ý hoặc từ chối.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { decideExplanation, listExplanations } from '@/services/admin-explanations';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import RequestTable from './RequestTable.vue';

const emit = defineEmits(['changed']);
const period = usePeriodStore();
const canDecide = computed(() => useSessionStore().caps.includes('attendance.correct'));
const { data, loading, error, reload } = useLoad(
  () => listExplanations({ month: period.month }),
  () => period.month
);
const items = computed(() => data.value?.items || []);

const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Nội dung', 'Kết quả'];
const WIDTHS = [260, 170, '', 170, 220];

// Đang gửi: mỗi giải trình một lần gửi tại một thời điểm
const busy = ref('');
async function decide(r?, action?) {
  if (busy.value) return;
  busy.value = r.id;
  try {
    await decideExplanation({ id: r.id, action, rev: r.rev });
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
    reload();
    emit('changed');
  }
}
</script>

<template>
  <section class="card">
    <div class="grp-h">
      <h2>Giải trình</h2>
      <span class="cap">{{ items.length }} giải trình · {{ data?.waiting || 0 }} chờ xử lý</span>
    </div>
    <div v-if="error" class="later"><Icon name="alert" />{{ error.message }}</div>
    <div v-else-if="!items.length" class="later">{{ loading ? 'Đang tải' : 'Không có giải trình nào.' }}</div>
    <RequestTable v-else :items="items" :heads="HEADS" :widths="WIDTHS">
      <template #extra="{ r }">
        <span class="pill" :class="r.pillClass">{{ r.statusLabel }}</span>
      </template>
      <template #act="{ r }">
        <template v-if="canDecide">
          <button v-if="r.canReject" type="button" class="tact" :disabled="!!busy" @click="decide(r, 'reject')">
            Từ chối
          </button>
          <button
            v-if="r.canApprove"
            type="button"
            class="btn sm pri"
            :disabled="!!busy"
            style="margin-left: 8px"
            @click="decide(r, 'approve')"
          >
            Duyệt
          </button>
        </template>
      </template>
    </RequestTable>
  </section>
</template>

<style scoped>
.grp-h {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 14px;
}
.grp-h h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.grp-h .cap {
  color: var(--muted);
  font-size: 13px;
}
.later {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  color: var(--muted);
}
button:disabled {
  opacity: 0.45;
}
</style>
