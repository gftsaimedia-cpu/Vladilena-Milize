<script setup lang="ts">
// Bảng lương (luong.html, bl-t10-*.html, bl-t11-du-cot.html): một màn, nhiều trạng thái theo ?kb= và ?thang=.
//   tháng 2026-10: tam-tinh, da-chot-cong, ban-nhap, cho-phe-duyet, chon-phieu, da-duyet-50, can-tinh-lai,
//                  da-phe-duyet, da-tra-luong (mặc định)
//   tháng 2026-11: mặc định, du-cot
// Nút bước kỳ mở hộp thoại tương ứng (?hop=); xác nhận trong hộp thì chuyển sang kịch bản kế tiếp (router.replace).
// ?phieu=<username> mở ngăn kéo phiếu lương; ?hop=in-tat-ca mở hộp In tất cả phiếu.
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { getPayroll, returnPayslips } from '@/services/admin-payroll';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import { monthLabel } from '@/utils/format';
import ExtrasCard from './parts/ExtrasCard.vue';
import PayrollDialogs from './parts/PayrollDialogs.vue';
import PayrollFormula from './parts/PayrollFormula.vue';
import PayrollTable from './parts/PayrollTable.vue';
import PayrollWideTable from './parts/PayrollWideTable.vue';
import RichText from './parts/RichText.vue';
import SelectionBanner from './parts/SelectionBanner.vue';
import PayslipDrawer from './payslip/PayslipDrawer.vue';
import { describeScenario, printLabel } from './scenarios';

const route = useRoute();
const router = useRouter();
const period = usePeriodStore();

const month = computed(() => period.month);
const kbQuery = computed(() => String(route.query.kb || ''));
const hop = computed(() => String(route.query.hop || ''));
const phieu = computed(() => String(route.query.phieu || ''));

// ---- Dữ liệu ----
const filter = ref('all');
const q = ref('');
const page = ref(1);
const wide = ref(false);
const reloadTick = ref(0);
const baseKey = computed(() => `${month.value}|${kbQuery.value}`);
const loadKey = computed(
  () => `${baseKey.value}|${wide.value}|${filter.value}|${q.value}|${page.value}|${reloadTick.value}`
);
const { data, loading, error, reload } = useLoad(
  () =>
    getPayroll(month.value, {
      kb: kbQuery.value,
      wide: wide.value,
      filter: filter.value,
      q: q.value,
      page: page.value
    }),
  loadKey
);

const facts = computed(() => data.value?.facts);
const ui = computed(() =>
  data.value && !data.value.empty ? describeScenario(month.value, data.value.kb, facts.value) : null
);
const rows = computed(() => data.value?.rows || []);
const monthNo = computed(() => Number(month.value.slice(5, 7)));
const final = computed(() => ui.value?.variant === 'final');
const canVerify = computed(() => useSessionStore().caps.includes('audit.read'));

// ---- Chọn phiếu (kỳ đang chờ phê duyệt) ----
const selected = reactive(new Set());
const others = ref(0);
const selectable = computed(() => rows.value.filter(r => r.status === 'pending'));
const selTotal = computed(() => selected.size + others.value);
let autoSelect = false;

function selectAll() {
  selected.clear();
  for (const r of selectable.value) selected.add(r.username);
  others.value = Math.max(0, (facts.value?.selectable || 0) - selectable.value.length);
}
function toggle(row?) {
  if (selected.has(row.username)) selected.delete(row.username);
  else selected.add(row.username);
}
function clearSelection() {
  selected.clear();
  others.value = 0;
  if (data.value?.kb === 'chon-phieu') go('cho-phe-duyet');
}
async function returnSelected() {
  try {
    await returnPayslips(month.value, [...selected]);
  } catch (e) {
    toast.error(e.message);
    return;
  }
  selected.clear();
  others.value = 0;
  refresh();
}
const batchNames = computed(() => {
  const names = rows.value.filter(r => selected.has(r.username)).map(r => r.name);
  return others.value ? [...names, ...(facts.value?.selectedOtherNames || [])] : names;
});
const batchMore = computed(() => (others.value ? facts.value?.selectedOtherMore || 0 : 0));

