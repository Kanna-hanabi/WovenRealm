/* ============================================================
 * AIStoryGen story runtime helpers
 * Pure helpers for choice parsing and prompt/runtime plumbing.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function hasChoiceTimeAnnotation(text) {
    return /\(\s*\d+\s*:\s*\d{1,2}\s*\)\s*$/.test(String(text || ''));
  }

  function cleanChoiceText(text, opts) {
    opts = opts || {};
    text = String(text == null ? '' : text).trim();
    if (!text) return '';
    text = stripChoiceLinePrefix(text)
      .replace(/^(?:选项|choice)\s*\d*\s*[:：-]\s*/i, '')
      .replace(/^["'“”‘’]|["'“”‘’]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';

    if (/^\s*(?:\[\/?(?:AI_|STATS|ITEMS?|LOC|REL|MEMORY|SCENE)|<|```)/i.test(text)) return '';
    if (/\[(?:AI_META|AI_EVENT|STATS|ITEMS?|AI_ITEMS_USED|LOC|RELATIONSHIP|MEMORY)[\s:\]]/i.test(text)) return '';
    if (/^(?:summary|eventType|location|targetLocation|locationStatus|characters|presentCharacters|presentEntities|sexTargets|memoryTags|memoryImportance|itemsGained|itemsLost|moneyChange|statChanges|relationshipChanges)\s*=/i.test(text)) return '';
    if (/^(?:你决定|你可以|以下|正文|剧情|选项|返回结果|输出|json|you decide)\s*[:：]?\s*$/i.test(text)) return '';
    if (/^(?:here are(?: choices?)?|sure|ok|based on|the choices|return only|output|json|instruction|choices?)\s*[:：-]?\s*$/i.test(text)) return '';

    var timeAnnotated = hasChoiceTimeAnnotation(text);
    var maxLength = Number(opts.maxChoiceLength || 96);
    if (!timeAnnotated && text.length > 52) return '';
    if (text.length > maxLength) return '';

    var sentenceMarks = (text.match(/[。！？.!?]/g) || []).length;
    if (sentenceMarks > (timeAnnotated ? 2 : 1)) return '';
    return text;
  }

  function normalizeChoiceValue(item) {
    if (item == null) return '';
    if (Array.isArray(item)) {
      var parts = item.map(function (x) {
        return String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      if (!parts.length) return '';
      var time = '';
      var text = '';
      parts.forEach(function (part) {
        if (!time && /^\(?\s*\d+\s*:\s*\d{1,2}\s*\)?$/.test(part)) {
          time = part.charAt(0) === '(' ? part : '(' + part + ')';
        } else if (!text || part.length > text.length) {
          text = part;
        }
      });
      if (!text) text = parts.filter(function (part) { return part !== time; }).join(' ');
      return [text, time].filter(Boolean).join(' ');
    }
    if (typeof item === 'object') {
      var textValue = item.choice || item.text || item.label || item.action || item.option || item.title || item.name || '';
      var timeValue = item.time || item.duration || item.cost || item.minutes || '';
      textValue = String(textValue == null ? '' : textValue).replace(/\s+/g, ' ').trim();
      timeValue = String(timeValue == null ? '' : timeValue).replace(/\s+/g, ' ').trim();
      if (timeValue && /^\d+$/.test(timeValue)) timeValue = '0:' + String(timeValue).padStart(2, '0');
      if (timeValue && !/^\(/.test(timeValue)) timeValue = '(' + timeValue + ')';
      return [textValue, timeValue].filter(Boolean).join(' ');
    }
    return String(item);
  }

  function normalizeChoiceArray(value, opts) {
    opts = opts || {};
    var maxChoices = Math.max(2, Number(opts.maxChoices || 5));
    if (!Array.isArray(value) || value.length < 2) return null;
    var localize = typeof opts.localizeChoice === 'function' ? opts.localizeChoice : null;
    var arr = value.slice(0, maxChoices).map(function (item) {
      var text = cleanChoiceText(normalizeChoiceValue(item), opts);
      if (localize && text) text = localize(text);
      return cleanChoiceText(text, opts);
    }).filter(Boolean);
    return arr.length >= 2 ? arr : null;
  }

  function parseChoiceArray(content, opts) {
    opts = opts || {};
    var text = String(content || '').trim();
    var parsed;
    function normalize(value) {
      if (typeof opts.normalizeChoiceArray === 'function') return opts.normalizeChoiceArray(value);
      return normalizeChoiceArray(value, opts);
    }

    try {
      parsed = JSON.parse(text);
      var direct = normalize(parsed);
      if (direct) return direct;
    } catch (_) {}

    var fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      try {
        parsed = JSON.parse(fenceMatch[1].trim());
        var fenced = normalize(parsed);
        if (fenced) return fenced;
      } catch (_) {}
    }

    var candidates = [];
    var start = -1;
    var depth = 0;
    var inString = false;
    var escape = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '[') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === ']' && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
    for (var ci = candidates.length - 1; ci >= 0; ci--) {
      try {
        parsed = JSON.parse(candidates[ci]);
        var found = normalize(parsed);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  function stripChoiceLinePrefix(line) {
    return String(line || '')
      .replace(/^\(\s*\d+\s*\)\s*/, '')
      .replace(/^\d+[\.\)\u3001]\s*/, '')
      .replace(/^[-*\u2022]\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim();
  }

  function extractFallbackChoices(content, opts) {
    opts = opts || {};
    var maxChoices = Math.max(2, Number(opts.maxChoices || 5));
    var text = String(content || '');
    var lineChoices = text.split(/\r?\n/)
      .map(function (line) { return cleanChoiceText(line, opts); })
      .filter(function (line) {
        return line.length > 3;
      })
      .slice(0, maxChoices);
    if (lineChoices.length >= 2) return lineChoices;

    var sentenceChoices = text.split(/[.\u3002\uff01!\uff1f?]\s*/)
      .map(function (line) { return cleanChoiceText(line, opts); })
      .filter(function (line) { return line.length > 5; })
      .slice(0, maxChoices);
    return sentenceChoices.length >= 2 ? sentenceChoices : null;
  }

  function parseChoicesOrFallback(content, opts) {
    return parseChoiceArray(content, opts) || extractFallbackChoices(content, opts);
  }

  var StoryRuntimeModule = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    cleanChoiceText: cleanChoiceText,
    normalizeChoiceArray: normalizeChoiceArray,
    parseChoiceArray: parseChoiceArray,
    stripChoiceLinePrefix: stripChoiceLinePrefix,
    extractFallbackChoices: extractFallbackChoices,
    parseChoicesOrFallback: parseChoicesOrFallback
  };

  root.AIStoryGen.StoryRuntimeModule = StoryRuntimeModule;
  root.AIStoryGenStoryRuntimeModule = StoryRuntimeModule;
})(typeof window !== 'undefined' ? window : globalThis);
