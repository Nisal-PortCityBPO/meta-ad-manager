const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const { Token } = require('../token-management/token.model');
const {
  ANALYSIS_ACTIONS,
  ANALYSIS_AGE_UNITS,
  ANALYSIS_LOGIC_MODES,
  ANALYSIS_METRICS,
  ANALYSIS_OPERATORS,
  AnalysisRule,
} = require('./analysisRule.model');

const ACTION_CONFIG = [
  { value: ANALYSIS_ACTIONS.START, label: 'Start', description: 'Ads that look safe to start or resume.' },
  { value: ANALYSIS_ACTIONS.PAUSE, label: 'Pause', description: 'Ads that should be paused for review.' },
  { value: ANALYSIS_ACTIONS.DUPLICATE, label: 'Duplicate', description: 'Winning ads that may deserve scaling.' },
  { value: ANALYSIS_ACTIONS.KILL, label: 'Kill', description: 'Ads that match hard stop conditions.' },
];

const METRIC_CONFIG = [
  { value: ANALYSIS_METRICS.SPEND, label: 'Spend', format: 'currency' },
  { value: ANALYSIS_METRICS.CLICKS, label: 'Clicks', format: 'number' },
  { value: ANALYSIS_METRICS.CTR, label: 'CTR', format: 'percent' },
  { value: ANALYSIS_METRICS.IMPRESSIONS, label: 'Impressions', format: 'number' },
  { value: ANALYSIS_METRICS.RESULTS, label: 'Results', format: 'number' },
  { value: ANALYSIS_METRICS.CPM, label: 'CPM', format: 'currency' },
  { value: ANALYSIS_METRICS.CPC, label: 'CPC', format: 'currency' },
  { value: ANALYSIS_METRICS.CPR, label: 'CPR', format: 'currency' },
  {
    value: ANALYSIS_METRICS.AD_AGE_HOURS,
    label: 'Ad posting age',
    format: 'hours',
    units: [
      { value: ANALYSIS_AGE_UNITS.HOURS, label: 'Hours' },
      { value: ANALYSIS_AGE_UNITS.DAYS, label: 'Days' },
    ],
  },
  { value: ANALYSIS_METRICS.FREQUENCY, label: 'Frequency', format: 'decimal' },
  {
    value: ANALYSIS_METRICS.AD_STATUS,
    label: 'Ad status',
    format: 'status',
    operators: [ANALYSIS_OPERATORS.EQ, ANALYSIS_OPERATORS.NEQ],
    options: [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'PAUSED', label: 'Paused' },
      { value: 'DISAPPROVED', label: 'Disapproved' },
      { value: 'PENDING_REVIEW', label: 'Pending review' },
      { value: 'CAMPAIGN_PAUSED', label: 'Campaign paused' },
      { value: 'ADSET_PAUSED', label: 'Ad set paused' },
      { value: 'WITH_ISSUES', label: 'With issues' },
      { value: 'DISABLED', label: 'Disabled' },
      { value: 'ARCHIVED', label: 'Archived' },
      { value: 'UNKNOWN', label: 'Unknown' },
    ],
  },
];

const OPERATOR_CONFIG = [
  { value: ANALYSIS_OPERATORS.LT, label: '<' },
  { value: ANALYSIS_OPERATORS.LTE, label: '<=' },
  { value: ANALYSIS_OPERATORS.GT, label: '>' },
  { value: ANALYSIS_OPERATORS.GTE, label: '>=' },
  { value: ANALYSIS_OPERATORS.EQ, label: '=' },
  { value: ANALYSIS_OPERATORS.NEQ, label: '!=' },
];

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeStatus(value) {
  const status = String(value || 'UNKNOWN').trim().toUpperCase();
  return status || 'UNKNOWN';
}

function normalizeAgeUnit(unit) {
  return unit === ANALYSIS_AGE_UNITS.DAYS ? ANALYSIS_AGE_UNITS.DAYS : ANALYSIS_AGE_UNITS.HOURS;
}

