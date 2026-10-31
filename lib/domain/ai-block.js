'use strict';
// Chặn duyệt khoản bị AI soát gắn cờ nặng.
// Chỉ chạy khi công tắc Agents bật (lib/agents.js); tắt thì không chặn khoản nào. Admin vẫn có đường ra là Từ chối.
// Danh sách luật chặn nằm ở cài đặt `ai_block_rules` (mảng id luật; mảng rỗng = tắt chặn); chưa đặt thì dùng DEFAULT_BLOCK_RULES.
const store = require('../db');
const { HttpError } = require('../http');
const agents = require('../agents');
const aiReview = require('./ai-review'); // gọi qua object để test thay được kết quả soát

const SETTING_KEY = 'ai_block_rules';
// Hai luật so khai báo với Check-in/out: khai nghỉ mà vẫn có Check-in, khai làm thêm mà Check-in/out không phủ giờ khai
const DEFAULT_BLOCK_RULES = Object.freeze(['leave-with-checkin', 'ot-checkin-mismatch']);

async function blockRules() {
  const value = await store.getSetting(SETTING_KEY, null);
  if (Array.isArray(value)) return value.filter(rule => typeof rule === 'string');
  // Chưa đặt cài đặt: DB trong bộ nhớ (chỉ test; nhiều test duyệt khoản mà không có Check-in) không chặn; DB thật dùng mặc định
  return process.env.DB_PATH === ':memory:' ? [] : DEFAULT_BLOCK_RULES;
}

// items: [{ username, date, rev, fingerprint }] sắp được duyệt. Ném 409 AI_BLOCKED nếu có khoản dính luật chặn của đúng phiên bản đang duyệt.
async function assertNotAiBlocked(items) {
  if (!(await agents.enabled())) return;
  const rules = await blockRules();
  if (!rules.length) return;
  const months = [...new Set(items.map(item => item.date.slice(0, 7)))];
  const blocked = [];
  for (const month of months) {
    const result = await aiReview.aiReviewResultCached(month, false);
    for (const finding of result.findings) {
      if (!rules.includes(finding.rule) || !finding.approval) continue;
      const hit = items.find(
        item => item.username === finding.username && item.date === finding.date && item.rev === finding.approval.rev
      );
      if (hit)
        blocked.push({
          username: hit.username,
          date: hit.date,
          rule: finding.rule,
          message: `${(result.names && result.names[hit.username]) || hit.username}, ngày ${hit.date}: ${finding.message}`
        });
    }
  }
  if (!blocked.length) return;
  throw new HttpError(
    409,
    `AI chặn duyệt ${blocked.length} khoản: ${blocked.map(b => b.message).join(' | ')}. Hãy từ chối kèm lý do hoặc nhờ nhân sự sửa lại khai báo.`,
    { code: 'AI_BLOCKED', blocked: blocked.map(({ username, date, rule }) => ({ username, date, rule })) }
  );
}

module.exports = { SETTING_KEY, DEFAULT_BLOCK_RULES, blockRules, assertNotAiBlocked };
