/* AIStoryGen native event guard.
 *
 * Protects the vanilla game from stale single-slot event queues that can trap
 * the player in a current-passage <-> next-passage loop after an event NPC has
 * already been cleared by the base game.
 */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizePassage(value) {
    return normalizeText(value);
  }

  function isPlainContinueText(text) {
    text = normalizeText(text)
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*\[[^\]]+\]\s*$/g, '')
      .trim();
    return /^(?:\u7ee7\u7eed|\u4e0b\u4e00\u6b65|Next|Continue|Walk\.?)$/i.test(text);
  }

  function eventAreas(buffer) {
    var out = [];
    (Array.isArray(buffer) ? buffer : []).forEach(function (entry) {
      var area = entry && Array.isArray(entry.area) ? entry.area : [];
      if (area.length) out.push(String(area[0] || '').trim());
    });
    return out.filter(Boolean);
  }

  function uniqueSlots(buffer) {
    var seen = {};
    (Array.isArray(buffer) ? buffer : []).forEach(function (entry) {
      var slot = entry && entry.slot != null ? String(entry.slot) : '';
      if (slot) seen[slot] = true;
    });
    return Object.keys(seen);
  }

  function shouldClearStaleSingleSlotEventLoop(state) {
    state = state || {};
    if (state.replaceActive || state.combatActive) {
      return { clear: false, reason: 'AI/native combat active' };
    }
    var current = normalizePassage(state.currentPassage);
    var target = normalizePassage(state.targetPassage);
    if (!current || !target || current === target) {
      return { clear: false, reason: 'missing current/target' };
    }
    if (!isPlainContinueText(state.linkText)) {
      return { clear: false, reason: 'not a plain continue link' };
    }
    var buffer = Array.isArray(state.eventBuffer) ? state.eventBuffer : [];
    if (buffer.length < 2) {
      return { clear: false, reason: 'event buffer too short' };
    }
    var slots = uniqueSlots(buffer);
    if (slots.length !== 1) {
      return { clear: false, reason: 'not a single-slot duplicate' };
    }
    var areas = eventAreas(buffer);
    if (areas.indexOf(current) < 0 || areas.indexOf(target) < 0) {
      return { clear: false, reason: 'buffer does not loop current and target' };
    }
    return {
      clear: true,
      reason: 'stale single-slot event loop',
      slot: slots[0],
      currentPassage: current,
      targetPassage: target,
      areas: areas
    };
  }

  function create(deps) {
    deps = deps || {};
    var lastDecision = null;
    var clearCount = 0;

    function call(fn, args, fallback) {
      if (typeof fn !== 'function') return typeof fallback === 'function' ? fallback() : fallback;
      return fn.apply(null, args || []);
    }

    function clearForOriginalLink(linkData) {
      linkData = linkData || {};
      var state = {
        currentPassage: linkData.currentPassage != null ? linkData.currentPassage : call(deps.getCurrentPassage, [], ''),
        targetPassage: linkData.targetPassage,
        linkText: linkData.linkText,
        replaceActive: !!(linkData.replaceActive != null ? linkData.replaceActive : call(deps.isReplaceActive, [], false)),
        combatActive: !!(linkData.combatActive != null ? linkData.combatActive : call(deps.isCombatActive, [], false)),
        eventBuffer: linkData.eventBuffer || call(deps.getEventBuffer, [], [])
      };
      var decision = shouldClearStaleSingleSlotEventLoop(state);
      decision.at = Date.now();
      decision.context = linkData.reason || '';
      lastDecision = decision;
      if (!decision.clear) return false;
      var ok = call(deps.clearEventQueue, [decision], false);
      if (ok !== false) clearCount += 1;
      return ok !== false;
    }

    return {
      schemaVersion: 1,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      shouldClearStaleSingleSlotEventLoop: shouldClearStaleSingleSlotEventLoop,
      clearForOriginalLink: clearForOriginalLink,
      getStatus: function () {
        return {
          schemaVersion: 1,
          clearCount: clearCount,
          lastDecision: lastDecision
        };
      }
    };
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    shouldClearStaleSingleSlotEventLoop: shouldClearStaleSingleSlotEventLoop,
    isPlainContinueText: isPlainContinueText
  };

  root.AIStoryGen.NativeEventGuardModule = moduleApi;
  root.AIStoryGenNativeEventGuardModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
