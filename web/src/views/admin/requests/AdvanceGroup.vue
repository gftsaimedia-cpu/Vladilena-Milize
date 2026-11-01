<script setup lang="ts">
// Nhóm Tạm ứng của Yêu cầu: yêu cầu tạm ứng của tháng đang xem; Admin đồng ý, từ chối, huỷ duyệt từng người hoặc đồng ý tất cả.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { approveAllAdvances, decideAdvance, listAdvances } from '@/services/admin-advance';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import RequestTable from './RequestTable.vue';

const period = usePeriodStore();
const canDecide = computed(() => {
  const caps = useSessionStore().caps;
  return caps.includes('request.decide.*') || caps.includes('request.decide.advance');
});
const { data, loading, error, reload } = useLoad(
  () => listAdvances({ month: period.month }),
  () => period.month
);
const items = computed(() => data.value?.items || []);
const pending = computed(() => data.value?.pending || 0);

const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Số tiền', 'Kết quả'];
const WIDTHS = [260, 170, '', 170, 300];

// Đang gửi: một lần gửi tại một thời điểm cho cả nhóm
const busy = ref('');
async function run(key?, fn?) {
  if (busy.value) return;
  busy.value = key;
  try {
    await fn();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
    reload();
  }
}
const decide = (r?, action?) =>
  run(r.id, () => decideAdvance({ month: data.value.month, username: r.username, action, rev: r.rev }));
const approveAll = () =>
  run('all', async () => {
    const res = await approveAllAdvances({ month: data.value.month, rev: data.value.rev });
    if (res.skipped && res.skipped.length)
      toast.error(`Bỏ qua ${res.skipped.length} yêu cầu: ${res.skipped.map(s => s.username).join(', ')}`);
  });
</script>

<template>
  <section class="card">
    <div class="grp-h">
      <h2>Tạm ứng</h2>
      <span class="cap">{{ items.length }} yêu cầu · {{ pending }} chờ xử lý</span>
      <div v-if="canDecide" class="r">
        <button type="button" class="btn pri" :disabled="!!busy || !pending" @click="approveAll">
          <Icon name="check" />
          Duyệt tất cả
        </button>
      </div>
    </div>
    <div v-if="error" class="later"><Icon name="alert" />{{ error.message }}</div>
    <div v-else-if="!items.length" class="later">{{ loading ? 'Đang tải' : 'Không có yêu cầu tạm ứng nào.' }}</div>
    <RequestTable v-else :items="items" :heads="HEADS" :widths="WIDTHS">
      <template #extra="{ r }">
        <span class="pill" :class="r.pillClass">{{ r.statusLabel }}</span>
      </template>
      <template #act="{ r }">
        <template v-if="canDecide">
          <button v-if="r.canCancel" type="button" class="tact" :disabled="!!busy" @click="decide(r, 'cancel')">
            Huỷ duyệt
          </button>
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
.grp-h .r {
  margin-left: auto;
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
