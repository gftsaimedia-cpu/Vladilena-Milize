<script setup lang="ts">
// Tab Hôm nay: lượt Check-in/out mới nhất của từng người theo giờ máy chủ.
import { computed, ref, watch } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { getToday } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { dayLong, initials } from '@/utils/format';
import PagerBar from './PagerBar.vue';
import SearchBox from './SearchBox.vue';

const period = usePeriodStore();
const month = computed(() => period.month);

const STATUS = {
  'checked-in': ['p-in', 'Đã Check-in'],
  'checked-out': ['p-done', 'Đã Check-out'],
  pending: ['p-pend', 'Chờ xử lý'],
  approved: ['p-done', 'Được phê duyệt'],
  rejected: ['p-err', 'Bị từ chối'],
  admin: ['p-done', 'Đã chấm công (Admin)'],
  in: ['p-in', 'Đang trong ca'],
  soon: ['p-draft', 'Chưa tới ca'],
  none: ['p-draft', 'Chưa có lượt']
};
const CHIPS = [
  ['all', 'Tất cả', 'all'],
  ['in', 'Đang trong ca', 'in'],
  ['none', 'Chưa có lượt', null],
  ['late', 'Đi trễ', null]
];

const filter = ref('all');
const q = ref('');
const page = ref(1);
watch([month, filter, q], () => (page.value = 1));
const { data } = useLoad(
  () => getToday(month.value, { filter: filter.value, q: q.value, page: page.value }),
  () => [month.value, filter.value, q.value, page.value].join('|')
);

const rows = computed(() => data.value?.rows || []);
const heading = computed(
  () => `Hôm nay · ${dayLong(data.value.date).replace(', ', ' ')}/${data.value.date.slice(0, 4)}`
);
const footText = computed(() => {
  const d = data.value;
  if (!d || !rows.value.length) return `0 trên ${d?.total || 0} nhân sự`;
  const from = (d.page - 1) * 20 + 1;
  return `${from}–${from + rows.value.length - 1} trên ${d.total} nhân sự`;
});
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ data && !data.empty ? heading : 'Hôm nay' }}</h2>
      <span v-if="data && !data.empty" class="cap"
        >Lượt Check-in/out mới nhất của từng người theo giờ máy chủ · cập nhật lúc {{ data.updatedAt }}</span
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
        <col style="width: 220px" />
        <col style="width: 90px" />
        <col style="width: 90px" />
        <col style="width: 90px" />
        <col style="width: 160px" />
        <col style="width: 90px" />
      </colgroup>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th>Ca</th>
          <th class="n">Vào</th>
          <th class="n">Ra</th>
          <th class="n">Trễ</th>
          <th>Trạng thái</th>
          <th class="n">Số lượt</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td>
            <template v-if="r.shiftLabel">{{ r.shiftLabel }}</template>
            <span v-else class="bad">Chưa có ca</span>
          </td>
          <td class="n" :class="{ z: !r.checkIn }">{{ r.checkIn || '—' }}</td>
          <td class="n" :class="{ z: !r.checkOut }">{{ r.checkOut || '—' }}</td>
          <td class="n">
            <span v-if="r.lateMin" class="late">{{ r.lateMin }}'</span>
          </td>
          <td>
            <span class="pill" :class="STATUS[r.status][0]">{{ STATUS[r.status][1] }}</span>
          </td>
          <td class="n" :class="{ z: !r.count }">{{ r.count }}</td>
        </tr>
        <tr v-if="data && !rows.length">
          <td colspan="7" class="none">
            {{ data.empty ? 'Chưa có dữ liệu chấm công của tháng này' : 'Không có nhân sự nào phù hợp' }}
          </td>
        </tr>
      </tbody>
    </table>
    <PagerBar :text="footText" :page="data?.page || 1" :pages="data?.pages || 1" @page="page = $event" />
  </section>
</template>

<style scoped>
.tbl td {
  height: 56px;
}
.tbl td.z {
  color: #a3a3a3;
}
.p-in {
  background: var(--gold-light);
  color: #5c4310;
}
.bad {
  color: var(--err-ink);
}
.late {
  color: var(--pend-ink);
  font-weight: 600;
}
td.none {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
