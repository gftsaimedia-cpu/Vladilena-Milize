<script setup lang="ts">
// Màn Nhân sự: danh sách hồ sơ, lọc theo loại và theo vấn đề (chưa có ca, thiếu ngày bắt đầu, đã khoá).
// ?loc=chua-co-ca chọn sẵn bộ lọc "chưa có ca" · ?hop=them | sua-ho-so (&nv=tên đăng nhập) mở sẵn hộp / ngăn kéo.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getStaffList } from '@/services/admin-hr';
import { dmy, initials } from '@/utils/format';
import PagerBar from '@/views/admin/attendance/PagerBar.vue';
import SearchBox from '@/views/admin/attendance/SearchBox.vue';
import { useHop } from '@/views/admin/attendance/useHop';
import AddStaffDialog from './AddStaffDialog.vue';
import BulkShiftDialog from './BulkShiftDialog.vue';
import ProfileDrawer from './ProfileDrawer.vue';

const route = useRoute();
const router = useRouter();

const TYPE_CHIPS = [
  ['all', 'Tất cả'],
  ['tts', 'Thực tập sinh'],
  ['ctv', 'Chuyên trách viên'],
  ['nv', 'Nhân viên']
];
const ISSUE_CHIPS = [
  ['chua-co-ca', 'Chưa có ca'],
  ['thieu-ngay', 'Thiếu ngày bắt đầu'],
  ['da-khoa', 'Đã khoá']
];
const LOCS = [...TYPE_CHIPS, ...ISSUE_CHIPS].map(c => c[0]);
const loc = computed(() => (LOCS.includes(route.query.loc as string) ? route.query.loc : 'all'));
const setLoc = (key?) => router.replace({ query: { ...route.query, loc: key === 'all' ? undefined : key } });

const q = ref('');
const page = ref(1);
watch([loc, q], () => (page.value = 1));
const { data, reload } = useLoad(
  () => getStaffList({ loc: loc.value, q: q.value, page: page.value }),
  () => [loc.value, q.value, page.value].join('|')
);
const rows = computed(() => data.value?.rows || []);
const summary = computed(() => data.value?.summary);

// Chọn nhiều người để gán ca
const selected = ref([]);
const allOn = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.includes(r.username)));
const toggle = (u?) =>
  (selected.value = selected.value.includes(u) ? selected.value.filter(x => x !== u) : [...selected.value, u]);
const toggleAll = () => {
  const names = rows.value.map(r => r.username);
  selected.value = allOn.value
    ? selected.value.filter(u => !names.includes(u))
    : [...new Set<any>([...selected.value, ...names])];
};

// Hộp và ngăn kéo
const { open: addOpen, close: closeAdd } = useHop('them');
const bulkOpen = ref(false);
const profileUser = ref(null);
const { open: profileHop, close: closeProfileHop } = useHop('sua-ho-so');
watch(
  profileHop,
  o => {
    if (o && route.query.nv) profileUser.value = String(route.query.nv);
  },
  { immediate: true }
);
function closeProfile() {
  profileUser.value = null;
  closeProfileHop();
}
function saved(close?) {
  close();
  reload();
}
function bulkSaved() {
  bulkOpen.value = false;
  selected.value = [];
  reload();
}

const footText = computed(() => {
  const d = data.value;
  if (!d) return '';
  if (loc.value === 'chua-co-ca') return [`${d.total} nhân sự chưa có ca`, d.lockedNote].filter(Boolean).join(' · ');
  if (!rows.value.length) return `0 trên ${d.total} nhân sự`;
  const from = (d.page - 1) * 20 + 1;
  return `${from}–${from + rows.value.length - 1} trên ${d.total} nhân sự · xếp theo loại rồi theo tên`;
});
</script>

