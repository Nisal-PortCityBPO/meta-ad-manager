const mongoose = require('mongoose');

const ANALYSIS_ACTIONS = Object.freeze({
  START: 'START',
  PAUSE: 'PAUSE',
  DUPLICATE: 'DUPLICATE',
  KILL: 'KILL',
});

const ANALYSIS_LOGIC_MODES = Object.freeze({
  ALL: 'ALL',
  ANY: 'ANY',
});

const ANALYSIS_METRICS = Object.freeze({
  SPEND: 'spend',
  CLICKS: 'clicks',
  CTR: 'ctr',
  IMPRESSIONS: 'impressions',
  RESULTS: 'results',
  CPM: 'cpm',
  CPC: 'cpc',
  CPR: 'cpr',
  AD_AGE_HOURS: 'adAgeHours',
  FREQUENCY: 'frequency',
  AD_STATUS: 'adStatus',
});

const ANALYSIS_OPERATORS = Object.freeze({
  LT: 'LT',
  LTE: 'LTE',
  GT: 'GT',
  GTE: 'GTE',
  EQ: 'EQ',
  NEQ: 'NEQ',
});

const ANALYSIS_AGE_UNITS = Object.freeze({
  HOURS: 'hours',
  DAYS: 'days',
});

const conditionSchema = new mongoose.Schema(
  {
    metric: {
      type: String,
      enum: Object.values(ANALYSIS_METRICS),
      required: true,
    },
    operator: {
      type: String,
      enum: Object.values(ANALYSIS_OPERATORS),
      required: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    unit: {
      type: String,
      enum: Object.values(ANALYSIS_AGE_UNITS),
      default: undefined,
    },
  },
  { _id: false }
);

const analysisRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      enum: Object.values(ANALYSIS_ACTIONS),
      required: true,
    },
    logicMode: {
      type: String,
      enum: Object.values(ANALYSIS_LOGIC_MODES),
      default: ANALYSIS_LOGIC_MODES.ALL,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    conditions: {
      type: [conditionSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

analysisRuleSchema.index({ action: 1, enabled: 1 });
analysisRuleSchema.index({ name: 1 });

analysisRuleSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    action: this.action,
    logicMode: this.logicMode,
    enabled: Boolean(this.enabled),
    conditions: Array.isArray(this.conditions)
      ? this.conditions.map((condition) => ({
          metric: condition.metric,
          operator: condition.operator,
          unit: condition.unit,
          value: condition.value,
        }))
      : [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const AnalysisRule =
  mongoose.models.AnalysisRule || mongoose.model('AnalysisRule', analysisRuleSchema);

module.exports = {
  ANALYSIS_ACTIONS,
  ANALYSIS_AGE_UNITS,
  ANALYSIS_LOGIC_MODES,
  ANALYSIS_METRICS,
  ANALYSIS_OPERATORS,
  AnalysisRule,
};
