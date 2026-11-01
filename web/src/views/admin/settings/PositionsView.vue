<script setup lang="ts">
// Cài đặt › Chức vụ và bậc: danh mục chức vụ, bậc lương và phụ cấp theo bậc của tháng đang xem.
// Sửa chức vụ, sửa bậc, thêm bậc kế tiếp chỉ có khi tài khoản có quyền config.payroll.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getPositions } from '@/services/admin-catalog';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import { monthLabel } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import LevelDialog from './positions/LevelDialog.vue';
import PositionDialog from './positions/PositionDialog.vue';

const period = usePeriodStore();
const canEdit = computed(() => useSessionStore().caps.includes('config.payroll'));
const { data, loading, error, reload } = useLoad(
  () => getPositions(period.month),
  () => period.month
);

// Hộp thoại đang mở: { kind: 'position' | 'level', code, level }
const dlg = ref(null);
const openPosition = (code?) => (dlg.value = { kind: 'position', code, level: 0 });
const openLevel = (code?, level?) => (dlg.value = { kind: 'level', code, level });
const rowOf = (code?) => (data.value && data.value.positions.find(p => p.code === code)) || null;
const dlgRow = computed(() => (dlg.value ? rowOf(dlg.value.code) : null));
</script>

<template>
  <SettingsFrame active="chuc-vu">
    <template #sub>
      <template v-if="data && !error">
        {{ data.positionCount }} chức vụ, {{ data.levelCount }} bậc · {{ monthLabel(data.month) }}
      </template>
    </template>

    <section v-if="error && !data" class="card">
      <div class="later"><Icon name="alert" />{{ error.message }}</div>
      <div class="later"><button type="button" class="btn sm" @click="reload">Thử lại</button></div>
    </section>
    <section v-else-if="!data" class="card" aria-busy="true">
      <div class="later">{{ loading ? 'Đang tải' : '' }}</div>
    </section>
    <section v-else-if="!data.positions.length" class="card">
      <div class="later">Chưa có chức vụ trong danh mục</div>
    </section>

    <template v-else>
      <section v-for="p in data.positions" :key="p.code" class="card">
        <div class="card-h">
          <h2>{{ p.name }}</h2>
          <span v-if="p.since" class="cap">{{ p.since }}</span>
          <div v-if="canEdit" class="r">
            <button type="button" class="btn sm" :aria-label="`Sửa chức vụ ${p.name}`" @click="openPosition(p.code)">
              <Icon name="edit" :size="14" />Sửa
            </button>
          </div>
        </div>
        <dl class="facts">
          <div v-for="f in p.facts" :key="f.label">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        </dl>
        <div class="bens">
          <span class="lbl">Quyền lợi đang bật</span>
          <span v-if="p.benefits.length" class="pills">
            <span v-for="b in p.benefits" :key="b" class="pill p-done">{{ b }}</span>
          </span>
          <span v-else class="cap">Không có</span>
        </div>
        <div class="card-h sec">
          <h2>Bậc</h2>
          <span class="cap">{{ p.levels.length }} bậc</span>
          <div v-if="canEdit" class="r">
            <button type="button" class="btn sm" @click="openLevel(p.code, 0)">
              <Icon name="plus" :size="14" />Thêm bậc
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bậc</th>
              <th>Tên</th>
              <th class="n">Lương cơ bản</th>
              <th class="n">Lương KPI tối đa</th>
              <th class="n">Phụ cấp đêm</th>
              <th v-if="canEdit"><span class="sr">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!p.levels.length">
              <td :colspan="canEdit ? 6 : 5" class="cap">Chưa có bậc</td>
            </tr>
            <tr v-for="l in p.levels" :key="l.level">
              <td>{{ l.level }}</td>
              <td>{{ l.name }}</td>
              <td class="n">{{ l.base }}</td>
              <td class="n">
                <span v-if="l.kpi">{{ l.kpi }}</span
                ><span v-else class="cap">Không có</span>
              </td>
              <td class="n">
                <span v-if="l.night">{{ l.night }}</span
                ><span v-else class="cap">Theo chức vụ</span>
              </td>
              <td v-if="canEdit" class="n">
                <button
                  type="button"
                  class="btn sm"
                  :aria-label="`Sửa bậc ${l.level} của ${p.name}`"
                  @click="openLevel(p.code, l.level)"
                >
                  Sửa
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </SettingsFrame>

  <PositionDialog
    v-if="dlg && dlg.kind === 'position' && dlgRow"
    :key="`p-${dlg.code}`"
    :row="dlgRow.raw"
    @close="dlg = null"
    @saved="reload"
    @stale="reload"
  />
  <LevelDialog
    v-if="dlg && dlg.kind === 'level' && dlgRow"
    :key="`l-${dlg.code}-${dlg.level}`"
    :row="dlgRow.raw"
    :level="dlg.level"
    @close="dlg = null"
    @saved="reload"
    @stale="reload"
  />
</template>

<style scoped>
.later {
  padding: 24px;
  color: var(--muted);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 4px 24px 16px;
}
.facts dt {
  font-size: 12px;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bens {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px 16px;
  flex-wrap: wrap;
}
.bens .lbl {
  font-size: 12px;
  color: var(--muted);
}
.pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sec {
  border-top: 1px solid var(--rule);
}
.cap {
  color: var(--muted);
  font-size: 13px;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
