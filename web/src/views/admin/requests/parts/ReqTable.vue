<script setup lang="ts">
// Bảng đơn của tab Yêu cầu (board Q1): mỗi ô một giá trị. Tên người và nút Xem mở ngăn chi tiết; đơn chờ có Từ chối
// (mở ngăn với ô ghi lý do) và Duyệt ngay trên dòng. Bảng rộng tối thiểu 860px, khung ngoài cuộn ngang khi màn hẹp.
// Chế độ chọn (board Q5): cột ô chọn hiện ở đầu, chỉ đơn chờ chọn được (đơn đã xử lý mờ, ô khoá); nút trên dòng ẩn.
import SelectCheck from '@/components/select-mode/SelectCheck.vue';
import type { CheckState } from '@/components/select-mode/useSelectMode';
import { KIND_LABEL, STATUS_DOT, STATUS_LABEL, type ReqRow } from '@/builders/api/admin-requests';

withDefaults(
  defineProps<{
    rows: ReqRow[];
    openId: string;
    busyId: string | null;
    selecting?: boolean;
    picked?: Set<string>;
    allState?: CheckState;
  }>(),
  { selecting: false, picked: () => new Set<string>(), allState: 'false' }
);
const emit = defineEmits<{
  open: [row: ReqRow];
  reject: [row: ReqRow];
  approve: [row: ReqRow];
  toggle: [id: string];
  'toggle-all': [];
}>();
</script>

<template>
  <div class="rq-scroll" tabindex="0" role="region" aria-label="Bảng yêu cầu, kéo ngang khi màn hẹp">
    <table class="rq-tbl" aria-label="Yêu cầu">
      <thead>
        <tr>
          <th v-if="selecting" scope="col" class="c-ck">
            <SelectCheck :state="allState" label="Chọn tất cả đơn chờ duyệt đang hiện" @toggle="emit('toggle-all')" />
          </th>
          <th scope="col" class="c-who">Nhân viên</th>
          <th scope="col" class="c-kind">Loại</th>
          <th scope="col" class="c-date">Ngày</th>
          <th scope="col">Nội dung</th>
          <th scope="col" class="c-st">Trạng thái</th>
          <th scope="col" class="c-act rq-act">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.id"
          :class="{
            on: r.id === openId || (selecting && picked.has(r.id)),
            off: selecting && r.status !== 'pend'
          }"
          :data-req="r.id"
        >
          <td v-if="selecting" class="c-ck">
            <SelectCheck
              :state="picked.has(r.id) ? 'true' : 'false'"
              :label="`Chọn đơn của ${r.name}`"
              :disabled="r.status !== 'pend'"
              why="Đơn đã xử lý, không chọn được"
              @toggle="emit('toggle', r.id)"
            />
          </td>
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
            <template v-if="selecting" />
            <template v-else-if="r.status === 'pend'">
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
/* Cột (board): ô chọn, Nhân viên, Loại 128, Ngày 96, Nội dung (phần còn lại), Trạng thái 116, Thao tác 176; độ rộng gồm đệm ô. */
.rq-tbl th.c-ck {
  width: 44px;
}
.rq-tbl th.c-who {
  width: 212px;
}
.rq-tbl th.c-kind {
  width: 124px;
}
.rq-tbl th.c-date {
  width: 92px;
}
.rq-tbl th.c-st {
  width: 120px;
}
.rq-tbl th.c-act {
  width: 172px;
  text-align: right;
}
.rq-tbl tr.on td {
  background: var(--gold-pale);
}
/* Chế độ chọn: đơn đã xử lý mờ (ô chọn vẫn đọc được lý do khoá qua title). */
.rq-tbl tr.off td {
  opacity: 0.45;
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
