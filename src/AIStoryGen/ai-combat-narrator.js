/* ============================================================
 * AIStoryGen combat narrator helpers
 * Pure helpers for combat UI text detection and lifecycle data.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isCombatStatLine(text) {
    return /\(\s*\d+\s*\/\s*\d+\s*\)/.test(String(text || ''));
  }

  function isCombatControlBoundaryText(text) {
    text = normalizeText(text);
    return /(切换到可选行动|切换到顺从行动|切换到反抗行动|可选行动|顺从行动|反抗行动|休息|亲吻|拉开距离|抚摸|抓住|遮住|战斗菜单|结束战斗|Switch to|Actions|Submissive|Defiant|Struggle|Rest|Kiss|Combat Menu|Battle Menu)/i.test(text);
  }

  function partLabelFromText(text) {
    text = normalizeText(text);
    var m = text.match(/你的([^。；\n]{1,24}?)(?:是自由的|拿着|被[^。；\n]{0,24}(?:占据|占用|抓住|束缚)|无法|不能)/);
    if (m && m[1]) return m[1].replace(/[。；，,.]/g, '').trim();
    m = text.match(/你感到[^。；\n]{0,24}?在[^。；\n]{0,10}?你([^。；\n]{1,24}?)(?:。|$)/);
    if (m && m[1]) return m[1].replace(/[。；，,.]/g, '').trim();
    m = text.match(/Your ([^.\n]{1,24}?)(?: is free| is occupied| is bound| cannot| is holding)/i);
    if (m && m[1]) return m[1].trim();
    return '';
  }

  function headingTextAt(texts, index) {
    texts = Array.isArray(texts) ? texts : [];
    index = Number(index || 0);
    var zhHeading = /(?:你的[^。；\n]{1,36}(?:是自由的|拿着|被[^。；\n]{0,24}(?:占据|占用|抓住|束缚)|无法|不能)|你感到[^。；\n]{0,24}?在[^。；\n]{0,10}?你[^。；\n]{1,24}?(?:。|$))/;
    var actionStart = /^(休息|抚摸|亲吻|抓住|遮住|戴上|给他|拿起|脱掉|摩擦|玩弄|拉开|别在|不做什么)/;
    var parts = [];
    for (var i = index; i < texts.length && i < index + 8; i++) {
      var t = normalizeText(texts[i]);
      if (i === index && !/^(?:你的|你感到|Your\b)/.test(t)) return '';
      if (t) parts.push(t);
      var joined = parts.join('');
      if (zhHeading.test(joined)) return joined;
      var english = parts.join(' ');
      if (/Your [^.\n]{1,36}(?: is free| is occupied| is bound| cannot| is holding)/i.test(english)) return english;
      if (parts.length > 1 && actionStart.test(t)) break;
    }
    return String(texts[index] || '');
  }

  function isCombatGroupBoundaryText(text) {
    text = normalizeText(text);
    return /^(\(\d+\)(?:\s*继续)?|继续|0\.5\.\d|战斗菜单|AI\s*补充|刷新选项|返回游戏|AI\s*记忆)$/.test(text)
      || /^(0\.5\.\d|战斗菜单|刷新选项|返回游戏|AI\s*记忆|Combat Menu|Battle Menu)/i.test(text);
  }

  function isContinueCombatControlText(text, passage, className) {
    var hay = normalizeText((text || '') + ' ' + (passage || ''));
    return /(\(?1\)?\s*继续|继续|Continue)/i.test(hay)
      && !/AI|doli-cn|ai-/i.test(String(className || ''));
  }

  function isBattleMenuControlText(text, passage) {
    return /(战斗菜单|Combat Menu|Battle Menu)/i.test(normalizeText((text || '') + ' ' + (passage || '')));
  }

  function createAnchorState() {
    return { initialNames: {}, prevNames: {}, hintedSwitches: {} };
  }

  function prevOutputs(outputs, windowK) {
    windowK = Number(windowK || 0);
    if (windowK <= 0 || !Array.isArray(outputs)) return [];
    return outputs.slice(-windowK);
  }

  function setCustomIntentDraft(drafts, part, text) {
    drafts = drafts && typeof drafts === 'object' ? drafts : {};
    part = normalizeText(part) || '动作';
    text = normalizeText(text);
    if (!text) delete drafts[part];
    else drafts[part] = text.slice(0, 500);
    return drafts;
  }

  function consumeCustomIntentDrafts(drafts, maxLen) {
    drafts = drafts && typeof drafts === 'object' ? drafts : {};
    var parts = [];
    Object.keys(drafts).forEach(function (part) {
      var text = normalizeText(drafts[part]);
      if (text) parts.push(part + ': ' + text);
    });
    return parts.join('\n').slice(0, maxLen || 1200);
  }

  function createEmptyIntent(actionKeys, targetKeys, customText) {
    var intent = {};
    (Array.isArray(actionKeys) ? actionKeys : []).forEach(function (key) { intent[key] = 0; });
    (Array.isArray(targetKeys) ? targetKeys : []).forEach(function (key) { intent[key] = 0; });
    intent.customPlayerNarrative = customText || '';
    return intent;
  }

  function cloneJSON(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function isLikelySettlementText(originalText, opts) {
    opts = opts || {};
    if (opts.combatActive) return false;
    if (opts.hasExistingBlock) return false;
    var text = normalizeText(originalText);
    if (text.length < 60) return false;
    if (/请选择游戏模式|基础开局|存档名|当前设置/.test(text)) return false;
    return /(高潮|精液|射精|亲吻|吻你|爱你|梦乡|自信|嫉妒|余韵|climax|orgasm|cum|kiss)/i.test(text);
  }

  function isBrokenTentacleState(vars) {
    var t = vars && vars.tentacles;
    if (!t || typeof t !== 'object') return true;
    var max = Number(t.max || 0);
    if (!max || max < 1) return true;
    if (!t[0] || typeof t[0] !== 'object') return true;
    if (!String(t[0].type || '').trim()) return true;
    return false;
  }

  function combatEndLabels() {
    return {
      neutral: '平稳结束',
      escape: '脱身离开',
      advantage: '占上风结束',
      submit: '顺从结束'
    };
  }

  var CombatNarratorModule = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    normalizeText: normalizeText,
    isCombatStatLine: isCombatStatLine,
    isCombatControlBoundaryText: isCombatControlBoundaryText,
    partLabelFromText: partLabelFromText,
    headingTextAt: headingTextAt,
    isCombatGroupBoundaryText: isCombatGroupBoundaryText,
    isContinueCombatControlText: isContinueCombatControlText,
    isBattleMenuControlText: isBattleMenuControlText,
    createAnchorState: createAnchorState,
    prevOutputs: prevOutputs,
    setCustomIntentDraft: setCustomIntentDraft,
    consumeCustomIntentDrafts: consumeCustomIntentDrafts,
    createEmptyIntent: createEmptyIntent,
    cloneJSON: cloneJSON,
    isLikelySettlementText: isLikelySettlementText,
    isBrokenTentacleState: isBrokenTentacleState,
    combatEndLabels: combatEndLabels
  };

  root.AIStoryGen.CombatNarratorModule = CombatNarratorModule;
  root.AIStoryGenCombatNarratorModule = CombatNarratorModule;
})(typeof window !== 'undefined' ? window : globalThis);