function getExpectedMetricValue(condition) {
  const value = normalizeNumber(condition.value);

  if (condition.metric === ANALYSIS_METRICS.AD_AGE_HOURS && normalizeAgeUnit(condition.unit) === ANALYSIS_AGE_UNITS.DAYS) {
    return value * 24;
  }

  return value;
}

function buildFilterKey(prefix, id, label) {
  if (id) {
    return String(id);
  }

  const normalizedLabel = String(label || '').trim().toLowerCase();

  return normalizedLabel ? `${prefix}:${normalizedLabel}` : '';
}

function getMetric(item, key) {
  return normalizeNumber(item?.[key] ?? item?.insights?.[key]);
}

function getDateValue(...values) {
  const value = values.find(Boolean);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAdStatusCandidates(ad) {
  return [
    ad?.effectiveStatus,
    ad?.effective_status,
    ad?.adReviewFeedback?.global?.status,
    ad?.ad_review_feedback?.global?.status,
    ad?.reviewStatus,
    ad?.review_status,
    ad?.status,
    ad?.configuredStatus,
    ad?.configured_status,
  ].map(normalizeStatus);
}

function getAdStatus(ad) {
  const statuses = getAdStatusCandidates(ad);
  const priorityStatus = statuses.find((status) =>
    status.includes('DISAPPROVED') ||
    status.includes('REJECTED') ||
    status.includes('WITH_ISSUES') ||
    status.includes('DISABLED') ||
    status.includes('BLOCK')
  );

  return priorityStatus || statuses.find((status) => status !== 'UNKNOWN') || 'UNKNOWN';
}

function getAdStatusGroup(ad) {
  const status = getAdStatus(ad);

  if (status.includes('DISAPPROVED') || status.includes('REJECTED')) {
    return 'disapproved';
  }

  if (status.includes('BLOCK') || status.includes('DISABLED') || status.includes('WITH_ISSUES')) {
    return 'blocked';
  }

  if (status.includes('PENDING') || status.includes('REVIEW') || status.includes('IN_PROCESS')) {
    return 'review';
  }

  if (['ACTIVE', 'ENABLED'].includes(status)) {
    return 'active';
  }

  return 'others';
}

function getAdAgeHours({ ad, adSet, campaign }) {
  const createdAt = getDateValue(
    ad?.createdTime,
    ad?.created_time,
    ad?.createdAt,
    adSet?.createdTime,
    adSet?.created_time,
    campaign?.createdTime,
    campaign?.created_time
  );

  if (!createdAt) {
    return 0;
  }

  return Math.max(0, (Date.now() - createdAt.getTime()) / (60 * 60 * 1000));
}

function getAdMetrics({ ad, adSet, campaign }) {
  const spend = getMetric(ad, 'spend');
  const impressions = getMetric(ad, 'impressions');
  const clicks = getMetric(ad, 'clicks');
  const results = getMetric(ad, 'results') || getMetric(ad, 'leads');
  const reach = getMetric(ad, 'reach');
  const ctr = getMetric(ad, 'ctr') || (impressions ? (clicks / impressions) * 100 : 0);
  const cpc = getMetric(ad, 'cpc') || (clicks ? spend / clicks : 0);
  const cpr = getMetric(ad, 'cpr') || getMetric(ad, 'cpl') || (results ? spend / results : 0);
  const cpm = getMetric(ad, 'cpm') || (impressions ? (spend / impressions) * 1000 : 0);
  const frequency = getMetric(ad, 'frequency') || (reach ? impressions / reach : 0);

  return {
    adAgeHours: getAdAgeHours({ ad, adSet, campaign }),
    adStatus: getAdStatus(ad),
    clicks,
    cpc,
    cpm,
    cpr,
    ctr,
    frequency,
    impressions,
    reach,
    results,
    spend,
  };
}

function getMetricLabel(metric) {
  return METRIC_CONFIG.find((item) => item.value === metric)?.label || metric;
}

function getOperatorLabel(operator) {
  return OPERATOR_CONFIG.find((item) => item.value === operator)?.label || operator;
}

function getConditionSummary(condition) {
  const conditionValue =
    condition.metric === ANALYSIS_METRICS.AD_AGE_HOURS
      ? `${condition.value} ${normalizeAgeUnit(condition.unit)}`
      : condition.value;

  return `${getMetricLabel(condition.metric)} ${getOperatorLabel(condition.operator)} ${conditionValue}`;
}

function getConditionActualValue(metrics, metric) {
  if (metric === ANALYSIS_METRICS.AD_STATUS) {
    return normalizeStatus(metrics[metric]);
  }

  return normalizeNumber(metrics[metric]);
}

function evaluateCondition(metrics, condition) {
  if (condition.metric === ANALYSIS_METRICS.AD_STATUS) {
    const actualValue = normalizeStatus(metrics[condition.metric]);
    const expectedValue = normalizeStatus(condition.value);

    switch (condition.operator) {
      case ANALYSIS_OPERATORS.EQ:
        return actualValue === expectedValue;
      case ANALYSIS_OPERATORS.NEQ:
        return actualValue !== expectedValue;
      default:
        return false;
    }
  }

  const actualValue = normalizeNumber(metrics[condition.metric]);
  const expectedValue = getExpectedMetricValue(condition);

  switch (condition.operator) {
    case ANALYSIS_OPERATORS.LT:
      return actualValue < expectedValue;
    case ANALYSIS_OPERATORS.LTE:
      return actualValue <= expectedValue;
    case ANALYSIS_OPERATORS.GT:
      return actualValue > expectedValue;
    case ANALYSIS_OPERATORS.GTE:
      return actualValue >= expectedValue;
    case ANALYSIS_OPERATORS.EQ:
      return actualValue === expectedValue;
    case ANALYSIS_OPERATORS.NEQ:
      return actualValue !== expectedValue;
    default:
      return false;
  }
}

function evaluateRule(rule, metrics) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];

  if (!conditions.length) {
    return {
      matched: false,
      matchedConditions: [],
    };
  }

  const results = conditions.map((condition) => ({
    metric: condition.metric,
    operator: condition.operator,
    expectedValue: condition.value,
    expectedUnit: condition.unit,
    actualValue: getConditionActualValue(metrics, condition.metric),
    matched: evaluateCondition(metrics, condition),
    summary: getConditionSummary(condition),
  }));
  const matched = rule.logicMode === ANALYSIS_LOGIC_MODES.ANY
    ? results.some((result) => result.matched)
    : results.every((result) => result.matched);

  return {
    matched,
    matchedConditions: results,
  };
}

