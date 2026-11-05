<script setup lang="ts">
// Bảng biểu thuế lũy tiến: mỗi bậc một dòng (Bậc, Thu nhập trên, Đến, Thuế suất). "Thu nhập trên" là chữ lấy theo mức
// "Đến" của bậc trước; bậc cuối không giới hạn. Ghi thẳng vào `brackets` của bản nháp; lỗi (keyed `brackets.<i>.upTo|ratePct`)
// hiện ngay dưới ô sai.
import { fieldText, type Bracket } from '@/builders/api/settings';
import FieldNum from '../fields/FieldNum.vue';

const props = defineProps({
  brackets: { type: Array as () => Bracket[], required: true },
  errors: { type: Object as () => Record<string, string>, default: () => ({}) },
  limits: { type: Object as () => Record<string, any> | null, default: null }
});

const from = (i: number) => (i === 0 ? '0 đ' : fieldText('upTo', props.brackets[i - 1].upTo));
const isLast = (i: number) => i === props.brackets.length - 1;
</script>

<template>
  <div class="bt">
    <table>
      <thead>
        <tr>
          <th>Bậc</th>
          <th>Thu nhập trên</th>
          <th>Đến</th>
          <th>Thuế suất</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, i) in brackets" :key="i">
          <td>{{ i + 1 }}</td>
          <td class="from">{{ from(i) }}</td>
          <td>
            <span v-if="isLast(i)" class="open">Không giới hạn</span>
            <template v-else>
              <FieldNum
                :model-value="b.upTo as number"
                money
                :max="limits?.upTo?.max ?? null"
                :label="`Bậc ${i + 1} · đến`"
                @update:model-value="b.upTo = $event"
              />
              <small v-if="errors[`brackets.${i}.upTo`]" class="err">{{ errors[`brackets.${i}.upTo`] }}</small>
            </template>
          </td>
          <td>
            <FieldNum
              :model-value="b.ratePct"
              unit="%"
              :decimals="2"
              :max="limits?.ratePct?.max ?? null"
              :label="`Bậc ${i + 1} · thuế suất`"
              @update:model-value="b.ratePct = $event"
            />
            <small v-if="errors[`brackets.${i}.ratePct`]" class="err">{{ errors[`brackets.${i}.ratePct`] }}</small>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="foot">Mức “thu nhập trên” của mỗi bậc lấy theo mức “đến” của bậc trước.</p>
  </div>
</template>

<style scoped>
.bt table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.bt th {
  text-align: left;
  font-weight: 500;
  font-size: 12px;
  color: var(--muted);
  padding: 0 12px 8px 0;
}
.bt td {
  padding: 6px 12px 6px 0;
  vertical-align: top;
  border-top: 1px solid var(--rule);
  font-variant-numeric: tabular-nums;
}
.bt td:first-child {
  width: 56px;
  padding-top: 14px;
}
.bt td.from {
  padding-top: 14px;
}
.bt td :deep(.fi) {
  height: 34px;
  border-radius: 8px;
  width: 170px;
}
.bt td:nth-child(4) :deep(.fi) {
  width: 110px;
}
.bt .open {
  display: inline-block;
  padding-top: 8px;
  color: var(--muted);
}
.bt .err {
  display: block;
  margin-top: 4px;
  color: var(--status-rejected);
  font-size: 12px;
  line-height: 16px;
}
.bt .foot {
  padding: 0;
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
