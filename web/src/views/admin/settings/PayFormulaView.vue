<script setup lang="ts">
// Cài đặt › Cách tính lương: công thức thực nhận đọc từ trên xuống như một phiếu lương.
// Bấm "Sửa" mở ngăn kéo của từng khoản (?hop=luong-ngay-cong | lam-them | phu-cap | luong-kpi | khau-tru | tam-ung).
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getPayFormula } from '@/services/admin-settings';
import SettingsFrame from './SettingsFrame.vue';
import PayDrawer from './pay/PayDrawer.vue';
import { PATHS } from './nav';
import { useHop } from './lib/useHop';

const { data, reload } = useLoad(() => getPayFormula());
const { hop, open, close } = useHop(['luong-ngay-cong', 'lam-them', 'phu-cap', 'luong-kpi', 'khau-tru', 'tam-ung']);

const STATUS = { default: ['p-draft', 'Mặc định'], adjusted: ['p-gold', 'Đã điều chỉnh'] };
</script>

<template>
  <SettingsFrame active="cong-thuc">
    <template #sub>
      Áp dụng cho mọi phiếu lương · <b>{{ data ? data.adjustedCount : 0 }} khoản</b> đã điều chỉnh ·
      <b>{{ data ? data.undecidedCount : 0 }} chính sách</b> công ty chưa chốt
    </template>

    <template v-if="data">
      <section class="card">
        <div class="card-h">
          <h2>Cách tính lương</h2>
          <span class="cap">Thực nhận của mỗi phiếu tính từ trên xuống</span>
        </div>
        <table class="tbl fx">
          <colgroup>
            <col style="width: 56px" />
            <col />
            <col style="width: 128px" />
            <col style="width: 76px" />
          </colgroup>
          <thead>
            <tr>
              <th class="op"></th>
              <th>Khoản</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.rows" :key="r.key">
              <td class="op">{{ r.op }}</td>
              <td class="nm">{{ r.name }}</td>
              <td>
                <span v-if="r.status === 'law'" class="pill p-lock"
                  ><Icon name="lock" :size="12" :stroke="2" />Theo luật</span
                >
                <span v-else class="pill" :class="STATUS[r.status][0]">{{ STATUS[r.status][1] }}</span>
              </td>
              <td style="text-align: right">
                <button v-if="r.drawer" type="button" class="tact" @click="open(r.drawer)">Sửa</button>
                <span v-else class="tact law">Do kế toán cài</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="foot" style="border-top: 0">
          <Icon name="history" />
          <span>
            Thay đổi gần đây: {{ data.recent || 'chưa có' }}. Mỗi lần sửa cách tính sẽ được ghi vào Nhật ký thay đổi.
          </span>
          <RouterLink :to="PATHS.nhatKy" class="link" style="margin-left: auto">Mở nhật ký</RouterLink>
        </div>
      </section>

      <section class="card" style="margin-top: 24px">
        <div class="card-h">
          <h2>Chính sách chưa chốt</h2>
          <span class="cap"
            >{{ data.open.total }} mục chờ công ty quyết định · {{ data.open.items.length }} mục đầu</span
          >
          <RouterLink :to="PATHS.tatCa" class="r link">Xem cả {{ data.open.total }} mục</RouterLink>
        </div>
        <div
          v-for="(it, i) in data.open.items"
          :key="i"
          class="op-row"
          :style="i === data.open.items.length - 1 ? 'border-bottom: 0' : undefined"
        >
          <span class="tag">{{ it.tag }}</span
          ><span>{{ it.text }}</span>
        </div>
        <div style="height: 8px"></div>
      </section>
    </template>
  </SettingsFrame>

  <PayDrawer v-if="hop" :key="hop" :name="hop" @close="close" @saved="reload" />
</template>

<style scoped>
.fx td {
  height: 64px;
}
.fx .op {
  width: 56px;
  font-size: 20px;
  color: #9e9e9e;
  text-align: center;
  padding-left: 20px;
  padding-right: 0;
}
.fx .nm {
  font-weight: 600;
}
.fx .ds {
  color: var(--muted);
  font-size: 13px;
  white-space: normal;
  line-height: 18px;
}
.fx td.ex {
  text-align: right;
}
.fx td.ex.z {
  color: #a3a3a3;
}
.fx tr.sum td {
  height: 64px;
  background: var(--gold-pale);
  border-top: 1px solid #f1e4c4;
}
.fx tr.sum .nm {
  font-size: 16px;
}
.fx tr.sum td.ex {
  font-size: 20px;
  font-weight: 600;
}
.fx th.exh {
  text-align: right;
}
.law {
  color: var(--muted);
  font-weight: 400;
  font-size: 12px;
}
.op-row {
  display: grid;
  grid-template-columns: 178px 1fr;
  gap: 12px;
  align-items: center;
  height: 48px;
  padding: 0 24px;
  border-top: 1px solid var(--rule);
  font-size: 13px;
}
.op-row .tag {
  font-size: 12px;
  color: var(--muted);
}
</style>
