/* ============================================================
 * AIStoryGen item schema
 * Normalizes AI-created inventory item names and rejects scene/action text.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  var EN_TO_ZH = {
    'dog food': '\u72d7\u7cae',
    'clean water': '\u6e05\u6c34',
    water: '\u6e05\u6c34',
    key: '\u94a5\u5319',
    'small key': '\u5c0f\u94a5\u5319',
    'rusty key': '\u751f\u9508\u94a5\u5319',
    feather: '\u7fbd\u6bdb',
    'large feather': '\u5927\u7fbd\u6bdb',
    'hawk feather': '\u9e70\u7fbd',
    'eagle feather': '\u9e70\u7fbd',
    gem: '\u5b9d\u77f3',
    gemstone: '\u5b9d\u77f3',
    'red gem': '\u7ea2\u5b9d\u77f3',
    'dark red gem': '\u6697\u7ea2\u5b9d\u77f3',
    'red gemstone': '\u7ea2\u5b9d\u77f3',
    egg: '\u9e1f\u86cb',
    'bird egg': '\u9e1f\u86cb',
    rope: '\u7ef3\u5b50',
    note: '\u7eb8\u6761',
    map: '\u5730\u56fe',
    herb: '\u8349\u836f',
    herbs: '\u8349\u836f',
    'wild herb': '\u91ce\u751f\u8349\u836f',
    flower: '\u82b1',
    'wild flower': '\u91ce\u82b1',
    berries: '\u91ce\u679c',
    berry: '\u91ce\u679c',
    bone: '\u9aa8\u5934',
    stick: '\u6728\u68cd',
    camisole: '\u540a\u5e26\u80cc\u5fc3',
    tabi: '\u8db3\u888b',
    zori: '\u8349\u5c65',
    'wooden clogs': '\u6728\u5c50',
    'gold chain': '\u91d1\u94fe',
    'gold chains': '\u91d1\u94fe',
    'gold bracelet': '\u91d1\u624b\u956f',
    'gold bracelets': '\u91d1\u624b\u956f'
  };

  var COMMON_WORN_ITEM_RE = /^(?:camisole|tabi|zori|wooden clogs?|gold chains?|gold bracelets?|吊带背心|吊带衫|贴身背心|足袋|木屐|草履|金链|金项链|金手镯|发饰|羽饰发夹|蝴蝶结|臂套)$/i;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function translateItemNameToChinese(name) {
    var raw = cleanText(name);
    return EN_TO_ZH[raw.toLowerCase()] || raw;
  }

  function isBadAiItemPhrase(text) {
    text = cleanText(text);
    if (!text) return true;
    if (COMMON_WORN_ITEM_RE.test(text)) return true;
    if (/^(?:itemsGained|items_gained|items|itemsLost|items_lost|lostItems|statChanges|relationshipChanges|presentCharacters|presentEntities|sexTargets|memoryTags|location|targetLocation|locationStatus|eventType|summary|moneyChange)\s*[:=]?\s*$/i.test(text)) return true;
    if (/^(?:itemsLost|items_lost|lostItems|statChanges|relationshipChanges|presentCharacters|presentEntities|sexTargets|memoryTags|location|targetLocation|locationStatus|eventType|summary|moneyChange)\s*[:=]/i.test(text)) return true;
    if (text.length > 24) return true;
    if (/\b(?:open|opened|closed|locked|broken|stuck|blocked)\b.{0,16}\b(?:door|gate|window|room|floor|wall|corridor|hallway|coop|kennel|barn|stable|fence)\b/i.test(text)) return true;
    if (/\b(?:door|gate|window|room|floor|wall|corridor|hallway|coop|kennel|barn|stable|fence)\b.{0,16}\b(?:open|opened|closed|locked|broken|stuck|blocked)\b/i.test(text)) return true;
    if (/\b(?:feeling|sense|memory|thought|idea|mood|emotion|warmth|calm|fear|desire|freedom|peace|silence|sound|scent|smell|air|wind|light|shadow|glow|presence|attention|gaze|trust|confidence|arousal)\b/i.test(text)) return true;
    if (/^[A-Za-z]+(?:\s+[A-Za-z]+){2,}$/.test(text) && !/\b(?:food|water|key|feather|egg|rope|note|map|herb|flower|berries|berry|bone|stick|tool|bottle|cloth|coin|ticket|card)\b/i.test(text)) return true;
    if (/[\u3002\uff01\uff1f\uff1b;.!?]/.test(text)) return true;
    if (/(\u5b83|\u4ed6|\u5979|\u53ea\u662f|\u5b9e\u9645\u4e0a|\u88ab|\u5361\u4f4f|\u5361\u5728|\u6321\u4f4f|\u538b\u4f4f|\u770b\u8d77\u6765|\u4f3c\u4e4e|\u597d\u50cf)/.test(text)) return true;
    if (/(\u5927\u655e|\u5f00\u7740|\u5173\u7740|\u534a\u5f00|\u9501\u7740|\u623f\u95f4|\u573a\u666f|\u8d70\u5eca|\u9e21\u820d|\u725b\u68da|\u72d7\u820d|\u6728\u95e8|\u5927\u95e8|\u95e8|\u7a97\u6237|\u7a97|\u5730\u677f|\u5899|\u5929\u7a7a|\u9633\u5149|\u9634\u5f71|\u6c14\u5473|\u58f0\u97f3|\u811a\u6b65|\u98ce|\u96e8|\u5c18\u571f|\u8349\u5c51|\u6ce5\u571f)/.test(text)) return true;
    if (/(\u6b63\u5728|\u4ecd\u7136|\u4f9d\u7136|\u5df2\u7ecf|\u53d8\u5f97|\u663e\u5f97|\u770b\u89c1|\u770b\u5230|\u7559\u4e0b|\u901a\u5411|\u8fde\u7740)/.test(text)) return true;
    var knownPerson = /(?:\u4e9a\u5386\u514b\u65af|\u827e\u5229\u514b\u65af|\u7f57\u5bbe|\u60e0\u7279\u5c3c|\u51ef\u62c9\u5c14|\u4f0a\u7538|\u6089\u5c3c|\u897f\u5fb7\u5c3c|\u82cf\u5fb7\u5c3c|\u827e\u5f17\u91cc|\u8d1d\u5229|Alex|Robin|Whitney|Kylar|Eden|Sydney|Avery|Bailey)/i;
    var actionVerb = /(?:\u6b63\u5728|\u6b63|\u4ecd\u5728|\u4f9d\u7136)?(?:\u8e72|\u7ad9|\u5750|\u8dea|\u8eba|\u9760|\u770b|\u671b|\u62b1|\u8d70|\u8dd1|\u8bf4|\u4f4e\u5934|\u62ac\u5934|\u8f6c\u8eab|\u4f38\u624b|\u7f29|\u7b11|\u54ed|\u7b49|\u505c)/;
    var locationTail = /(?:\u5728|\u5230|\u671d|\u9760\u8fd1).{0,12}(?:\u8fb9|\u65c1|\u91cc|\u4e0a|\u4e0b|\u524d|\u540e|\u9644\u8fd1|\u6805\u680f|\u6811\u4e0b|\u95e8\u53e3|\u89d2\u843d)$/;
    if (knownPerson.test(text) && (actionVerb.test(text) || locationTail.test(text))) return true;
    if (actionVerb.test(text) && locationTail.test(text)) return true;
    if (/^(?:\u4ed6|\u5979|\u5b83|\u4ed6\u4eec|\u5979\u4eec|\u90a3\u4e2a\u4eba|\u90a3\u53ea\u52a8\u7269)\s*/.test(text)) return true;
    if (/(?:\u6b63\u8e72|\u6b63\u5750|\u6b63\u7ad9|\u8e72\u5728|\u5750\u5728|\u7ad9\u5728|\u9760\u5728|\u8d70\u5230|\u8d70\u5411|\u671b\u7740|\u770b\u7740)/.test(text)) return true;
    return false;
  }

  function normaliseAiItemName(name) {
    name = cleanText(name);
    name = name.replace(/^(?:itemsGained|items_gained|items)\s*[:=]\s*/i, '').trim();
    name = name.replace(/\s*[\(\uff08]\s*(?:gained|obtained|acquired|\u83b7\u5f97|\u5df2\u83b7\u5f97)\s*[\)\uff09]\s*$/i, '').trim();
    name = name.replace(/\s*(?:x|\u00d7|\*)\s*\d+\s*$/i, '').trim();
    name = translateItemNameToChinese(name);
    if (isBadAiItemPhrase(name)) return '';
    name = name.replace(/^(?:\u4f60|PC|player)\s*(?:\u62ff\u8d77|\u62ff\u5230|\u6536\u4e0b|\u5f97\u5230|\u627e\u5230|\u53d1\u73b0|\u6361\u5230|\u62fe\u8d77)\s*/i, '').trim();
    name = name.replace(/^(?:\u8fd9\u91cc|\u90a3\u91cc|\u5730\u4e0a|\u684c\u4e0a|\u67b6\u5b50\u4e0a|\u89d2\u843d\u91cc|\u9e21\u820d\u91cc|\u72d7\u820d\u91cc|\u623f\u95f4\u91cc)\s*(?:\u6709|\u5806\u653e\u7740|\u653e\u7740|\u6446\u7740)?\s*/i, '').trim();
    name = name.replace(/^(?:\u4e00|\u51e0|\u6570|\u4e9b|\u4e00\u4e9b)?(?:\u4e2a|\u4ef6|\u628a|\u679a|\u6839|\u6761|\u53ea|\u5f20|\u672c|\u74f6|\u7f50|\u888b|\u76d2|\u6876|\u5757|\u526f|\u53cc|\u5806|\u4efd|\u5305)+(?:\u7684)?/, '').trim();
    name = name.replace(/(?:\u7684)?(?:\u6728\u95e8|\u5927\u95e8|\u95e8|\u7a97\u6237|\u7a97|\u6805\u680f|\u5899|\u5730\u677f|\u623f\u95f4|\u9e21\u820d|\u725b\u68da|\u72d7\u820d)\s*(?:\u5927\u655e\u7740|\u5f00\u7740|\u5173\u7740|\u534a\u5f00|\u9501\u7740|\u574f\u4e86|\u7834\u4e86)?$/i, '').trim();
    name = name.replace(/^(?:old|new|small|large|wooden|open|closed)\s+/i, '').trim();
    name = name.replace(/[\u3001\u3002\uff01!?,\uff0c\uff1b;\uff1a:]+$/g, '').trim();
    if (name.length > 16) name = name.slice(0, 16).trim();
    return name;
  }

  function isBadAiItemName(name) {
    name = cleanText(name);
    if (!name || name.length < 2 || name.length > 16) return true;
    if (isBadAiItemPhrase(name)) return true;
    if (/(^|\s)(it|this|that|something|anything)(\s|$)/i.test(name)) return true;
    if (/^(?:\u8fd9|\u90a3|\u8fd9\u4e2a|\u90a3\u4e2a)/.test(name)) return true;
    if (/^(?:door|gate|window|room|scene|floor|wall|corridor|hallway|coop|kennel|barn|stable|fence|sky|sunlight|shadow|sound|scent|smell|air|wind|light|warmth|calm|fear|desire|peace|silence)$/i.test(name)) return true;
    return false;
  }

  function parseAiItemToken(token) {
    token = cleanText(token);
    if (!token || isBadAiItemPhrase(token)) return null;
    if (/(^|\s)(it|this|that|something|anything)(\s|$)/i.test(token)) return null;
    var qty = 1;
    var m = token.match(/(.+?)\s*(?:x|\u00d7|\*)\s*(\d+)$/i) || token.match(/(.+?)\s*[\(\uff08](\d+)[\)\uff09]$/);
    if (m) {
      token = m[1].trim();
      qty = Math.max(1, parseInt(m[2], 10) || 1);
    }
    var name = normaliseAiItemName(token);
    if (isBadAiItemName(name)) return null;
    if (/(\u94b1|\u91d1\u94b1|\u73b0\u91d1|\u786c\u5e01|\u949e\u7968|\u7eb8\u5e01|\u4fbf\u58eb|\u82f1\u9551|\u00a3|pence|money|cash|coin|coins|note|notes)/i.test(name)) return null;
    return { name: name, qty: qty };
  }

  function expandAiItemTokens(token) {
    token = cleanText(token);
    if (!token) return [];
    var parts = token.split(/(?:\u548c|\u4e0e|\u53ca|\u3001|,|;|\uff0c|\uff1b)/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return parts.length > 1 ? parts : [token];
  }

  function mergeAiItemListByName(items) {
    var merged = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var name = normaliseAiItemName(item && item.name);
      var qty = Math.max(1, parseInt(item && item.qty, 10) || 1);
      if (isBadAiItemName(name)) return;
      var existing = null;
      for (var i = 0; i < merged.length; i++) {
        if (merged[i] && merged[i].name === name) {
          existing = merged[i];
          break;
        }
      }
      if (existing) existing.qty = Math.max(Math.max(1, parseInt(existing.qty, 10) || 1), qty);
      else merged.push({ name: name, qty: qty });
    });
    return merged;
  }

  function formatRuntimeItemForEvent(item) {
    var name = normaliseAiItemName(item && item.name);
    var qty = Math.max(1, parseInt(item && item.qty, 10) || 1);
    return name && !isBadAiItemName(name) ? name + (qty > 1 ? ' x' + qty : '') : '';
  }

  var module = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    translateItemNameToChinese: translateItemNameToChinese,
    normaliseAiItemName: normaliseAiItemName,
    normalizeAiItemName: normaliseAiItemName,
    isBadAiItemName: isBadAiItemName,
    isBadAiItemPhrase: isBadAiItemPhrase,
    parseAiItemToken: parseAiItemToken,
    expandAiItemTokens: expandAiItemTokens,
    mergeAiItemListByName: mergeAiItemListByName,
    formatRuntimeItemForEvent: formatRuntimeItemForEvent
  };

  root.AIStoryGenItemSchemaModule = module;
  root.AIStoryGen.ItemSchemaModule = module;
})(typeof window !== 'undefined' ? window : globalThis);
