<script setup lang="ts">
// Cài đặt › Chế độ theo loại nhân sự: ba thẻ Thực tập sinh / Chuyên trách viên / Nhân viên, mỗi thẻ một dòng mức của
// loại đó ở tháng này (phụ cấp, lương KPI, iDorm) và một dòng loại yêu cầu được gửi. Gõ hoặc tick ngay trong ô, bấm
// Lưu để chọn tháng áp dụng và xem lại các ô sẽ đổi. Ca đêm của Nhân viên chọn theo từng người, không sửa ở đây.
// Địa chỉ: /admin/cai-dat/che-do[/chuyen-trach | /nhan-vien].
import ScrollX from '@/components/ui/ScrollX.vue';
import { computed, nextTick, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from '@/components/shell/toast';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import { useLoad } from '@/composables/useLoad';
import { mergeStale } from '@/builders/api/benefits';
import { getBenefits, saveBenefits } from '@/services/admin-settings';
import { monthLabel } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import ConfirmDialog from './benefits/ConfirmDialog.vue';
import CheckBox from './fields/CheckBox.vue';
import FieldNum from './fields/FieldNum.vue';
import SaveBar from './fields/SaveBar.vue';
import { PATHS } from './nav';
import { useDraft } from './lib/useDraft';
import { isStale } from './positions/useSnapshots';

const route = useRoute();
const { data, error, reload } = useLoad(() => getBenefits());
const form = useDraft(() => data.value);
const { draft } = form;
const confirming = ref(false);
const saving = ref(false);
const plain = (v?) => JSON.parse(JSON.stringify(v));

const tabPath = (key?) => (key === 'thuc-tap-sinh' ? PATHS.cheDo : `${PATHS.cheDo}/${key}`);
const current = computed(() => {
  if (!draft.value) return null;
  const key = route.params.loai || 'thuc-tap-sinh';
  return draft.value.types.find(t => t.key === key) || draft.value.types[0];
});

// Ô % để trống không phải một mức: trả về số đã tải, như thể chưa sửa ô đó.
function setPct(key?, value?) {
  const loaded = data.value && data.value.types.find(t => t.code === current.value.code);
  current.value.values[key] = value == null && loaded ? loaded.values[key] : value;
}

async function onConfirm(month?, reason?) {
  if (saving.value) return;
  saving.value = true;
  form.error.value = '';
  const mine = plain(draft.value);
  try {
    await saveBenefits(month, mine, reason);
    confirming.value = false;
    toast.ok(`Đã lưu chế độ, áp dụng từ ${monthLabel(month).toLowerCase()}`);
    // Đọc lại để có số phiên bản mới; đọc không được thì coi bản nháp là bản đã lưu.
    data.value = await getBenefits().catch(() => mine);
    await nextTick();
    form.saved.value = true;
  } catch (e) {
    if (!isStale(e)) {
      form.error.value = e && e.message ? e.message : 'Không lưu được, thử lại sau.';
      return;
    }
    const oldBase = plain(data.value);
    try {
      const fresh = await getBenefits();
      data.value = fresh;
      await nextTick(); // watch của useDraft đặt lại bản nháp theo số mới ở lượt này
      draft.value = mergeStale(oldBase, mine, fresh);
      toast.error('Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu');
    } catch (e2) {
      form.error.value = e2 && e2.message ? e2.message : 'Không tải được số mới, thử lại sau.';
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SettingsFrame active="quyen-loi">
    <template #sub>
      <template v-if="current">
        {{ current.name }} · {{ current.count }} người · tick hoặc gõ mức ngay trong ô, bấm Lưu để áp dụng
      </template>
    </template>

    <PageLoadError v-if="error" what="chế độ theo loại" :error="error" @retry="reload" />
    <section v-else-if="draft && current" class="card">
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
        </span>
      </div>

      <div class="sh">
        <h3>Phụ cấp và lương KPI</h3>
        <span>Mức của {{ current.name }}</span>
      </div>
      <ScrollX label="Quyền lợi theo loại"><table class="tbl ql">
        <thead>
          <tr>
            <th v-for="c in draft.columns" :key="c.key" class="c">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td v-for="c in draft.columns" :key="c.key" class="c">
              <span v-if="c.key === 'nightPct' && current.nightByPerson" class="byp">Theo từng người</span>
              <CheckBox
                v-else-if="c.kind === 'check'"
                v-model="current.values[c.key]"
                :label="`${c.label} · ${current.name}`"
              />
              <FieldNum
                v-else
                :model-value="current.values[c.key]"
                unit="%"
                :max="100"
                dim
                :label="`${c.label} · ${current.name}`"
                @update:model-value="setPct(c.key, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table></ScrollX>

      <div class="sh" style="padding-top: 24px">
        <h3>Được gửi yêu cầu</h3>
        <span>Loại yêu cầu {{ current.name }} được gửi trên app nhân viên</span>
      </div>
      <ScrollX label="Quyền lợi theo loại"><table class="tbl ql">
        <thead>
          <tr>
            <th v-for="r in draft.requests" :key="r.key" class="c">{{ r.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td v-for="r in draft.requests" :key="r.key" class="c">
              <CheckBox v-model="current.req[r.key]" :label="`${r.label} · ${current.name}`" />
            </td>
          </tr>
        </tbody>
      </table></ScrollX>

      <SaveBar
        save-label="Lưu"
        :changes="form.changes.value"
        :saving="saving"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="confirming = true"
      />
    </section>
  </SettingsFrame>

  <ConfirmDialog
    v-if="confirming && draft"
    :draft="draft"
    :saving="saving"
    @close="confirming = false"
    @confirm="onConfirm"
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
.byp {
  color: var(--muted);
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
