<script setup lang="ts">
// Thẻ "Khoản cộng/trừ thêm" dưới Bảng lương tháng 10: khoản một lần cho một người trong tháng.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getExtras } from '@/services/admin-payroll';
import { useSessionStore } from '@/stores/session';
import { vnd } from '@/utils/format';
import EntryActionDialog from './EntryActionDialog.vue';

const props = defineProps({
  month: { type: String, required: true },
  version: { type: Number, default: 0 } // đổi số này để tải lại sau khi thêm khoản
});
defineEmits(['add']);

const bump = ref(0);
const { data } = useLoad(
  () => getExtras(props.month),
  () => `${props.month}|${props.version}|${bump.value}`
);
const caps = computed(() => useSessionStore().caps);
const canWrite = computed(() => caps.value.includes('salary.write'));
const canApprove = computed(() => caps.value.includes('payroll.approve'));
const canLegal = computed(() => caps.value.includes('config.legal'));
const action = ref(null); // { kind, item }
const done = () => {
  action.value = null;
  bump.value++;
};
const filter = ref('all');
const CHIPS = [
  ['all', 'Tất cả'],
  ['pending', 'Chờ phê duyệt'],
  ['approved', 'Đã phê duyệt'],
  ['rejected', 'Từ chối'],
  ['cancelled', 'Đã huỷ']
];
const STATUS = {
  pending: ['p-pend', 'Chờ phê duyệt'],
  approved: ['p-done', 'Đã phê duyệt'],
  rejected: ['p-err', 'Từ chối'],
  cancelled: ['p-draft', 'Đã huỷ']
};
const items = computed(() =>
  (data.value?.items || []).filter(i => filter.value === 'all' || i.status === filter.value)
);
const n = computed(() => Number(props.month.slice(5, 7)));
</script>

<template>
  <section class="card extras">
    <div class="card-h">
      <h2>Khoản cộng/trừ thêm</h2>
      <span class="cap">
        Khoản một lần cho một người trong tháng {{ n }} · khoản đã phê duyệt thành một dòng riêng trên phiếu
      </span>
      <span class="r" style="display: flex; gap: 8px">
        <button type="button" class="btn sm" @click="$emit('add')">Thêm cho nhiều người</button>
        <button type="button" class="btn sm pri" @click="$emit('add')"><Icon name="plus" />Thêm khoản</button>
      </span>
    </div>
    <div class="tools">
      <button
        v-for="[key, label] in CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: filter === key }"
        @click="filter = key"
      >
        {{ label }} <small>{{ data?.counts[key] ?? 0 }}</small>
      </button>
    </div>
    <table v-if="items.length" class="tbl">
      <thead>
        <tr>
          <th>Người nhận</th>
          <th>Tên khoản</th>
          <th class="n">Số tiền</th>
          <th>Trạng thái</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in items" :key="it.id">
          <td>{{ it.name }}</td>
          <td>{{ it.label }}</td>
          <td class="n">{{ it.kind === 'minus' ? '−' : '+' }}{{ vnd(it.amount) }}</td>
          <td>
            <span class="pill" :class="STATUS[it.status][0]">{{ STATUS[it.status][1] }}</span>
          </td>
          <td class="acts">
            <template v-if="it.status === 'pending'">
              <button v-if="canWrite" type="button" class="btn sm" @click="action = { kind: 'edit', item: it }">
                Sửa
              </button>
              <button v-if="canApprove" type="button" class="btn sm" @click="action = { kind: 'approve', item: it }">
                Duyệt
              </button>
              <button v-if="canApprove" type="button" class="btn sm" @click="action = { kind: 'reject', item: it }">
                Từ chối
              </button>
            </template>
            <button
              v-if="canLegal && it.unconfirmedFlags && (it.status === 'pending' || it.status === 'approved')"
              type="button"
              class="btn sm"
              @click="action = { kind: 'confirm', item: it }"
            >
              Xác nhận cờ
            </button>
            <button
              v-if="canWrite && (it.status === 'pending' || it.status === 'approved')"
              type="button"
              class="btn sm"
              @click="action = { kind: 'void', item: it }"
            >
              Huỷ
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">
      <b>Chưa có khoản nào trong tháng {{ n }}</b>
      Bấm Thêm khoản để lập khoản đầu tiên của tháng.
    </div>
    <EntryActionDialog v-if="action" :kind="action.kind" :item="action.item" @close="action = null" @done="done" />
  </section>
</template>

<style scoped>
.extras {
  margin-top: 24px;
}
.acts {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.empty {
  padding: 28px 24px 32px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.empty b {
  display: block;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
</style>
