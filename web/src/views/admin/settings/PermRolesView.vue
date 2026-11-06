<script setup lang="ts">
// Cài đặt › Phân quyền › Vai trò: chọn một vai trò, đặt mức quyền theo khu vực và loại yêu cầu được xử lý.
// Vai trò Admin toàn quyền, không sửa được. ?hop=tao-vai-tro mở hộp tạo vai trò.
import { computed, nextTick, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getRoles, saveRoles } from '@/services/admin-settings';
import { useSessionStore } from '@/stores/session';
import SettingsFrame from './SettingsFrame.vue';
import CreateRoleDialog from './perm/CreateRoleDialog.vue';
import DeprecateRoleDialog from './perm/DeprecateRoleDialog.vue';
import PermTabs from './perm/PermTabs.vue';
import CheckBox from './fields/CheckBox.vue';
import SaveBar from './fields/SaveBar.vue';
import SelectBox from './fields/SelectBox.vue';
import { useDraft } from './lib/useDraft';
import { useHop } from './lib/useHop';

const { data, reload } = useLoad(() => getRoles());
const form = useDraft(() => data.value && data.value.roles);
const { draft: roles } = form;
const { hop, open, close } = useHop(['tao-vai-tro']);
const session = useSessionStore();
const canDeprecate = computed(() => session.caps.includes('roles.manage'));
const deprecateOpen = ref(false);

const activeKey = ref('');
const role = computed(() => {
  if (!roles.value) return null;
  return roles.value.find(r => r.key === activeKey.value) || roles.value[0];
});
const copyOpen = ref(false); // hộp tạo vai trò mở từ "Sao chép thành vai trò mới"

// Phạm vi là của cả vai trò: đổi ở một khu thì mọi khu cùng đổi.
function setScope(value?) {
  for (const area of Object.values<any>(role.value.areas)) area.scope = value;
}
// Lưu xong tải lại để lấy số phiên bản mới của vai trò, giữ dòng "Đã lưu thay đổi".
async function onSave() {
  if (!(await form.save(d => saveRoles(d)))) return;
  await reload();
  await nextTick();
  form.saved.value = true;
}

async function onCreated(key?) {
  await reload();
  activeKey.value = key;
}
const dialog = computed(() => (copyOpen.value ? 'copy' : hop.value === 'tao-vai-tro' ? 'new' : ''));
const closeDialog = () => {
  copyOpen.value = false;
  if (hop.value) close();
};
</script>

<template>
  <SettingsFrame active="phan-quyen">
    <template #sub>
      <template v-if="data">
        {{ data.roles.length }} vai trò · {{ data.accounts }} tài khoản · vai trò quyết định ai xem, ai sửa và ai được
        xử lý loại yêu cầu nào
      </template>
    </template>

    <section v-if="role && data" class="card">
      <PermTabs :key="data.roles.length" active="vai-tro" />
      <div class="roles">
        <button
          v-for="r in roles"
          :key="r.key"
          type="button"
          class="chip"
          :class="{ on: r.key === role.key }"
          @click="activeKey = r.key"
        >
          {{ r.name }} <small v-if="r.note">{{ r.note }}</small>
        </button>
        <button type="button" class="add" @click="open('tao-vai-tro')">
          <Icon name="plus" :size="14" />Tạo vai trò
        </button>
      </div>
      <div class="rh">
        <h3>{{ role.name }}</h3>
        <span v-if="role.locked" class="pill p-lock"
          ><Icon name="lock" :size="12" :stroke="2" />Toàn quyền, không sửa được</span
        >
        <button type="button" class="link" @click="copyOpen = true">Sao chép thành vai trò mới</button>
        <button
          v-if="canDeprecate && !role.locked && !role.deprecated"
          type="button"
          class="link"
          @click="deprecateOpen = true"
        >
          Ngừng dùng
        </button>
      </div>
      <div class="pq">
        <div class="l">
          <table class="tbl pa">
            <colgroup>
              <col />
              <col style="width: 176px" />
              <col style="width: 120px" />
            </colgroup>
            <thead>
              <tr>
                <th>Khu vực</th>
                <th>Quyền</th>
                <th>Phạm vi</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in data.areas" :key="g.group">
                <tr class="gh">
                  <td colspan="3">{{ g.group }}</td>
                </tr>
                <tr v-for="a in g.items" :key="a.key">
                  <td>{{ a.name }}</td>
                  <td>
                    <span class="seg" :class="{ lk: role.locked }">
                      <button
                        v-for="lv in a.levels"
                        :key="lv"
                        type="button"
                        :class="{ on: role.areas[a.key].value === lv }"
                        :disabled="role.locked"
                        @click="role.areas[a.key].value = lv"
                      >
                        {{ data.levelLabels[lv] }}
                      </button>
                    </span>
                  </td>
                  <td>
                    <SelectBox
                      v-if="a.scoped"
                      :model-value="role.areas[a.key].scope"
                      :options="data.scopes"
                      :disabled="role.locked"
                      :style="role.locked ? 'color: var(--muted)' : undefined"
                      :label="`Phạm vi ${a.name}`"
                      @update:model-value="setScope"
                    />
                    <span v-else style="color: #a3a3a3">—</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="pr">
          <h4>Được xử lý yêu cầu</h4>
          <div v-for="q in data.requests" :key="q.key" class="ck">
            <CheckBox v-model="role.requests[q.key]" :locked="role.locked" :label="q.label" />{{ q.label }}
          </div>
          <h4 style="margin-top: 20px">Việc khác</h4>
          <div v-for="q in data.other" :key="q.key" class="ck">
            <CheckBox v-model="role.other[q.key]" :locked="role.locked" :label="q.label" />{{ q.label }}
          </div>
        </div>
      </div>
      <SaveBar
        v-if="!role.locked || form.changes.value"
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="onSave"
      />
    </section>
  </SettingsFrame>

  <CreateRoleDialog
    v-if="dialog && role"
    :copy-from="dialog === 'copy' ? role.key : ''"
    :copy-name="role.name"
    @close="closeDialog"
    @saved="onCreated"
  />
  <DeprecateRoleDialog v-if="deprecateOpen && role" :role="role" @close="deprecateOpen = false" @saved="reload" />
</template>

<style scoped>
.roles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 18px 24px 16px;
  border-bottom: 1px solid var(--rule);
}
.roles .add {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed #b5b5b5;
  font-size: 13px;
  font-weight: 500;
  background: none;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}
.rh {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 24px 4px;
}
.rh h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.rh .link {
  margin-left: auto;
}
.pq {
  display: grid;
  grid-template-columns: 1fr 260px;
}
.pq .l {
  border-right: 1px solid var(--rule);
}
.pa td {
  height: 48px;
}
.pa .gh td {
  height: 34px;
}
.pr {
  padding: 8px 24px 16px;
}
.pr h4 {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.ck {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
  line-height: 18px;
}
</style>
