/* ============================================================
 * AIStoryGen link classifier
 * Centralizes rules for vanilla links that must not receive
 * AI story generation buttons.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  var GAME_MENU_PASSAGES = [
    'Settings', 'Attitudes', 'Traits', 'Social', 'Characteristics', 'Journal',
    'Wardrobe', 'Mirror', 'Sextoys Inventory', 'PillCollection', 'Feats', 'Cheats',
    'Statistics', 'Start', 'Save', 'Load',
    'AIStoryGen_Config', 'AIStoryGen_Demo', 'AIPixelGen_Config', 'AIPixelGen_Workshop',
    'Clothing Shop', 'Pet Shop', 'Forest Shop', 'Market Stall',
    'Tailor', 'Boutique', 'Equipment Shop'
  ];

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cleanLinkText(value) {
    return normalizeText(value)
      .replace(/^\s*(?:\(\d+\)|\d+[\.\)\]]?)\s*/, '')
      .replace(/\s*\[[^\]]+\]\s*$/g, '')
      .replace(/\s*[\(（]\s*\d+\s*:\s*\d{1,2}\s*[\)）]\s*$/g, '')
      .replace(/[\uFF1A:]\s*$/g, '')
      .trim();
  }

  function compactText(value) {
    return cleanLinkText(value).replace(/\s+/g, '');
  }

  function isGameMenuPassage(name) {
    name = normalizeText(name);
    if (!name) return false;
    for (var i = 0; i < GAME_MENU_PASSAGES.length; i++) {
      if (name === GAME_MENU_PASSAGES[i]) return true;
    }
    if (/^(AIStoryGen|AIPixelGen)_/i.test(name)) return true;
    if (name.indexOf('SettingsTab') === 0) return true;
    if (/^(Farm Upgrades|Farm Upgrade|Upgrade|Upgrades)\b/i.test(name)) return true;
    return false;
  }

  function isSettingsOrUtilityLink(targetPassage, linkText, rowText) {
    var target = normalizeText(targetPassage);
    if (isGameMenuPassage(target)) return true;
    if (/^(AIStoryGen|AIPixelGen)_/i.test(target)) return true;
    if (/(^|[\s_-])(settings?|options?|attitudes?|traits?|journal|statistics?|stats|save|load|cheats?|feats?|wardrobe|mirror)([\s_-]|$)/i.test(target)) return true;

    var zhExact = {
      '\u6e38\u620f\u8bbe\u7f6e': true,
      '\u8bbe\u7f6e': true,
      '\u9009\u9879': true,
      '\u6001\u5ea6': true,
      '\u7279\u8d28': true,
      '\u7edf\u8ba1': true,
      '\u65e5\u5fd7': true,
      '\u7b14\u8bb0': true,
      '\u5b58\u6863': true,
      '\u4fdd\u5b58': true,
      '\u8bfb\u6863': true,
      '\u52a0\u8f7d': true,
      '\u6210\u5c31': true,
      '\u4f5c\u5f0a': true,
      '\u8863\u67dc': true,
      '\u955c\u5b50': true,
      '\u5173\u95ed': true
    };
    var candidates = [cleanLinkText(linkText), cleanLinkText(rowText)];
    for (var i = 0; i < candidates.length; i++) {
      var clean = candidates[i];
      if (!clean) continue;
      if (zhExact[clean.replace(/\s+/g, '')]) return true;
      if (/^(?:game settings|settings|options|attitudes|traits|journal|notes|statistics|stats|save|load|cheats|feats|wardrobe|mirror|close)$/i.test(clean)) return true;
    }
    return false;
  }

  function isLeaveLikeLink(text) {
    var compact = compactText(text);
    if (/^(\u79bb\u5f00|\u79bb\u5f00\u8fd9\u91cc|\u51fa\u53bb|\u51fa\u95e8|\u5916\u51fa|\u8d70\u5f00|\u8fd4\u56de|\u56de\u53bb|\u9000\u51fa|\u5173\u95ed)$/i.test(compact)) return true;
    var clean = cleanLinkText(text);
    return /\bleave\b/i.test(clean) || /^(?:exit|back|return|close)$/i.test(clean);
  }

  function isTakeAllLink(text) {
    var compact = compactText(text);
    if (/^(\u62ff\u53d6\u5168\u90e8|\u62ff\u8d70\u5168\u90e8|\u62fe\u53d6\u5168\u90e8|\u6536\u4e0b\u5168\u90e8|\u5168\u90e8\u62ff\u53d6|\u5168\u90e8\u62ff\u8d70|\u5168\u90e8\u62fe\u53d6|\u5168\u90e8\u6536\u4e0b)$/i.test(compact)) return true;
    return /^(?:take all|take everything|collect all|pick up all|loot all)$/i.test(cleanLinkText(text));
  }

  function isDirectSettlementAction(targetPassage, linkText) {
    var target = normalizeText(targetPassage);
    var clean = cleanLinkText(linkText);
    var compact = compactText(linkText);

    // These vanilla actions apply time, items, relationship, or stat changes in
    // the link body before showing a fixed result passage. AI should not replace
    // them because it can desync the actual game state from the written story.
    if (/^Eden (?:Salve|Soap|Stock|Sweep|Fix|Design|Scarf|Table)$/i.test(target)) return true;

    if (/^(?:make salves?|make soap|take stock(?: of .* supplies)?|sweep(?: the floor)?|sew .* clothes?|sew designs?|make a scarf|relax)$/i.test(clean)) return true;
    if (/^(?:\u5236\u4f5c\u836f\u818f|\u5236\u9020\u80a5\u皂|\u6e05\u70b9.*\u7269\u8d44|\u626b\u5730|\u7f1d\u8865.*\u8863\u670d|\u7f1d.*\u6795|\u5236\u4f5c.*\u56f4\u5dfe|\u653e\u677e)$/i.test(compact)) return true;
    return false;
  }

  function classifyAIStoryLink(data) {
    data = data || {};
    var text = normalizeText(data.linkText);
    if (!text) return { skip: true, reason: 'empty', type: 'empty', text: '' };

    var rowText = normalizeText(data.rowText);
    if (isSettingsOrUtilityLink(data.targetPassage, text, rowText)) {
      return { skip: true, reason: 'utility link', type: 'utility', text: cleanLinkText(text) };
    }
    if (isLeaveLikeLink(text)) {
      return { skip: true, reason: 'leave link', type: 'leave', text: cleanLinkText(text) };
    }
    if (isTakeAllLink(text)) {
      return { skip: true, reason: 'take-all link', type: 'take_all', text: cleanLinkText(text) };
    }
    if (isDirectSettlementAction(data.targetPassage, text)) {
      return { skip: true, reason: 'direct settlement action', type: 'direct_settlement', text: cleanLinkText(text) };
    }
    if (/^\s*(?:\(\d+\)\s*)?(?:\u79bb\u5f00|Leave)\s*(?:\[[^\]]+\])?\s*$/i.test(rowText)) {
      return { skip: true, reason: 'leave row', type: 'leave', text: cleanLinkText(text) };
    }
    return { skip: false, reason: 'story action', type: 'story', text: cleanLinkText(text) };
  }

  function shouldSkipAIStoryLink(data) {
    return !!classifyAIStoryLink(data).skip;
  }

  function create() {
    return {
      schemaVersion: 1,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      classifyAIStoryLink: classifyAIStoryLink,
      shouldSkipAIStoryLink: shouldSkipAIStoryLink,
      isGameMenuPassage: isGameMenuPassage,
      isSettingsOrUtilityLink: isSettingsOrUtilityLink,
      isLeaveLikeLink: isLeaveLikeLink,
      isTakeAllLink: isTakeAllLink,
      isDirectSettlementAction: isDirectSettlementAction,
      cleanLinkText: cleanLinkText
    };
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    classifyAIStoryLink: classifyAIStoryLink,
    shouldSkipAIStoryLink: shouldSkipAIStoryLink,
    isGameMenuPassage: isGameMenuPassage,
    isSettingsOrUtilityLink: isSettingsOrUtilityLink,
    isLeaveLikeLink: isLeaveLikeLink,
    isTakeAllLink: isTakeAllLink,
    isDirectSettlementAction: isDirectSettlementAction,
    cleanLinkText: cleanLinkText
  };

  root.AIStoryGen.LinkClassifierModule = moduleApi;
  root.AIStoryGenLinkClassifierModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
