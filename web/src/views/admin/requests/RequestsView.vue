<script setup lang="ts">
// Yêu cầu (duyet, yc-moi-thang): hai chế độ xem theo route (meta.scope):
//   'thang'     /admin/yeu-cau            yêu cầu của tháng hiện tại, chia nhóm Có cảnh báo AI / Không có cảnh báo
//   'moi-thang' /admin/yeu-cau/moi-thang  thêm các tháng trước (AI chưa kiểm tra)
// ?hop=dong-y-5 mở hộp đồng ý cả loạt.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { countWaiting } from '@/builders/admin-requests/explanations';
import { listWaitingExplanations } from '@/services/admin-explanations';
import { approveRequest, getOlderRequests, getRequests, rejectRequest } from '@/services/admin-main';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import AdvanceGroup from './AdvanceGroup.vue';
import BulkApproveDialog from './BulkApproveDialog.vue';
import ExplanationsGroup from './ExplanationsGroup.vue';
import GroupClean from './GroupClean.vue';
import GroupHistory from './GroupHistory.vue';
import GroupOlder from './GroupOlder.vue';
import { monthNo } from './helpers';
import SelectBox from './SelectBox.vue';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
// Nhóm đang xem: yêu cầu theo ngày, giải trình, tạm ứng (hai nhóm sau chỉ khi có năng lực duyệt)
const { data: waitingExplanations, reload: reloadWaiting } = useLoad(listWaitingExplanations);
const waitingCount = computed(() => countWaiting(waitingExplanations.value));
watch(
  () => route.query.nhom,
  nhom => {
    if (nhom === 'giai-trinh') group.value = 'giai-trinh';
  }
);
const groups = computed(() => [
  ['duyet', 'Yêu cầu'],
  ...(session.caps.includes('attendance.correct')
    ? [['giai-trinh', waitingCount.value ? `Giải trình (${waitingCount.value})` : 'Giải trình']]
    : []),
  ...(session.caps.includes('request.decide.*') || session.caps.includes('request.decide.advance')
    ? [['tam-ung', 'Tạm ứng']]
    : [])
]);
const group = ref(route.query.nhom === 'giai-trinh' ? 'giai-trinh' : 'duyet'); // ?nhom=giai-trinh mở sẵn nhóm Giải trình
const period = usePeriodStore();
const scope = computed(() => (route.meta.scope === 'moi-thang' ? 'moi-thang' : 'thang'));

const TABS = [
  ['cho', 'Chờ xử lý', 'pending'],
  ['dong-y', 'Đã đồng ý', 'approved'],
  ['tu-choi', 'Đã từ chối', 'rejected'],
  ['tat-ca', 'Tất cả', 'all']
];
const tab = ref('cho');
const kind = ref('');
const query = ref('');

const { data, reload } = useLoad(
  () => getRequests({ tab: tab.value, scope: scope.value, kind: kind.value, q: query.value }),
  () => [tab.value, scope.value, kind.value, query.value, period.month]
);

const counts = computed(() => data.value?.counts);
const month = computed(() => monthNo(counts.value?.currentMonth));
const items = computed(() => data.value?.items || []);
const clean = computed(() => items.value);
const kindOptions = computed(() => [
  { value: '', label: 'Mọi loại yêu cầu' },
  ...(data.value?.kinds || []).map(k => ({ value: k, label: k }))
]);

// Tháng trước: trang đầu từ getRequests, "Xem thêm" nối thêm
const olderMore = ref([]);
const olderExhausted = ref(false);
const older = computed(() => [...(data.value?.older?.items || []), ...olderMore.value]);
const olderTotal = computed(() => data.value?.older?.total || 0);
async function loadMore() {
  const res = await getOlderRequests({ kind: kind.value, q: query.value, offset: older.value.length });
  olderMore.value.push(...res.items);
  if (!res.items.length) olderExhausted.value = true;
}

// Ô tick: mặc định chọn hết nhóm "Không có cảnh báo" mỗi lần tải
const selected = ref([]);
watch(
  data,
  () => {
    olderMore.value = [];
    olderExhausted.value = false;
    selected.value = clean.value.map(r => r.id);
  },
  { immediate: true }
);
const selectedItems = computed(() => clean.value.filter(r => selected.value.includes(r.id)));

// Hộp và ngăn kéo
const bulkOpen = ref(false);
let openedHop = '';
watch(
  () => [route.query.hop, data.value],
  ([hop, d]: any) => {
    if (!hop) openedHop = '';
    if (!d || !hop || hop === openedHop) return;
    openedHop = hop;
    if (hop === 'dong-y-5') bulkOpen.value = true;
  },
  { immediate: true }
);

