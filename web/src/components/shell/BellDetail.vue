<script setup lang="ts">
// Thẻ chi tiết của chuông (bảng thiết kế BellInbox): thẻ riêng bên trái ngăn kéo, nhãn nhóm và nút Đóng chi tiết ở đầu.
// Một việc chờ (`item`) hoặc một tin hệ thống (`news`), đúng một trong hai.
// - Quên chấm công: một nút "Nhắc giải trình". Đã nhắc thì có dòng "Đã nhắc: HH:MM DD/MM" (giờ VN) và nút đổi thành
//   "Nhắc lại"; việc ở lại cho tới khi nhân viên gửi giải trình.
// - Đơn nghỉ, làm thêm, giải trình, tạm ứng: ô "Ghi chú cho nhân viên" (bắt buộc khi từ chối) và Từ chối / Duyệt.
// - Tin hệ thống: chỉ đọc, một liên kết sang màn liên quan.
// Tự gọi useShellStore().decide; xong thì emit('decided') để ngăn kéo báo câu kết quả và chọn việc kế tiếp
// (`kept`: việc vừa nhắc vẫn ở lại, ngăn kéo giữ nguyên lựa chọn).
// emit('leave') khi bấm liên kết sang màn khác (liên kết tự đổi địa chỉ).
import { computed, nextTick, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { InboxItem, SystemNote } from '@/mock/inbox';
import { ALREADY_HANDLED, decisionText, type DecisionVerb } from '@/services/admin-main';
import { useShellStore } from '@/stores/shell';
import { employeePath } from '@/views/admin/attendance/links';
import { BELL_ICONS, CHEVRON_ICON, CLOSE_ICON } from './bell-icons';

// `embedded`: dựng nội dung trong hộp thoại khác (cửa sổ duyệt của Tổng quan): không đặt cố định bên ngăn kéo,
// không có vai trò hộp thoại và đầu thẻ (nhãn nhóm, nút Đóng) vì hộp thoại chủ tự có.
// `profileLink`: việc nào cũng có liên kết "Mở hồ sơ chấm công" (khung chi tiết của Chấm công); mặc định chỉ việc chấm công và giải trình.
const props = defineProps<{ item?: InboxItem; news?: SystemNote; group: string; embedded?: boolean; profileLink?: boolean }>();
const emit = defineEmits<{
  decided: [result: { id: string; ok: boolean; text: string; kept: boolean }];
  close: [];
  leave: [];
}>();

const shell = useShellStore();
const route = useRoute();
const busy = ref(false);
const note = ref('');
const noteError = ref(false);
const noteBox = ref<HTMLTextAreaElement | null>(null);
const remindBtn = ref<HTMLButtonElement | null>(null);

const view = computed(() => {
  const item = props.item;
  if (item) {
    return { name: item.name, role: item.role, initials: item.initials, head: item.head, sub: item.sub, facts: item.facts };
  }
  const news = props.news!;
  return { name: news.source, role: `Tin hệ thống · ${news.when}`, initials: '', head: news.head, sub: news.sub, facts: news.facts };
});
const month = () => (route.query.thang ? { thang: route.query.thang } : {});
const link = computed(() => {
  const item = props.item;
  if (item) {
    if (!props.profileLink && item.group !== 'att' && item.group !== 'exp') return null;
    return { label: 'Mở hồ sơ chấm công', to: { path: employeePath(item.personId), query: month() } };
  }
  const news = props.news!;
  return { label: news.link.label, to: { path: news.link.to, query: month() } };
});
const remind = computed(() => props.item?.action === 'remind');
// Giờ nhắc gần nhất theo giờ VN (UTC+7), dạng "09:40 28/10".
const remindedAt = computed(() => {
  const at = props.item?.remindedAt;
  if (!at) return '';
  const vn = new Date(Date.parse(at) + 7 * 3600000).toISOString();
  return `${vn.slice(11, 16)} ${vn.slice(8, 10)}/${vn.slice(5, 7)}`;
});
const decide = computed(() => !!props.item && props.item.action === 'decide');

function onNote() {
  noteError.value = false;
}

async function act(verb: DecisionVerb) {
  const item = props.item;
  if (!item || busy.value) return;
  const text = note.value.trim();
  if (verb === 'reject' && !text) {
    noteError.value = true;
    nextTick(() => noteBox.value?.focus());
    return;
  }
  busy.value = true;
  let kept = false;
  try {
    const hit = await shell.decide(item.id, verb, text || undefined);
    kept = verb === 'remind' && hit !== null;
    emit('decided', {
      id: item.id,
      ok: hit !== null,
      text: hit ? decisionText(verb, hit.name) : ALREADY_HANDLED,
      kept
    });
  } catch {
    /* máy chủ từ chối hoặc mạng rớt: resolveRequest đã hiện thông báo; việc ở nguyên chỗ để thử lại */
  } finally {
    busy.value = false;
  }
  // Nút nhắc bị khoá trong lúc gửi nên có thể mất focus; việc ở lại thì trả focus về nút (giờ là "Nhắc lại").
  if (kept) nextTick(() => remindBtn.value?.focus());
}
</script>

<template>
  <section
    class="bdd"
    :class="{ 'bdd-emb': embedded }"
    :role="embedded ? undefined : 'dialog'"
    :aria-label="embedded ? undefined : 'Chi tiết yêu cầu'"
    :tabindex="embedded ? undefined : -1"
  >
    <div v-if="!embedded" class="bdd-top">
      <span class="bdd-grp">{{ group }}</span>
      <button type="button" class="bdd-x" aria-label="Đóng chi tiết" @click="emit('close')">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="CLOSE_ICON"
        />
      </button>
    </div>
    <div class="bdd-main">
      <div class="bdd-who">
        <span class="bdd-av" aria-hidden="true">
          <template v-if="item">{{ view.initials }}</template>
          <svg
            v-else
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            v-html="BELL_ICONS.sys"
          />
        </span>
        <div class="bdd-whotx">
          <h3 class="bdd-nm">{{ view.name }}</h3>
          <p class="bdd-mt">{{ view.role }}</p>
        </div>
      </div>
      <div>
        <h4 class="bdd-head">{{ view.head }}</h4>
        <p class="bdd-sub">{{ view.sub }}</p>
      </div>
      <dl class="bdd-dl">
        <div v-for="[label, value, extra] in view.facts" :key="label">
          <dt>{{ label }}</dt>
          <dd>
            {{ value }}
            <div v-if="extra" class="bdd-mt bdd-extra">{{ extra }}</div>
          </dd>
        </div>
      </dl>
      <RouterLink v-if="link" :to="link.to" class="bdd-link" @click="emit('leave')">
        {{ link.label }}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="CHEVRON_ICON"
        />
      </RouterLink>
      <div v-if="remind" class="bdd-remind">
        <p v-if="remindedAt" class="bdd-mt">Đã nhắc: {{ remindedAt }}</p>
        <div class="bdd-acts">
          <button ref="remindBtn" type="button" class="bdd-b1" :disabled="busy" @click="act('remind')">
            {{ remindedAt ? 'Nhắc lại' : 'Nhắc giải trình' }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="decide" class="bdd-note">
      <label for="bell-note">Ghi chú cho nhân viên</label>
      <textarea
        id="bell-note"
        ref="noteBox"
        v-model="note"
        class="bdd-nt"
        :class="{ bad: noteError }"
        :aria-invalid="noteError || undefined"
        :aria-describedby="noteError ? 'bell-note-err' : 'bell-note-hint'"
        placeholder="Ví dụ: ngày này máy chấm công vẫn ghi nhận giờ vào 08:47"
        @input="onNote"
      />
      <div v-if="!noteError" id="bell-note-hint" class="bdd-mt">
        Bắt buộc khi từ chối. Nhân viên xem được ghi chú trong chi tiết yêu cầu.
      </div>
      <div v-else id="bell-note-err" class="bdd-er" role="alert">Ghi lý do từ chối để nhân viên biết vì sao.</div>
      <div class="bdd-acts bdd-decide">
        <button type="button" class="bdd-b2" :disabled="busy" @click="act('reject')">Từ chối</button>
        <button type="button" class="bdd-b1" :disabled="busy" @click="act('approve')">Duyệt</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Thẻ riêng bên trái ngăn kéo (ngăn kéo rộng 440px, cách mép phải 16px, cộng khe 12px). */
.bdd {
  position: fixed;
  z-index: 2;
  top: 16px;
  right: 468px;
  box-sizing: border-box;
  width: 380px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 24px 24px;
  border-radius: 24px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}
.bdd:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.bdd-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.bdd-grp {
  flex-grow: 1;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
.bdd-x {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-ctl);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.bdd-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.bdd-who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bdd-av {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
}
.bdd-whotx {
  min-width: 0;
}
.bdd-nm {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.bdd-mt {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.bdd-head {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.bdd-sub {
  margin: 2px 0 0;
  color: var(--muted);
}
.bdd-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.bdd-dl > div {
  display: flex;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.bdd-dl dt {
  width: 128px;
  flex: none;
  color: var(--muted);
}
.bdd-dl dd {
  margin: 0;
  min-width: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.bdd-extra {
  font-weight: 400;
}
.bdd-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-decoration: underline;
}
.bdd-remind {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bdd-acts {
  display: flex;
  gap: 8px;
}
.bdd-b1,
.bdd-b2 {
  flex: 1 1 0;
  height: 40px;
  border-radius: var(--r-ctl);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.bdd-b1 {
  background: #000000;
  border: 1px solid #000000;
  color: #ffffff;
}
.bdd-b2 {
  background: var(--surface);
  border: 1px solid var(--control);
  color: var(--text);
}
.bdd-b1:disabled,
.bdd-b2:disabled {
  opacity: 0.5;
  cursor: default;
}
.bdd-note {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}
.bdd-note label {
  font-weight: 600;
}
/* Ô ghi chú: bo 8px, viền đỏ khi thiếu lý do từ chối. */
.bdd-nt {
  width: 100%;
  height: 88px;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--control);
  background: var(--surface);
  font: inherit;
  color: var(--text);
  resize: none;
}
.bdd-nt::placeholder {
  color: #757575;
}
.bdd-nt.bad {
  border-color: var(--status-rejected);
}
.bdd-er {
  font-size: 12px;
  line-height: 16px;
  color: var(--status-rejected);
}
.bdd-decide {
  margin-top: 4px;
}
.bdd-x:focus-visible,
.bdd-link:focus-visible,
.bdd-b1:focus-visible,
.bdd-b2:focus-visible,
.bdd-nt:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
/* Nhúng trong hộp thoại khác: bỏ chỗ đặt cố định, nền và đệm (hộp thoại chủ lo). */
.bdd.bdd-emb {
  position: static;
  width: auto;
  max-width: none;
  max-height: none;
  overflow: visible;
  padding: 0;
  border-radius: 0;
  background: transparent;
}
/* Màn hẹp: không đủ chỗ đặt thẻ bên trái, thẻ phủ lên ngăn kéo (ngăn kéo `inert` trong lúc đó). */
@media (max-width: 899px) {
  .bdd {
    right: 16px;
    bottom: 16px;
    width: 440px;
    max-width: calc(100vw - 32px);
    max-height: none;
  }
}
</style>
