// Hộp chi tiết ngày mở sẵn theo ?hop=chi-tiet-ngay&nv=<id>&ngay=<YYYY-MM-DD> (mục lục thiết kế, tải lại trang mở lại hộp).
// Mở và đóng bằng router.replace; đóng chỉ bỏ ba khoá đó, các khoá khác (thang, q, pb, xem) giữ nguyên.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useDayHop() {
  const route = useRoute();
  const router = useRouter();
  const day = computed(() => {
    const { hop, nv, ngay } = route.query;
    return hop === 'chi-tiet-ngay' && typeof nv === 'string' && typeof ngay === 'string'
      ? { personId: nv, date: ngay }
      : null;
  });
  function openDay(personId: string, date: string) {
    router.replace({ query: { ...route.query, hop: 'chi-tiet-ngay', nv: personId, ngay: date } });
  }
  function closeDay() {
    const { hop, nv, ngay, ...rest } = route.query;
    router.replace({ query: rest });
  }
  return { day, openDay, closeDay };
}
