<script setup lang="ts">
// Cài đặt › Tất cả cài đặt: tìm trong mọi nhóm, mở đúng mục để xem hoặc sửa.
// ?q=<từ khoá> điền sẵn ô tìm (từ ô "Tìm cài đặt" ở đầu trang).
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAllSettings, saveAllSettings } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import { monthShort } from '@/utils/format';
import { filterAllSettings, normalizeSettingsSearch, searchAllSettings } from '@/builders/admin-config/all-settings';
import SettingsFrame from './SettingsFrame.vue';
import RevertDialog from './all/RevertDialog.vue';
import SettingItem from './all/SettingItem.vue';
import SaveBar from './fields/SaveBar.vue';
import { useDraft } from './lib/useDraft';

const route = useRoute();
const router = useRouter();
const period = usePeriodStore();
const session = useSessionStore();
const validGroups = [
  'ngay-cong',
  'lam-them',
  'phu-cap',
  'luong-kpi',
  'khau-tru',
  'tam-ung',
  'bao-hiem',
  'thue',
  'chuc-vu',
  'ky-luong',
  'cham-cong',
  'nghi-phep',
  'phe-duyet',
  'ho-so',
  'phieu-luong',
  'nang-cao'
];
const group = ref(validGroups.includes(String(route.query.group)) ? String(route.query.group) : 'ngay-cong');
const { data, loading, error, reload } = useLoad(
  () => getAllSettings(group.value),
  () => group.value
);
const form = useDraft(() => data.value && data.value.detail);
const { draft } = form;

const q = ref(String(route.query.q || ''));
watch(
  () => route.query.q,
  v => (q.value = String(v || ''))
);
const filter = ref('all'); // all | editable | unconfirmed | readonly
const FILTERS = [
  ['all', 'Tất cả'],
  ['editable', 'Sửa được'],
  ['unconfirmed', 'Chưa xác nhận'],
  ['readonly', 'Chỉ đọc']
];

