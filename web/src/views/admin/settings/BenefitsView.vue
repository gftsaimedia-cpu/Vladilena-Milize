<script setup lang="ts">
// Cài đặt › Chế độ theo loại nhân sự: ba thẻ Thực tập sinh / Chuyên trách viên / Nhân viên, mỗi thẻ hai bảng theo bậc
// (phụ cấp, lương KPI, iDorm và loại yêu cầu được gửi). Gõ hoặc tick ngay trong ô, "Xem trước và lưu" để áp dụng.
// Địa chỉ: /admin/cai-dat/che-do[/chuyen-trach | /nhan-vien] · ?hop=them-che-do mở hộp thêm khoản phụ cấp.
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getBenefits, saveBenefits } from '@/services/admin-settings';
import { getAllowanceFlags, previewBenefits } from '@/services/admin-config';
import { useSessionStore } from '@/stores/session';
import { dmy, vndc } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import AddAllowanceDialog from './benefits/AddAllowanceDialog.vue';
import ConfirmFlagsDialog from './benefits/ConfirmFlagsDialog.vue';
import PreviewDialog from './benefits/PreviewDialog.vue';
import CheckBox from './fields/CheckBox.vue';
import FieldNum from './fields/FieldNum.vue';
import SaveBar from './fields/SaveBar.vue';
import { PATHS } from './nav';
import { useDraft } from './lib/useDraft';
import { useHop } from './lib/useHop';

const route = useRoute();
const { data, reload } = useLoad(() => getBenefits());
const form = useDraft(() => data.value);
const { draft } = form;
const { hop, open, close } = useHop(['them-che-do']);

// Cờ miễn thuế, bảo hiểm của các khoản phụ cấp thêm và dấu xác nhận của Kế toán
const session = useSessionStore();
const { data: flags, reload: reloadFlags } = useLoad(() => getAllowanceFlags());
const canConfirm = computed(() => session.caps.includes('config.legal'));
const confirming = ref(null);
const taxText = (r?) => (r.tax === 'full' ? 'Miễn toàn bộ' : r.tax === 'cap' ? `Miễn đến ${vndc(r.taxCap)}` : 'Không');
const flagsText = (r?) => `Thuế: ${taxText(r)} · BH: ${r.insuranceBase ? 'Có' : 'Không'}`;

// Bấm lưu: hỏi máy chủ tác động trước, hộp xem trước hiện lỗi và cảnh báo nguyên văn; bấm Lưu trong hộp mới ghi.
const preview = ref(null);
const previewing = ref(false);
async function onPreview() {
  if (previewing.value || form.saving.value) return;
  previewing.value = true;
  form.error.value = '';
  try {
    preview.value = await previewBenefits(JSON.parse(JSON.stringify(draft.value)));
  } catch (e) {
    form.error.value = e && e.message ? e.message : 'Không xem trước được.';
  } finally {
    previewing.value = false;
  }
}
async function onConfirm() {
  if (form.saving.value) return;
  await form.save(d => saveBenefits(d));
  preview.value = null;
}

const tabPath = (key?) => (key === 'thuc-tap-sinh' ? PATHS.cheDo : `${PATHS.cheDo}/${key}`);
const current = computed(() => {
  if (!draft.value) return null;
  const key = route.params.loai || 'thuc-tap-sinh';
  return draft.value.types.find(t => t.key === key) || draft.value.types[0];
});
</script>

