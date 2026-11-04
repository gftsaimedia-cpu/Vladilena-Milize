<script setup lang="ts">
// Bảng danh sách nhân sự: mỗi ô một giá trị trên một dòng, cuộn ngang trong vùng riêng (có bàn phím).
// Cột đầu (ô chọn) chưa có nội dung; các bước sau thêm chọn dòng và liên kết mở hồ sơ.
import type { StaffRow } from '@/mock/staff';
import { dmy } from '@/utils/format';
import StatusPill from './StatusPill.vue';

defineProps<{ rows: StaffRow[] }>();
</script>

<template>
  <div class="tscroll" role="region" aria-label="Bảng danh sách nhân sự" tabindex="0">
    <table class="stbl">
      <colgroup>
        <col style="width: 48px" />
        <col style="width: 224px" />
        <col style="width: 224px" />
        <col style="width: 120px" />
        <col style="width: 176px" />
        <col style="width: 136px" />
        <col style="width: 112px" />
      </colgroup>
      <thead>
        <tr>
          <th />
          <th scope="col">Nhân viên</th>
          <th scope="col">Email</th>
          <th scope="col">Phòng ban</th>
          <th scope="col">Chức danh</th>
          <th scope="col">Trạng thái</th>
          <th scope="col">Ngày vào làm</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ gone: r.status === 'out' }">
          <td />
          <th scope="row">
            <div class="who">
              <span class="av">{{ r.initials }}</span>
              <span class="nn">{{ r.name }}</span>
            </div>
          </th>
          <td>
            <span class="em" :title="r.activated ? 'Đã kích hoạt tài khoản' : 'Chưa kích hoạt tài khoản'">
              <svg class="mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <template v-if="r.activated">
                  <circle cx="8" cy="8" r="8" fill="#1c1c1c" />
                  <path d="M4.6 8.2l2.3 2.3 4.5-4.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </template>
                <template v-else>
                  <circle cx="8" cy="8" r="8" fill="#eb973d" />
                  <path d="M8 4.4v4.2" fill="none" stroke="#212121" stroke-width="1.7" stroke-linecap="round" />
                  <circle cx="8" cy="11.3" r="1" fill="#212121" />
                </template>
              </svg>
              <span class="et">{{ r.email }}</span
              ><span v-if="!r.activated" class="sr-only">, chưa kích hoạt tài khoản</span>
            </span>
          </td>
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
.stbl tbody tr:hover > * {
  background: var(--raised);
}
.who {
  gap: 12px;
}
.av {
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
.em {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  vertical-align: middle;
}
.mark {
  flex: none;
}
.et {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gone > * {
  color: var(--muted);
}
.gone .av {
  background: var(--status-draft);
}
</style>
