<script setup lang="ts">
// Cài đặt › Cách tính lương: công thức thực nhận đọc từ trên xuống như một phiếu lương, chữ dựng từ kho cài đặt.
// Bấm "Sửa" hoặc "Xem" mở ngăn kéo của từng khoản (?hop=luong-ngay-cong | lam-them | phu-cap | luong-kpi | khau-tru | tam-ung).
import Icon from '@/components/ui/Icon.vue';
import { payFormulaView } from '@/builders/api/settings-screens';
import { useLoad } from '@/composables/useLoad';
import { getSettings, getSettingsHistory } from '@/services/settings-store';
import SettingsFrame from './SettingsFrame.vue';
import PayDrawer from './pay/PayDrawer.vue';
import LoadFail from './fields/LoadFail.vue';
import { PATHS } from './nav';
import { useHop } from './lib/useHop';

const { data, error, reload } = useLoad(async () => {
  const [settings, overtime, attendance, kpiWeights] = await Promise.all([
    getSettings(),
    getSettingsHistory('overtime'),
    getSettingsHistory('attendance'),
    getSettingsHistory('kpi-weights')
  ]);
  return payFormulaView(settings, {
    overtime: overtime.items,
    attendance: attendance.items,
    kpiWeights: kpiWeights.items
  });
});
const { hop, open, close } = useHop(['luong-ngay-cong', 'lam-them', 'phu-cap', 'luong-kpi', 'khau-tru', 'tam-ung']);
</script>

<template>
  <SettingsFrame active="cong-thuc">
    <template #sub>
      Áp dụng cho mọi phiếu lương · {{ data ? data.editedCount : 0 }} khoản đã chỉnh
    </template>

    <section v-if="data" class="card">
      <div class="card-h">
        <h2>Cách tính lương</h2>
        <span class="cap">Thực nhận của mỗi phiếu tính từ trên xuống</span>
      </div>
      <!-- Bảng rộng hơn khung hẹp (điện thoại): cuộn ngang trong thẻ, không làm cả trang tràn. -->
      <div class="fx-wrap" role="region" aria-label="Các khoản của cách tính lương" tabindex="0">
      <table class="tbl fx">
        <colgroup>
          <col style="width: 56px" />
          <col style="width: 220px" />
          <col />
          <col style="width: 128px" />
          <col style="width: 96px" />
        </colgroup>
        <thead>
          <tr>
            <th class="op"><span class="sr-only">Cộng hay trừ</span></th>
            <th>Khoản</th>
            <th>Đang áp dụng</th>
            <th>Trạng thái</th>
            <th style="text-align: right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.rows" :key="r.key">
            <td class="op">{{ r.op }}</td>
            <td class="nm">{{ r.name }}</td>
            <td class="ds">{{ r.value }}</td>
            <td>
              <span v-if="r.edited" class="st">• Đã chỉnh</span>
            </td>
            <td style="text-align: right">
              <button type="button" class="tact" @click="open(r.drawer)">{{ r.action }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <div class="foot" style="border-top: 0">
        <Icon name="history" />
        <span>{{ data.recent }} Mỗi lần sửa được ghi vào Nhật ký thay đổi.</span>
        <RouterLink :to="PATHS.nhatKy" class="link" style="margin-left: auto">Mở nhật ký</RouterLink>
      </div>
    </section>
    <section v-else-if="error" class="card">
      <div class="card-h"><h2>Cách tính lương</h2></div>
      <LoadFail what="cách tính lương" @retry="reload" />
    </section>
  </SettingsFrame>

  <PayDrawer v-if="hop" :key="hop" :name="hop" @close="close" @saved="reload" />
</template>

<style scoped>
.fx-wrap {
  overflow-x: auto;
}
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
.fx .st {
  font-size: 13px;
  color: var(--text);
}
</style>
