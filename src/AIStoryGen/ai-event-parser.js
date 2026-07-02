/* ============================================================
 * AIStoryGen event parser
 * Parses AI_EVENT / AI_META marker syntax into normalized raw fields.
 * Game-state validation remains in aiMacro.js for now.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function text(value) {
    return String(value || '');
  }

  function normalizeText(value) {
    return text(value).replace(/\s+/g, ' ').trim();
  }

  function parseListField(value) {
    if (Array.isArray(value)) return value.map(function (v) { return normalizeText(v); }).filter(Boolean);
    return text(value).split(/[;\uff1b,\uff0c\u3001]/).map(function (s) { return normalizeText(s); }).filter(Boolean);
  }

  function canonicalAIEventKey(key) {
    key = text(key).replace(/[\s-]+/g, '_').toLowerCase();
    var map = {
      summary: 'summary',
      memory: 'summary',
      eventsummary: 'summary',
      event_summary: 'summary',
      eventtype: 'eventType',
      event_type: 'eventType',
      location: 'location',
      currentlocation: 'location',
      current_location: 'location',
      targetlocation: 'targetLocation',
      target_location: 'targetLocation',
      loc: 'targetLocation',
      passage: 'targetLocation',
      locationstatus: 'locationStatus',
      location_status: 'locationStatus',
      travelstatus: 'locationStatus',
      travel_status: 'locationStatus',
      arrivalstatus: 'locationStatus',
      arrival_status: 'locationStatus',
      characters: 'presentCharacters',
      npcs: 'presentCharacters',
      presentcharacters: 'presentCharacters',
      present_characters: 'presentCharacters',
      entities: 'presentEntities',
      presententities: 'presentEntities',
      present_entities: 'presentEntities',
      presenttargets: 'presentTargets',
      present_targets: 'presentTargets',
      presenttargets: 'presentTargets',
      present_targets: 'presentTargets',
      memorytags: 'memoryTags',
      memory_tags: 'memoryTags',
      tags: 'memoryTags',
      memoryimportance: 'memoryImportance',
      memory_importance: 'memoryImportance',
      importance: 'memoryImportance',
      itemsgained: 'itemsGained',
      items_gained: 'itemsGained',
      items: 'itemsGained',
      itemslost: 'itemsLost',
      items_lost: 'itemsLost',
      stats: 'statChanges',
      statchanges: 'statChanges',
      stat_changes: 'statChanges',
      relationshipchanges: 'relationshipChanges',
      relationship_changes: 'relationshipChanges',
      npcrelationshipchanges: 'relationshipChanges',
      npc_relationship_changes: 'relationshipChanges',
      npcrelations: 'relationshipChanges',
      npc_relations: 'relationshipChanges',
      relationships: 'relationshipChanges',
      moneychange: 'moneyChange',
      money_change: 'moneyChange',
      choice: 'choice'
    };
    return map[key] || '';
  }

  function normalizeRawEventData(data) {
    if (!data || typeof data !== 'object') return {};
    var out = {};
    var multi = {
      itemsGained: true,
      itemsLost: true,
      statChanges: true,
      relationshipChanges: true,
      presentCharacters: true,
      presentEntities: true,
      presentTargets: true,
      memoryTags: true
    };
    Object.keys(data).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return;
      var canonical = canonicalAIEventKey(key);
      if (!canonical) return;
      var value = data[key];
      if (value == null) return;
      if (Array.isArray(value)) value = value.join(';');
      value = text(value).trim();
      if (!value && canonical !== 'memoryImportance') return;
      if (multi[canonical] && out[canonical]) out[canonical] += ';' + value;
      else if (!Object.prototype.hasOwnProperty.call(out, canonical)) out[canonical] = value;
    });
    return out;
  }

  function extractAIEventBody(source) {
    var raw = text(source);
    var match = raw.match(/\[AI_EVENT\]\s*([\s\S]*?)\s*\[\/AI_EVENT\]/i);
    if (!match) {
      var oneLine = raw.match(/\[AI_EVENT:\s*([^\]]+)\]/i);
      if (oneLine) match = [oneLine[0], oneLine[1]];
    }
    if (!match) {
      var naked = raw.match(/\[AI_EVENT\]\s*([\s\S]*?)(?=(?:\n\s*\[(?:STATS|ITEMS?|AI_ITEMS_USED|AI_META|LOC)[:\]]|\n\s*\[[^\]]*(?:\u538b\u529b|\u75b2\u52b3|\u5174\u594b|\u6027\u594b|\u75bc\u75db|\u521b\u4f24|\u8bf1\u60d1|\u81ea\u63a7|\u91d1\u94b1|arousal|stress|pain|trauma|money)[^\]]*\]|\n\s*\(\d+\)|$))/i);
      if (naked) match = [naked[0], naked[1]];
    }
    return match ? text(match[1]).trim() : '';
  }

  function parseKeyValueBlock(body) {
    body = text(body).trim();
    if (!body) return {};
    if (/^\s*{[\s\S]*}\s*$/.test(body)) {
      try {
        var parsed = JSON.parse(body);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    }
    var out = {};
    var keyPattern = [
      'summary', 'memory', 'eventsummary', 'event_summary',
      'eventtype', 'event_type',
      'location', 'currentlocation', 'current_location',
      'targetlocation', 'target_location', 'loc', 'passage',
      'locationstatus', 'location_status', 'travelstatus', 'travel_status', 'arrivalstatus', 'arrival_status',
      'characters', 'npcs', 'presentcharacters', 'present_characters',
      'entities', 'presententities', 'present_entities',
      'presenttargets', 'present_targets', 'presenttargets', 'present_targets',
      'memorytags', 'memory_tags', 'tags', 'memoryimportance', 'memory_importance', 'importance',
      'itemsgained', 'items_gained', 'items', 'itemslost', 'items_lost',
      'stats', 'statchanges', 'stat_changes',
      'relationshipchanges', 'relationship_changes', 'npcrelationshipchanges', 'npc_relationship_changes',
      'npcrelations', 'npc_relations', 'relationships',
      'moneychange', 'money_change', 'choice'
    ].join('|');
    var re = new RegExp('(' + keyPattern + ')\\s*[:=]\\s*([\\s\\S]*?)(?=(?:\\r?\\n|;;|\\s*;\\s*)(?:' + keyPattern + ')\\s*[:=]|$)', 'gi');
    var match;
    while ((match = re.exec(body))) {
      var key = match[1];
      var value = text(match[2]).replace(/[;\s]+$/g, '').trim();
      if (key) out[key] = value;
    }
    return out;
  }

  function parseAIEventBlock(source) {
    var body = extractAIEventBody(source);
    if (!body) return {};
    return normalizeRawEventData(parseKeyValueBlock(body));
  }

  function removeAIEventBlocks(source) {
    return text(source)
      .replace(/\s*\[AI_EVENT\]\s*[\s\S]*?\s*\[\/AI_EVENT\]\s*/gi, '\n')
      .replace(/\s*\[AI_EVENT:\s*[\s\S]*?\]\s*/gi, '\n')
      .replace(/\s*\[AI_EVENT\]\s*[\s\S]*?(?=(?:\n\s*\[(?:STATS|ITEMS?|AI_ITEMS_USED|AI_META|LOC)[:\]]|\n\s*\[[^\]]*(?:\u538b\u529b|\u75b2\u52b3|\u5174\u594b|\u6027\u594b|\u75bc\u75db|\u521b\u4f24|\u8bf1\u60d1|\u81ea\u63a7|\u91d1\u94b1|arousal|stress|pain|trauma|money)[^\]]*\]|\n\s*\(\d+\)|$))/gi, '\n');
  }

  function stripAIMetadataMarkers(source) {
    return removeAIEventBlocks(source)
      .replace(/\s*\[AI_META\]\s*{[\s\S]*?}\s*\[\/AI_META\]\s*/gi, '\n')
      .replace(/\s*\[AI_META\]\s*{[\s\S]*?(?=(?:\n\s*\[(?:STATS|ITEMS?|AI_ITEMS_USED|AI_EVENT|LOC)[:\]]|\n\s*\(\d+\)|$))/gi, '\n')
      .replace(/\s*\[AI_META\][\s\S]*?(?=(?:\n\s*\[(?:STATS|ITEMS?|AI_ITEMS_USED|AI_EVENT|LOC)[:\]]|\n\s*\(\d+\)|$))/gi, '\n')
      .replace(/\s*\[LOC:\s*[^\]]+\]\s*/gi, '\n')
      .trim();
  }

  function extractAIMetadataLocation(source) {
    var match = text(source).match(/\[AI_META\]\s*({[\s\S]*?})\s*\[\/AI_META\]/i);
    if (!match) return '';
    try {
      var data = JSON.parse(match[1]);
      var loc = data && (data.location || data.loc || data.passage || data.current_location);
      loc = loc == null ? '' : normalizeText(loc);
      if (/^(none|null|current|same|unknown|\u5f53\u524d|\u4e0d\u53d8)$/i.test(loc)) return '';
      return loc;
    } catch (_) {
      return '';
    }
  }

  function create() {
    return {
      schemaVersion: 1,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      parseAIEventBlock: parseAIEventBlock,
      extractAIEventBody: extractAIEventBody,
      parseKeyValueBlock: parseKeyValueBlock,
      normalizeRawEventData: normalizeRawEventData,
      canonicalAIEventKey: canonicalAIEventKey,
      parseListField: parseListField,
      removeAIEventBlocks: removeAIEventBlocks,
      stripAIMetadataMarkers: stripAIMetadataMarkers,
      extractAIMetadataLocation: extractAIMetadataLocation
    };
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    parseAIEventBlock: parseAIEventBlock,
    extractAIEventBody: extractAIEventBody,
    parseKeyValueBlock: parseKeyValueBlock,
    normalizeRawEventData: normalizeRawEventData,
    canonicalAIEventKey: canonicalAIEventKey,
    parseListField: parseListField,
    removeAIEventBlocks: removeAIEventBlocks,
    stripAIMetadataMarkers: stripAIMetadataMarkers,
    extractAIMetadataLocation: extractAIMetadataLocation
  };

  root.AIStoryGen.EventParserModule = moduleApi;
  root.AIStoryGenEventParserModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
