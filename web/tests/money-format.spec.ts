import { expect, test } from '@playwright/test';
import { money, moneyText } from '../src/utils/format';

// Chạy phía Node. Tiền lớn tự chọn đơn vị theo độ lớn (người dùng 06/11: không gán cứng "tỷ ₫").
test('money picks tỷ, triệu or đồng by size', () => {
  expect(money(2_110_759_432)).toEqual({ value: '2,11', unit: 'tỷ ₫' });
  expect(money(2_000_000_000)).toEqual({ value: '2', unit: 'tỷ ₫' });
  expect(money(370_046_440)).toEqual({ value: '370', unit: 'triệu ₫' });
  expect(money(370_500_000)).toEqual({ value: '370,5', unit: 'triệu ₫' });
  expect(money(16_000_000)).toEqual({ value: '16', unit: 'triệu ₫' });
  expect(money(850_000)).toEqual({ value: '850.000', unit: '₫' });
  expect(money(0)).toEqual({ value: '0', unit: '₫' });
});

test('money moves up a unit when rounding reaches 1.000', () => {
  expect(money(999_960_000)).toEqual({ value: '1', unit: 'tỷ ₫' });
  expect(money(999_999)).toEqual({ value: '999.999', unit: '₫' });
});

test('moneyText joins value and unit', () => {
  expect(moneyText(2_110_759_432)).toBe('2,11 tỷ ₫');
  expect(moneyText(20_000_000)).toBe('20 triệu ₫');
  expect(moneyText(0)).toBe('0 ₫');
});
