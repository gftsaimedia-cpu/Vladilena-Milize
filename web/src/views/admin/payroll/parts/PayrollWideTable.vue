<script setup lang="ts">
// Bảng lương đủ cột: tách tổng thu nhập thành tiền ngày công, phụ cấp, OT, lương KPI, khác.
import { computed } from 'vue';
import { initials, vnd } from '@/utils/format';

const props = defineProps({
  rows: { type: Array as () => any[], default: () => [] },
  estimated: { type: Boolean, default: true }
});
const emit = defineEmits(['open']);

const WIDTHS = [null, 62, 96, 104, 50, 74, 64, 104, 82, 72, 92, 100];
const cls = (v?, bold = false) => [v === 0 ? 'z' : props.estimated ? 'est' : '', bold && 'b'];
const est = computed(() => (props.estimated ? 'est' : ''));
</script>

<template>
  <table class="tbl wide">
    <colgroup>
      <col v-for="(w, i) in WIDTHS" :key="i" :style="w ? { width: w + 'px' } : null" />
    </colgroup>
    <thead>
      <tr>
        <th>Nhân sự</th>
        <th class="n">Ngày công</th>
        <th class="n">Tiền ngày công</th>
        <th class="n">Phụ cấp</th>
        <th class="n">OT</th>
        <th class="n">Lương KPI</th>
        <th class="n">Khác</th>
        <th class="n">Tổng thu nhập</th>
        <th class="n">Bảo hiểm</th>
        <th class="n">Thuế TNCN</th>
        <th class="n">Tạm ứng</th>
        <th class="n">Thực nhận</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.username"
        class="clk"
        :class="{ err: r.status === 'failed' }"
        tabindex="0"
        @click="emit('open', r)"
        @keydown.enter="emit('open', r)"
      >
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
          <td colspan="11">
            <div class="errmsg">
              <span class="pill p-err">Chưa tính được</span>
              <span class="m">{{ r.problem }}</span>
              <RouterLink class="link" to="/admin/nhan-su" @click.stop>Sửa hồ sơ</RouterLink>
            </div>
          </td>
        </template>
        <template v-else>
          <td class="n">{{ r.workdays }}</td>
          <td class="n" :class="cls(r.detail.base)">{{ vnd(r.detail.base) }}</td>
          <td class="n" :class="cls(r.detail.allowance)">
            {{ vnd(r.detail.allowance) }}
            <div v-if="r.detail.allowance" class="pcn">{{ r.detail.allowanceNote }}</div>
          </td>
          <td class="n" :class="cls(r.detail.ot)">{{ vnd(r.detail.ot) }}</td>
          <td class="n" :class="cls(r.detail.kpi)">{{ vnd(r.detail.kpi) }}</td>
          <td class="n" :class="cls(r.detail.other)">{{ vnd(r.detail.other) }}</td>
          <td class="n b" :class="est">{{ vnd(r.income) }}</td>
          <td class="n" :class="cls(r.insurance)">{{ vnd(r.insurance) }}</td>
          <td class="n" :class="cls(r.tax)">{{ vnd(r.tax) }}</td>
          <td class="n" :class="cls(r.advance)">{{ vnd(r.advance) }}</td>
          <td class="n b" :class="est">{{ vnd(r.net) }}</td>
        </template>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.wide td {
  height: 58px;
  font-size: 13px;
  padding: 0 8px;
}
.wide tbody tr.clk {
  cursor: pointer;
}
.wide th {
  padding: 10px 8px;
}
.wide th:first-child,
.wide td:first-child {
  padding-left: 24px;
}
.wide td.z {
  color: #9e9e9e;
}
.wide td.b {
  font-weight: 600;
}
.wide .pcn {
  font-size: 11px;
  color: var(--muted);
  line-height: 14px;
}
.wide tr.err td {
  background: #fffafa;
}
.wide .who .s {
  font-size: 12px;
}
.errmsg {
  display: flex;
  align-items: center;
  gap: 10px;
}
.errmsg .m {
  color: var(--text);
}
.errmsg .link {
  margin-left: auto;
}
</style>