function getSafeRule(rule) {
  const safeRule = rule.toSafeObject ? rule.toSafeObject() : rule;

  return {
    ...safeRule,
    conditionSummary: (safeRule.conditions || []).map(getConditionSummary).join(
      safeRule.logicMode === ANALYSIS_LOGIC_MODES.ANY ? ' OR ' : ' AND '
    ),
  };
}

function validateRulePayload(payload = {}) {
  const name = String(payload.name || '').trim();
  const action = payload.action;
  const logicMode = payload.logicMode || ANALYSIS_LOGIC_MODES.ALL;
  const conditions = Array.isArray(payload.conditions) ? payload.conditions : [];

  if (!name) {
    throw new HttpError(400, 'Rule name is required');
  }

  if (!Object.values(ANALYSIS_ACTIONS).includes(action)) {
    throw new HttpError(400, 'Rule action is required');
  }

  if (!Object.values(ANALYSIS_LOGIC_MODES).includes(logicMode)) {
    throw new HttpError(400, 'Rule logic mode is invalid');
  }

  if (!conditions.length) {
    throw new HttpError(400, 'At least one condition is required');
  }

  const normalizedConditions = conditions.map((condition) => {
    if (!Object.values(ANALYSIS_METRICS).includes(condition.metric)) {
      throw new HttpError(400, 'Condition metric is invalid');
    }

    if (!Object.values(ANALYSIS_OPERATORS).includes(condition.operator)) {
      throw new HttpError(400, 'Condition operator is invalid');
    }

    if (condition.metric === ANALYSIS_METRICS.AD_STATUS) {
      if (![ANALYSIS_OPERATORS.EQ, ANALYSIS_OPERATORS.NEQ].includes(condition.operator)) {
        throw new HttpError(400, 'Ad status only supports equals or not equals');
      }

      return {
        metric: condition.metric,
        operator: condition.operator,
        value: normalizeStatus(condition.value),
      };
    }

    const value = Number(condition.value);
    if (!Number.isFinite(value)) {
      throw new HttpError(400, 'Condition value must be a number');
    }

    const normalizedCondition = {
      metric: condition.metric,
      operator: condition.operator,
      value,
    };

    if (condition.metric === ANALYSIS_METRICS.AD_AGE_HOURS) {
      normalizedCondition.unit = normalizeAgeUnit(condition.unit);
    }

    return normalizedCondition;
  });

  return {
    action,
    conditions: normalizedConditions,
    enabled: payload.enabled !== false,
    logicMode,
    name,
  };
}

