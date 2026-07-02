/* ============================================================
 * AIStoryGen event schema
 * Shared allowlists and canonical keys for AI_EVENT state effects.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  var RUNTIME_STAT_SCHEMA = {
    arousal: { key: 'arousal', target: 'arousal', label: '\u5174\u594b', category: 'body' },
    awareness: { key: 'awareness', target: 'awareness', label: '\u89c9\u77e5', category: 'body' },
    stress: { key: 'stress', target: 'stress', label: '\u538b\u529b', category: 'body' },
    pain: { key: 'pain', target: 'pain', label: '\u75bc\u75db', category: 'body' },
    trauma: { key: 'trauma', target: 'trauma', label: '\u521b\u4f24', category: 'body' },
    lewdity: { key: 'lewdity', target: 'lewdity', label: '\u6deb\u4e71', category: 'body' },
    tiredness: { key: 'tiredness', target: 'tiredness', label: '\u75b2\u52b3', category: 'body' },
    fatigue: { key: 'tiredness', target: 'tiredness', label: '\u75b2\u52b3', category: 'body' },
    control: { key: 'control', target: 'control', label: '\u81ea\u63a7', category: 'body' },
    lust: { key: 'lust', target: 'lust', label: '\u6b32\u671b', category: 'body' },
    drunk: { key: 'drunk', target: 'drunk', label: '\u9189\u9152', category: 'effect' },
    drugged: { key: 'drugged', target: 'drugged', label: '\u836f\u7269', category: 'effect' },
    hallucinogen: { key: 'hallucinogen', target: 'hallucinogen', label: '\u81f4\u5e7b', category: 'effect' },
    money: { key: 'money', target: 'money', label: '\u91d1\u94b1', category: 'resource', limit: 'money' },
    purity: { key: 'purity', target: 'purity', label: '\u7eaf\u6d01', category: 'trait' },
    beauty: { key: 'beauty', target: 'beauty', label: '\u7f8e\u8c8c', category: 'trait' },
    charm: { key: 'charm', target: 'charm', label: '\u9b45\u529b', category: 'trait' },
    exhibitionism: { key: 'exhibitionism', target: 'exhibitionism', label: '\u66b4\u9732\u7656', category: 'trait' },
    promiscuity: { key: 'promiscuity', target: 'promiscuity', label: '\u6deb\u4e71\u7656', category: 'trait' },
    deviancy: { key: 'deviancy', target: 'deviancy', label: '\u53d8\u6001\u7656', category: 'trait' },
    masochism: { key: 'masochism', target: 'masochism', label: '\u53d7\u8650\u7656', category: 'trait' },
    willpower: { key: 'willpower', target: 'willpower', label: '\u610f\u5fd7\u529b', category: 'skill' },
    physique: { key: 'physique', target: 'physique', label: '\u4f53\u8d28', category: 'skill' },
    skulduggery: { key: 'skulduggery', target: 'skulduggery', label: '\u5077\u7a83', category: 'skill' },
    athletics: { key: 'athletics', target: 'athletics', label: '\u8fd0\u52a8', category: 'skill' },
    tending: { key: 'tending', target: 'tending', label: '\u62a4\u7406', category: 'skill' },
    housekeeping: { key: 'housekeeping', target: 'housekeeping', label: '\u5bb6\u653f', category: 'skill' },
    swimming: { key: 'swimming', target: 'swimmingskill', label: '\u6e38\u6cf3', category: 'skill' },
    swimmingskill: { key: 'swimming', target: 'swimmingskill', label: '\u6e38\u6cf3', category: 'skill' },
    dancing: { key: 'dancing', target: 'danceskill', label: '\u821e\u8e48', category: 'skill' },
    danceskill: { key: 'dancing', target: 'danceskill', label: '\u821e\u8e48', category: 'skill' },
    seduction: { key: 'seduction', target: 'seductionskill', label: '\u8bf1\u60d1', category: 'skill' },
    seductionskill: { key: 'seduction', target: 'seductionskill', label: '\u8bf1\u60d1', category: 'skill' },
    oral: { key: 'oral', target: 'oralskill', label: '\u53e3\u4ea4', category: 'skill' },
    oralskill: { key: 'oral', target: 'oralskill', label: '\u53e3\u4ea4', category: 'skill' },
    vaginal: { key: 'vaginal', target: 'vaginalskill', label: '\u9634\u9053', category: 'skill' },
    vaginalskill: { key: 'vaginal', target: 'vaginalskill', label: '\u9634\u9053', category: 'skill' },
    anal: { key: 'anal', target: 'analskill', label: '\u809b\u4ea4', category: 'skill' },
    analskill: { key: 'anal', target: 'analskill', label: '\u809b\u4ea4', category: 'skill' },
    hand: { key: 'hand', target: 'handskill', label: '\u624b\u6280', category: 'skill' },
    handskill: { key: 'hand', target: 'handskill', label: '\u624b\u6280', category: 'skill' },
    feet: { key: 'feet', target: 'feetskill', label: '\u8db3\u6280', category: 'skill' },
    feetskill: { key: 'feet', target: 'feetskill', label: '\u8db3\u6280', category: 'skill' },
    penile: { key: 'penile', target: 'penileskill', label: '\u9634\u830e', category: 'skill' },
    penileskill: { key: 'penile', target: 'penileskill', label: '\u9634\u830e', category: 'skill' },
    chest: { key: 'chest', target: 'chestskill', label: '\u80f8\u90e8', category: 'skill' },
    chestskill: { key: 'chest', target: 'chestskill', label: '\u80f8\u90e8', category: 'skill' },
    thigh: { key: 'thigh', target: 'thighskill', label: '\u5927\u817f', category: 'skill' },
    thighskill: { key: 'thigh', target: 'thighskill', label: '\u5927\u817f', category: 'skill' },
    bottom: { key: 'bottom', target: 'bottomskill', label: '\u81c0\u90e8', category: 'skill' },
    bottomskill: { key: 'bottom', target: 'bottomskill', label: '\u81c0\u90e8', category: 'skill' },
    science: { key: 'science', target: 'science', label: '\u79d1\u5b66', category: 'school' },
    maths: { key: 'maths', target: 'maths', label: '\u6570\u5b66', category: 'school' },
    english: { key: 'english', target: 'english', label: '\u82f1\u8bed', category: 'school' },
    history: { key: 'history', target: 'history', label: '\u5386\u53f2', category: 'school' }
  };

  var NPC_RELATION_SCHEMA = {
    love: { key: 'love', label: '\u597d\u611f' },
    lust: { key: 'lust', label: '\u6b32\u671b' },
    dom: { key: 'dom', label: '\u652f\u914d' },
    rage: { key: 'rage', label: '\u6124\u6012' },
    trust: { key: 'trust', label: '\u4fe1\u4efb' }
  };

  function clone(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (key) {
      out[key] = Object.assign({}, obj[key]);
    });
    return out;
  }

  function resolveRuntimeStat(key) {
    key = String(key || '').toLowerCase().trim();
    return RUNTIME_STAT_SCHEMA[key] || null;
  }

  function getRuntimeStatLabel(key) {
    var spec = resolveRuntimeStat(key);
    return spec ? spec.label : String(key || '');
  }

  function getRuntimeStatLimit(key, defaultLimit) {
    var spec = resolveRuntimeStat(key);
    defaultLimit = Math.max(0, parseInt(defaultLimit, 10) || 0);
    if (spec && spec.limit === 'money') return Math.max(100000, defaultLimit * 200);
    return defaultLimit;
  }

  function formatRuntimeStatAllowlist() {
    var seen = {};
    var keys = [];
    Object.keys(RUNTIME_STAT_SCHEMA).forEach(function (key) {
      var spec = RUNTIME_STAT_SCHEMA[key];
      if (!spec || seen[spec.key]) return;
      seen[spec.key] = true;
      keys.push(spec.key);
    });
    return keys.sort().join(', ');
  }

  function normalizeRuntimeStatPart(part, explicitMoneyDelta) {
    part = String(part || '').trim();
    var m = part.match(/^(\w+)\s*([+-]\d+)/);
    if (!m) return null;
    var spec = resolveRuntimeStat(m[1]);
    if (!spec) return null;
    var delta = parseInt(m[2], 10);
    if (!delta) return null;
    if (spec.target === 'money' && explicitMoneyDelta && Math.sign(explicitMoneyDelta) === Math.sign(delta) && Math.abs(explicitMoneyDelta) !== Math.abs(delta)) {
      delta = explicitMoneyDelta;
    }
    return {
      key: spec.key,
      target: spec.target,
      delta: delta,
      label: spec.label,
      category: spec.category,
      text: spec.key + (delta >= 0 ? '+' : '') + delta
    };
  }

  function pushNormalisedStatPart(out, seen, part, explicitMoneyDelta) {
    var normalized = normalizeRuntimeStatPart(part, explicitMoneyDelta);
    if (!normalized) return null;
    seen = seen || {};
    if (seen[normalized.target]) return null;
    seen[normalized.target] = true;
    if (out && typeof out.push === 'function') out.push(normalized.text);
    return normalized;
  }

  function getNpcRelationSchema() {
    return clone(NPC_RELATION_SCHEMA);
  }

  function resolveNpcRelationField(field) {
    field = String(field || '').toLowerCase().trim();
    return NPC_RELATION_SCHEMA[field] || null;
  }

  function formatNpcRelationshipChange(change) {
    if (!change || !change.npc || !change.field || !change.delta) return '';
    var spec = resolveNpcRelationField(change.field);
    if (!spec) return '';
    var delta = parseInt(change.delta, 10);
    if (!delta) return '';
    return change.npc + ':' + spec.key + (delta >= 0 ? '+' : '') + delta;
  }

  var module = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    getRuntimeStatSchema: function () { return clone(RUNTIME_STAT_SCHEMA); },
    resolveRuntimeStat: resolveRuntimeStat,
    getRuntimeStatLabel: getRuntimeStatLabel,
    getRuntimeStatLimit: getRuntimeStatLimit,
    formatRuntimeStatAllowlist: formatRuntimeStatAllowlist,
    normalizeRuntimeStatPart: normalizeRuntimeStatPart,
    pushNormalisedStatPart: pushNormalisedStatPart,
    getNpcRelationSchema: getNpcRelationSchema,
    resolveNpcRelationField: resolveNpcRelationField,
    formatNpcRelationshipChange: formatNpcRelationshipChange
  };

  root.AIStoryGenEventSchemaModule = module;
  root.AIStoryGen.EventSchemaModule = module;
})(typeof window !== 'undefined' ? window : globalThis);
