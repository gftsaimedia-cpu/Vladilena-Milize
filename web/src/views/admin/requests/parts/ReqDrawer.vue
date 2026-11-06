<script setup lang="ts">
// Ngăn chi tiết một đơn (board Q3–Q4): người gửi, nội dung, các dòng chi tiết, "Các bước" (gửi → chờ / đã xử lý kèm ghi chú)
// và liên kết sang hồ sơ chấm công. Đơn chờ có chân ngăn: ô "Ghi chú cho nhân viên" (bắt buộc khi từ chối, nút Từ chối khoá tới
// khi có chữ), Từ chối và Duyệt. `rejecting` (mở từ nút Từ chối của dòng, ?tuchoi=1): focus vào ô ghi chú, ô và câu gợi ý nổi lên.
// Ngăn không tự gọi duyệt / từ chối: emit('decide') để màn gọi useShellStore().decide.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { KIND_LABEL, STATUS_DOT, STATUS_LABEL, vnStamp, type ReqRow } from '@/builders/api/admin-requests';
import { employeePath } from '@/views/admin/attendance/links';

const props = defineProps<{ row: ReqRow; rejecting: boolean; busy: boolean }>();
const emit = defineEmits<{ close: []; decide: [d: { verb: 'approve' | 'reject'; note?: string }] }>();

const route = useRoute();
const note = ref('');
const noteBox = ref<HTMLTextAreaElement | null>(null);
const pend = computed(() => props.row.status === 'pend');
const empty = computed(() => !note.value.trim());
const need = computed(() => props.rejecting && empty.value);

const role = computed(() => [props.row.dept, props.row.title].filter(Boolean).join(' · '));
const steps = computed(() => {
  const r = props.row;
  const out = [{ t: 'Gửi đơn', d: vnStamp(r.sentAt), c: 'var(--primary)', note: '' }];
  if (r.status === 'pend') out.push({ t: 'Chờ duyệt', d: 'Chưa ai xử lý', c: STATUS_DOT.pend, note: '' });
  else {
    const t = r.status === 'ok' ? 'Đã duyệt · Quản trị viên' : r.status === 'rej' ? 'Đã từ chối · Quản trị viên' : 'Nhân viên đã huỷ';
    out.push({ t, d: vnStamp(r.reviewedAt), c: STATUS_DOT[r.status], note: r.reviewNote ?? '' });
  }
  return out;
});
const profile = computed(() => ({
  path: employeePath(props.row.personId),
  query: route.query.thang ? { thang: route.query.thang } : {}
}));

function focusNote() {
  nextTick(() => noteBox.value?.focus());
}
onMounted(() => {
  if (props.rejecting) focusNote();
});
watch(
  () => props.rejecting,
  on => {
    if (on) focusNote();
  }
);

function reject() {
  if (empty.value || props.busy) return;
  emit('decide', { verb: 'reject', note: note.value.trim() });
}
function approve() {
  if (props.busy) return;
  emit('decide', { verb: 'approve', note: note.value.trim() || undefined });
}
</script>

