// Chi tiết mở theo URL trên trang máy tính (spec 3.3): đọc đúng các cặp đường dẫn–tham số của điện thoại.
//   /nv/cham-cong?ngay=  →  day        /nv/yeu-cau?yc=  →  request        /nv/toi?hop=doi-mat-khau  →  password
//   /nv/yeu-cau?tao=  →  tao (luồng Tạo yêu cầu K3; giá trị lạ do NewRequestBody đưa về menu, spec staff-requests 4.1)
// Giá trị lạ thì bỏ tham số bằng router.replace và không mở gì; tham số đúng tên nhưng sai đường dẫn thì bỏ qua.
// Đọc chi tiết là bất đồng bộ: kết quả của lần đọc cũ bị bỏ nếu tham số đã đổi trong lúc chờ.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DayDetail, RequestDetail } from '@/mock/staff-phone';
import { getDay, getRequest } from '@/services/staff-phone';

const PASSWORD = 'doi-mat-khau';

export function useDesktopDetail() {
  const route = useRoute();
  const router = useRouter();

  const first = (v: unknown): string | null => {
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' && s ? s : null;
  };
  const param = (path: string, name: string) => computed(() => (route.path === path ? first(route.query[name]) : null));
  const ngay = param('/nv/cham-cong', 'ngay');
  const yc = param('/nv/yeu-cau', 'yc');
  const hop = param('/nv/toi', 'hop');
  const tao = param('/nv/yeu-cau', 'tao');

  function drop(name: string) {
    const { [name]: _dropped, ...rest } = route.query;
    router.replace({ path: route.path, query: rest });
  }
  // Đóng mọi ngăn kéo: bỏ cả tao và ngay của luồng Tạo yêu cầu (ngay của Giải trình nằm trên /nv/yeu-cau).
  function closeDetail() {
    const { ngay: _n, yc: _y, hop: _h, tao: _t, ...rest } = route.query;
    router.replace({ path: route.path, query: rest });
  }

  const day = ref<DayDetail | null>(null);
  watch(
    ngay,
    async value => {
      if (!value) {
        day.value = null;
        return;
      }
      const found = await getDay(value);
      if (ngay.value !== value) return; // đã đổi trong lúc chờ
      day.value = found;
      if (!found) drop('ngay');
    },
    { immediate: true }
  );

  const request = ref<RequestDetail | null>(null);
  watch(
    yc,
    async value => {
      if (!value) {
        request.value = null;
        return;
      }
      const found = await getRequest(value);
      if (yc.value !== value) return;
      request.value = found;
      if (!found) drop('yc');
    },
    { immediate: true }
  );

  const password = ref(false);
  watch(
    hop,
    value => {
      password.value = value === PASSWORD;
      if (value && value !== PASSWORD) drop('hop');
    },
    { immediate: true }
  );

  return { day, request, password, tao, closeDetail };
}
