<script setup lang="ts">
// Bảng đơn của tab Yêu cầu (board Q1): mỗi ô một giá trị. Tên người và nút Xem mở ngăn chi tiết; đơn chờ có Từ chối
// (mở ngăn với ô ghi lý do) và Duyệt ngay trên dòng. Bảng rộng tối thiểu 860px, khung ngoài cuộn ngang khi màn hẹp.
import { KIND_LABEL, STATUS_DOT, STATUS_LABEL, type ReqRow } from '@/builders/api/admin-requests';

defineProps<{ rows: ReqRow[]; openId: string; busyId: string | null }>();
const emit = defineEmits<{ open: [row: ReqRow]; reject: [row: ReqRow]; approve: [row: ReqRow] }>();
</script>

<template>
  <div class="rq-scroll" tabindex="0" role="region" aria-label="Bảng yêu cầu, kéo ngang khi màn hẹp">
    <table class="rq-tbl" aria-label="Yêu cầu">
      <thead>
        <tr>
          <th scope="col">Nhân viên</th>
          <th scope="col">Loại</th>
          <th scope="col">Ngày</th>
          <th scope="col">Nội dung</th>
          <th scope="col">Trạng thái</th>
          <th scope="col" class="rq-act">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ on: r.id === openId }" :data-req="r.id">
          <td>
            <button type="button" class="rq-who" :aria-label="`Xem yêu cầu của ${r.name}`" @click="emit('open', r)">
              <span class="rq-av" aria-hidden="true">{{ r.initials }}</span>
              <span class="rq-nm">{{ r.name }}</span>
            </button>
          </td>
          <td class="rq-cl">{{ KIND_LABEL[r.kind] }}</td>
          <td class="rq-cl">{{ r.date }}</td>
          <td class="rq-cl" :title="r.what">{{ r.what }}</td>
          <td>
            <span class="rq-st"><span class="rq-dot" :style="{ background: STATUS_DOT[r.status] }" />{{ STATUS_LABEL[r.status] }}</span>
          </td>
          <td class="rq-act">
            <template v-if="r.status === 'pend'">
              <button
                type="button"
                class="rq-sb2"
                :aria-label="`Từ chối yêu cầu của ${r.name}, mở ô ghi lý do`"
                :disabled="busyId === r.id"
                @click="emit('reject', r)"
              >
                Từ chối
              </button>
              <button
                type="button"
                class="rq-sb1"
                :aria-label="`Duyệt yêu cầu của ${r.name}`"
                :disabled="busyId !== null"
                @click="emit('approve', r)"
              >
                Duyệt
              </button>
            </template>
            <button v-else type="button" class="rq-sb3" :aria-label="`Xem yêu cầu của ${r.name}`" @click="emit('open', r)">
              Xem
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.rq-scroll {
  overflow-x: auto;
}
.rq-scroll:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.rq-tbl {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
  table-layout: fixed;
}
.rq-tbl th {
  height: 40px;
  padding: 0 6px;
  background: var(--ground);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--muted);
  text-align: left;
}
.rq-tbl td {
  height: 56px;
  padding: 0 6px;
  border-bottom: 1px solid var(--border);
}
.rq-tbl th:first-child,
.rq-tbl td:first-child {
  padding-left: 20px;
}
.rq-tbl th:last-child,
.rq-tbl td:last-child {
  padding-right: 20px;
}
/* Cột: Nhân viên, Loại 128, Ngày 96, Nội dung, Trạng thái 116, Thao tác 176 (board). */
.rq-tbl th:nth-child(1) {
  width: 32%;
}
.rq-tbl th:nth-child(2) {
  width: 140px;
}
.rq-tbl th:nth-child(3) {
  width: 108px;
}
.rq-tbl th:nth-child(5) {
  width: 128px;
}
.rq-tbl th:nth-child(6) {
  width: 196px;
}
.rq-tbl tr.on td {
  background: var(--gold-pale);
}
.rq-who {
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.rq-who:hover .rq-nm {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.rq-av {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.rq-nm {
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rq-cl {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rq-st {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.rq-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50px;
}
.rq-act {
  text-align: right;
  white-space: nowrap;
}
td.rq-act button + button {
  margin-left: 8px;
}
.rq-sb1,
.rq-sb2,
.rq-sb3 {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-ctl);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.rq-sb1 {
  background: #000000;
  border: 1px solid #000000;
  color: #ffffff;
}
.rq-sb2 {
  background: var(--surface);
  border: 1px solid var(--control);
  color: var(--text);
}
.rq-sb3 {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.rq-sb1:disabled,
.rq-sb2:disabled {
  opacity: 0.5;
  cursor: default;
}
.rq-who:focus-visible,
.rq-sb1:focus-visible,
.rq-sb2:focus-visible,
.rq-sb3:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
</style>
