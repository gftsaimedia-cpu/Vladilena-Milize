// Số đếm của khung Admin (thanh bên, chuông) trên dữ liệu giả.
import { pendingRequests } from './approvals';
import { MOCK_MONTH } from './clock';

export type Bell = {
  month: string;
  total: number;
  requests: number;
  explanations: number;
  overtime: number;
  forgotten: { count: number; items: { date: string; text: string }[] };
};

const FORGOTTEN = [
  { date: '2026-10-27', text: 'Lê Hoàng Nam · quên Check-out' },
  { date: '2026-10-26', text: 'Đỗ Mai Linh · quên Check-in' }
];

export function bellView(month: string): Bell {
  const requests = pendingRequests().length;
  const explanations = 2;
  const forgotten = { count: FORGOTTEN.length, items: FORGOTTEN.map(f => ({ ...f })) };
  return { month, total: requests + explanations + forgotten.count, requests, explanations, overtime: 1, forgotten };
}

export function shellCounts(): { requests: number; bell: number } {
  return { requests: pendingRequests().length, bell: bellView(MOCK_MONTH).total };
}
