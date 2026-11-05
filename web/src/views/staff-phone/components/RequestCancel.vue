<script setup lang="ts">
// Huỷ đơn trong chi tiết yêu cầu (J5 và ngăn kéo yêu cầu K; spec staff-requests 4.6, brief FE mục 8, board J19).
// Chỉ đơn đang chờ duyệt có nút "Huỷ đơn". Bấm thì hỏi lại ngay tại chỗ "Huỷ đơn này?" với "Không" và "Huỷ đơn" (spec: xác nhận
// tại chỗ, không mở hộp mới). Huỷ xong: thông báo nổi "Đã huỷ đơn" rồi phát `changed` kèm id đơn, vỏ đọc lại đơn (thành
// "Đã huỷ", khối này mất) và tải lại danh sách. Server từ chối (vd. Admin vừa duyệt): câu lỗi ở đây và vẫn phát `changed` để vỏ
// đọc lại đơn (spec 6).
//   <RequestCancel :request="detail" @changed="id => …" />
import { computed, nextTick, ref, useId, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import type { RequestDetail } from '@/mock/staff-phone';
import { cancelRequest } from '@/services/staff-requests';
import { datesText } from '@/utils/format';

const props = defineProps<{ request: RequestDetail }>();
const emit = defineEmits<{ changed: [id: string] }>();

const id = useId();
const days = computed(() => datesText(props.request.dates));
const box = ref<HTMLElement | null>(null);
const askButton = ref<HTMLButtonElement | null>(null);
const noButton = ref<HTMLButtonElement | null>(null);
const asking = ref(false);
/** Đang huỷ, hoặc đã huỷ xong và chờ vỏ đọc lại đơn: hai nút không làm gì nữa. */
const busy = ref(false);
const error = ref('');
let dialog: HTMLElement | null = null;

// Đổi sang đơn khác hoặc đơn vừa đổi trạng thái (đọc lại xong): về trạng thái đầu. Khối nút vừa mất mà focus đang ở đó thì
// đưa focus về hộp chứa, không để rơi xuống <body>.
watch(
  () => [props.request.id, props.request.status],
  async ([nextId], [prevId]) => {
    asking.value = false;
    busy.value = false;
    if (nextId !== prevId) error.value = '';
    await nextTick();
    const a = document.activeElement;
    if (!a || a === document.body) (askButton.value ?? dialog)?.focus();
  }
);

async function ask() {
  error.value = '';
  asking.value = true;
  await nextTick();
  noButton.value?.focus();
}
async function keep() {
  if (busy.value) return;
  asking.value = false;
  await nextTick();
  askButton.value?.focus();
}
async function confirm() {
  if (busy.value) return;
  busy.value = true;
  dialog = box.value?.closest<HTMLElement>('[role="dialog"]') ?? null;
  const requestId = props.request.id;
  try {
    await cancelRequest(requestId);
    toast.ok('Đã huỷ đơn');
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Chưa huỷ được đơn. Bạn thử lại sau ít phút.';
    asking.value = false;
    busy.value = false;
    await nextTick();
    askButton.value?.focus();
  }
  emit('changed', requestId);
}
</script>

<template>
  <div v-if="request.status === 'pend' || error" ref="box" class="rc">
    <template v-if="request.status === 'pend'">
      <div v-if="asking" class="rc-confirm" role="group" :aria-labelledby="`${id}-q`" :aria-describedby="days ? `${id}-d` : undefined">
        <p :id="`${id}-q`" class="rc-q">Huỷ đơn này?</p>
        <p v-if="days" :id="`${id}-d`" class="mut">Ngày {{ days }} được trả lại, bạn nộp đơn khác vào các ngày này được ngay.</p>
        <div class="rc-two">
          <button ref="noButton" type="button" class="b2" :aria-disabled="busy || undefined" @click="keep">Không</button>
          <button type="button" class="rc-yes" :aria-disabled="busy || undefined" :aria-busy="busy || undefined" @click="confirm">
            Huỷ đơn
          </button>
        </div>
      </div>
      <button v-else ref="askButton" type="button" class="b2 rc-open" @click="ask">Huỷ đơn</button>
    </template>
    <p v-if="error" class="rc-err" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.rc {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Nút "Huỷ đơn": nút phụ (.b2) chữ đỏ như board J19. Hai lớp để thắng màu chữ của .b2 trong phone.css. */
.rc .rc-open {
  color: var(--status-rejected);
}
/* Hỏi lại tại chỗ: hộp nền --page bo 12px (như hộp giải trình của J3); hai nút cao 48px bo 8px, không bóng. */
.rc-confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: var(--page);
}
.rc-q {
  margin: 0;
  font-weight: 600;
}
.rc-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.rc-yes {
  height: 48px;
  border: 0;
  border-radius: 8px;
  background: var(--status-rejected);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.rc [aria-disabled='true'] {
  cursor: default;
  opacity: 0.6;
}
.rc-err {
  margin: 0;
  color: var(--err-ink);
}
</style>