<template>
  <SettingsFrame active="quyen-loi">
    <template #sub>
      <template v-if="current">
        {{ current.name }} · {{ current.count }} người, {{ current.levels.length }} bậc · tick hoặc gõ mức ngay trong ô,
        bấm Xem trước và lưu để áp dụng
      </template>
    </template>

    <section v-if="draft && current" class="card">
      <div class="tabs in">
        <RouterLink
          v-for="t in draft.types"
          :key="t.key"
          :to="tabPath(t.key)"
          class="tab"
          :class="{ on: t.key === current.key }"
        >
          {{ t.name }} <small>{{ t.count }}</small>
        </RouterLink>
        <span class="r">
          <RouterLink :to="PATHS.nhatKy" class="link">Nhật ký</RouterLink>
          <button type="button" class="btn sm" @click="open('them-che-do')"><Icon name="plus" />Thêm chế độ</button>
        </span>
      </div>

      <div class="sh">
        <h3>Phụ cấp và lương KPI</h3>
        <span>Mức theo từng bậc của {{ current.name }}</span>
      </div>
      <table class="tbl ql">
        <colgroup>
          <col style="width: 120px" />
          <col v-for="c in draft.columns" :key="c.key" />
        </colgroup>
        <thead>
          <tr>
            <th>Bậc</th>
            <th v-for="c in draft.columns" :key="c.key" class="c">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lv in current.levels" :key="lv.name">
            <td class="b">{{ lv.name }}</td>
            <td v-for="c in draft.columns" :key="c.key" class="c">
              <CheckBox v-if="c.kind === 'check'" v-model="lv.values[c.key]" :label="`${c.label} · ${lv.name}`" />
              <FieldNum
                v-else
                v-model="lv.values[c.key]"
                :unit="c.kind === 'pct' ? '%' : '₫'"
                :money="c.kind === 'money'"
                dim
                :label="`${c.label} · ${lv.name}`"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="sh" style="padding-top: 24px">
        <h3>Được gửi yêu cầu</h3>
        <span>Bậc nào được gửi loại yêu cầu nào trên app nhân viên</span>
      </div>
      <table class="tbl ql">
        <colgroup>
          <col style="width: 120px" />
          <col v-for="r in draft.requests" :key="r.key" />
        </colgroup>
        <thead>
          <tr>
            <th>Bậc</th>
            <th v-for="r in draft.requests" :key="r.key" class="c">{{ r.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lv in current.levels" :key="lv.name">
            <td class="b">{{ lv.name }}</td>
            <td v-for="r in draft.requests" :key="r.key" class="c">
              <CheckBox v-model="lv.req[r.key]" :label="`${r.label} · ${lv.name}`" />
            </td>
          </tr>
        </tbody>
      </table>

      <template v-if="flags && flags.rows.length">
        <div class="sh" style="padding-top: 24px">
          <h3>Cờ thuế và bảo hiểm của khoản thêm</h3>
        </div>
        <table class="tbl ql">
          <thead>
            <tr>
              <th>Khoản</th>
              <th class="c">Miễn thuế</th>
              <th class="c">Tính vào bảo hiểm</th>
              <th class="c">Xác nhận</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in flags.rows" :key="r.code">
              <td class="b">{{ r.label }}</td>
              <td class="c">{{ taxText(r) }}</td>
              <td class="c">{{ r.insuranceBase ? 'Có' : 'Không' }}</td>
              <td class="c">
                <template v-if="r.confirmedBy">{{ r.confirmedBy }} · {{ dmy(r.confirmedAt) }}</template>
                <button v-else-if="canConfirm" type="button" class="btn sm" @click="confirming = r">Xác nhận</button>
                <template v-else>Chưa xác nhận</template>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <SaveBar
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="onPreview"
      />
    </section>
  </SettingsFrame>

  <PreviewDialog
    v-if="preview"
    :preview="preview"
    :saving="form.saving.value"
    @close="preview = null"
    @confirm="onConfirm"
  />
  <ConfirmFlagsDialog
    v-if="confirming"
    :row="confirming"
    :flags-text="flagsText(confirming)"
    :month="flags.month"
    :rev="flags.rev"
    @close="confirming = null"
    @saved="reloadFlags"
  />
  <AddAllowanceDialog
    v-if="hop === 'them-che-do' && data"
    :types="data.types.map(t => ({ key: t.key, name: t.name }))"
    @close="close"
    @saved="reload"
  />
</template>

<style scoped>
.ql td {
  height: 44px;
}
.ql th.c,
.ql td.c {
  text-align: center;
}
.ql td.b {
  font-weight: 500;
}
.sh {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 18px 24px 6px;
}
.sh h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.sh span {
  color: var(--muted);
  font-size: 13px;
}
.tabs.in {
  padding: 0 24px;
  margin-bottom: 0;
}
.tabs.in .tab {
  padding-top: 18px;
}
.tabs.in .r {
  margin-left: auto;
  display: flex;
  gap: 16px;
  align-items: center;
  padding-bottom: 10px;
}
</style>
