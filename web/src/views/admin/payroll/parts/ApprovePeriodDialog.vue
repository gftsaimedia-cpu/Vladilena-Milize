<script setup lang="ts">
// Hộp "Phê duyệt kỳ lương tháng …" (dlg-t10-phe-duyet-ky-bi-chan, dlg-t10-phe-duyet-ky-con-1):
// còn phiếu chưa phê duyệt thì nút bị khoá; phiếu chưa tính được phải loại khỏi kỳ kèm lý do.
import { computed, onMounted, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { approvePeriod, getPeriodApprovalSummary } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';
import DlgField from './DlgField.vue';

const props = defineProps({
  month: { type: String, required: true },
  pending: { type: Number, default: 0 },
  failed: { type: Array as () => any[], default: () => [] }
});
const emit = defineEmits(['close', 'done']);

const summary = ref<{
  rev: number;
  draft: number;
  legacyPending: number;
  approved: number;
  errors: Array<{ username: string; name: string; shortProblem: string }>;
} | null>(null);

const reasons = reactive<Record<string, string>>({});
const error = ref('');
const busy = ref(false);

const pendingCount = computed(() => (summary.value ? summary.value.legacyPending : props.pending));
const failedList = computed(() => (summary.value ? summary.value.errors : props.failed));

onMounted(async () => {
  try {
    const s = await getPeriodApprovalSummary(props.month);
    summary.value = s;
  } catch {
    // Giữ nguyên fallback từ props nếu gọi máy chủ lỗi
  }
});

async function submit() {
  if (pendingCount.value > 0 || busy.value) return;
  const items = failedList.value;
  const excluded = items.map(p => ({ username: p.username, reason: (reasons[p.username] || '').trim() }));
  if (excluded.some(x => x.reason.length < 10 || x.reason.length > 300)) {
    error.value = 'Mỗi phiếu loại khỏi kỳ cần lý do từ 10 đến 300 ký tự.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await approvePeriod(props.month, {
      rev: summary.value?.rev,
      excludeErrors: excluded
    });
    emit('done');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="`Phê duyệt kỳ lương tháng ${monthShort(month)}`"
    sub="Những việc còn lại trước khi khoá số"
    :width="680"
    :top="90"
    :dismissable="false"
    @close="emit('close')"
  >
    <p>
      Phê duyệt kỳ là khoá số: sau khi phê duyệt, phiếu lương tháng {{ Number(month.slice(5, 7)) }} không sửa được và số
      chuyển từ bản nháp sang chính thức. Muốn đổi sau đó phải mở lại kỳ.
    </p>
    <div v-if="pendingCount > 0" class="chk">
      <span
        ><span class="pill p-pend" style="min-width: 34px; justify-content: center">{{ pendingCount }}</span></span
      >
      <span>Phiếu chưa phê duyệt</span>
      <span class="r">
        <button type="button" class="link" @click="emit('close')">Phê duyệt trên bảng lương</button>
      </span>
    </div>
    <div v-if="failedList.length" class="chk">
      <span
        ><span class="pill p-err" style="min-width: 34px; justify-content: center">{{ failedList.length }}</span></span
      >
      <span>Phiếu chưa tính được · loại khỏi kỳ kèm lý do, hoặc sửa hồ sơ rồi tính lại</span>
      <span class="r" />
    </div>
    <DlgField
      v-for="p in failedList"
      :key="p.username"
      v-model="reasons[p.username]"
      :label="`Lý do loại phiếu của ${p.name}`"
      :hint="`· ${p.shortProblem}`"
      area
      placeholder="Ghi lý do loại phiếu này khỏi kỳ"
      :maxlength="300"
    />
    <div style="height: 14px" />
    <div v-if="pendingCount > 0" class="note err">
      <Icon name="alert" />
      <div>Còn {{ pendingCount }} phiếu chưa phê duyệt nên chưa phê duyệt kỳ được.</div>
    </div>
    <div v-else-if="error" class="note err">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="pendingCount > 0 ? 'off' : 'pri'" :disabled="busy" @click="submit">
        <Icon name="lock" />Phê duyệt kỳ lương
      </button>
    </template>
  </AppModal>
</template>