async function listRules() {
  const rules = await AnalysisRule.find().sort({ action: 1, name: 1 });
  return rules.map(getSafeRule);
}

async function createRule({ payload, actor, req }) {
  const data = validateRulePayload(payload);
  const rule = await AnalysisRule.create({
    ...data,
    createdBy: actor?._id || null,
    updatedBy: actor?._id || null,
  });

  await writeActivityLog({
    user: actor,
    action: 'ANALYSIS_RULE_CREATED',
    entity: 'AnalysisRule',
    entityId: rule._id.toString(),
    metadata: {
      action: rule.action,
      conditions: rule.conditions,
      name: rule.name,
    },
    req,
  });

  return getSafeRule(rule);
}

async function updateRule({ ruleId, payload, actor, req }) {
  const data = validateRulePayload(payload);
  const rule = await AnalysisRule.findById(ruleId);

  if (!rule) {
    throw new HttpError(404, 'Analysis rule not found');
  }

  rule.name = data.name;
  rule.action = data.action;
  rule.logicMode = data.logicMode;
  rule.enabled = data.enabled;
  rule.conditions = data.conditions;
  rule.updatedBy = actor?._id || null;
  await rule.save();

  await writeActivityLog({
    user: actor,
    action: 'ANALYSIS_RULE_UPDATED',
    entity: 'AnalysisRule',
    entityId: rule._id.toString(),
    metadata: {
      action: rule.action,
      conditions: rule.conditions,
      name: rule.name,
    },
    req,
  });

  return getSafeRule(rule);
}

async function deleteRule({ ruleId, actor, req }) {
  const rule = await AnalysisRule.findById(ruleId);

  if (!rule) {
    throw new HttpError(404, 'Analysis rule not found');
  }

  await rule.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'ANALYSIS_RULE_DELETED',
    entity: 'AnalysisRule',
    entityId: rule._id.toString(),
    metadata: {
      action: rule.action,
      name: rule.name,
    },
    req,
  });
}

