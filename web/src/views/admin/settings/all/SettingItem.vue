<script setup lang="ts">
// Một mục trong Tất cả cài đặt: tên và mô tả bên trái, ô nhập bên phải (mục nhiều ô thì mỗi ô một dòng có nhãn).
// Ô đã đổi hiện "Đang áp dụng <số đã lưu>", ô sai hiện gợi ý ngay dưới ô. Mục chỉ xem (readonly) là một dòng chữ.
// draft là bản nháp của cả nhóm (v-model ghi thẳng vào draft[ô]); state là nhóm đã lưu ở tháng đang chọn.
// history (null: mục không có lịch sử) là các dòng của riêng mục; nút Hoàn tác của dòng báo `revert` kèm dòng gốc.
import { computed, ref } from 'vue';
import { fieldText, type Bracket, type GroupState, type Values } from '@/builders/api/settings';
import type { HistoryRowView, SettingEntry } from '@/builders/api/settings-screens';
import FieldNum from '../fields/FieldNum.vue';
import BracketTable from './BracketTable.vue';

const props = defineProps({
  entry: { type: Object as () => SettingEntry, required: true },
  draft: { type: Object as () => Values, default: () => ({}) },
  errors: { type: Object as () => Record<string, string>, default: () => ({}) },
  state: { type: Object as () => GroupState | null, default: null },
  history: { type: Array as () => HistoryRowView[] | null, default: null }
});
defineEmits(['revert']);

const showHistory = ref(false);

const many = computed(() => props.entry.fields.length > 1);
const maxOf = (field: string): number | null => props.state?.limits[field]?.max ?? null;
const saved = (field: string) => props.state?.values[field] as number | undefined;
const edited = (field: string) => !!props.state && props.draft[field] !== saved(field);
</script>

<template>
  <div class="it2" :class="{ wide: entry.brackets }" :data-setting-key="entry.key" tabindex="-1">
    <div class="l">
      <div class="nm">{{ entry.title }}</div>
      <div v-if="entry.desc" class="ds">{{ entry.desc }}</div>
      <button v-if="history" type="button" class="link hist" @click="showHistory = !showHistory">
        {{ showHistory ? 'Ẩn lịch sử' : 'Lịch sử' }}
      </button>
    </div>
    <div class="c">
      <BracketTable
        v-if="entry.brackets && Array.isArray(draft.brackets)"
        :brackets="draft.brackets as Bracket[]"
        :errors="errors"
        :limits="state?.limits.brackets ?? null"
      />
      <p v-if="entry.readonly" class="txt">{{ entry.readonly }}</p>
      <div v-for="f in entry.fields" :key="f.field" class="fr">
        <span v-if="many" class="fl">{{ f.label }}</span>
        <FieldNum
          :model-value="draft[f.field] as number"
          :label="f.label"
          :prefix="f.prefix"
          :unit="f.unit"
          :integer="f.integer"
          :decimals="f.decimals"
          :money="f.money"
          :max="maxOf(f.field)"
          @update:model-value="draft[f.field] = $event"
        />
        <small v-if="edited(f.field)" class="was">Đang áp dụng {{ fieldText(f.field, saved(f.field) as number) }}</small>
        <small v-if="errors[f.field]" class="err">{{ errors[f.field] }}</small>
      </div>
    </div>
    <div v-if="history && showHistory" class="hl">
      <div class="hh">Lịch sử · {{ history.length }} lần sửa</div>
      <table v-if="history.length">
        <thead>
          <tr>
            <th>Ô</th>
            <th>Áp dụng từ</th>
            <th>Số cũ → số mới</th>
            <th>Lý do</th>
            <th>Người sửa</th>
            <th>Lúc sửa</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in history" :key="h.id">
            <td>{{ h.label }}</td>
            <td>{{ h.month }}</td>
            <td>{{ h.change }}</td>
            <td>{{ h.reason }}</td>
            <td>{{ h.by }}</td>
            <td>{{ h.at }}</td>
            <td>
              <button type="button" class="link" :disabled="!h.canRevert" @click="$emit('revert', h.raw)">Hoàn tác</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="none">Chưa có lần sửa nào.</p>
    </div>
  </div>
</template>

<style scoped>
.it2 {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
  padding: 18px 24px;
  border-top: 1px solid var(--rule);
}
.it2 .nm {
  font-weight: 600;
  font-size: 14px;
}
.it2 .ds {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
  line-height: 19px;
}
.hist {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
}
.hl {
  grid-column: 1 / -1;
  font-size: 12px;
}
.hh {
  font-weight: 600;
  margin-bottom: 6px;
}
.hl table {
  width: 100%;
  border-collapse: collapse;
}
.hl th {
  text-align: left;
  font-weight: 500;
  color: var(--muted);
  padding: 0 10px 6px 0;
}
.hl td {
  padding: 6px 10px 6px 0;
  border-top: 1px solid var(--rule);
  vertical-align: top;
}
.hl .link:disabled {
  opacity: 0.4;
  cursor: default;
}
.hl .none {
  margin: 0;
  color: var(--muted);
}
.it2.wide {
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}
.it2.wide .c {
  align-items: stretch;
}
.c {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.fr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px 12px;
  width: 100%;
}
.fl {
  flex: 1;
  font-size: 13px;
  color: var(--muted);
}
.fr :deep(.fi) {
  height: 34px;
  border-radius: 8px;
  justify-content: flex-end;
}
.was,
.err {
  flex-basis: 100%;
  text-align: right;
  font-size: 12px;
  line-height: 16px;
}
.was {
  color: var(--muted);
}
.err {
  color: var(--status-rejected);
}
.txt {
  margin: 0;
  font-size: 14px;
}
@media (max-width: 1200px) {
  .it2 {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 14px;
  }
  .c {
    align-items: stretch;
  }
}
</style>