<template>
  <AppDrawer :title="`Chi tiết yêu cầu của ${row.name}`" :width="480" floating ruled @close="emit('close')">
    <template #head>
      <div class="rq-dh">
        <span class="rq-mt rq-dk">Yêu cầu · {{ KIND_LABEL[row.kind] }}</span>
        <span class="rq-dst"><span class="rq-dot" :style="{ background: STATUS_DOT[row.status] }" />{{ STATUS_LABEL[row.status] }}</span>
      </div>
    </template>
    <div class="rq-db">
      <div class="rq-dwho">
        <span class="rq-dav" aria-hidden="true">{{ row.initials }}</span>
        <div class="rq-dwt">
          <div class="rq-dnm">{{ row.name }}</div>
          <div class="rq-mt">{{ role ? `${role} · ` : '' }}gửi lúc {{ vnStamp(row.sentAt) }}</div>
        </div>
      </div>
      <div>
        <div class="rq-dhead">{{ row.head }}</div>
        <div v-if="row.sub" class="rq-dsub">{{ row.sub }}</div>
      </div>
      <dl v-if="row.facts.length" class="rq-dl">
        <div v-for="[label, value, extra] in row.facts" :key="label">
          <dt>{{ label }}</dt>
          <dd>
            {{ value }}
            <div v-if="extra" class="rq-mt">{{ extra }}</div>
          </dd>
        </div>
      </dl>
      <div>
        <div class="rq-sth">Các bước</div>
        <ol class="rq-steps">
          <li v-for="s in steps" :key="s.t">
            <span class="rq-dot" :style="{ background: s.c }" />
            <div class="rq-stx">
              <div class="rq-stt">{{ s.t }}</div>
              <div class="rq-mt">{{ s.d }}</div>
              <div v-if="s.note" class="rq-qt">“{{ s.note }}”</div>
            </div>
          </li>
        </ol>
      </div>
      <RouterLink :to="profile" class="rq-link">
        Mở hồ sơ chấm công của {{ row.name }}
        <Icon name="chevr" :size="14" />
      </RouterLink>
    </div>
    <template v-if="pend" #footer>
      <div class="rq-df">
        <label for="rq-note" class="rq-nl">Ghi chú cho nhân viên</label>
        <textarea
          id="rq-note"
          ref="noteBox"
          v-model="note"
          class="rq-nt"
          :class="{ need }"
          aria-describedby="rq-hint"
          :placeholder="rejecting ? 'Ví dụ: trùng lịch kiểm kê cuối tháng, bạn đổi sang ngày khác nhé' : 'Không bắt buộc khi duyệt'"
        />
        <div id="rq-hint" class="rq-mt rq-hint" :class="{ need }">
          {{
            need
              ? 'Ghi lý do để bật nút Từ chối. Nhân viên đọc được ghi chú này.'
              : 'Bắt buộc khi từ chối. Nhân viên đọc được ghi chú này.'
          }}
        </div>
        <div class="rq-btns">
          <button type="button" class="rq-b2" :disabled="empty || busy" @click="reject">Từ chối</button>
          <button type="button" class="rq-b1" :disabled="busy" @click="approve">Duyệt</button>
        </div>
      </div>
    </template>
  </AppDrawer>
</template>

<!-- Ngăn được Teleport ra <body>; luật scoped vẫn áp vì phần tử nằm trong khuôn của thành phần này. -->
<style scoped>
.rq-mt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.rq-dh {
  display: flex;
  flex-direction: column;
}
.rq-dk {
  font-weight: 500;
}
.rq-dst {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-weight: 600;
}
.rq-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50px;
}
/* Ngăn tự cuộn (đầu, chân dính): phần giữa chỉ đặt đệm và khoảng cách. */
.rq-db {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.rq-dwho {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rq-dav {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.rq-dwt {
  min-width: 0;
}
.rq-dnm {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.rq-dhead {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.rq-dsub {
  margin-top: 2px;
  color: var(--muted);
}
.rq-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.rq-dl > div {
  display: flex;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.rq-dl dt {
  width: 152px;
  flex: none;
  color: var(--muted);
}
.rq-dl dd {
  margin: 0;
  min-width: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.rq-sth {
  margin-bottom: 12px;
  font-weight: 600;
}
.rq-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rq-steps li {
  display: flex;
  gap: 12px;
}
.rq-steps .rq-dot {
  margin-top: 6px;
}
.rq-stx {
  min-width: 0;
}
.rq-stt {
  font-weight: 500;
}
.rq-qt {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: var(--r-ctl);
  background: var(--ground);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rq-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.rq-df {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rq-nl {
  font-weight: 600;
}
/* Ô ghi chú: bo 8px; khi mở để từ chối mà chưa có chữ thì viền cam. */
.rq-nt {
  width: 100%;
  height: 84px;
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
.rq-nt::placeholder {
  color: var(--muted);
}
.rq-nt.need {
  border-color: var(--status-pending);
  box-shadow: 0 0 0 1px var(--status-pending);
}
.rq-hint.need {
  color: var(--text);
  font-weight: 500;
}
.rq-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.rq-b1,
.rq-b2 {
  flex: 1 1 0;
  height: 44px;
  border-radius: var(--r-ctl);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.rq-b1 {
  background: #000000;
  border: 1px solid #000000;
  color: #ffffff;
}
.rq-b2 {
  background: var(--surface);
  border: 1px solid var(--control);
  color: var(--text);
}
.rq-b2:disabled {
  background: var(--ground);
  border-color: var(--border);
  color: #757575;
  cursor: not-allowed;
}
.rq-b1:disabled {
  opacity: 0.5;
  cursor: default;
}
.rq-link:focus-visible,
.rq-nt:focus-visible,
.rq-b1:focus-visible,
.rq-b2:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
</style>