async function getAdInventory() {
  const [profiles, tokens] = await Promise.all([
    BusinessProfile.find()
      .populate({ path: 'sourceToken', select: 'label adsPowerProfile' })
      .populate({
        path: 'socialAccount',
        populate: [
          { path: 'brand', select: 'name color' },
          { path: 'agency', select: 'name' },
          { path: 'sourceToken', select: 'label adsPowerProfile' },
        ],
      })
      .sort({ socialAccountName: 1, name: 1 }),
    Token.find().select('label adsPowerProfile connectionStatus status').sort({ label: 1 }),
  ]);
  const ads = [];
  const tokenOptions = new Map();
  const adAccountOptions = new Map();
  const tokenSummary = {
    blocked: 0,
    connected: 0,
    total: tokens.length,
  };

  tokens.forEach((token) => {
    const key = buildFilterKey('token', token._id?.toString(), token.label);
    const connectionStatus = normalizeStatus(token.connectionStatus);

    if (connectionStatus === 'CONNECTED') {
      tokenSummary.connected += 1;
    } else {
      tokenSummary.blocked += 1;
    }

    tokenOptions.set(key, {
      adsPowerProfile: token.adsPowerProfile || '',
      label: token.label || 'Unknown token',
      value: key,
    });
  });

  profiles.forEach((profile) => {
    const socialAccount = profile.socialAccount;
    const adAccounts = Array.isArray(profile.adAccounts) ? profile.adAccounts : [];
    const sourceToken = socialAccount?.sourceToken || profile.sourceToken;
    const tokenContext = sourceToken
      ? {
          id: sourceToken._id?.toString?.() || sourceToken.toString?.() || null,
          adsPowerProfile: sourceToken.adsPowerProfile || '',
          label: sourceToken.label || profile.sourceTokenLabel || '',
        }
      : {
          id: null,
          adsPowerProfile: '',
          label: profile.sourceTokenLabel || socialAccount?.sourceTokenLabel || '',
        };

    tokenContext.key = buildFilterKey('token', tokenContext.id, tokenContext.label);

    if (tokenContext.key && !tokenOptions.has(tokenContext.key)) {
      tokenOptions.set(tokenContext.key, {
        adsPowerProfile: tokenContext.adsPowerProfile || '',
        label: tokenContext.label || 'Unknown token',
        value: tokenContext.key,
      });
    }

    adAccounts.forEach((adAccount) => {
      const adAccountContext = {
        id: adAccount.id || adAccount.accountId || null,
        name: adAccount.name || 'Unknown ad account',
      };

      adAccountContext.key = buildFilterKey('ad-account', adAccountContext.id, adAccountContext.name);

      if (adAccountContext.key) {
        const existingAdAccountOption = adAccountOptions.get(adAccountContext.key);
        const isActiveAdAccount = normalizeStatus(adAccount.connectionStatus) === 'ACTIVE';

        if (existingAdAccountOption) {
          if (tokenContext.key && !existingAdAccountOption.tokenValues.includes(tokenContext.key)) {
            existingAdAccountOption.tokenValues.push(tokenContext.key);
          }
          existingAdAccountOption.isActive = existingAdAccountOption.isActive || isActiveAdAccount;
        } else {
          adAccountOptions.set(adAccountContext.key, {
            isActive: isActiveAdAccount,
            label: adAccountContext.name || 'Unknown ad account',
            tokenValue: tokenContext.key,
            tokenValues: tokenContext.key ? [tokenContext.key] : [],
            value: adAccountContext.key,
          });
        }
      }

      (Array.isArray(adAccount.campaigns) ? adAccount.campaigns : []).forEach((campaign) => {
        (Array.isArray(campaign.adSets) ? campaign.adSets : []).forEach((adSet) => {
          (Array.isArray(adSet.ads) ? adSet.ads : []).forEach((ad) => {
            const metrics = getAdMetrics({ ad, adSet, campaign });
            const status = getAdStatus(ad);
            const statusGroup = getAdStatusGroup(ad);

            ads.push({
              id: String(ad.id || `${campaign.id}-${adSet.id}-${ad.name}`),
              name: ad.title || ad.name || `Ad ${ad.id || ''}`.trim(),
              status,
              statusGroup,
              metrics,
              context: {
                adAccount: adAccountContext,
                adSet: {
                  id: String(adSet.id || ''),
                  name: adSet.name || 'Unknown ad set',
                },
                brand: socialAccount?.brand
                  ? {
                      id: socialAccount.brand._id.toString(),
                      color: socialAccount.brand.color,
                      name: socialAccount.brand.name,
                    }
                  : null,
                businessProfile: {
                  id: profile._id.toString(),
                  name: profile.name,
                },
                campaign: {
                  id: String(campaign.id || ''),
                  name: campaign.name || 'Unknown campaign',
                },
                socialAccount: socialAccount
                  ? {
                      id: socialAccount._id.toString(),
                      name: socialAccount.name,
                    }
                  : null,
                token: tokenContext,
              },
            });
          });
        });
      });
    });
  });

  return {
    ads,
    filters: {
      adAccounts: Array.from(adAccountOptions.values()).sort((first, second) => first.label.localeCompare(second.label)),
      tokens: Array.from(tokenOptions.values()).sort((first, second) => first.label.localeCompare(second.label)),
    },
    summary: {
      adAccountCount: adAccountOptions.size,
      adAccountActiveCount: Array.from(adAccountOptions.values()).filter((account) => account.isActive).length,
      adAccountBlockedCount: Array.from(adAccountOptions.values()).filter((account) => !account.isActive).length,
      tokenBlockedCount: Math.max(tokenSummary.blocked, tokenOptions.size - tokenSummary.connected),
      tokenConnectedCount: tokenSummary.connected,
      tokenCount: tokenOptions.size,
    },
  };
}