const needle = computed(() => q.value.trim().toLowerCase());
const browsingGroups = ref(false);
watch(needle, (value, previous) => {
  if (!value || !previous) browsingGroups.value = false;
});
const showGroupBrowser = computed(() => !needle.value || browsingGroups.value);
const searchResults = computed(
  () =>
    data.value?.searchResults?.filter(
      r =>
        !needle.value ||
        normalizeSettingsSearch(`${r.title} ${r.groupLabel} ${r.section}`).includes(
          normalizeSettingsSearch(needle.value)
        )
    ) || []
);
function hasUnsavedChanges() {
  return form.changes.value > 0;
}
function confirmDiscardDraft() {
  if (!hasUnsavedChanges()) return true;
  if (form.saving.value) return false;
  if (!window.confirm('Bạn có thay đổi chưa lưu. Bỏ bản nháp này và tiếp tục?')) return false;
  form.reset();
  return true;
}
async function selectGroup(next) {
  if (next === group.value) return true;
  const query = { ...route.query };
  delete query.setting;
  await router.push({ query: { ...query, group: next } });
  return group.value === next;
}
const routeGroup = value => (validGroups.includes(String(value)) ? String(value) : 'ngay-cong');
onBeforeRouteUpdate((to, from) => {
  if (routeGroup(to.query.group) === routeGroup(from.query.group)) return true;
  return confirmDiscardDraft();
});
watch(
  () => route.query.group,
  async value => {
    const target = validGroups.includes(String(value)) ? String(value) : 'ngay-cong';
    if (target !== group.value) {
      group.value = target;
    }
  }
);
watch([() => data.value?.detail, () => route.query.setting], async ([detail, targetSetting]) => {
  if (!detail || detail.key !== group.value) return;
  const setting = String(targetSetting || '');
  if (setting) {
    if (detail.readonly.some(item => item.key === setting)) filter.value = 'readonly';
    else if (detail.items.some(item => item.key === setting)) filter.value = 'all';
    await nextTick();
    document
      .querySelector(`[data-setting-key="${CSS.escape(setting)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = document.querySelector(`[data-setting-key="${CSS.escape(setting)}"]`) as HTMLElement | null;
    (
      (target?.querySelector('.c button:not(:disabled), .c input:not(:disabled)') as HTMLElement | null) || target
    )?.focus({ preventScroll: true });
  }
});
function openResult(result) {
  router.push({ query: { ...route.query, ...result.query, q: needle.value } });
}
onBeforeRouteLeave(() => {
  return confirmDiscardDraft();
});
function guardUnload(event) {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
}
window.addEventListener('beforeunload', guardUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload));
const items = computed(() => {
  if (!draft.value) return [];
  return filterAllSettings(draft.value, needle.value, filter.value, String(route.query.setting || '')).items;
});
const readonly = computed(() => {
  if (!draft.value) return [];
  return filterAllSettings(draft.value, needle.value, filter.value, String(route.query.setting || '')).readonly;
});
const showSoon = computed(() => filter.value === 'all' && draft.value && draft.value.soonCount > 0 && !needle.value);

// Mục nào đã khác bản đã lưu (để bật "Hoàn tác")
const isChanged = (item?) => {
  const saved = data.value.detail.items.find(i => i.key === item.key);
  return JSON.stringify(saved) !== JSON.stringify(item);
};
function undo(item?) {
  const i = draft.value.items.findIndex(x => x.key === item.key);
  draft.value.items[i] = JSON.parse(JSON.stringify(data.value.detail.items.find(x => x.key === item.key)));
}

// Hoàn tác về một phiên bản cũ của ô (lịch sử từng mục): chỉ khi có quyền ghi mục đó và không còn chỗ sửa dở
const reverting = ref(null); // { item, row }
const canRevert = (item?) => form.changes.value === 0 && !!item.history && session.caps.includes(item.history.cap);
function onReverted() {
  reverting.value = null;
  reload();
}

const detailCard = ref(null);
function showUnconfirmed() {
  selectGroup('ngay-cong').then(selected => {
    if (!selected) return;
    filter.value = 'unconfirmed';
    detailCard.value && detailCard.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
</script>

<template>
  <SettingsFrame active="tat-ca">
    <template #acts>
      <span aria-hidden="true"></span>
    </template>
    <template #sub>
      <template v-if="data">
        <template v-if="data.intro.count > 0">
          Đang áp dụng cho tháng {{ monthShort(period.month) }} · <b>{{ data.intro.count }} mục</b> còn dùng mặc định
          của app, chờ bạn xác nhận
        </template>
      </template>
    </template>

    <div v-if="data && data.intro.count > 0" class="first">
      <div class="note gold">
        <Icon name="spark" />
        <div>
          <b>{{ data.intro.count }} mục cài đặt lần đầu</b> đang dùng giá trị mặc định của app, chưa ai xác nhận. Sửa
          từng mục bên dưới rồi bấm Xem trước và lưu: chọn tháng áp dụng, xem tác động lên từng người và ghi lý do.
        </div>
      </div>
      <button type="button" class="btn sm" @click="showUnconfirmed">Xem {{ data.intro.count }} mục</button>
    </div>

    <section v-if="data" class="card">
      <div class="card-h">
        <h2>Tất cả cài đặt</h2>
        <span class="cap">Chọn một nhóm để xem và sửa từng mục</span>
      </div>
      <label class="srch">
        <Icon name="search" />
        <input
          v-model="q"
          type="text"
          placeholder="Tìm theo tên cài đặt, ở mọi nhóm"
          aria-label="Tìm theo tên cài đặt"
        />
      </label>
      <div v-if="needle" class="results" aria-live="polite">
        <p class="result-label">
          {{
            searchResults.length ? `${searchResults.length} kết quả trên mọi nhóm` : 'Không có kết quả trên mọi nhóm'
          }}
        </p>
        <button
          v-for="result in searchResults"
          :key="result.groupKey + ':' + result.settingKey"
          type="button"
          class="result"
          @click="openResult(result)"
        >
          <span
            ><b>{{ result.title }}</b
            ><small>{{ result.section }} · {{ result.groupLabel }}</small></span
          >
          <small>{{ result.readonly ? 'Chỉ đọc' : 'Mở mục' }}</small>
        </button>
      </div>
      <button
        v-if="needle"
        type="button"
        class="browse-groups"
        aria-controls="settings-group-browser"
        :aria-expanded="browsingGroups"
        @click="browsingGroups = !browsingGroups"
      >
        Duyệt nhóm cài đặt
      </button>
      <div v-show="showGroupBrowser" id="settings-group-browser" class="gl">
        <template v-for="g in data.groups" :key="g.section">
          <div class="lb">{{ g.section }}</div>
          <div class="chs">
            <button
              v-for="c in g.items"
              :key="c.key"
              type="button"
              class="chip"
              :class="{ on: group === c.key }"
              @click="selectGroup(c.key)"
            >
              {{ c.name }} <small>{{ c.count }}</small>
            </button>
          </div>
        </template>
      </div>
    </section>

    <p v-if="loading" class="load-state" role="status">Đang tải cài đặt…</p>
    <div v-else-if="error" class="load-state" role="alert">
      Không tải được cài đặt. <button type="button" class="link" @click="reload">Thử lại</button>
    </div>
    <section v-if="draft && !loading && !error" ref="detailCard" class="card">
      <div class="card-h">
        <h2>{{ draft.title }}</h2>
        <span class="cap"
          >{{ draft.items.length }} mục sửa được · {{ draft.readonly.length }} mục chỉ đọc · {{ draft.soonCount }} mục
          sắp có</span
        >
        <span class="r" style="display: flex; gap: 8px">
          <button
            v-for="[key, label] in FILTERS"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: filter === key }"
            @click="filter = key"
          >
            {{ label }}
          </button>
        </span>
      </div>

      <SettingItem
        v-for="it in items"
        :key="it.key"
        :item="it"
        :changed="isChanged(it)"
        :can-revert="canRevert(it)"
        @undo="undo(it)"
        @revert="reverting = { item: it, row: $event }"
      />
      <p v-if="!items.length && !readonly.length" class="none">
        {{ draft.items.length || draft.readonly.length ? 'Không có mục nào khớp.' : 'Chưa có mục nào trong nhóm này.' }}
      </p>

      <template v-if="readonly.length">
        <div class="sech">CHỈ ĐỌC · {{ readonly.length }} MỤC · đặt theo quy chế hoặc hệ thống, không sửa ở đây</div>
        <div v-for="r in readonly" :key="r.key" class="ro" :data-setting-key="r.key" tabindex="-1">
          <div>
            <b>{{ r.title }}</b
            ><span>{{ r.desc }}</span>
          </div>
          <span class="v">{{ r.value }}</span>
        </div>
        <div style="height: 14px"></div>
      </template>
      <div v-if="showSoon" class="soon2">
        <b>Sắp có · {{ draft.soonCount }} mục</b> · đã có trong danh mục nhưng phần tính lương chưa dùng tới nên chưa
        sửa được
      </div>
      <SaveBar
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="form.save(d => saveAllSettings(group, d))"
      />
    </section>
  </SettingsFrame>

  <RevertDialog
    v-if="reverting"
    :name="reverting.item.name"
    :row="reverting.row"
    @close="reverting = null"
    @saved="onReverted"
  />
</template>

<style scoped>
.first {
  display: flex;
  align-items: center;
  gap: 12px;
}
.first .note {
  flex: 1;
}
.srch {
  margin: 4px 24px 2px;
  height: 40px;
  border: 1px solid var(--control);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: #8a8a8a;
  font-size: 14px;
}
.srch input {
  flex: 1;
  color: var(--text);
}
.results {
  padding: 0 24px 12px;
}
.result-label {
  margin: 4px 0 6px;
  color: var(--muted);
  font-size: 12px;
}
.result {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 10px;
  text-align: left;
  border-top: 1px solid var(--rule);
}
.result:hover,
.result:focus-visible {
  background: var(--surface-2, #f7f7f7);
  outline: 2px solid var(--control);
  outline-offset: -2px;
}
.result span {
  min-width: 0;
}
.result b,
.result small {
  display: block;
}
.result small {
  color: var(--muted);
  font-size: 12px;
}
.browse-groups {
  display: block;
  min-height: 40px;
  margin: 0 24px 12px;
  padding: 0 10px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
  text-align: left;
}
.browse-groups:hover,
.browse-groups:focus-visible {
  color: var(--text);
  outline: 2px solid var(--control);
  outline-offset: 1px;
}
.load-state {
  margin: 12px 0;
  padding: 16px 24px;
  color: var(--muted);
}
.gl {
  padding: 0 24px 18px;
}
.gl .lb {
  font-size: 12px;
  color: var(--muted);
  margin: 12px 0 8px;
}
.gl .chs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ro {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid var(--rule);
  font-size: 13px;
}
.ro b {
  display: block;
  font-weight: 600;
  font-size: 14px;
}
@media (max-width: 1200px) {
  .card-h {
    flex-wrap: wrap;
  }
  .card-h .r {
    flex-wrap: wrap;
    max-width: 100%;
  }
}
@media (max-width: 640px) {
  .first {
    align-items: stretch;
    flex-direction: column;
  }
  .srch {
    margin: 8px 14px 2px;
  }
  .results,
  .gl {
    padding-left: 14px;
    padding-right: 14px;
  }
  .browse-groups {
    margin-left: 14px;
    margin-right: 14px;
  }
  .result {
    align-items: flex-start;
  }
  .ro {
    padding: 12px 14px;
  }
}
.ro span {
  color: var(--muted);
}
.ro .v {
  margin-left: auto;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}
.sech {
  padding: 14px 24px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  border-top: 1px solid var(--rule);
  background: var(--raised);
}
.soon2 {
  margin: 0 24px 20px;
  padding: 12px 14px;
  border: 1.5px dashed #cfcfcf;
  border-radius: 12px;
  font-size: 13px;
  color: var(--muted);
}
.soon2 b {
  color: var(--text);
}
.none {
  margin: 0;
  padding: 8px 24px 22px;
  color: var(--muted);
  font-size: 13px;
}
</style>
