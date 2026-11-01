<script setup lang="ts">
// Cài đặt › Tất cả cài đặt: tìm theo tên, chọn một nhóm để xem và sửa từng mục (bản demo có nội dung nhóm 1).
// ?q=<từ khoá> điền sẵn ô tìm (từ ô "Tìm cài đặt" ở đầu trang) · ?hop=them-chuc-vu mở hộp thêm chức vụ.
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAllSettings, saveAllSettings } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import { monthShort } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import AddPositionDialog from './all/AddPositionDialog.vue';
import RevertDialog from './all/RevertDialog.vue';
import SettingItem from './all/SettingItem.vue';
import SaveBar from './fields/SaveBar.vue';
import { useDraft } from './lib/useDraft';
import { useHop } from './lib/useHop';

const route = useRoute();
const period = usePeriodStore();
const session = useSessionStore();
const group = ref('ngay-cong');
const { data, reload } = useLoad(
  () => getAllSettings(group.value),
  () => group.value
);
const form = useDraft(() => data.value && data.value.detail);
const { draft } = form;
const { hop, open, close } = useHop(['them-chuc-vu']);

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
const items = computed(() => {
  if (!draft.value || filter.value === 'readonly') return [];
  return draft.value.items.filter(
    i =>
      (filter.value !== 'unconfirmed' || i.badge === 'unconfirmed') &&
      (!needle.value || i.name.toLowerCase().includes(needle.value))
  );
});
const readonly = computed(() => {
  if (!draft.value || !['all', 'readonly'].includes(filter.value)) return [];
  return draft.value.readonly.filter(r => !needle.value || r.title.toLowerCase().includes(needle.value));
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
  group.value = 'ngay-cong';
  filter.value = 'unconfirmed';
  detailCard.value && detailCard.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <SettingsFrame active="tat-ca">
    <template #sub>
      <template v-if="data">
        Đang áp dụng cho tháng {{ monthShort(period.month) }} · <b>{{ data.intro.count }} mục</b> còn dùng mặc định của
        app, chờ bạn xác nhận
      </template>
    </template>

    <div v-if="data" class="first">
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
        <button type="button" class="r btn sm" @click="open('them-chuc-vu')"><Icon name="plus" />Thêm chức vụ</button>
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
      <div class="gl">
        <template v-for="g in data.groups" :key="g.section">
          <div class="lb">{{ g.section }}</div>
          <div class="chs">
            <button
              v-for="c in g.items"
              :key="c.key"
              type="button"
              class="chip"
              :class="{ on: group === c.key }"
              @click="group = c.key"
            >
              {{ c.name }} <small>{{ c.count }}</small>
            </button>
          </div>
        </template>
      </div>
    </section>

    <section v-if="draft" ref="detailCard" class="card">
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
        <div v-for="r in readonly" :key="r.title" class="ro">
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

  <AddPositionDialog v-if="hop === 'them-chuc-vu'" @close="close" @saved="reload" />
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
