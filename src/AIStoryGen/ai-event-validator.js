/* ============================================================
 * AIStoryGen event validator
 * Coordinates field-level validation for parsed AI_EVENT data.
 * Runtime game-state normalizers are injected by aiMacro.js.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function text(value) {
    return String(value || '');
  }

  function fallbackCanonicalKey(key) {
    var parser = root.AIStoryGenEventParserModule || root.AIStoryGen.EventParserModule;
    if (parser && typeof parser.canonicalAIEventKey === 'function') return parser.canonicalAIEventKey(key);
    return text(key).replace(/[\s-]+/g, '_').toLowerCase();
  }

  function fallbackText(value, maxLen) {
    value = text(value).replace(/\s+/g, ' ').trim();
    maxLen = parseInt(maxLen, 10) || 0;
    if (maxLen > 0 && value.length > maxLen) value = value.slice(0, maxLen);
    return value;
  }

  function fallbackInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) return fallback;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }

  function stripListFieldLabel(part) {
    part = fallbackText(part, 80);
    var m = part.match(/^(summary|eventType|location|targetLocation|locationStatus|characters|presentCharacters|presentEntities|presentTargets|presentTargets|memoryTags|memoryImportance|itemsGained|itemsLost|statChanges|relationshipChanges|moneyChange)\s*[:=]\s*(.*)$/i);
    if (!m) return part;
    return fallbackText(m[2] || '', 80);
  }

  function isNoiseListPart(part) {
    part = fallbackText(part, 80);
    if (!part) return true;
    if (/^(summary|eventType|location|targetLocation|locationStatus|characters|presentCharacters|presentEntities|presentTargets|presentTargets|memoryTags|memoryImportance|itemsGained|itemsLost|statChanges|relationshipChanges|moneyChange)\s*[:=]?\s*$/i.test(part)) return true;
    return false;
  }

  function cleanNameListResult(value, maxItems, maxLen) {
    var parser = root.AIStoryGenEventParserModule || root.AIStoryGen.EventParserModule;
    var parts = parser && typeof parser.parseListField === 'function' ? parser.parseListField(value) : text(value).split(/[;,\uff1b\uff0c\u3001]/);
    var out = [];
    var seen = {};
    parts.forEach(function (part) {
      part = stripListFieldLabel(part);
      part = fallbackText(part, maxLen || 40);
      if (isNoiseListPart(part)) return;
      var key = part.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push(part);
    });
    return out.slice(0, maxItems || 10).join(';');
  }

  function callNormalizer(fn, fallback, args) {
    try {
      if (typeof fn === 'function') return fn.apply(null, args);
    } catch (_) {}
    return fallback.apply(null, args);
  }

  function isMergeField(canonical) {
    return /^(itemsGained|itemsLost|statChanges|relationshipChanges|presentCharacters|presentEntities|presentTargets|memoryTags)$/.test(canonical);
  }

  function stageRawEventData(data, canonicalKey) {
    var staged = {};
    if (!data || typeof data !== 'object') return staged;
    Object.keys(data).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return;
      var canonical = canonicalKey(key);
      if (!canonical) return;
      var value = data[key];
      if (value == null) return;
      if (Array.isArray(value)) value = value.join(';');
      value = text(value).trim();
      if (!value && canonical !== 'memoryImportance') return;
      if (isMergeField(canonical) && staged[canonical]) staged[canonical] += ';' + value;
      else if (!Object.prototype.hasOwnProperty.call(staged, canonical)) staged[canonical] = value;
    });
    return staged;
  }

  function create(deps) {
    deps = deps || {};
    function canonical(key) {
      return callNormalizer(deps.canonicalAIEventKey, fallbackCanonicalKey, [key]);
    }
    function normaliseText(value, maxLen) {
      return callNormalizer(deps.normaliseText, fallbackText, [value, maxLen]);
    }
    function passthrough(value) {
      return text(value).trim();
    }
    function normaliseNameList(value, maxItems, maxLen) {
      var normalized = callNormalizer(deps.normaliseNameList, function (raw, limit, len) {
        var parser = root.AIStoryGenEventParserModule || root.AIStoryGen.EventParserModule;
        var parts = parser && typeof parser.parseListField === 'function' ? parser.parseListField(raw) : text(raw).split(/[;,\uff1b\uff0c\u3001]/);
        var out = [];
        var seen = {};
        parts.forEach(function (part) {
          part = fallbackText(part, len || 40);
          var key = part.toLowerCase();
          if (!part || seen[key]) return;
          seen[key] = 1;
          out.push(part);
        });
        return out.slice(0, limit || 10).join(';');
      }, [value, maxItems, maxLen]);
      return cleanNameListResult(normalized, maxItems, maxLen);
    }
    function parseImportance(value) {
      return callNormalizer(deps.parseInt, fallbackInt, [value, 0, 3, 1]);
    }

    function validate(data, rawText) {
      var staged = stageRawEventData(data, canonical);
      var out = {};
      var summary = normaliseText(staged.summary, 220);
      if (summary) out.summary = summary;
      var eventType = callNormalizer(deps.normaliseEventType, passthrough, [staged.eventType]);
      if (eventType) out.eventType = eventType;
      var loc = callNormalizer(deps.normaliseLocation, passthrough, [staged.location]);
      if (loc) out.location = loc;
      var target = callNormalizer(deps.normaliseLocation, passthrough, [staged.targetLocation]);
      if (target) out.targetLocation = target;
      var status = callNormalizer(deps.normaliseStatus, passthrough, [staged.locationStatus]);
      if (status) out.locationStatus = status;
      var characters = normaliseNameList(staged.presentCharacters, 10, 40);
      if (characters) out.presentCharacters = characters;
      var entities = normaliseNameList(staged.presentEntities, 10, 40);
      if (entities) out.presentEntities = entities;
      var presentTargets = normaliseNameList(staged.presentTargets, 10, 40);
      if (presentTargets) out.presentTargets = presentTargets;
      var tags = normaliseNameList(staged.memoryTags, 8, 24);
      if (tags) out.memoryTags = tags;
      if (Object.prototype.hasOwnProperty.call(staged, 'memoryImportance')) out.memoryImportance = parseImportance(staged.memoryImportance);
      var itemsGained = callNormalizer(deps.normaliseItems, passthrough, [staged.itemsGained]);
      if (itemsGained) out.itemsGained = itemsGained;
      var itemsLost = callNormalizer(deps.normaliseItems, passthrough, [staged.itemsLost]);
      if (itemsLost) out.itemsLost = itemsLost;
      var stats = callNormalizer(deps.normaliseStats, passthrough, [staged.statChanges, rawText]);
      if (stats) out.statChanges = stats;
      var rel = callNormalizer(deps.normaliseRelationships, passthrough, [staged.relationshipChanges]);
      if (rel) out.relationshipChanges = rel;
      var money = callNormalizer(deps.normaliseMoney, passthrough, [staged.moneyChange, rawText]);
      if (money) out.moneyChange = money;
      var choice = normaliseText(staged.choice, 100);
      if (choice) out.choice = choice;
      return out;
    }

    return {
      schemaVersion: MODULE_SCHEMA_VERSION,
      validate: validate,
      stageRawEventData: function (data) { return stageRawEventData(data, canonical); }
    };
  }

  var module = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    stageRawEventData: function (data, canonicalKey) {
      return stageRawEventData(data, canonicalKey || fallbackCanonicalKey);
    }
  };

  root.AIStoryGenEventValidatorModule = module;
  root.AIStoryGen.EventValidatorModule = module;
})(typeof window !== 'undefined' ? window : globalThis);
