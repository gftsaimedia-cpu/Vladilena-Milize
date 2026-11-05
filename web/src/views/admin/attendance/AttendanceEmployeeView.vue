<script setup lang="ts">
// Hồ sơ chấm công của một nhân viên trên dữ liệu giả: thông tin, 4 chỉ số tháng, dải ngày và lịch sử có trục giờ.
// Người, tháng và việc chờ (shell.version) là khoá tải lại; hộp chi tiết ngày nằm trên URL (?hop, ?nv, ?ngay).
// Trước/sau theo thứ tự danh sách nhân viên, giữ ?thang. Tab lịch sử và nút "Chỉ ngày có ngoại lệ" là trạng thái cục bộ.
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ATTENDANCE_GROUPS as GROUPS } from '@/constants/labels';
import type { HistoryEntry } from '@/mock/attendance-employee';
import { useLoad } from '@/composables/useLoad';
import { getEmployeeAttendance } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import DayDetailDialog from './DayDetailDialog.vue';
import { employeePath } from './links';
import HistoryList from './parts/HistoryList.vue';
import MonthStrip from './parts/MonthStrip.vue';
import { focusLost, untilIdle, useDayHop } from './useDayHop';
import './attendance.css';

const EXCEPTIONS = new Set(['late', 'leave', 'absent', 'todo', 'nocheck']);
const TABS = [
  { key: 'timeline', label: 'Dòng thời gian' },
  { key: 'table', label: 'Bảng giờ' }
] as const;

const route = useRoute();
const router = useRouter();
const period = usePeriodStore();
const shell = useShellStore();
const personId = computed(() => String(route.params.id));
const { data: view, loading } = useLoad(
  () => getEmployeeAttendance(personId.value, period.month),
  () => `${personId.value}|${period.month}|${shell.version}`
);
const tab = ref<(typeof TABS)[number]['key']>('timeline');

// Trả focus sau hộp chi tiết ngày. Nút mở còn (ngày vẫn trong dải, lời nhắc còn ngày chờ khác) thì focus về nút đó.
// Xử lý xong ngày chờ cuối cùng thì lời nhắc "Xem ngày" mất: focus sang ô của đúng ngày vừa xử lý trên dải, nếu ô đó không còn
// là nút (ngày về "không ca") thì sang tab đang chọn của mục lịch sử.
const { day, openDay, closeDay } = useDayHop({
  capture: () => undefined,
  async restore(opener, _ctx, closing) {
    await untilIdle(loading);
    if (!focusLost()) return;
    if (opener.isConnected) return opener.focus();
    const stripDay = document.querySelector<HTMLElement>(`.ms-i[data-date="${closing.date}"]`);
    (stripDay ?? document.getElementById(`ep-tab-${tab.value}`))?.focus();
  }
});

const monthNo = computed(() => Number(period.month.slice(5, 7)));
const monthText = computed(() => `${monthNo.value}/${period.month.slice(0, 4)}`);
const thang = computed(() => (route.query.thang ? { thang: route.query.thang } : {}));
const listTo = computed(() => ({ path: '/admin/cham-cong', query: thang.value }));
const month = computed(() => view.value?.data ?? null);

const only = ref(false);
const entries = computed<HistoryEntry[]>(() => {
  const all = month.value?.history ?? [];
  return only.value ? all.filter(e => e.type === 'row' && EXCEPTIONS.has(e.row.kind)) : all;
});

const prevBtn = ref<HTMLButtonElement | null>(null);
const nextBtn = ref<HTMLButtonElement | null>(null);
function go(id: string | null) {
  if (id) router.push({ path: employeePath(id), query: thang.value });
}
// Nút đang giữ focus mà bị tắt (tới đầu hoặc cuối danh sách) làm focus rơi về body: chuyển sang nút còn lại.
// watch chạy trước lần vẽ lại, lúc nút còn bật và còn giữ focus.
watch(
  () => view.value?.nextId ?? null,
  next => {
    if (next === null && document.activeElement === nextBtn.value && view.value?.prevId) prevBtn.value?.focus();
  }
);
watch(
  () => view.value?.prevId ?? null,
  prev => {
    if (prev === null && document.activeElement === prevBtn.value && view.value?.nextId) nextBtn.value?.focus();
  }
);

function onTabKey(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = TABS[(TABS.findIndex(t => t.key === tab.value) + step + TABS.length) % TABS.length];
  tab.value = next.key;
  nextTick(() => document.getElementById(`ep-tab-${next.key}`)?.focus());
}
</script>

