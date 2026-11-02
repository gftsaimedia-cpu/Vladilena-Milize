<script setup lang="ts">
// Ngăn kéo Sửa hồ sơ nhân sự (drw-ns-sua-ho-so): thông tin chung, ca cố định, hợp đồng, bảo hiểm, thuế; khoá tài khoản.
import { computed, ref, watch } from 'vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { toast } from '@/components/shell/toast';
import { getStaffOptions, getStaffProfile, lockStaff, saveStaffProfile, unlockStaff } from '@/services/admin-hr';
import FldInput from './fields/FldInput.vue';
import { useSessionStore } from '@/stores/session';
import { CONTRACT_STATUS_OPTIONS } from '@/builders/admin-hr/staff';
import FldSelect from './fields/FldSelect.vue';
import StaffTrace from './StaffTrace.vue';

const props = defineProps({ username: { type: String, required: true } });
const emit = defineEmits(['close', 'saved']);
const canTrace = useSessionStore().caps.includes('audit.read');

const { data: profile } = useLoad(
  () => getStaffProfile(props.username),
  () => props.username
);
const { data: opts } = useLoad(() => getStaffOptions());
const form = ref(null);
watch(profile, p => (form.value = p ? { ...p } : null), { immediate: true });

const levels = computed(() => {
  const list = opts.value?.levels[form.value?.type] || [];
  return list.some(l => l.value === form.value?.level)
    ? list
    : [{ value: form.value?.level || '', label: '—' }, ...list];
});
function onType(type?) {
  form.value.type = type;
  form.value.level = opts.value.levels[type]?.[0]?.value || '';
}
const CHECKS = [
  ['taxDeduct', 'Khấu trừ thuế TNCN'],
  ['familyDeduct', 'Giảm trừ gia cảnh'],
  ['advance', 'Được tạm ứng']
];

const busy = ref(false);
async function run(fn?) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit('saved');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    busy.value = false;
  }
}
const save = () => run(() => saveStaffProfile(props.username, { ...form.value, name: form.value.name.trim() }));
const lock = () => run(() => lockStaff(props.username, form.value.ver));
const unlock = () => run(() => unlockStaff(props.username, form.value.ver));
</script>

<template>
  <AppDrawer :title="profile?.name || ''" :sub="profile?.subtitle || ''" @close="emit('close')">
    <template v-if="form && opts">
      <div v-if="!form.shift" class="sec">
        <div class="note err">
          <Icon name="alert" />
          <div>
            <b>Chưa có ca cố định</b>
          </div>
        </div>
      </div>
      <div class="sec">
        <div class="facts">
          <div>
            <span>Tên đăng nhập</span
            ><b
              ><code>{{ profile.username }}</code></b
            >
          </div>
          <div>
            <span>Tài khoản</span><b>{{ profile.accountState }}</b>
          </div>
          <div>
            <span>Tạo lúc</span><b>{{ profile.createdAt }}</b>
          </div>
          <div>
            <span>Phép năm còn lại (ngày)</span><b>{{ profile.leave ?? 'Chưa có số dư phép năm' }}</b>
          </div>
        </div>
        <div class="g2">
          <FldInput v-model="form.name" label="Họ tên" />
          <FldInput v-model="form.title" label="Chức danh" placeholder="Chưa có" />
          <FldSelect v-model="form.contractStatus" label="Trạng thái nhân sự" :options="CONTRACT_STATUS_OPTIONS" />
          <FldSelect :model-value="form.type" label="Loại nhân sự" :options="opts.types" @update:model-value="onType" />
          <FldSelect v-model="form.level" label="Bậc" :options="levels" />
          <FldSelect v-model="form.shift" label="Ca cố định" :options="opts.shifts" :warn="!form.shift" />
          <FldInput v-model="form.start" label="Ngày bắt đầu làm" kind="date" icon="cal" />
          <FldInput v-model="form.birth" label="Ngày sinh" kind="date" icon="cal" />
        </div>
        <div class="ck2">
          <button
            type="button"
            class="ckb"
            role="checkbox"
            :aria-checked="form.iDorm"
            @click="form.iDorm = !form.iDorm"
          >
            <span class="cb" :class="{ on: form.iDorm }"
              ><Icon v-if="form.iDorm" name="check" :size="12" :stroke="3" /></span
            >Ở iDorm
          </button>
          <span class="muted">Lịch làm việc: {{ form.scheduleText }}</span>
        </div>
        <div class="grp-t">Hợp đồng, bảo hiểm, thuế</div>
        <div class="g2">
          <FldSelect v-model="form.contract" label="Hợp đồng" :options="opts.contracts" />
          <FldInput v-model="form.dependents" label="Số người phụ thuộc" kind="number" step="1" />
        </div>
        <FldSelect v-model="form.insurance" label="Đóng bảo hiểm bắt buộc" :options="opts.insurance" />
        <div class="ck2">
          <button
            v-for="[key, label] in CHECKS"
            :key="key"
            type="button"
            class="ckb"
            role="checkbox"
            :aria-checked="form[key]"
            @click="form[key] = !form[key]"
          >
            <span class="cb" :class="{ on: form[key] }"
              ><Icon v-if="form[key]" name="check" :size="12" :stroke="3" /></span
            >{{ label }}
          </button>
        </div>
        <StaffTrace v-if="canTrace && profile.uuid" :uuid="profile.uuid" />
        <div style="height: 20px" />
      </div>
    </template>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <span class="sp" />
      <button v-if="form?.locked" type="button" class="btn" :disabled="busy" @click="unlock">
        <Icon name="unlock" />Mở khoá tài khoản
      </button>
      <button v-else type="button" class="btn dz" :disabled="!form || busy" @click="lock">
        <Icon name="lock" />Khoá tài khoản
      </button>
      <button type="button" class="btn pri" :disabled="!form || !form.name.trim() || busy" @click="save">
        <Icon name="check" />Lưu hồ sơ
      </button>
    </template>
  </AppDrawer>
</template>

<style scoped>
.sec {
  padding: 12px 28px 0;
}
.facts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--raised);
}
.facts div {
  padding: 10px 14px;
}
.facts div + div {
  border-left: 1px solid var(--border);
}
.facts span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.facts b {
  font-size: 13px;
  font-weight: 500;
}
.facts code {
  font-size: 12px;
}
.grp-t {
  margin: 22px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  border-top: 1px solid var(--rule);
  padding-top: 16px;
}
.ck2 {
  display: flex;
  gap: 24px;
  margin-top: 14px;
  font-size: 14px;
}
.ck2 .muted {
  color: var(--muted);
}
.ckb {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
.ckb:focus-visible .cb {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.btn.dz {
  color: var(--err-ink);
  border-color: #e0b4b4;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
