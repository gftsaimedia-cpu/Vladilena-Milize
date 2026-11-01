<script setup lang="ts">
// Hộp "Bỏ qua phát hiện của AI" (dlg-t10-bo-qua-ai): mọi phát hiện chưa xử lý của kỳ, nhóm theo nhân sự.
// readonly (kỳ đã khoá): chỉ xem, không còn nút Bỏ qua.
import { computed } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getFindings } from '@/services/admin-payroll';
import FindingRow from './FindingRow.vue';

const props = defineProps({
  month: { type: String, required: true },
  run: { type: Number, default: 1 },
  readonly: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);

const { data } = useLoad(() => getFindings(props.month));
const groups = computed(() => data.value || []);
const half = computed(() => Math.ceil(groups.value.length / 2));
const columns = computed(() => [groups.value.slice(0, half.value), groups.value.slice(half.value)]);
const open = computed(() => groups.value.map(g => g.items.filter(i => !i.skipped).length));
const people = computed(() => (props.readonly ? groups.value.length : open.value.filter(n => n > 0).length));
const count = computed(() =>
  props.readonly ? groups.value.reduce((n, g) => n + g.items.length, 0) : open.value.reduce((n, c) => n + c, 0)
);
const sub = computed(() => {
  if (!data.value) return '';
  const tail = props.readonly ? '' : ' chưa xử lý';
  return `Bản nháp lần tính ${props.run} · ${people.value} nhân sự, ${count.value} phát hiện${tail}`;
});
const onSkipped = (id?) => {
  for (const g of groups.value) {
    const it = g.items.find(i => i.id === id);
    if (it) it.skipped = true;
  }
};
</script>

<template>
  <AppModal title="Bỏ qua phát hiện của AI" :sub="sub" :width="1040" :top="40" @close="emit('close')">
    <div class="note">
      <Icon name="info" />
      <div>
        Bỏ qua một phát hiện cần lý do 10–300 ký tự và được ghi vào nhật ký. AI chỉ gợi ý: bỏ qua không đổi số tiền nào.
      </div>
    </div>
    <div v-if="data && !groups.length" class="empty">Chưa có phát hiện nào của AI trong kỳ này.</div>
    <div v-else class="cols2">
      <div v-for="(col, ci) in columns" :key="ci">
        <div v-for="g in col" :key="g.username" class="pp">
          <div class="pn">{{ g.name }}</div>
          <FindingRow
            v-for="it in g.items"
            :key="it.id"
            :month="month"
            :finding="it"
            :readonly="readonly"
            @skipped="onSkipped"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
    </template>
  </AppModal>
</template>

<style scoped>
.cols2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 28px;
  margin-top: 8px;
}
.pp {
  border-top: 1px solid var(--rule);
  padding: 10px 0 6px;
}
.pp .pn {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
}
.pp :deep(.aif) {
  min-height: 36px;
  font-size: 13px;
}
.pp :deep(.aif .btn) {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.empty {
  padding: 24px 0;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
