<script setup lang="ts">
// Bảng lương gọn. variant: 'draft10' (tháng 10 chưa có trạng thái phiếu) | 'draft11' (tháng 11, có mũi tên mở phiếu)
// | 'review' (có ô chọn, cảnh báo AI, trạng thái phiếu) | 'final' (số chính thức, không còn ô chọn).
// Bấm dòng = mở phiếu lương (emit 'open'); ô chọn và biểu tượng cảnh báo AI không mở phiếu.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useSessionStore } from '@/stores/session';
import { initials, vnd } from '@/utils/format';

const props = defineProps({
  rows: { type: Array as () => any[], default: () => [] },
  variant: { type: String, default: 'draft10' },
  selected: { type: Object as () => any, default: () => new Set() }
});
const emit = defineEmits(['open', 'toggle']);

const WIDTHS = {
  draft10: [null, 76, 112, 96, 88, 104, 118],
  review: [44, null, 76, 112, 96, 88, 104, 118, 132],
  final: [null, 76, 112, 96, 88, 104, 118]
};
const review = computed(() => props.variant === 'review');
const final = computed(() => props.variant === 'final');
const widths = computed(() => WIDTHS[props.variant] || null);
const draft11 = computed(() => props.variant === 'draft11');
const estimated = computed(() => !final.value);

const moneyCls = (v?) => (v === 0 ? 'z' : estimated.value ? 'est' : '');
const rowCls = (r?) => ({
  err: r.status === 'failed'
});
const pillOf = (s?) =>
  s === 'approved'
    ? ['p-done', 'Đã phê duyệt']
    : s === 'failed'
      ? ['p-err', 'Chưa tính được']
      : ['p-pend', 'Chờ phê duyệt'];
</script>

<template>
  <table class="tbl" :class="'v-' + variant">
    <colgroup v-if="widths">
      <col v-for="(w, i) in widths" :key="i" :style="w ? { width: w + 'px' } : null" />
    </colgroup>
    <thead>
      <tr>
        <th v-if="review" class="cbc"></th>
        <th :class="{ 'w-name': draft11 }">Nhân sự</th>
        <th class="n">Ngày công</th>
        <th class="n">Tổng thu nhập</th>
        <th class="n">Bảo hiểm</th>
        <th class="n">Thuế TNCN</th>
        <th class="n">Tạm ứng</th>
        <th class="n">Thực nhận</th>
        <th v-if="review">Trạng thái</th>
        <th v-if="draft11"></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.username"
        class="clk"
        :class="rowCls(r)"
        tabindex="0"
        @click="emit('open', r)"
        @keydown.enter="emit('open', r)"
      >
        <td v-if="review" class="cbc">
          <template v-if="r.status === 'pending'">
            <button
              type="button"
              class="cb"
              :class="{ on: selected.has(r.username) }"
              role="checkbox"
              :aria-checked="selected.has(r.username)"
              :aria-label="`Chọn phiếu của ${r.name}`"
              @click.stop="emit('toggle', r)"
            >
              <Icon v-if="selected.has(r.username)" name="check" :size="12" :stroke="3" />
            </button>
          </template>
        </td>
        <td>
          <div class="who">
            <span class="av">{{ initials(r.name) }}</span>
            <div>
              <div class="t">{{ r.name }}</div>
              <div class="s">{{ r.sub }}</div>
            </div>
          </div>
        </td>

        <template v-if="r.status === 'failed'">
          <td colspan="6">
            <div class="errmsg">
              <span v-if="draft11" class="pill p-err">Chưa tính được</span>
              <span v-else-if="final" class="pill p-draft">Loại khỏi kỳ</span>
              <span class="m">{{ r.problem }}</span>
              <RouterLink v-if="final" class="link" to="/admin/cai-dat/nhat-ky" @click.stop
                >Lý do trong nhật ký</RouterLink
              >
              <RouterLink v-else class="link" to="/admin/nhan-su" @click.stop>Sửa hồ sơ</RouterLink>
            </div>
          </td>
          <td v-if="review"><span class="pill p-err">Chưa tính được</span></td>
        </template>
        <template v-else>
          <td class="n">{{ r.workdays }}</td>
          <td class="n" :class="moneyCls(r.income)">{{ vnd(r.income) }}</td>
          <td class="n" :class="moneyCls(r.insurance)">{{ vnd(r.insurance) }}</td>
          <td class="n" :class="moneyCls(r.tax)">{{ vnd(r.tax) }}</td>
          <td class="n" :class="moneyCls(r.advance)">{{ vnd(r.advance) }}</td>
          <td class="n tl" :class="{ est: estimated }">{{ vnd(r.net) }}</td>
          <td v-if="review">
            <span class="pill" :class="pillOf(r.status)[0]">{{ pillOf(r.status)[1] }}</span>
          </td>
        </template>
        <td v-if="draft11" class="chev"><Icon name="chevr" /></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.tbl td {
  height: 56px;
}
.tbl tbody tr.clk {
  cursor: pointer;
}
.tbl td.z {
  color: #9e9e9e;
}
.tbl td.tl {
  font-weight: 600;
}
.tbl tr.err td {
  background: #fffafa;
}
.tbl tr.warn td {
  background: #fffcf3;
}
.errmsg {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--err-ink);
}
.errmsg .m {
  color: var(--text);
}
.errmsg .link {
  margin-left: auto;
}
.aic {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  background: none;
  border: 0;
  padding: 0;
  font-family: inherit;
  color: inherit;
}
button.aic {
  cursor: pointer;
}
.aic svg {
  color: var(--accent);
  width: 13px;
  height: 13px;
}
.aim {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
  color: var(--accent);
  vertical-align: middle;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.aim svg {
  width: 12px;
  height: 12px;
}
.tbl td.cbc,
.tbl th.cbc {
  padding-right: 0;
  width: 44px;
}
.v-draft11 .w-name {
  width: 34%;
}
.v-draft11 th.n {
  width: 11%;
}
.v-draft11 th:last-child {
  width: 40px;
}
</style>
