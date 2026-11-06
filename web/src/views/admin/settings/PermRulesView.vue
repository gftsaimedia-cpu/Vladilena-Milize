<script setup lang="ts">
// Cài đặt › Phân quyền › Xử lý yêu cầu: yêu cầu chưa được đồng ý hoặc bị từ chối thì ngày đó tính thế nào.
import { useLoad } from '@/composables/useLoad';
import { getRequestRules, saveRequestRules } from '@/services/admin-settings';
import SettingsFrame from './SettingsFrame.vue';
import PermTabs from './perm/PermTabs.vue';
import CheckBox from './fields/CheckBox.vue';
import SaveBar from './fields/SaveBar.vue';
import SelectBox from './fields/SelectBox.vue';
import Icon from '@/components/ui/Icon.vue';
import { PATHS } from './nav';
import { useDraft } from './lib/useDraft';

const { data } = useLoad(() => getRequestRules());
const form = useDraft(() => data.value);
const { draft } = form;
</script>

<template>
  <SettingsFrame active="phan-quyen">
    <template #sub>Yêu cầu chưa được đồng ý hoặc bị từ chối thì ngày đó tính thế nào</template>

    <section v-if="draft" class="card">
      <PermTabs active="xu-ly" />
      <div class="qd">
        <div>
          <h3>Nghỉ</h3>
          <table class="tbl qt">
            <colgroup>
              <col />
              <col style="width: 176px" />
              <col style="width: 150px" />
            </colgroup>
            <thead>
              <tr>
                <th>Loại yêu cầu</th>
                <th>Khi chưa đồng ý hoặc bị từ chối</th>
                <th class="c">Tính là ngày nghỉ khi xét chuyên cần</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in draft.leave" :key="r.key">
                <td class="n0">{{ r.label }}</td>
                <td>
                  <SelectBox v-model="r.value" :options="draft.leaveOptions" style="width: 160px" :label="r.label" />
                </td>
                <td class="c">
                  <CheckBox v-model="r.countsAbsent" :label="`${r.label}: tính là ngày nghỉ khi xét chuyên cần`" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>Làm thêm</h3>
          <table class="tbl qt">
            <colgroup>
              <col />
              <col style="width: 200px" />
            </colgroup>
            <thead>
              <tr>
                <th>Loại yêu cầu</th>
                <th>Khi chưa đồng ý hoặc bị từ chối</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in draft.extra" :key="r.key">
                <td class="n0">{{ r.label }}</td>
                <td>
                  <SelectBox v-model="r.value" :options="draft.extraOptions" style="width: 170px" :label="r.label" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="nt">
        <Icon name="info" />
        <span>
          Ai được xử lý loại nào: đặt trong từng <RouterLink :to="PATHS.vaiTro" class="link">Vai trò</RouterLink> · Ai
          được gửi loại nào: đặt ở <RouterLink :to="PATHS.cheDo" class="link">Chế độ theo loại</RouterLink>
        </span>
      </div>
      <SaveBar
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="form.save(d => saveRequestRules(d))"
      />
    </section>
  </SettingsFrame>
</template>

<style scoped>
.qd {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.qd > div + div {
  border-left: 1px solid var(--rule);
}
.qd h3 {
  margin: 0;
  padding: 18px 24px 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.qt td {
  height: 52px;
}
.qt thead th {
  height: 60px;
  vertical-align: bottom;
}
.qt td.n0 {
  font-weight: 500;
}
.qt th.c,
.qt td.c {
  text-align: center;
  white-space: normal;
  line-height: 15px;
}
.nt {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 14px 24px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 13px;
}
</style>
