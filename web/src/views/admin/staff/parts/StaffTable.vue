<script setup lang="ts">
// Bảng danh sách nhân sự: mỗi ô một giá trị trên một dòng, cuộn ngang trong vùng riêng (có bàn phím).
// Không có cột ô chọn; cột chỉ hiện khi màn đang ở chế độ chọn (Gán ca, Đổi phòng ban). Khi đó người đã nghỉ việc mờ và
// ô chọn khoá; ô ở đầu cột chọn mọi người chọn được đang hiện. Tên là liên kết mở ngăn kéo hồ sơ (?nv=<id>).
import { useRoute } from 'vue-router';
import SelectCheck from '@/components/select-mode/SelectCheck.vue';
import type { CheckState } from '@/components/select-mode/useSelectMode';
import type { StaffRow } from '@/mock/staff';
import { dmy } from '@/utils/format';
import StatusPill from './StatusPill.vue';

defineProps<{ rows: StaffRow[]; selecting: boolean; picked: Set<string>; allState: CheckState }>();
const route = useRoute();
defineEmits<{ toggle: [id: string]; 'toggle-all': [] }>();

/** Người đã nghỉ việc không gán ca hay đổi phòng được. */
const locked = (r: StaffRow) => r.status === 'out';
</script>

<template>
  <div class="tscroll" role="region" aria-label="Bảng danh sách nhân sự" tabindex="0">
    <table class="stbl">
      <colgroup>
        <col v-if="selecting" style="width: 48px" />
        <col style="width: 224px" />
        <col style="width: 224px" />
        <col style="width: 120px" />
        <col style="width: 176px" />
        <col style="width: 136px" />
        <col style="width: 112px" />
      </colgroup>
      <thead>
        <tr>
          <th v-if="selecting" scope="col" class="ck">
            <SelectCheck :state="allState" label="Chọn tất cả người chọn được đang hiện" @toggle="$emit('toggle-all')" />
          </th>
          <th scope="col">Nhân viên</th>
          <th scope="col">Email</th>
          <th scope="col">Phòng ban</th>
          <th scope="col">Chức danh</th>
          <th scope="col">Trạng thái</th>
          <th scope="col">Ngày vào làm</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td class="empty" :colspan="selecting ? 7 : 6">Không có nhân sự nào khớp bộ lọc trên trang này.</td>
        </tr>
        <tr
          v-for="r in rows"
          :key="r.id"
          :class="{ gone: r.status === 'out', on: selecting && picked.has(r.id), bkoff: selecting && locked(r) }"
        >
          <td v-if="selecting" class="ck">
            <SelectCheck
              :state="picked.has(r.id) ? 'true' : 'false'"
              :label="`Chọn ${r.name}`"
              :disabled="locked(r)"
              why="Đã nghỉ việc, không chọn được"
              @toggle="$emit('toggle', r.id)"
            />
          </td>
          <th scope="row">
            <div class="stw">
              <span class="stav">{{ r.initials }}</span>
              <RouterLink class="nn" replace :to="{ query: { ...route.query, nv: r.id } }">{{ r.name }}</RouterLink>
            </div>
          </th>
          <td>{{ r.email }}</td>
          <td>{{ r.dept }}</td>
          <td>{{ r.title }}</td>
          <td><StatusPill :status="r.status" :label="r.statusLabel" /></td>
          <td>{{ dmy(r.joined) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.tscroll {
  overflow-x: auto;
  border-top: 1px solid var(--border);
}
.tscroll:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.stbl {
  table-layout: fixed;
  min-width: 1040px;
}
.stbl th,
.stbl td {
  padding: 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stbl thead th {
  height: 44px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}
.stbl tbody th,
.stbl tbody td {
  height: 56px;
  border-top: 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 400;
  color: var(--text);
  text-align: left;
  vertical-align: middle;
}
:root[data-density='gon'] .stbl tbody th {
  height: 42px;
}
.stbl tbody tr:hover > * {
  background: var(--raised);
}
.stbl tbody tr.on > * {
  background: var(--gold-pale);
}
.stw {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.stav {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--gold-light);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.nn {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.nn:hover {
  text-decoration: underline;
}
.nn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.stbl tbody td.empty {
  height: 120px;
  padding: 0 12px;
  border-bottom: 0;
  text-align: center;
  white-space: normal;
  color: var(--muted);
}
.stbl tbody tr.gone > *,
.stbl tbody tr.gone .nn {
  color: var(--muted);
}
.gone .stav {
  background: var(--status-draft);
}
.stbl tbody tr.bkoff > * {
  opacity: 0.45;
}
.stbl tbody tr.bkoff > td.ck {
  opacity: 1;
}
</style>