// ---- Đổi kỳ / kịch bản: về trạng thái đầu ----
watch(
  baseKey,
  () => {
    filter.value = 'all';
    q.value = '';
    page.value = 1;
    wide.value = kbQuery.value === 'du-cot';
    selected.clear();
    others.value = 0;
    autoSelect = true;
  },
  { immediate: true }
);
watch(loading, isLoading => {
  const d = data.value;
  if (isLoading || !d || d.empty) return;
  if (d.strip) period.setStrip(d.strip);
  else period.resetStrip();
  if (autoSelect) {
    autoSelect = false;
    if (d.kb === 'chon-phieu') selectAll();
  }
});
watch([filter, q], () => (page.value = 1));

// ---- Đi tới kịch bản kế tiếp, mở/đóng hộp ----
function queryWith(patch?) {
  const next = { ...route.query, ...patch };
  for (const k of Object.keys(next)) if (next[k] === '' || next[k] == null) delete next[k];
  return next;
}
const go = (kb?) => router.replace({ query: queryWith({ kb, hop: '' }) });
const openHop = (name?) => router.replace({ query: queryWith({ hop: name }) });
const closeHop = () => router.replace({ query: queryWith({ hop: '' }) });
const refresh = () => {
  reloadTick.value++;
};
function finishHop(kb?) {
  if (kb && kb !== data.value?.kb) go(kb);
  else closeHop();
  refresh();
}
const reopenTarget = ref(null);
function reopen(step?, kb?, label?) {
  reopenTarget.value = { step, kb, label };
  openHop('mo-lai');
}

function onAction(key?) {
  const map = {
    formula: () => router.push('/admin/cai-dat'), // Cài đặt › Cách tính lương
    close: () => openHop('chot-cong'),
    'reopen-hours': () => reopen('hours', 'tam-tinh', 'Mở lại công'),
    calc: () => openHop('tinh-luong'),
    reopen: () => reopen('draft', 'ban-nhap', 'Mở lại'),
    'approve-period': () => openHop('phe-duyet-ky'),
    'reopen-period': () => reopen('approval', 'cho-phe-duyet', 'Mở lại kỳ'),
    paid: () => openHop('da-tra-luong'),
    print: () => openHop('in-tat-ca')
  };
  map[key]?.();
}
function toggleWide() {
  wide.value = !wide.value;
}

// Phiếu lương một người (ngăn kéo của nhóm phiếu lương)
const openPayslip = (row?) => router.replace({ query: queryWith({ phieu: row.username }) });
const closePayslip = () => {
  router.replace({ query: queryWith({ phieu: '' }) });
  refresh();
};
const payslipName = computed(() => rows.value.find(r => r.username === phieu.value)?.name || '');
</script>