async function approve(r?) {
  await approveRequest(r.id);
  reload();
}
async function reject(r?) {
  await rejectRequest(r.id);
  reload();
}
function setScope(next?) {
  if (next === scope.value) return;
  const q = route.query.thang ? { thang: route.query.thang } : {};
  router.push({ path: next === 'thang' ? '/admin/yeu-cau' : '/admin/yeu-cau/moi-thang', query: q });
}
</script>

<template>
  <div v-if="counts">
    <div class="title">
      <div>
        <h1>Yêu cầu</h1>
        <p v-if="scope === 'thang'">
          <b>{{ counts.pendingMonth }} yêu cầu</b> của tháng {{ month }} đang chờ bạn · còn
          {{ counts.pendingOlder }} yêu cầu của các tháng trước
        </p>
        <p v-else>
          <b>{{ counts.pending }} yêu cầu</b> đang chờ bạn · {{ counts.pendingMonth }} của tháng {{ month }},
          {{ counts.pendingOlder }} của các tháng trước
        </p>
      </div>
    </div>

    <div v-if="groups.length > 1" class="tabs">
      <button
        v-for="[key, label] in groups"
        :key="key"
        type="button"
        class="tab"
        :class="{ on: group === key }"
        @click="group = key"
      >
        {{ label }}
      </button>
    </div>
    <ExplanationsGroup v-if="group === 'giai-trinh'" @changed="reloadWaiting" />
    <AdvanceGroup v-else-if="group === 'tam-ung'" />
    <template v-else>
      <div class="tabs">
        <button
          v-for="[key, label, field] in TABS"
          :key="key"
          type="button"
          class="tab"
          :class="{ on: tab === key }"
          @click="tab = key"
        >
          {{ label }} <small>{{ counts[field] }}</small>
        </button>
      </div>
      <div class="ctl">
        <span class="seg">
          <button type="button" :class="{ on: scope === 'thang' }" @click="setScope('thang')">
            Tháng {{ month }} · {{ counts.pendingMonth }}
          </button>
          <button type="button" :class="{ on: scope === 'moi-thang' }" @click="setScope('moi-thang')">
            Mọi tháng · {{ counts.pending }}
          </button>
        </span>
        <SelectBox v-model="kind" :options="kindOptions" label="Loại yêu cầu" />
        <label class="search" style="margin-left: auto">
          <Icon name="search" :size="14" />
          <input v-model="query" type="search" placeholder="Tìm tên nhân sự" aria-label="Tìm tên nhân sự" />
        </label>
      </div>

      <template v-if="tab === 'cho'">
        <template v-if="scope === 'thang'">
          <GroupClean
            v-if="clean.length"
            v-model:selected="selected"
            :items="clean"
            :older-count="counts.pendingOlder"
            @all-months="setScope('moi-thang')"
            @approve-selected="bulkOpen = true"
            @approve="approve"
            @reject="reject"
          />
          <section v-if="!items.length" class="card"><div class="later">Không có yêu cầu nào đang chờ.</div></section>
        </template>
        <template v-else>
          <section class="card" style="margin-bottom: 24px">
            <div class="sumc">
              <h2>Tháng {{ month }}</h2>
              <span class="cap">{{ items.length }} yêu cầu</span>
              <span class="cap">· {{ clean.length }} có thể đồng ý cả loạt</span>
              <button type="button" class="btn sm" @click="setScope('thang')">Xem tháng {{ month }}</button>
            </div>
          </section>
          <GroupOlder
            :items="older"
            :total="olderTotal"
            :can-more="!olderExhausted && older.length < olderTotal"
            @approve="approve"
            @reject="reject"
            @more="loadMore"
          />
        </template>
      </template>
      <GroupHistory v-else :items="items" :total="counts[TABS.find(t => t[0] === tab)[2]]" />
    </template>

    <BulkApproveDialog
      v-if="bulkOpen && selectedItems.length"
      :items="selectedItems"
      @close="bulkOpen = false"
      @done="reload"
    />
  </div>
</template>

<style scoped>
.ctl {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -4px 0 20px;
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
}
.search:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sumc {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 24px;
}
.sumc h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.sumc .cap {
  color: var(--muted);
  font-size: 13px;
}
.sumc .btn {
  margin-left: auto;
}
.sumc .aic {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
}
.sumc .aic svg {
  color: var(--accent);
}
.later {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  color: var(--muted);
}
</style>