<template>
  <div class="att ep">
    <div class="title">
      <div>
        <nav class="crumb" aria-label="Đường dẫn">
          <RouterLink :to="listTo">Chấm công</RouterLink>
          <template v-if="view">
            <span aria-hidden="true">›</span>
            <span aria-current="page">{{ view.person.name }}</span>
          </template>
        </nav>
        <h1>Hồ sơ chấm công</h1>
      </div>
      <div v-if="view" class="acts">
        <button ref="prevBtn" type="button" class="btn sm" :disabled="!view.prevId" @click="go(view.prevId)">
          Nhân viên trước
        </button>
        <span class="pos">{{ view.index }} / {{ view.total }}</span>
        <button ref="nextBtn" type="button" class="btn sm" :disabled="!view.nextId" @click="go(view.nextId)">
          Nhân viên sau
        </button>
      </div>
    </div>

    <template v-if="view">
      <div class="top">
        <section class="card info" aria-label="Thông tin nhân viên">
          <div class="id">
            <span class="avt" aria-hidden="true">{{ view.person.initials }}</span>
            <div class="who2">
              <h2>{{ view.person.name }}</h2>
              <p>{{ view.person.contract }}</p>
              <p>Mã {{ view.person.code }} · vào làm {{ view.person.joined }}</p>
            </div>
          </div>
          <div v-if="month?.pending" class="call">
            <p>{{ month.pending.text }}</p>
            <button type="button" class="btn sm" @click="openDay(view.person.id, month.pending.date)">Xem ngày</button>
          </div>
          <dl class="facts">
            <div>
              <dt>Vị trí</dt>
              <dd>{{ view.person.title }}</dd>
            </div>
            <div>
              <dt>Phòng ban</dt>
              <dd>{{ view.person.dept }}</dd>
            </div>
            <div>
              <dt>Ca làm việc</dt>
              <dd>{{ view.person.shift }}</dd>
            </div>
            <div>
              <dt>Phép năm còn</dt>
              <dd>{{ view.person.leaveLeft }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="month" class="stats" :aria-label="`Chỉ số tháng ${monthNo}`">
          <article v-for="s in month.stats" :key="s.label" class="stat" :aria-label="s.label">
            <span class="sl">{{ s.label }}</span>
            <span class="sv">{{ s.value }}</span>
            <span class="sn">{{ s.note }}</span>
          </article>
        </section>
      </div>

      <template v-if="month">
        <section class="card blk" :aria-label="`Tháng ${monthText}`">
          <div class="bh">
            <h2>Tháng {{ monthText }}</h2>
            <div class="legend" role="group" aria-label="Chú giải">
              <span v-for="g in GROUPS" :key="g.key" class="gc" :data-group="g.key">
                <span class="b" :class="g.key" aria-hidden="true" />{{ g.label }}
                <span class="ct">{{ month.chips[g.key] }}</span>
              </span>
            </div>
          </div>
          <MonthStrip :days="month.strip" :month-no="monthNo" @open-day="date => openDay(view!.person.id, date)" />
        </section>

        <section class="card blk" aria-label="Lịch sử chấm công">
          <div class="bh">
            <h2>Lịch sử chấm công</h2>
            <div class="tools2">
              <div class="tabs2" role="tablist" aria-label="Kiểu xem lịch sử" @keydown="onTabKey">
                <button
                  v-for="t in TABS"
                  :id="`ep-tab-${t.key}`"
                  :key="t.key"
                  type="button"
                  role="tab"
                  :aria-selected="tab === t.key"
                  :aria-controls="tab === t.key ? `ep-panel-${t.key}` : undefined"
                  :tabindex="tab === t.key ? 0 : -1"
                  @click="tab = t.key"
                >
                  {{ t.label }}
                </button>
              </div>
              <button type="button" class="btn sm only" :aria-pressed="only" @click="only = !only">
                Chỉ ngày có ngoại lệ
              </button>
            </div>
          </div>
          <div :id="`ep-panel-${tab}`" role="tabpanel" :aria-labelledby="`ep-tab-${tab}`">
            <HistoryList
              :key="view.person.id"
              :entries="entries"
              :mode="tab"
              empty="Không có ngày nào có ngoại lệ."
            />
          </div>
        </section>
      </template>
      <p v-else class="none">Chưa có dữ liệu chấm công giả cho tháng {{ monthText }}.</p>
    </template>
    <template v-else-if="!loading">
      <p class="none">Không tìm thấy nhân viên này.</p>
      <RouterLink :to="listTo" class="link">Về Chấm công</RouterLink>
    </template>

    <DayDetailDialog
      v-if="day"
      :key="`${day.personId}|${day.date}`"
      :person-id="day.personId"
      :date="day.date"
      @close="closeDay"
    />
  </div>
</template>

<style scoped>
.title {
  flex-wrap: wrap;
  gap: 12px 16px;
}
.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--muted);
}
.crumb a {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--status-draft);
}
.crumb a:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 8px;
}
.acts {
  align-items: center;
}
.pos {
  min-width: 48px;
  text-align: center;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.acts .btn:disabled {
  opacity: 0.45;
}

.top {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}
.info {
  min-width: 0;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.id {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avt {
  flex: none;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gold-light);
  font-size: 18px;
  font-weight: 600;
}
.who2 h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.who2 p {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--muted);
}
.call {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 14px 16px;
  border: 2px solid var(--status-pending);
  border-radius: var(--r-md);
}
.call p {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.call .btn {
  flex: none;
}
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}
.facts dt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.stats {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.stat {
  min-width: 0;
  min-height: 112px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
}
.sl,
.sn {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.sl {
  font-weight: 500;
}
.sv {
  font-size: 28px;
  line-height: 32px;
  font-weight: 500;
  letter-spacing: -0.56px;
  font-variant-numeric: tabular-nums;
}

.blk {
  margin-bottom: 24px;
  overflow: hidden;
}
.bh {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 20px 24px 12px;
}
.bh h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.tools2 {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.tabs2 {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: var(--r-pill);
  background: var(--ground);
}
.tabs2 button {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.tabs2 button[aria-selected='true'] {
  background: var(--surface-dark);
  color: var(--on-primary);
}
.tabs2 button:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.only[aria-pressed='true'] {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
  color: var(--on-primary);
}
.only:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.none {
  margin: 0 0 12px;
  padding: 20px 0;
  color: var(--muted);
}

@media (max-width: 1023px) {
  .top {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .info {
    padding: 20px 16px;
  }
  .call {
    flex-wrap: wrap;
  }
  .bh {
    padding: 16px 16px 12px;
  }
  .tools2 {
    margin-left: 0;
  }
  .stat {
    padding: 12px 16px;
  }
}
</style>
