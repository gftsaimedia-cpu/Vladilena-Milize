<script setup lang="ts">
// Thân luồng "Tạo yêu cầu" (board J8, J9, K3; spec staff-requests 4.2–4.5), dùng chung cho hộp trượt điện thoại và ngăn kéo K3.
// Tự vẽ đầu hộp: menu là "Tạo yêu cầu" + dòng phụ + ✕; form là ‹ (quay lại menu) + tên loại + ✕. Vỏ mở với `bare` và đặt tên
// dialog theo sự kiện `title`. Menu: 6 loại theo thứ tự board; loại không có trong kinds (quyền lợi) bị ẩn; loại khoá vẫn
// focus được bằng bàn phím (aria-disabled, bấm không làm gì), lý do của server là mô tả của dòng.
// Form: nhận ctx, ngay và kết quả xem trước gần nhất đã về (tự đặt hộp tóm tắt ở chỗ board vẽ), phát bản nháp. Bản nháp đủ thì
// xem trước (useNewRequest) rồi mới bật "Gửi yêu cầu"; server từ chối thì câu lỗi nằm dưới nút. Gửi xong: thông báo nổi
// "Đã gửi yêu cầu" rồi phát `sent` (vỏ tải lại danh sách và đóng luồng).
//   <BottomSheet :title="t" bare @close="…"><NewRequestBody @title="t = $event" @close="…" @sent="…" /></BottomSheet>
import { computed, nextTick, ref, useId, watch, type Component } from 'vue';
import { toast } from '@/components/shell/toast';
import type { PhoneIconName } from '@/mock/staff-phone';
import type { RequestKind } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import LeaveForm from './LeaveForm.vue';
import { useNewRequest } from './useNewRequest';

const emit = defineEmits<{ title: [title: string]; close: []; sent: [] }>();

// Form đã có, theo loại. Mỗi form tự khai props (ctx, ngay, preview: PreviewResult<loại đó>) và emit `draft`
// (RequestDraft[loại đó] | null), nên kiểu của bản nháp và tóm tắt nằm trong form, không ép kiểu ở đây.
// Loại chưa có form hiện khoá trong menu, URL của nó về menu.
const FORMS: { [K in RequestKind]?: Component } = { leave: LeaveForm };
const NO_FORM = 'Chưa có trong bản mockup';

const MENU: { kind: RequestKind; label: string; icon: PhoneIconName; hint: string }[] = [
  { kind: 'leave', label: 'Đơn nghỉ', icon: 'leave', hint: 'Nghỉ cả ngày' },
  { kind: 'leave-with-makeup', label: 'Nghỉ có làm bù', icon: 'redo', hint: 'Nghỉ 1 ngày thì bù đủ 8 giờ trong tháng' },
  { kind: 'overtime', label: 'Làm thêm giờ', icon: 'clockPlus', hint: 'Ngoài ca, cách ca ít nhất 1 giờ' },
  { kind: 'shift-change', label: 'Đổi ca', icon: 'swap', hint: 'Normal, Flex hoặc Night cho một khoảng ngày' },
  { kind: 'explanation', label: 'Giải trình', icon: 'chat', hint: 'Cho một ngày chấm công chưa hợp lệ' },
  { kind: 'advance', label: 'Tạm ứng', icon: 'coin', hint: 'Ứng trước một phần lương tháng' }
];
const LABEL = Object.fromEntries(MENU.map(m => [m.kind, m.label])) as Record<RequestKind, string>;

const flow = useNewRequest(k => !!FORMS[k]);
const { ctx, loadError, kind, ngay, shownPreview, canSend, sending, sendError } = flow;

const title = computed(() => (kind.value ? LABEL[kind.value] : 'Tạo yêu cầu'));
watch(title, t => emit('title', t), { immediate: true });

const uid = useId();
const menu = computed(() => {
  const c = ctx.value;
  if (!c) return [];
  return MENU.flatMap(m => {
    const k = c.kinds.find(x => x.kind === m.kind);
    if (!k) return [];
    const hasForm = !!FORMS[m.kind];
    const leaveLeft = m.kind === 'leave' && c.annualLeaveLeft !== null ? `Phép năm còn ${c.annualLeaveLeft} ngày` : '';
    const hint = !k.enabled ? (k.reason ?? m.hint) : !hasForm ? NO_FORM : leaveLeft || m.hint;
    return [{ ...m, enabled: k.enabled && hasForm, hint, id: `${uid}-${m.kind}` }];
  });
});
// Dòng khoá không mở gì, kể cả khi bấm Enter hay Space.
function open(row: { kind: RequestKind; enabled: boolean }) {
  if (row.enabled) flow.pick(row.kind);
}

const form = computed(() => (kind.value ? (FORMS[kind.value] ?? null) : null));

async function onSend() {
  if (await flow.send()) {
    toast.ok('Đã gửi yêu cầu');
    emit('sent');
  }
}