function buildRecommendationFilters({ inventory, rules }) {
  return {
    adAccounts: inventory.filters.adAccounts,
    rules: rules.map((rule) => {
      const safeRule = getSafeRule(rule);

      return {
        action: safeRule.action,
        label: safeRule.name,
        value: safeRule.id,
      };
    }),
    tokens: inventory.filters.tokens,
  };
}

function getInventoryAdKey(ad) {
  return `${ad.context.adAccount?.key || 'ad-account'}:${ad.id}`;
}

async function getRecommendations() {
  const [rules, inventory] = await Promise.all([
    AnalysisRule.find({ enabled: true }).sort({ action: 1, name: 1 }),
    getAdInventory(),
  ]);
  const ads = inventory.ads;
  const categories = ACTION_CONFIG.map((action) => ({
    ...action,
    recommendations: [],
  }));
  const categoriesByAction = new Map(categories.map((category) => [category.value, category]));
  const rulesAppliedAdKeys = new Set();
  const ruleCountsByAction = ACTION_CONFIG.reduce(
    (counts, action) => ({
      ...counts,
      [action.value]: rules.filter((rule) => rule.action === action.value).length,
    }),
    {}
  );

  rules.forEach((rule) => {
    ads.forEach((ad) => {
      const evaluation = evaluateRule(rule, ad.metrics);

      if (!evaluation.matched) {
        return;
      }

      rulesAppliedAdKeys.add(getInventoryAdKey(ad));

      categoriesByAction.get(rule.action)?.recommendations.push({
        ad,
        action: rule.action,
        matchedConditions: evaluation.matchedConditions,
        rule: getSafeRule(rule),
      });
    });
  });

  categories.forEach((category) => {
    category.recommendations.sort((first, second) => second.ad.metrics.spend - first.ad.metrics.spend);
  });

  return {
    actions: ACTION_CONFIG,
    categories,
    filters: buildRecommendationFilters({ inventory, rules }),
    generatedAt: new Date(),
    inventoryCount: ads.length,
    metrics: METRIC_CONFIG,
    operators: OPERATOR_CONFIG,
    ruleCount: rules.length,
    summary: {
      ...inventory.summary,
      rulesAppliedAdCount: rulesAppliedAdKeys.size,
      rulesNotAppliedAdCount: Math.max(0, ads.length - rulesAppliedAdKeys.size),
      ruleCountsByAction,
      totalAdCount: ads.length,
    },
  };
}

function getAnalysisConfig() {
  return {
    actions: ACTION_CONFIG,
    logicModes: [
      { value: ANALYSIS_LOGIC_MODES.ALL, label: 'All conditions' },
      { value: ANALYSIS_LOGIC_MODES.ANY, label: 'Any condition' },
    ],
    metrics: METRIC_CONFIG,
    operators: OPERATOR_CONFIG,
  };
}

module.exports = {
  createRule,
  deleteRule,
  getAnalysisConfig,
  getRecommendations,
  listRules,
  updateRule,
};
