<script setup>
// Tab Phép còn lại: phép năm tính đến hôm nay (ngày), cộng theo ngày bắt đầu làm và sinh nhật.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast.js';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { getLeaveLedger, refreshLeave } from '@/services/admin-attendance.js';
import { getLeaveBalances } from '@/services/admin-hr.js';
import { ApiError } from '@/services/http.js';
import { usePeriodStore } from '@/stores/period.js';
import { useSessionStore } from '@/stores/session.js';
import { dmy, initials, num } from '@/utils/format.js';
import PagerBar from './PagerBar.vue';
import SearchBox from './SearchBox.vue';

const period = usePeriodStore();
const session = useSessionStore();
const canRefresh = computed(() => session.caps.includes('profile.write'));
const month = computed(() => period.month);

const TAGS = {
  adj: ['p-gold', 'Có điều chỉnh'],
  neg: ['p-err', 'Phép âm'],
  zero: ['p-draft', 'Hết phép']
};
const CHIPS = [
  ['all', 'Tất cả', 'all'],
  ['neg', 'Phép âm', 'neg'],
  ['zero', 'Hết phép', null],
  ['adj', 'Có điều chỉnh', null]
];

const filter = ref('all');
const q = ref('');
const page = ref(1);
watch([month, filter, q], () => (page.value = 1));
const { data, reload } = useLoad(
  () => getLeaveBalances(month.value, { filter: filter.value, q: q.value, page: page.value }),
  () => [month.value, filter.value, q.value, page.value].join('|')
);

const rows = computed(() => data.value?.rows || []);

// Cập nhật phép: máy chủ tính lại sổ phép của mọi người rồi bảng nạp lại
const refreshing = ref(false);
async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const res = await refreshLeave();
    toast.ok(`Đã cập nhật phép của ${res.accounts} người`);
    reload();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    toast.error(e.message);
  } finally {
    refreshing.value = false;
  }
}

// Sổ phép một người trong năm của tháng đang xem
const KIND_LABEL = {
  start: 'Phép ngày bắt đầu làm',
  month: 'Cộng theo tháng làm',
  seniority: 'Cộng theo thâm niên',
  birthday: 'Cộng sinh nhật',
  expire: 'Hết hạn'
};
const picked = ref(null); // { id, name }
const ledger = ref(null);
const ledgerErr = ref('');
const year = computed(() => month.value.slice(0, 4));
async function openLedger(r) {
  picked.value = { id: r.id, name: r.name };
  ledger.value = null;
  ledgerErr.value = '';
  try {
    const res = await getLeaveLedger({ username: r.id, year: year.value });
    if (picked.value && picked.value.id === r.id) ledger.value = res;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    ledgerErr.value = e.message;
  }
}
const closeLedger = () => (picked.value = null);
const adj = n => (n > 0 ? `+${num(n)}` : num(n));
const footText = computed(() => {
  const d = data.value;
  if (!d || !rows.value.length) return `0 trên ${d?.total || 0} nhân sự có phép năm · ngày`;
  const from = (d.page - 1) * 20 + 1;
  return `${from}–${from + rows.value.length - 1} trên ${d.total} nhân sự có phép năm · ngày`;
});
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Phép năm còn lại</h2>
      <button
        v-if="canRefresh"
        type="button"
        class="btn"
        style="margin-left: auto"
        :disabled="refreshing"
        @click="refresh"
      >
        <Icon name="clock" />Cập nhật phép
      </button>
      <span v-if="data && !data.empty" class="cap"
        >Tính đến {{ dmy(data.asOf) }} · được cộng theo ngày bắt đầu làm và sinh nhật · đã dùng là ngày nghỉ phép đã xin
        tới hôm nay</span
      >
    </div>
    <div class="tools">
      <button
        v-for="[key, label, cnt] in CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: filter === key }"
        @click="filter = key"
      >
        {{ label }} <small v-if="cnt && data?.counts?.[cnt] != null">{{ data.counts[cnt] }}</small>
      </button>
      <SearchBox v-model="q" style="margin-left: auto; width: 220px" />
    </div>
    <table class="tbl">
      <colgroup>
        <col />
        <col style="width: 120px" />
        <col style="width: 120px" />
        <col style="width: 120px" />
        <col style="width: 120px" />
        <col style="width: 160px" />
      </colgroup>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th class="n">Được cộng</th>
          <th class="n">Đã dùng</th>
          <th class="n">Điều chỉnh</th>
          <th class="n">Còn lại</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="row" @click="openLedger(r)">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td class="n">{{ num(r.granted) }}</td>
          <td class="n" :class="{ z: !r.used }">{{ num(r.used) }}</td>
          <td class="n" :class="{ z: !r.adjust }">{{ adj(r.adjust) }}</td>
          <td class="n" :class="r.left < 0 ? 'neg' : 'b'">{{ num(r.left) }}</td>
          <td>
            <span v-if="r.tag" class="pill" :class="TAGS[r.tag][0]">{{ TAGS[r.tag][1] }}</span>
          </td>
        </tr>
        <tr v-if="data && !rows.length">
          <td colspan="6" class="none">
            {{ data.empty ? 'Chưa có dữ liệu phép của tháng này' : 'Không có nhân sự nào phù hợp' }}
          </td>
        </tr>
      </tbody>
    </table>
    <PagerBar :text="footText" :page="data?.page || 1" :pages="data?.pages || 1" @page="page = $event" />
  </section>

  <AppModal
    v-if="picked"
    :title="`Sổ phép năm ${year} · ${picked.name}`"
    :sub="ledger && ledger.on ? `Tính đến ${dmy(ledger.on)}` : ''"
    :width="560"
    @close="closeLedger"
  >
    <p v-if="ledgerErr" class="none-l">{{ ledgerErr }}</p>
    <p v-else-if="ledger && !ledger.hasAccount" class="none-l">Người này không có sổ phép</p>
    <table v-else-if="ledger" class="tbl">
      <thead>
        <tr>
          <th>Ngày</th>
          <th>Nội dung</th>
          <th class="n">Ngày phép</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(e, i) in ledger.events" :key="i">
          <td>{{ dmy(e.onDate) }}</td>
          <td>{{ KIND_LABEL[e.kind] || e.kind }}</td>
          <td class="n" :class="{ neg: e.days < 0 }">{{ adj(e.days) }}</td>
        </tr>
        <tr v-if="!ledger.events.length">
          <td colspan="3" class="none-l">Năm {{ year }} chưa có lần cộng hay hết hạn nào</td>
        </tr>
        <tr>
          <td colspan="2"><b>Còn lại</b></td>
          <td class="n b">{{ num(ledger.balance) }}</td>
        </tr>
      </tbody>
    </table>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="closeLedger">Đóng</button>
    </template>
  </AppModal>
</template>

<style scoped>
.tbl td {
  height: 56px;
}
.tbl td.z {
  color: #a3a3a3;
}
.tbl td.b {
  font-weight: 600;
}
.tbl td.neg {
  color: var(--err-ink);
  font-weight: 600;
}
/* Nhãn "Có điều chỉnh" của trang này (settings.css cũng có .p-gold, cùng dáng) */
.p-gold {
  background: var(--gold-light);
  color: #5c4310;
}
.tbl tr.row {
  cursor: pointer;
}
.none-l {
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
td.none {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