// Focus khi đổi bước: vào form thì ô đầu tiên, quay lại menu thì dòng của loại vừa rời.
const root = ref<HTMLElement | null>(null);
watch(kind, async (now, before) => {
  await nextTick();
  if (now) root.value?.querySelector<HTMLElement>('.nr-form select, .nr-form input, .nr-form textarea')?.focus();
  else if (before) root.value?.querySelector<HTMLElement>(`[data-kind="${before}"]`)?.focus();
});
</script>

<template>
  <div ref="root" class="nr">
    <div class="nr-head" :class="{ 'nr-head-form': kind }">
      <button v-if="kind" type="button" class="rb" aria-label="Quay lại chọn loại" @click="flow.toMenu()">
        <PhIcon name="left" :stroke="2" />
      </button>
      <div class="nr-ht">
        <h2>{{ title }}</h2>
        <div v-if="!kind" class="mut">Chọn loại để điền đơn</div>
      </div>
      <button type="button" class="rb" aria-label="Đóng" @click="emit('close')"><PhIcon name="x" :size="18" :stroke="2" /></button>
    </div>

    <p v-if="loadError" class="nr-err" role="alert">{{ loadError }}</p>
    <template v-else-if="ctx">
      <div v-if="!kind" class="nr-menu" role="group" aria-label="Loại yêu cầu">
        <button
          v-for="row in menu"
          :key="row.kind"
          type="button"
          class="nr-row"
          :data-kind="row.kind"
          :aria-disabled="row.enabled ? undefined : 'true'"
          :aria-labelledby="`${row.id}-t`"
          :aria-describedby="`${row.id}-d`"
          @click="open(row)"
        >
          <span class="ti"><PhIcon :name="row.icon" /></span>
          <span class="nr-rt">
            <b :id="`${row.id}-t`">{{ row.label }}</b>
            <span :id="`${row.id}-d`" class="mut sm">{{ row.hint }}</span>
          </span>
          <PhIcon :name="row.enabled ? 'right' : 'lock'" class="nr-chev" />
        </button>
      </div>
      <template v-else-if="form">
        <div class="nr-form">
          <component :is="form" :ctx="ctx" :ngay="ngay" :preview="shownPreview" @draft="flow.setDraft" />
        </div>
        <button type="button" class="nr-send" :disabled="!canSend" :aria-busy="sending || undefined" @click="onSend">
          Gửi yêu cầu
        </button>
        <p v-if="sendError" class="nr-err" role="alert">{{ sendError }}</p>
      </template>
    </template>
  </div>
</template>

<style>
/* Không scoped: các form (LeaveForm và các form sau) dùng chung lớp ô nhập nr-*. Mọi lớp có tiền tố nr- để không đụng lớp
   toàn cục (.sel, .note…). Ô nhập bo 8px, viền --control, không bóng, không dạng viên thuốc (spec 4.4). */
.nr {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}
.nr-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.nr-head.nr-head-form {
  align-items: center;
}
.nr-ht {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nr-menu {
  display: flex;
  flex-direction: column;
}
.nr-row {
  width: 100%;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.nr-row + .nr-row {
  border-top: 1px solid var(--border);
}
.nr-row[aria-disabled='true'] {
  cursor: default;
}
.nr-row[aria-disabled='true'] b,
.nr-row[aria-disabled='true'] .ti {
  color: var(--muted);
}
.nr-rt {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nr-rt b {
  font-weight: 600;
}
.nr-chev {
  flex: none;
  color: var(--muted);
}
.nr-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.nr-fl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.nr-fl > label {
  font-weight: 600;
}
.nr-fl.nr-range {
  gap: 12px; /* hai ô ngày và hộp tóm tắt (board J9) */
}
.nr-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.nr-box {
  position: relative;
}
.nr-box > svg {
  position: absolute;
  top: 14px;
  pointer-events: none;
  color: var(--muted);
}
.nr-in {
  width: 100%;
  height: 48px;
  box-sizing: border-box;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: 8px;
  box-shadow: none;
  background: var(--surface);
  font: inherit;
  color: var(--text);
}
.ph-sheet .nr-in {
  font-size: 16px; /* dưới 16px thì Safari điện thoại phóng to khi chạm vào ô */
}
.nr-in::placeholder {
  color: #757575;
}
select.nr-in {
  appearance: none;
  -webkit-appearance: none;
  text-overflow: ellipsis;
}
select.nr-in:disabled {
  background: var(--page);
  color: var(--muted);
  border-color: var(--border);
  opacity: 1;
}
.nr-sel select.nr-in {
  padding-right: 44px;
}
.nr-sel > svg {
  right: 14px;
}
.nr-dt select.nr-in {
  padding-left: 42px;
}
.nr-dt > svg {
  left: 12px;
}
textarea.nr-in {
  height: 96px;
  padding: 12px;
  resize: none;
}
.sd-drawer textarea.nr-in {
  height: 120px;
}
.nr-sum {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--page);
}
.nr-sum b {
  font-weight: 600;
}
.nr-send {
  flex: none;
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.nr-send:disabled {
  opacity: 0.4;
  cursor: default;
}
.sd-drawer .nr-send {
  margin-top: auto; /* K3: nút Gửi nằm đáy ngăn kéo */
}
.nr-err {
  margin: 0;
  color: var(--err-ink);
}
</style>
