<script setup lang="ts">
// Phiếu lương một người (board H): ngăn kéo nổi gồm đầu phiếu, định danh, chấm công tháng và bảng Tổng hợp lương.
// Chấm điểm KPI ngay trong phiếu: điểm đang gõ nằm ở `draft`, `view` là phiếu tính lại theo draft (hiện ngay khi gõ).
// Việc lưu thuộc về màn Bảng lương (prop `save`: lưu, thay phiếu đang mở, tải lại bảng) vì ngăn kéo có thể đã tháo khỏi
// trang khi lưu xong. Rời ô thì lưu; đóng, sang phiếu khác hay phiếu đổi từ ngoài thì lưu hết điểm chưa lưu (flush).
// Duyệt / từ chối thêm ở đợt sau.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import type { Payslip } from '@/mock/payroll';
import type { KpiPart, KpiScores } from '@/mock/payroll-calc';
import { previewPayslip } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';
import StatusPill from '../parts/StatusPill.vue';
import SlipAttendance from './SlipAttendance.vue';
import SlipHistory from './SlipHistory.vue';
import SlipKpi from './SlipKpi.vue';
import SlipSummary from './SlipSummary.vue';

const props = defineProps<{
  slip: Payslip;
  month: string;
  hasPrev: boolean;
  hasNext: boolean;
  save: (id: string, part: KpiPart, value: number | null) => Promise<void>;
}>();
const emit = defineEmits<{ close: []; prev: []; next: [] }>();

const draft = ref<KpiScores>({ ...props.slip.kpi.scores });
const PARTS = Object.keys(draft.value) as KpiPart[];
// `owner`: phiếu mà draft đang giữ điểm và điểm đã lưu của nó (không phản ứng; chỉ để biết cột nào chưa lưu).
let owner = { id: props.slip.id, saved: { ...props.slip.kpi.scores } };
const view = computed(() => previewPayslip(props.slip, draft.value));

const update = (part: KpiPart, value: number | null) => (draft.value = { ...draft.value, [part]: value });
const save = (part: KpiPart) => {
  owner.saved[part] = draft.value[part];
  return props.save(owner.id, part, draft.value[part]);
};
// Lưu mọi cột có draft khác điểm đã lưu. Gọi lặp là vô hại: lần sau không còn cột nào khác.
function flush() {
  for (const part of PARTS) if (draft.value[part] !== owner.saved[part]) save(part);
}
watch(
  () => props.slip,
  slip => {
    if (slip.id === owner.id) {
      owner.saved = { ...slip.kpi.scores };
      return;
    }
    // Phiếu đổi ngoài nút Đóng và hai mũi tên (Back, sửa địa chỉ): lưu điểm chưa lưu của phiếu cũ trước khi đặt lại draft.
    flush();
    owner = { id: slip.id, saved: { ...slip.kpi.scores } };
    draft.value = { ...slip.kpi.scores };
  }
);
onBeforeUnmount(flush);
const close = () => {
  flush();
  emit('close');
};
const go = (to: 'prev' | 'next') => {
  flush();
  emit(to);
};

// AppDrawer đặt tiêu điểm vào ô bấm được đầu tiên, ở đây là mũi tên Phiếu trước, mà mũi tên đó có thể bị tắt ở đầu danh sách.
// Như các ngăn kéo khác, tiêu điểm đầu vào nút Đóng; Tab và Shift+Tab vẫn tới hai mũi tên. Phần tử này mount sau AppDrawer.
const head = ref<HTMLElement | null>(null);
const prevBtn = ref<HTMLButtonElement | null>(null);
const nextBtn = ref<HTMLButtonElement | null>(null);
const closeBtn = () => head.value?.closest('.drw')?.querySelector<HTMLElement>('.drw-h .x');
onMounted(() => closeBtn()?.focus());
// Mũi tên đang giữ tiêu điểm bị tắt ở đầu hay cuối danh sách: tiêu điểm sang mũi tên kia, cả hai tắt thì sang Đóng.
// Đọc activeElement trước khi DOM đổi (watch chạy trước lần vẽ lại), rồi đặt tiêu điểm sau nextTick.
watch([() => props.hasPrev, () => props.hasNext], async ([prev, next]) => {
  const was = document.activeElement;
  await nextTick();
  if (was === prevBtn.value && !prev) (next ? nextBtn.value : closeBtn())?.focus();
  else if (was === nextBtn.value && !next) (prev ? prevBtn.value : closeBtn())?.focus();
});
</script>

<template>
  <AppDrawer :title="`Phiếu lương của ${slip.name}`" floating @close="close">
    <template #head>
      <div ref="head" class="pd-head">
        <h2>Phiếu lương tháng {{ monthShort(month) }}</h2>
        <button ref="prevBtn" type="button" class="pd-ib" aria-label="Phiếu trước" :disabled="!hasPrev" @click="go('prev')">
          <Icon name="chevl" />
        </button>
        <button ref="nextBtn" type="button" class="pd-ib" aria-label="Phiếu sau" :disabled="!hasNext" @click="go('next')">
          <Icon name="chevr" />
        </button>
      </div>
    </template>

    <div class="pd-body">
      <div class="pd-id">
        <span class="pd-av" aria-hidden="true">{{ slip.initials }}</span>
        <div class="pd-who">
          <b>{{ slip.name }}</b>
          <span>{{ slip.dept }} · {{ slip.title }} · {{ slip.id }}</span>
        </div>
        <StatusPill :status="slip.status" />
      </div>
      <dl class="pd-info">
        <div>
          <dt>Loại · bậc</dt>
          <dd>{{ slip.kind }} · Bậc {{ slip.level }}</dd>
        </div>
        <div>
          <dt>Tình trạng</dt>
          <dd>{{ slip.contract }}</dd>
        </div>
        <div>
          <dt>Trả lương</dt>
          <dd>{{ slip.payday }}</dd>
        </div>
      </dl>
      <p class="pd-note">{{ slip.note }}</p>
    </div>

    <SlipAttendance :slip="slip" :month="month" />
    <SlipSummary :slip="view" :month="month">
      <template #kpi><SlipKpi :scores="view.kpi.scores" :name="slip.name" @update="update" @save="save" /></template>
      <template #history><SlipHistory :key="slip.id" :history="view.kpi.history" /></template>
    </SlipSummary>
  </AppDrawer>
</template>

<style scoped>
.pd-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pd-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.pd-ib {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.pd-ib:hover:not(:disabled) {
  background: var(--ground);
}
.pd-ib:disabled {
  opacity: 0.35;
  cursor: default;
}
.pd-body {
  padding: 8px 24px 0;
}
.pd-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pd-av {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gold-light);
  font-size: 16px;
  font-weight: 600;
}
.pd-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pd-who b {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.pd-who span {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 16px 0 0;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.pd-info > div {
  padding: 10px 14px;
  min-width: 0;
}
.pd-info > div + div {
  border-left: 1px solid var(--border);
}
.pd-info dt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info dd {
  margin: 2px 0 0;
  font-weight: 500;
}
.pd-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
</style>
