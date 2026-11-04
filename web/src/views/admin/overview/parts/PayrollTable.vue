<script setup lang="ts">
// Bảng lương của Tổng quan: lọc theo trạng thái và tìm theo tên / phòng ban chạy tại chỗ trên các dòng mẫu.
// Trạng thái lọc và chữ tìm thuộc về bảng, không ghi lên đường dẫn.
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import type { OverviewView, PayrollStatus } from '@/mock/overview';
import { foldText } from '@/utils/format';

const route = useRoute();
const linkTo = (path: string) => ({ path, query: route.query.thang ? { thang: route.query.thang } : {} });

const props = defineProps<{ payroll: OverviewView['payroll']; slips: OverviewView['period']['slips'] }>();

const LABEL: Record<PayrollStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  done: 'Đã duyệt',
  rejected: 'Từ chối'
};
type Filter = 'all' | PayrollStatus;

const filter = ref<Filter>('all');
const query = ref('');

const filters = computed<{ key: Filter; label: string; count: number }[]>(() => [
  { key: 'all', label: 'Tất cả', count: props.slips.total },
  { key: 'draft', label: LABEL.draft, count: props.slips.draft },
  { key: 'pending', label: LABEL.pending, count: props.slips.pending },
  { key: 'done', label: LABEL.done, count: props.slips.done },
  { key: 'rejected', label: LABEL.rejected, count: props.slips.rejected }
]);

const rows = computed(() => {
  const q = foldText(query.value);
  return props.payroll.rows.filter(
    r => (filter.value === 'all' || r.status === filter.value) && (!q || foldText(`${r.name} ${r.dept}`).includes(q))
  );
});
</script>

<template>
  <div class="card pt">
    <div class="head">
      <div>
        <h2>{{ payroll.title }}</h2>
        <p class="cap">{{ payroll.total }} phiếu · cập nhật lúc {{ payroll.updatedAt }}</p>
      </div>
      <label class="find">
        <Icon name="search" :size="16" />
        <input
          v-model="query"
          type="text"
          placeholder="Tìm theo tên hoặc phòng ban"
          aria-label="Tìm theo tên hoặc phòng ban"
        />
      </label>
    </div>

    <div class="chips" role="group" aria-label="Lọc theo trạng thái">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ on: filter === f.key }"
        :aria-pressed="filter === f.key"
        @click="filter = f.key"
      >
        {{ f.label }} <small>{{ f.count }}</small>
      </button>
    </div>

    <div class="scroll" role="region" :aria-label="payroll.title" tabindex="0">
      <table class="ov-table">
        <thead>
          <tr>
            <th>Nhân viên</th>
            <th>Phòng ban</th>
            <th class="n">Ngày công</th>
            <th class="n">Lương cơ bản</th>
            <th class="n">Phụ cấp</th>
            <th class="n">Thực nhận</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>
              <div class="who">
                <span class="av">{{ r.initials }}</span>
                <div>
                  <div class="t">{{ r.name }}</div>
                  <div class="s">{{ r.title }}</div>
                </div>
              </div>
            </td>
            <td>{{ r.dept }}</td>
            <td class="n">{{ r.days }}</td>
            <td class="n">{{ r.base }}</td>
            <td class="n">{{ r.allowance }}</td>
            <td class="n net">{{ r.net }}</td>
            <td>
              <span class="pill" :class="`st-${r.status}`">{{ LABEL[r.status] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="empty">Không có phiếu nào khớp.</p>

    <div class="foot">
      <span>Hiển thị {{ rows.length }} trong {{ payroll.total }} phiếu</span>
      <RouterLink :to="linkTo('/admin/bang-luong')" class="link">Mở bảng lương đầy đủ</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.pt {
  min-width: 0;
  padding: 24px 0 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 0 24px;
}
h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.cap {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.find {
  flex: 0 1 280px;
  min-width: 0;
  width: 100%;
  max-width: 280px;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--faint);
  font-size: 14px;
}
.find:focus-within {
  border-color: var(--text);
}
.find input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 24px;
}
.chip {
  cursor: pointer;
}
.scroll {
  overflow-x: auto;
}
.scroll:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.ov-table {
  min-width: 920px;
}
.ov-table .who .t {
  font-size: 14px;
}
.ov-table td.net {
  font-weight: 600;
}
.pill.st-done {
  background: var(--status-done);
  color: #fff;
}
.pill.st-pending {
  background: var(--status-pending);
  color: var(--text);
}
.pill.st-draft {
  background: var(--status-draft);
  color: var(--text);
}
.pill.st-rejected {
  background: var(--status-rejected);
  color: #fff;
}
.empty {
  margin: 0;
  padding: 16px 24px;
  border-top: 1px solid var(--rule);
  font-size: 14px;
  color: var(--muted);
  text-align: center;
}
.foot {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 14px 24px 18px;
}
.foot :deep(.link) {
  font-size: 14px;
}
@media (max-width: 480px) {
  .head,
  .chips {
    padding: 0 16px;
  }
  .pt {
    padding-top: 20px;
  }
  .foot,
  .empty {
    padding-inline: 16px;
  }
}
</style>