<template>
  <div class="title">
    <div>
      <h1>Nhân sự</h1>
      <p v-if="summary">
        {{ summary.total }} nhân sự · {{ summary.active }} đang làm việc · <b>{{ summary.noShift }} người</b> chưa có
        ca, <b>{{ summary.noStart }} người</b> thiếu ngày bắt đầu làm
      </p>
    </div>
    <div class="acts">
      <button type="button" class="btn" @click="bulkOpen = true"><Icon name="clock" />Gán ca cho nhiều người</button>
      <button type="button" class="btn pri" @click="addOpen = true"><Icon name="plus" />Thêm nhân sự</button>
    </div>
  </div>

  <section class="card">
    <div class="tools" style="padding-top: 20px">
      <button
        v-for="[key, label] in TYPE_CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: loc === key }"
        @click="setLoc(key)"
      >
        {{ label }} <small v-if="data">{{ data.counts[key] }}</small>
      </button>
      <span class="vr" />
      <button
        v-for="[key, label] in ISSUE_CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: loc === key }"
        @click="setLoc(key)"
      >
        {{ label }} <small v-if="data">{{ data.counts[key] }}</small>
      </button>
      <SearchBox v-model="q" style="margin-left: auto; width: 200px" />
    </div>
    <table class="tbl ns">
      <colgroup>
        <col style="width: 56px" />
        <col style="width: 236px" />
        <col style="width: 196px" />
        <col style="width: 186px" />
        <col style="width: 112px" />
        <col style="width: 230px" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th class="cbc">
            <button
              type="button"
              class="cb"
              :class="{ on: allOn }"
              role="checkbox"
              :aria-checked="allOn"
              aria-label="Chọn tất cả"
              @click="toggleAll"
            >
              <Icon v-if="allOn" name="check" :size="12" :stroke="3" />
            </button>
          </th>
          <th>Nhân sự</th>
          <th>Loại · bậc</th>
          <th>Ca cố định</th>
          <th>Bắt đầu làm</th>
          <th>Hợp đồng · bảo hiểm</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.username"
          class="open"
          :class="{ sel: selected.includes(r.username) }"
          tabindex="0"
          @click="profileUser = r.username"
          @keydown.enter="profileUser = r.username"
        >
          <td class="cbc">
            <button
              type="button"
              class="cb"
              :class="{ on: selected.includes(r.username) }"
              role="checkbox"
              :aria-checked="selected.includes(r.username)"
              :aria-label="`Chọn ${r.name}`"
              @click.stop="toggle(r.username)"
              @keydown.enter.stop
            >
              <Icon v-if="selected.includes(r.username)" name="check" :size="12" :stroke="3" />
            </button>
          </td>
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="u">{{ r.username }}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="two">
              <div class="a" :class="{ bad: r.typeBad }">{{ r.typeLabel }}</div>
              <div class="b">{{ r.level }}</div>
            </div>
          </td>
          <td>
            <div class="two">
              <div class="a" :class="{ bad: !r.shift }">{{ r.shiftName }}</div>
              <div class="b">{{ r.shiftHours }}</div>
            </div>
          </td>
          <td>
            <template v-if="r.start">{{ dmy(r.start) }}</template>
            <span v-else class="soft">Không cần</span>
          </td>
          <td>
            <div class="two">
              <div class="a">{{ r.contractLabel }}</div>
              <div class="b">{{ r.insuranceLabel }}</div>
            </div>
          </td>
          <td style="text-align: right">
            <span class="act">
              <span v-if="r.locked" class="pill p-draft">Đã khoá</span>
              <template v-if="r.issue">
                <span class="pill p-err">Cần sửa</span>
                <button type="button" class="link" style="margin-left: 8px" @click.stop="profileUser = r.username">
                  {{ r.issue }}
                </button>
              </template>
            </span>
          </td>
        </tr>
        <tr v-if="data && !rows.length">
          <td colspan="7" class="none">Không có nhân sự nào phù hợp</td>
        </tr>
      </tbody>
    </table>
    <div v-if="loc === 'chua-co-ca'" class="note" style="margin: 16px 24px 20px">
      <Icon name="info" />
      <div>Chọn nhiều người rồi bấm <b>Gán ca cho nhiều người</b> để gán cùng một ca.</div>
    </div>
    <PagerBar :text="footText" :page="data?.page || 1" :pages="data?.pages || 1" @page="page = $event" />
  </section>

  <AddStaffDialog v-if="addOpen" @close="closeAdd" @saved="saved(closeAdd)" />
  <BulkShiftDialog v-if="bulkOpen" :usernames="selected" @close="bulkOpen = false" @saved="bulkSaved" />
  <ProfileDrawer v-if="profileUser" :username="profileUser" @close="closeProfile" @saved="saved(closeProfile)" />
</template>

<style scoped>
.ns td {
  height: 58px;
}
.ns .u {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.ns .two .a {
  white-space: nowrap;
}
.ns .two .b {
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
  margin-top: 2px;
  white-space: nowrap;
}
.ns td.cbc,
.ns th.cbc {
  padding-right: 0;
}
.ns .bad {
  color: var(--err-ink);
}
.ns .soft {
  color: var(--muted);
}
.ns tr.open {
  cursor: pointer;
}
.ns tr.open:hover td {
  background: #fafafa;
}
.ns tr.open:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.vr {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}
td.none {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
