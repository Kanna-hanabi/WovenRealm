/* AIStoryGen native target detector.
 *
 * Owns direct sex-mode target detection and loose/strict entry gating. The
 * native scene bridge still owns the public UI/action API.
 */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  var NATIVE_SEX_TEMPLATES = [
    { re: /(\u7f57\u5bbe|Robin)/i, passage: 'Bed Robin Sex', label: '\u7f57\u5bbe', npc: 'Robin', setup: '<<endcombat>><<set $sexstart to 1>><<npc Robin>><<person1>>' },
    { re: /(\u51ef\u62c9\u5c14|Kylar)/i, passage: 'Street Kylar Sex', label: '\u51ef\u62c9\u5c14', npc: 'Kylar', preSetup: '<<set $location to "town">>', setup: '<<endcombat>><<set $sexstart to 1>><<set $location to "town">><<npc Kylar>><<person1>>' },
    { re: /(\u8d1d\u5229|Bailey)/i, passage: 'Avery Cards Bailey Sex', label: '\u8d1d\u5229', npc: 'Bailey', setup: '<<endcombat>><<set $sexstart to 1>><<npc Bailey>><<person1>>' },
    { re: /(\u4f0a\u7538|Eden)/i, passage: 'Eden Bath Sex', label: '\u4f0a\u7538', npc: 'Eden', setup: '<<endcombat>><<set $sexstart to 1>><<npc Eden>><<person1>>' },
    { re: /(\u60e0\u7279\u5c3c|Whitney)/i, passage: 'Maths Whitney Sex', label: '\u60e0\u7279\u5c3c', npc: 'Whitney', setup: '<<endcombat>><<set $sexstart to 1>><<npc Whitney>><<person1>>' },
    { re: /(\u827e\u5f17\u91cc|Avery)/i, passage: 'Avery Cards Bailey Sex', label: '\u827e\u5f17\u91cc', npc: 'Avery', setup: '<<endcombat>><<set $sexstart to 1>><<npc Avery>><<person1>>' },
    { re: /(\u4e9a\u5386\u514b\u65af|Alex)/i, passage: 'Farm Alex Sex', label: '\u4e9a\u5386\u514b\u65af', npc: 'Alex', setup: '<<endcombat>><<set $sexstart to 1>><<npc Alex>><<person1>>' },
    { re: /(\u5e03\u8d56\u5c14|Briar)/i, passage: 'Briar Sex', label: '\u5e03\u8d56\u5c14', npc: 'Briar', setup: '<<endcombat>><<npc Briar>><<person1>><<set $sexstart to 1>>' },
    { re: /(\u83b1\u987f|Leighton)/i, passage: "Head's Office Photoshoot Sex", label: '\u83b1\u987f', npc: 'Leighton', preSetup: '<<set $phase to 1>>', setup: '<<endcombat>><<set $sexstart to 1>><<set $phase to 1>><<npc Leighton>><<person1>>' },
    { re: /(\u89e6\u624b|tentacle|tentacles)/i, passage: 'Street Tentacle Sex', label: '\u89e6\u624b', preSetup: '<<set $phase to 0>>', setup: '<<endcombat>><<set $sexstart to 1>><<set $phase to 0>>' },
    { re: /(\u72d7|\u72ac|dog)/i, passage: 'Beast Sex', label: '\u72d7', setup: '<<endcombat>><<set $sexstart to 1>>' },
    { re: /(\u72fc|wolf)/i, passage: 'Beast Sex', label: '\u72fc', setup: '<<endcombat>><<set $sexstart to 1>>' }
  ];

  var KNOWN_CUSTOM_NPCS = {
    Charlie: 'Charlie', Darryl: 'Darryl', Doren: 'Doren', Gwylan: 'Gwylan', Harper: 'Harper',
    Jordan: 'Jordan', Landry: 'Landry', Mason: 'Mason', Morgan: 'Morgan', Niki: 'Niki',
    Quinn: 'Quinn', Remy: 'Remy', River: 'River', Sam: 'Sam', Sirris: 'Sirris',
    Sydney: 'Sydney', Winter: 'Winter', Wren: 'Wren', Zephyr: 'Zephyr'
  };

  var KNOWN_CUSTOM_NPC_LABELS = {
    Jordan: '\u7ea6\u65e6',
    Sydney: '\u6089\u5c3c',
    Winter: '\u6e29\u7279',
    Wren: '\u96f7\u6069'
  };

  var KNOWN_CUSTOM_NPC_ALIASES = {
    Jordan: ['\u7ea6\u65e6', '\u4e54\u4e39', 'Jordan'],
    Sydney: ['\u6089\u5c3c', '\u897f\u5fb7\u5c3c', 'Sydney'],
    Winter: ['\u6e29\u7279', 'Winter'],
    Wren: ['\u96f7\u6069', 'Wren']
  };

  function cloneTemplate(template) {
    return Object.assign({}, template);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function call(fn, args, fallback) {
    if (typeof fn !== 'function') return typeof fallback === 'function' ? fallback() : fallback;
    return fn.apply(null, args || []);
  }

  function getCandidateTemplates() {
    return NATIVE_SEX_TEMPLATES.map(cloneTemplate);
  }

  function findTemplateByName(name, extra) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    for (var i = 0; i < NATIVE_SEX_TEMPLATES.length; i++) {
      var c = NATIVE_SEX_TEMPLATES[i];
      if (c.re.test(name) || String(c.label || '').toLowerCase() === name.toLowerCase() || String(c.npc || '').toLowerCase() === name.toLowerCase()) {
        return Object.assign(cloneTemplate(c), extra || {});
      }
    }
    var custom = findKnownCustomNpcTarget(name, null, extra);
    if (custom) return custom;
    return null;
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function knownCustomNpcPattern(key) {
    var aliases = KNOWN_CUSTOM_NPC_ALIASES[key] || [KNOWN_CUSTOM_NPC_LABELS[key] || key, key];
    var parts = aliases.map(escapeRegExp).filter(Boolean);
    return parts.length ? new RegExp('(' + parts.join('|') + ')', 'i') : null;
  }

  function getKnownNpcLabels() {
    return Object.assign({}, KNOWN_CUSTOM_NPC_LABELS);
  }

  function getKnownNpcAliases() {
    var out = {};
    Object.keys(KNOWN_CUSTOM_NPC_ALIASES).forEach(function (key) {
      out[key] = (KNOWN_CUSTOM_NPC_ALIASES[key] || []).slice();
    });
    return out;
  }

  function buildKnownCustomNpcTarget(key, opts, extra) {
    opts = opts || {};
    var npc = KNOWN_CUSTOM_NPCS[key] || key;
    var label = KNOWN_CUSTOM_NPC_LABELS[key] || key;
    function npcSetup(n, suffix) {
      return call(opts.buildNpcSetup, [n, suffix || ''], function () {
        return '<<npc ' + String(n || '').trim() + (suffix || '') + '>>';
      });
    }
    return Object.assign({
      label: label,
      npc: npc,
      passage: 'Named NPC Gangbang',
      setup: '<<endcombat>><<clearnpc>><<set $sexstart to 1>>' + npcSetup(npc, ' -1')
    }, extra || {});
  }

  function findKnownCustomNpcTarget(name, opts, extra) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    var lower = name.toLowerCase();
    var keys = Object.keys(KNOWN_CUSTOM_NPCS);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var aliases = KNOWN_CUSTOM_NPC_ALIASES[key] || [KNOWN_CUSTOM_NPC_LABELS[key] || key, key];
      for (var j = 0; j < aliases.length; j++) {
        if (String(aliases[j] || '').toLowerCase() === lower) return buildKnownCustomNpcTarget(key, opts, extra);
      }
    }
    return null;
  }

  function nameContexts(hay, re, radius) {
    var out = [];
    try {
      var flags = 'g' + (re.ignoreCase ? 'i' : '') + (re.multiline ? 'm' : '');
      var rx = new RegExp(re.source, flags);
      var m;
      while ((m = rx.exec(hay)) && out.length < 20) {
        var name = String(m[0] || '');
        var left = Math.max(0, m.index - radius);
        var right = Math.min(hay.length, m.index + name.length + radius);
        out.push(hay.slice(left, right));
        if (!name) rx.lastIndex += 1;
      }
    } catch (e) {
      return [];
    }
    return out;
  }

  function absentOrReferenceContext(ctx) {
    return /(\u79bb\u5f00|\u5df2\u7ecf\u79bb\u5f00|\u4e0d\u5728|\u677e\u5f00|\u4e0d\u6253\u6270|\u60f3\u8d77|\u56de\u5fc6|\u56de\u60f3|\u60f3\u8c61|\u5e7b\u60f3|\u68a6|\u68a6\u5883|\u5b57\u8ff9|\u7eb8\u6761|\u4fe1\u5c01|\u50ac\u6b3e\u5355|\u6795\u5934|\u6c14\u606f|\u540d\u5b57|\u63d0\u5230|\u7559\u4e0b|\u7559\u7684|\u77ed\u4fe1|\u4fe1\u606f|\u624b\u673a|\u7167\u7247|\u6d77\u62a5|\u753b\u50cf|\u9001\u7684|\u6253\u7b97|\u8ba1\u5212|\u9700\u8981\u56de\u5230|\u6b20\u4e0b|\u6536\u53d6|\u9884\u7ea6|\u4efb\u52a1|\u5907\u5fd8|\u63d0\u9192|\u65f6\u6548|\u65e5\u5fd7|\u5e93\u5b58|\u7269\u54c1|\u5c0f\u5c4b|\u529e\u516c\u5ba4|left|gone|not here|remember|memory|dream|imagin|fantasy|note|letter|photo|poster|message|phone|owe|debt|collect|appointment|need to return|cabin|office|reminder|quest|journal|inventory)/i.test(ctx || '');
  }

  function isMentionOnly(hay, re) {
    var contexts = nameContexts(hay, re, 28);
    if (!contexts.length) return false;
    for (var i = 0; i < contexts.length; i++) {
      if (!absentOrReferenceContext(contexts[i])) return false;
    }
    return true;
  }

  function hasPresentContext(hay, re) {
    var contexts = nameContexts(hay, re, 48);
    for (var i = 0; i < contexts.length; i++) {
      var ctx = contexts[i];
      if (absentOrReferenceContext(ctx)) continue;
      if (/(\u6b63\u5728|\u5c31\u5728|\u5728[^，。?.]{0,12}(\u91cc|\u4e2d|\u65c1|\u524d|\u540e)|\u51fa\u73b0|\u51fa\u73b0\u5728|\u5728\u573a|\u540c\u5904|\u540c\u884c|\u7ad9|\u5750|\u8e72|\u9760\u7740|\u62b1\u7740|\u62ac\u5934|\u4f4e\u5934|\u8d70\u6765|\u8d70\u8fd1|\u9760\u8fd1|\u9762\u524d|\u8eab\u8fb9|\u65c1\u8fb9|\u8eab\u540e|\u770b\u7740|\u671b\u7740|\u5fae\u7b11|\u5f00\u53e3|\u8bf4|\u95ee|\u56de\u7b54|\u4f38\u624b|\u6293\u4f4f|\u62b1\u4f4f|\u63e1\u4f4f|\u89e6\u78b0|\u4eb2|\u543b|\u966a|\u4e00\u8d77|\u8ddf\u4f60|\u4f38\u51fa|\u63a2\u51fa|\u722c\u51fa|\u94bb\u51fa|\u62e6\u5728|\u8ddf\u7740|\u6709\u4e00\u53ea|present|appears?|stands?|sits?|walks?|beside|near|with you|says?|asks?|smiles?|looks?|reaches?|holds?|touches?)/i.test(ctx)) return true;
    }
    return false;
  }

  function addUniqueTarget(found, candidate) {
    for (var i = 0; i < found.length; i++) {
      if (found[i].label === candidate.label && found[i].passage === candidate.passage) return false;
    }
    found.push(cloneTemplate(candidate));
    return true;
  }

  function blockedMenuText(text) {
    return /\u8bf7\u9009\u62e9\u6e38\u620f\u6a21\u5f0f|\u5b58\u6863\u540d|\u5f53\u524d\u8bbe\u7f6e|NPC\u6027\u522b|\u517d\u7c7b\u5916\u89c2/.test(text || '');
  }

  function blockedPassageName(name) {
    return /^(Start|Settings|Options|Save|Load|Journal|Statistics|Cheats|Attitudes|Traits|Social|Characteristics|Wardrobe|Mirror)$/i.test(String(name || ''));
  }

  function hasNativeSceneEvidence(text) {
    return /(\u4f60|\u4ed6|\u5979|\u5b83|\u4ed6\u4eec|\u5979\u4eec|\u6b63\u5728|\u5c31\u5728|\u623f\u95f4|\u6d74|\u6e05\u6d17|\u8eab\u4f53|\u88f8\u9732|\u8131\u6389|\u80f8|\u80cc|\u9760|\u62b1|\u89e6\u78b0|\u4eb2|\u543b|\u8bf4|\u95ee|\u770b\u7740|you|he|she|they|room|bath|wash|body|naked|undress|chest|back|touch|hold|kiss|says?|asks?|looks?)/i.test(String(text || ''));
  }

  function addPassageTarget(found, text, passageName) {
    passageName = String(passageName || '').trim();
    if (!passageName || !hasNativeSceneEvidence(text)) return false;
    for (var i = 0; i < NATIVE_SEX_TEMPLATES.length; i++) {
      var c = NATIVE_SEX_TEMPLATES[i];
      if (!c.re.test(passageName)) continue;
      addUniqueTarget(found, c);
      return true;
    }
    return false;
  }

  function collectTargets(contextText, opts) {
    opts = opts || {};
    var text = contextText != null ? String(contextText) : String(call(opts.getContextText, [], '') || '');
    var pageText = String(opts.pageText || '');
    if (!text) return [];
    if (blockedMenuText(text + '\n' + pageText)) return [];
    var passageName = opts.passageName != null ? opts.passageName : call(opts.getPassageName, [], '');
    if (blockedPassageName(passageName)) return [];

    var found = safeArray(opts.structuredTargets != null ? opts.structuredTargets : call(opts.getStructuredTargets, [], [])).map(cloneTemplate);
    for (var i = 0; i < NATIVE_SEX_TEMPLATES.length; i++) {
      var c = NATIVE_SEX_TEMPLATES[i];
      if (!c.re.test(text)) continue;
      if (isMentionOnly(text, c.re)) continue;
      if (!hasPresentContext(text, c.re)) continue;
      addUniqueTarget(found, c);
    }
    Object.keys(KNOWN_CUSTOM_NPCS).forEach(function (key) {
      var re = knownCustomNpcPattern(key);
      if (!re || !re.test(text)) return;
      if (isMentionOnly(text, re)) return;
      if (!hasPresentContext(text, re)) return;
      addUniqueTarget(found, buildKnownCustomNpcTarget(key, opts, { manual: false, customKnown: true }));
    });
    addPassageTarget(found, text, passageName);
    return found.slice(0, 10);
  }

  function inferStart(contextText, opts) {
    var targets = collectTargets(contextText, opts);
    return targets && targets.length ? targets[0] : null;
  }

  function shouldShowOption(opts) {
    opts = opts || {};
    var combatActive = !!(opts.combatActive != null ? opts.combatActive : call(opts.isCombatActive, [], false));
    if (combatActive) return false;
    var text = opts.contextText != null ? String(opts.contextText) : String(call(opts.getContextText, [], '') || '');
    if (!text) return false;
    var triggerMode = Number(opts.triggerMode || 2) || 2;
    if (triggerMode === 2 && inferStart(text, opts)) return true;
    var passageName = opts.passageName != null ? opts.passageName : call(opts.getPassageName, [], '');
    var signalText = text + '\n' + String(passageName || '');
    var closeSignal = /(\u9760\u8fd1|\u8d34\u8fd1|\u6328\u7740|\u8fd1\u5728\u54ab\u5c3a|\u8ddd\u79bb\u5f88\u8fd1|\u9762\u5bf9\u9762|\u6293\u4f4f|\u62b1\u4f4f|\u62e5\u4f4f|\u6402\u4f4f|\u6309\u4f4f|\u538b\u4f4f|\u8eab\u4f53\u76f8\u8d34|\u547c\u5438\u4ea4\u9519|\u8033\u8fb9|\u89e6\u78b0|\u629a\u6478|\u4eb2\u543b|\u63a5\u543b|\u66a7\u6627|\u6311\u9017|\u6b32\u671b|\u5fc3\u8df3|\u6c14\u606f|\u6d74|\u6e05\u6d17|\u88f8\u9732|\u8131\u6389|\u80f8\u53e3|\u80cc\u4e0a|intimate|close to|kiss|embrace|hold|touch|flirt|aroused|desire|bath|wash|naked|undress)/i.test(text);
    var personSignal = /(\u7f57\u5bbe|\u60e0\u7279\u5c3c|\u8d1d\u5229|\u827e\u5f17\u91cc|\u4f0a\u7538|\u51ef\u62c9\u5c14|\u4f26\u6566|NPC|\u7537\u4eba|\u5973\u4eba|\u7537\u5b50|\u5973\u5b50|\u5bf9\u65b9|\u964c\u751f\u4eba|\u540c\u4f34|\u4eba\u5f71|\u90a3\u4e2a\u4eba|\u8eab\u65c1\u7684\u4eba|\u4f60\u4eec|Robin|Whitney|Bailey|Avery|Eden|Kylar|person|man|woman)/i.test(signalText);
    var strictClose = closeSignal || /(\u9760\u8fd1|\u8d34\u8fd1|\u8d34\u7740|\u6328\u7740|\u8ddd\u79bb\u5f88\u8fd1|\u9762\u5bf9\u9762|\u6293\u4f4f|\u62b1\u4f4f|\u62e5\u4f4f|\u6402\u4f4f|\u6309\u4f4f|\u538b\u4f4f|\u8eab\u4f53\u76f8\u8d34|\u547c\u5438|\u8033\u8fb9|\u89e6\u78b0|\u629a\u6478|\u4eb2\u543b|\u63a5\u543b|\u66a7\u6627|\u6311\u9017|\u6b32\u671b|\u5fc3\u8df3|\u6c14\u606f|\u6d74|\u6e05\u6d17|\u88f8\u9732|\u8131\u6389|\u80f8\u53e3|\u80cc\u4e0a)/i.test(text);
    var strictPerson = personSignal || /(\u7f57\u5bbe|\u60e0\u7279\u5c3c|\u8d1d\u5229|\u827e\u5f17\u91cc|\u4f0a\u7538|\u51ef\u62c9\u5c14|\u5e03\u8d56\u5c14|\u83b1\u987f|NPC|\u7537\u4eba|\u5973\u4eba|\u7537\u5b50|\u5973\u5b50|\u5bf9\u65b9|\u964c\u751f\u4eba|\u540c\u4f34|\u4eba\u5f71|\u90a3\u4e2a\u4eba|\u8eab\u65c1\u7684\u4eba|\u4f60\u4eec|Briar|Leighton)/i.test(signalText);
    return strictClose && strictPerson && !!inferStart(text, opts);
  }

  function normalizeCustomTarget(raw, opts) {
    opts = opts || {};
    var name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    if (name.length > 32) name = name.slice(0, 32);
    var template = findTemplateByName(name, { manual: true });
    if (template) return template;

    function npcSetup(npc, suffix) {
      return call(opts.buildNpcSetup, [npc, suffix || ''], function () {
        return '<<npc ' + String(npc || '').trim() + (suffix || '') + '>>';
      });
    }

    var knownTarget = findKnownCustomNpcTarget(name, opts, { manual: true });
    if (knownTarget) return knownTarget;
    return { label: name, npc: name, passage: 'Named NPC Gangbang', manual: true, custom: true, setup: '<<endcombat>><<clearnpc>><<set $sexstart to 1>>' + npcSetup(name, ' -1') };
  }

  function create(deps) {
    deps = deps || {};
    return {
      schemaVersion: 1,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      getCandidateTemplates: getCandidateTemplates,
      findTemplateByName: function (name, extra) {
        return findTemplateByName(name, extra);
      },
      collectTargets: function (contextText, opts) {
        return collectTargets(contextText, Object.assign({}, deps, opts || {}));
      },
      inferStart: function (contextText, opts) {
        return inferStart(contextText, Object.assign({}, deps, opts || {}));
      },
      shouldShowOption: function (opts) {
        return shouldShowOption(Object.assign({}, deps, opts || {}));
      },
      normalizeCustomTarget: function (raw, opts) {
        return normalizeCustomTarget(raw, Object.assign({}, deps, opts || {}));
      },
      getKnownNpcLabels: getKnownNpcLabels,
      getKnownNpcAliases: getKnownNpcAliases
    };
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    getCandidateTemplates: getCandidateTemplates,
    findTemplateByName: findTemplateByName,
    collectTargets: collectTargets,
    inferStart: inferStart,
    shouldShowOption: shouldShowOption,
    normalizeCustomTarget: normalizeCustomTarget,
    getKnownNpcLabels: getKnownNpcLabels,
    getKnownNpcAliases: getKnownNpcAliases
  };

  root.AIStoryGen.NativeTargetDetectorModule = moduleApi;
  root.AIStoryGenNativeTargetDetectorModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
