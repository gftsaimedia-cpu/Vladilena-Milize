'use strict';
const { Explanation } = require('./explanation');
const { ExplanationRepository } = require('./explanation-repository');
const { ExplanationService, TEXT_MAX } = require('./explanation-service');
const { lateCheckoutMin, needsExplanation } = require('./late-checkout');
const { ensureExplanationSchema } = require('./schema');

module.exports = {
  Explanation,
  ExplanationRepository,
  ExplanationService,
  TEXT_MAX,
  lateCheckoutMin,
  needsExplanation,
  ensureExplanationSchema
};
