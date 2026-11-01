<script setup lang="ts">
// Cài đặt › Nhật ký thay đổi: ai làm gì, lúc nào, đổi từ gì sang gì (25 dòng một trang, lọc theo người/mục/ngày).
import { reactive, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAuditLog, verifyAuditLog } from '@/services/admin-settings';
import { dayLong } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import FieldDate from './fields/FieldDate.vue';
import SelectBox from './fields/SelectBox.vue';

const EMPTY = { who: '', action: '', from: '', to: '' };
const box = reactive({ ...EMPTY }); // ô lọc đang nhập
const applied = ref({ ...EMPTY }); // bộ lọc đang áp dụng (bấm Lọc mới đổi)
const page = ref(1);
const { data } = useLoad(
  () => getAuditLog({ page: page.value, ...applied.value }),
  () => [page.value, applied.value]
);

function apply() {
  applied.value = { ...box };
  page.value = 1;
}
function clear() {
  Object.assign(box, EMPTY);
  apply();
}

// Mục gộp (×17) mở ra thành từng dòng
const opened = ref(new Set());
const toggle = (id?) => {
  const next = new Set<any>(opened.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  opened.value = next;
};

const checking = ref(false);
const checked = ref(null);
async function verify() {
  checking.value = true;
  try {
    const res = await verifyAuditLog();
    if (res.ok) checked.value = res;
    else toast.error(res.reason || `Dòng ${res.firstBadId} không khớp`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    checking.value = false;
  }
}
const dayText = (iso?) => `${dayLong(iso)}/${iso.slice(0, 4)}`;
</script>

<template>
  <SettingsFrame active="nhat-ky">
    <template #sub>{{ data ? data.total : 0 }} dòng · ghi lại ai làm gì, lúc nào, đổi từ gì sang gì</template>
    <template #acts>
      <button type="button" class="btn" :disabled="checking" @click="verify">
        <Icon :name="checked ? 'check' : 'shield'" />
        {{ checked ? `Nhật ký nguyên vẹn · đã kiểm tra ${checked.checked} dòng` : 'Kiểm tra nhật ký không bị sửa' }}
      </button>
    </template>

    <section v-if="data" class="card">
      <div class="flt">
        <div>
          <label>Người</label>
          <SelectBox v-model="box.who" :options="[{ value: '', label: 'Tất cả' }, ...data.people]" label="Người" />
        </div>
        <div>
          <label>Mục</label>
          <SelectBox
            v-model="box.action"
            :options="[{ value: '', label: 'Tất cả' }, ...data.actions.map(a => ({ value: a, label: a }))]"
            label="Mục"
          />
        </div>
        <div><label>Từ ngày</label><FieldDate v-model="box.from" label="Từ ngày" /></div>
        <div><label>Đến ngày</label><FieldDate v-model="box.to" label="Đến ngày" /></div>
        <div style="display: flex; gap: 8px">
          <button type="button" class="btn sm pri" @click="apply"><Icon name="search" />Lọc</button>
          <button type="button" class="btn sm" @click="clear">Xoá lọc</button>
        </div>
      </div>

      <table class="tbl lg">
        <colgroup>
          <col style="width: 84px" />
          <col style="width: 150px" />
          <col style="width: 190px" />
          <col />
          <col style="width: 200px" />
        </colgroup>
        <thead>
          <tr>
            <th>Lúc</th>
            <th>Người</th>
            <th>Việc</th>
            <th>Thay đổi</th>
            <th>Lý do</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="d in data.days" :key="d.day">
            <tr class="day">
              <td colspan="5">{{ dayText(d.day) }}</td>
            </tr>
            <template v-for="e in d.rows" :key="e.id">
              <tr v-for="n in e.count > 1 && opened.has(e.id) ? e.count : 1" :key="n">
                <td class="tm">{{ e.time }}</td>
                <td>
                  <div class="t">{{ e.whoName }}</div>
                  <div class="s">{{ e.who }}</div>
                </td>
                <td class="v">
                  {{ e.action }}
                  <template v-if="e.count > 1 && !opened.has(e.id)">
                    <span class="x">× {{ e.count }}</span>
                    <div class="s">
                      {{ e.count }} dòng giống nhau được gộp ·
                      <button type="button" class="link" @click="toggle(e.id)">Mở ra</button>
                    </div>
                  </template>
                  <div v-else-if="e.count > 1 && n === 1" class="s">
                    <button type="button" class="link" @click="toggle(e.id)">Gộp lại</button>
                  </div>
                </td>
                <td class="df">
                  <div v-for="(c, i) in e.changes" :key="i">
                    {{ c.text }}<code v-if="c.code">{{ c.code }}</code>
                  </div>
                </td>
                <td class="ly">{{ e.reason }}</td>
              </tr>
            </template>
          </template>
          <tr v-if="!data.days.length">
            <td colspan="5" class="none">Không có dòng nào khớp bộ lọc</td>
          </tr>
        </tbody>
      </table>
      <div class="foot">
        <span>{{ data.rangeLabel }}</span>
        <span class="pager">
          <span>Trang {{ data.page }}/{{ data.pages }}</span>
          <button
            type="button"
            class="pb"
            aria-label="Trang trước"
            :disabled="data.page <= 1"
            @click="page = data.page - 1"
          >
            <Icon name="chevl" />
          </button>
          <button
            type="button"
            class="pb"
            aria-label="Trang sau"
            :disabled="data.page >= data.pages"
            @click="page = data.page + 1"
          >
            <Icon name="chevr" />
          </button>
        </span>
      </div>
    </section>
  </SettingsFrame>
</template>

<style scoped>
.flt {
  display: grid;
  grid-template-columns: 1fr 1fr 150px 150px auto;
  gap: 12px;
  align-items: end;
  padding: 18px 24px 16px;
}
.flt label {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.flt .sel,
.flt .fi {
  width: 100%;
  justify-content: space-between;
  font-weight: 400;
}
.flt .fi {
  justify-content: flex-start;
}
.lg td {
  height: auto;
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: top;
  white-space: normal;
}
.lg .day td {
  padding-top: 8px;
  padding-bottom: 8px;
  background: var(--raised);
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}
.lg .tm {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.lg .t {
  font-weight: 500;
}
.lg .s {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.lg .v {
  font-weight: 500;
}
.lg .v .x {
  display: inline-block;
  margin-left: 6px;
  font-size: 12px;
  font-weight: 600;
  background: #eeeeee;
  border-radius: 999px;
  padding: 0 7px;
}
.lg .df {
  font-size: 13px;
  line-height: 20px;
}
.lg .df code {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: var(--muted);
  margin-left: 4px;
}
.lg .ly {
  color: var(--muted);
  font-size: 13px;
  line-height: 20px;
}
.lg .none {
  text-align: center;
  color: var(--muted);
  height: 80px;
  vertical-align: middle;
}
.pb:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
