<script setup lang="ts">
// Hộp chấm công thay hàng loạt: chọn người, khoảng ngày và một ca; mỗi ngày trong khoảng của mỗi người đi làm theo ca đó.
// Kết quả từng người (đã lưu, ngày bỏ qua, cảnh báo) hiện ngay trong hộp; lỗi của máy chủ hiện nguyên văn và không ai được lưu.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { bulkPunch, getBulkPunchOptions } from '@/services/admin-attendance';
import { ApiError } from '@/services/http';
import { dmy } from '@/utils/format';
import FldInput from '@/views/admin/staff/fields/FldInput.vue';
import FldSelect from '@/views/admin/staff/fields/FldSelect.vue';

const props = defineProps({ month: { type: String, required: true } }); // 'YYYY-MM'
const emit = defineEmits(['close', 'saved']);

const { data } = useLoad(
  () => getBulkPunchOptions(),
  () => 'bulk-punch'
);
const people = computed(() => data.value?.people || []);
const shifts = computed(() => data.value?.shifts || []);

const picked = ref([]);
const from = ref('');
const to = ref('');
const preset = ref('');
const shift = computed(() => preset.value || shifts.value[0]?.value || '');
const toggle = (username?) => {
  picked.value = picked.value.includes(username)
    ? picked.value.filter(u => u !== username)
    : [...picked.value, username];
};

// Các ngày từ `from` đến `to` (cùng tháng đang xem)
const dates = computed(() => {
  const a = from.value;
  const b = to.value || from.value;
  if (!a || a.slice(0, 7) !== props.month || b.slice(0, 7) !== props.month || b < a) return [];
  const out: any[] = [];
  for (let d = Number(a.slice(8)); d <= Number(b.slice(8)); d++)
    out.push(`${props.month}-${String(d).padStart(2, '0')}`);
  return out;
});
const canSend = computed(() => picked.value.length && dates.value.length && shift.value);

const sending = ref(false);
const error = ref('');
const result = ref(null);
const nameOf = (username?) => people.value.find(p => p.value === username)?.label.split(' · ')[0] || username;
async function send() {
  if (!canSend.value || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const res = await bulkPunch({
      month: props.month,
      usernames: picked.value,
      dates: dates.value,
      preset: shift.value
    });
    result.value = res;
    emit('saved');
  } catch (e) {
    // Câu lỗi của máy chủ (kể cả bản công đã bị sửa nơi khác) hiện nguyên văn
    if (!(e instanceof ApiError)) throw e;
    error.value = e.message;
    toast.error(e.message);
  } finally {
    sending.value = false;
  }
}
const warningsOf = (username?) =>
  (result.value?.warnings || []).filter(w => w && w.details && w.details.username === username).map(w => w.message);
</script>

<template>
  <AppModal
    title="Chấm công thay hàng loạt"
    :sub="`Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`"
    :width="640"
    :top="56"
    :dismissable="!sending"
    @close="emit('close')"
  >
    <template v-if="!result">
      <div class="hd2 first">Người cần chấm công</div>
      <div class="people">
        <label v-for="p in people" :key="p.value" class="pk">
          <input type="checkbox" :checked="picked.includes(p.value)" @change="toggle(p.value)" />
          <span>{{ p.label }}</span>
        </label>
        <p v-if="data && !people.length" class="none">Chưa có nhân sự nào thuộc bảng lương</p>
      </div>
      <div class="g2">
        <FldInput v-model="from" label="Từ ngày" kind="date" />
        <FldInput v-model="to" label="Đến ngày" small="để trống là một ngày" kind="date" />
      </div>
      <FldSelect v-model="preset" label="Ca" :options="shifts" />
      <p v-if="error" class="err">{{ error }}</p>
    </template>
    <template v-else>
      <div v-for="r in result.results" :key="r.username" class="res">
        <div class="h">
          <b>{{ nameOf(r.username) }}</b>
          <span class="pill p-done">Đã lưu</span>
        </div>
        <div v-if="r.autoApproved" class="s">{{ r.autoApproved }} yêu cầu được duyệt ngay</div>
        <div v-if="r.skipped && r.skipped.length" class="s">
          Bỏ qua {{ r.skipped.map(k => dmy(k.date)).join(', ') }} (đang khai nghỉ)
        </div>
        <div v-for="w in warningsOf(r.username)" :key="w" class="s warn">{{ w }}</div>
      </div>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">{{ result ? 'Đóng' : 'Huỷ' }}</button>
      <button v-if="!result" type="button" class="btn pri" :disabled="!canSend || sending" @click="send">
        <Icon name="check" />Chấm công
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.hd2 {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.hd2.first {
  margin-top: 0;
}
.people {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px 12px;
  margin-bottom: 14px;
}
.pk {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  font-size: 14px;
  cursor: pointer;
}
.res {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
}
.res + .res {
  margin-top: 10px;
}
.res .h {
  display: flex;
  align-items: center;
  gap: 10px;
}
.res .h .pill {
  margin-left: auto;
}
.res .s {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.res .s.warn {
  color: var(--err-ink);
}
.err {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--err-ink);
}
.none {
  margin: 6px 0;
  color: var(--muted);
  font-size: 13px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
