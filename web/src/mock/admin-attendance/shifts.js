// 6 ca cố định của GFT (số người theo thiết kế 22/10).
export const SHIFTS = [
  { code: 'n1', name: 'Normal 1', from: '08:00', to: '17:00', type: 'Normal', count: 50 },
  { code: 'n2', name: 'Normal 2', from: '10:00', to: '19:00', type: 'Normal', count: 6 },
  { code: 'f1', name: 'Flex 1', from: '06:00', to: '15:00', type: 'Flex', count: 4 },
  { code: 'f2', name: 'Flex 2', from: '13:00', to: '22:00', type: 'Flex', count: 3 },
  { code: 'g1', name: 'Night 1', from: '21:00', to: '06:00', type: 'Night', count: 2, nextDay: true },
  { code: 'g2', name: 'Night 2', from: '22:00', to: '07:00', type: 'Night', count: 3, nextDay: true }
];

export const shiftOf = code => SHIFTS.find(s => s.code === code) || null;
/** "Normal 1 08:00–17:00" */
export const shiftLine = code => {
  const s = shiftOf(code);
  return s ? `${s.name} ${s.from}–${s.to}` : null;
};
