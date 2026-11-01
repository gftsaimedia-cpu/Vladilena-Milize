// Hộp thoại/ngăn kéo mở bằng ?hop=<tên> trên địa chỉ: bấm nút thì đặt ?hop, đóng thì bỏ ?hop (nút Quay lại cũng đóng được).
//   const { hop, open, close } = useHop(['them-ngay-le', 'doi-ngay-checkin']);
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useHop(valid?) {
  const route = useRoute();
  const router = useRouter();
  const hop = computed(() => {
    const h = route.query.hop;
    return typeof h === 'string' && valid.includes(h) ? h : null;
  });
  const open = (name?) => router.push({ query: { ...route.query, hop: name } });
  const close = () => {
    const { hop: dropped, ...rest } = route.query;
    router.replace({ query: rest });
  };
  return { hop, open, close };
}