<template>
  <template v-if="data && data.empty">
    <div class="title">
      <div>
        <h1>Bảng lương</h1>
        <p>Chưa có bảng lương cho {{ monthLabel(month) }}</p>
      </div>
    </div>
  </template>

  <template v-else-if="ui">
    <div class="title">
      <div>
        <h1>Bảng lương</h1>
        <p><RichText :segs="ui.sub" /></p>
      </div>
      <div class="acts">
        <button
          v-for="a in ui.actions"
          :key="a.key"
          type="button"
          class="btn"
          :class="{ pri: a.pri, off: a.off }"
          @click="onAction(a.key)"
        >
          <Icon :name="a.icon" />{{ a.label }}
          <small v-if="a.small">{{ a.small }}</small>
        </button>
      </div>
    </div>
    <div v-if="ui.note" class="topnote">
      <div class="note" :class="ui.note.cls">
        <Icon :name="ui.note.icon" />
        <div><RichText :segs="ui.note.segs" /></div>
      </div>
    </div>

    <PayrollFormula :formula="data.formula" />

    <section class="card">
      <div class="card-h">
        <h2>Bảng lương tháng {{ monthNo }}{{ wide ? ' · đủ cột' : '' }}</h2>
        <span class="cap"><RichText :segs="ui.cap" /></span>
      </div>
      <div class="tools">
        <button
          v-for="[key, label, count] in data.chips"
          :key="key"
          type="button"
          class="chip"
          :class="{ on: filter === key }"
          @click="filter = key"
        >
          {{ label }}
          <small v-if="count != null">{{ count }}</small>
        </button>
        <label class="search">
          <Icon name="search" :size="14" />
          <input v-model.trim="q" type="search" placeholder="Tìm nhân sự" aria-label="Tìm nhân sự" />
        </label>
        <button type="button" class="btn sm" :class="{ on: wide }" @click="toggleWide">
          {{ wide ? 'Thu gọn cột' : 'Xem đủ cột' }}
        </button>
        <button v-if="final && canVerify" type="button" class="btn sm" @click="openHop('kiem-tra-lai')">
          <Icon name="check" />Kiểm tra lại
        </button>
        <button v-if="ui.printInTools" type="button" class="btn sm" @click="onAction('print')">
          <Icon name="print" />{{ printLabel(facts) }}
        </button>
      </div>

      <SelectionBanner
        v-if="ui.selection && !final && !wide"
        :total="selTotal"
        :on-page="selected.size"
        :others="others"
        @select-all="selectAll"
        @clear="clearSelection"
        @return="returnSelected"
        @approve="openHop('phe-duyet-50')"
      />

      <PayrollWideTable v-if="wide" :rows="rows" :estimated="!final" @open="openPayslip" />
      <PayrollTable
        v-else
        :rows="rows"
        :variant="ui.variant"
        :selected="selected"
        @open="openPayslip"
        @toggle="toggle"
      />
      <div v-if="!rows.length && !loading" class="none">Không có phiếu nào khớp.</div>

      <div class="foot">
        <span v-if="data.paging.to">
          {{ data.paging.from }}–{{ data.paging.to }} trên {{ data.paging.total }} phiếu
        </span>
        <span v-else>0 phiếu</span>
        <span class="pager">
          <span>Trang {{ data.paging.page }}/{{ data.paging.pageCount }}</span>
          <button type="button" class="pb" aria-label="Trang trước" :disabled="page <= 1" @click="page--">
            <Icon name="chevl" />
          </button>
          <button
            type="button"
            class="pb"
            aria-label="Trang sau"
            :disabled="page >= data.paging.pageCount"
            @click="page++"
          >
            <Icon name="chevr" />
          </button>
        </span>
      </div>
    </section>

    <ExtrasCard v-if="ui.extras" :month="month" :version="reloadTick" @add="openHop('them-khoan')" />
  </template>

  <div v-else-if="error" class="state-msg">
    Không tải được bảng lương. <button type="button" class="link" @click="reload">Thử lại</button>
  </div>

  <!-- Hộp thoại các bước kỳ lương -->
  <PayrollDialogs
    v-if="data && !data.empty && hop"
    :hop="hop"
    :data="data"
    :selection="{ usernames: [...selected], others, names: batchNames, more: batchMore, total: selTotal }"
    :reopen-target="reopenTarget"
    @close="closeHop"
    @finish="finishHop"
  />

  <PayslipDrawer
    v-if="phieu && data && !data.empty"
    :month="month"
    :username="phieu"
    :name="payslipName"
    :scenario="data.kb"
    @close="closePayslip"
  />
</template>

<style scoped>
.topnote {
  margin: -8px 0 20px;
}
.tools .search {
  margin-left: auto;
  width: 190px;
}
.tools .search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
  padding: 0;
}
.tools .search input::placeholder {
  color: var(--faint);
}
.tools .search input::-webkit-search-cancel-button {
  appearance: none;
}
.tools .search:focus-within {
  border-color: var(--text);
}
.btn.sm.on {
  background: var(--text);
  color: #fff;
  border-color: var(--text);
}
.btn.off {
  cursor: pointer;
}
.btn.off:disabled {
  cursor: default;
}
.pb:disabled {
  opacity: 0.4;
  cursor: default;
}
.none {
  padding: 28px 24px 32px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  border-top: 1px solid var(--rule);
}
.state-msg {
  padding: 40px 0;
  color: var(--muted);
}
</style>
