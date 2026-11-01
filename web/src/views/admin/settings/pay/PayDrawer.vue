<script setup lang="ts">
// Ngăn kéo sửa một khoản của công thức lương. Cả sáu ngăn (ngày công, làm thêm, phụ cấp, KPI, khấu trừ, tạm ứng)
// vẽ từ một bản mô tả theo khối (xem mock/admin-settings/pay.js) nên cùng một khung, cùng một thanh lưu.
import { ref } from 'vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getPayDrawer, savePayDrawer } from '@/services/admin-settings';
import FieldNum from '../fields/FieldNum.vue';
import FieldText from '../fields/FieldText.vue';
import SelectBox from '../fields/SelectBox.vue';
import AddPositionDialog from '../all/AddPositionDialog.vue';
import { useDraft } from '../lib/useDraft';

const props = defineProps({ name: { type: String, required: true } });
const emit = defineEmits(['close', 'saved']);

const { data } = useLoad(() => getPayDrawer(props.name));
const form = useDraft(() => data.value);
const { draft } = form;
const positionOpen = ref(false);

// Thêm một dòng (bậc) vào cuối nhóm, ngay trước nút "Thêm …"
function addRow(items?, at?) {
  const add = items[at];
  items.splice(at, 0, {
    kind: 'row',
    label: '',
    editableLabel: true,
    field: { type: add.row.field.type, value: add.row.field.value, unit: add.row.field.unit }
  });
}

async function submit() {
  const ok = await form.save(d => savePayDrawer(props.name, d));
  if (ok) {
    emit('saved');
    emit('close');
  }
}
</script>

<template>
  <AppDrawer
    v-if="draft"
    :title="draft.title"
    :sub="draft.sub"
    :width="560"
    :dismissable="!positionOpen"
    @close="emit('close')"
  >
    <div class="sec">
      <template v-for="(sec, si) in draft.sections" :key="si">
        <div class="dg">
          <b>{{ sec.title }}</b>
          <span class="r">
            <template v-for="(c, ci) in sec.right" :key="ci">
              <SelectBox
                v-if="c.kind === 'select'"
                v-model="c.value"
                :options="c.options"
                style="height: 30px"
                :label="sec.title"
              />
              <FieldNum
                v-else-if="c.kind === 'num'"
                v-model="c.value"
                :unit="c.unit"
                :style="{ height: '30px', minWidth: c.minWidth ? c.minWidth + 'px' : undefined }"
                :label="sec.title"
              />
              <span v-else-if="c.kind === 'pill'" class="pill" :class="c.cls">{{ c.text }}</span>
              <RouterLink v-else-if="c.kind === 'link'" :to="c.to" class="link">{{ c.text }}</RouterLink>
              <span v-else>{{ c.text }}</span>
            </template>
          </span>
        </div>

        <template v-for="(it, ii) in sec.items" :key="ii">
          <div v-if="it.kind === 'row'" class="dr">
            <span class="l">
              <FieldText v-if="it.editableLabel" v-model="it.label" placeholder="Tên bậc" label="Tên bậc" />
              <template v-else>{{ it.label }}</template>
              <small v-if="it.small">{{ it.small }}</small>
              <small v-else-if="it.pill"
                ><span class="pill" :class="it.pill.cls" style="height: 18px">{{ it.pill.text }}</span></small
              >
            </span>
            <SelectBox
              v-if="it.field.type === 'select'"
              v-model="it.field.value"
              :options="it.field.options"
              :label="it.label"
            />
            <FieldNum
              v-else
              v-model="it.field.value"
              :money="it.field.type === 'money'"
              :unit="it.field.unit"
              :prefix="it.field.prefix"
              :label="it.label"
            />
          </div>
          <div v-else-if="it.kind === 'src'" class="src2" :class="{ big: it.big }">
            <span v-if="it.pill" class="pill" :class="it.pill.cls" style="height: 20px">{{ it.pill.text }}</span>
            {{ it.text }}
          </div>
          <button v-else-if="it.action === 'position'" type="button" class="add" @click="positionOpen = true">
            <Icon name="plus" />{{ it.text }}
          </button>
          <button v-else type="button" class="add" @click="addRow(sec.items, ii)">
            <Icon name="plus" />{{ it.text }}
          </button>
        </template>
      </template>
      <div style="height: 16px"></div>
    </div>

    <template #footer>
      <span style="color: var(--muted); font-size: 13px">
        {{
          form.error.value || (form.changes.value ? `Có ${form.changes.value} thay đổi chưa lưu` : 'Chưa có thay đổi')
        }}
      </span>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button
        type="button"
        class="btn"
        :class="form.changes.value ? 'pri' : 'off'"
        :disabled="!form.changes.value || form.saving.value"
        @click="submit"
      >
        Xem trước và lưu
      </button>
    </template>
  </AppDrawer>

  <AddPositionDialog v-if="positionOpen" @close="positionOpen = false" />
</template>

<style scoped>
.sec {
  padding: 4px 28px 0;
}
.dg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 0 8px;
  border-top: 1px solid var(--rule);
  margin-top: 6px;
}
.dg:first-child {
  border-top: 0;
  margin-top: 0;
}
.dg b {
  font-size: 14px;
  font-weight: 600;
}
.dg .r {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}
.dr {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  font-size: 14px;
}
.dr .l small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.dr .fi {
  width: 150px;
  height: 34px;
  justify-content: flex-end;
}
.dr .sel {
  width: 150px;
  height: 34px;
}
.dr .l .fi {
  width: auto;
  justify-content: flex-start;
}
.add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin: 4px 0 6px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.src2 {
  color: var(--muted);
  font-size: 12px;
  line-height: 17px;
  margin: 6px 0 4px;
}
.src2.big {
  font-size: 13px;
  color: var(--text);
}
</style>
