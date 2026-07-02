/* ============================================================
 * AIStoryGen transaction engine
 * Owns the apply/commit/rollback order for AI narrative effects.
 * Concrete game-state edits still live in aiMacro.js and are injected here.
 * ============================================================ */
(function () {
  'use strict';

  var root = window.AIStoryGen = window.AIStoryGen || {};
  var MODULE_SCHEMA_VERSION = 1;
  var PUBLIC_SCHEMA_VERSION = 5;

  function createTransactionEngine(deps) {
    deps = deps || {};
    var publicSchemaVersion = deps.publicSchemaVersion || PUBLIC_SCHEMA_VERSION;

    function loadCfg() {
      try {
        if (typeof deps.loadCfg === 'function') return deps.loadCfg();
      } catch (_) {}
      return {};
    }

    function warn(message, error) {
      try {
        if (typeof deps.warn === 'function') {
          deps.warn(message, error);
          return;
        }
        if (typeof console !== 'undefined' && console.warn) console.warn(message, error);
      } catch (_) {}
    }

    function captureRuntimeSnapshot() {
      return typeof deps.captureRuntimeSnapshot === 'function' ? deps.captureRuntimeSnapshot() : null;
    }

    function restoreRuntimeSnapshot(snapshot, opts) {
      if (typeof deps.restoreRuntimeSnapshot === 'function') deps.restoreRuntimeSnapshot(snapshot, opts || {});
    }

    function captureGameSnapshot() {
      return typeof deps.captureGameSnapshot === 'function' ? deps.captureGameSnapshot() : null;
    }

    function restoreGameSnapshot(snapshot) {
      if (typeof deps.restoreGameSnapshot === 'function') deps.restoreGameSnapshot(snapshot);
    }

    function prepareNarrativeTextEffects(rawText, cfg, opts) {
      if (typeof deps.prepareNarrativeTextEffects !== 'function') {
        throw new Error('AITransaction missing prepareNarrativeTextEffects dependency');
      }
      return deps.prepareNarrativeTextEffects(rawText, cfg, opts || {});
    }

    function getLastChoiceText() {
      try {
        return String((typeof deps.getLastChoiceText === 'function' && deps.getLastChoiceText()) || '');
      } catch (_) {
        return '';
      }
    }

    function parseLocationMarker(text) {
      try {
        return typeof deps.parseLocationMarker === 'function' ? !!deps.parseLocationMarker(text) : false;
      } catch (err) {
        throw err;
      }
    }

    function inferLocationFromText(choiceText, aiText) {
      try {
        return typeof deps.inferLocationFromText === 'function' ? !!deps.inferLocationFromText(choiceText, aiText) : false;
      } catch (err) {
        throw err;
      }
    }

    function eventSuppressesLocationFallback(text) {
      try {
        return typeof deps.eventSuppressesLocationFallback === 'function' ? !!deps.eventSuppressesLocationFallback(text) : false;
      } catch (_) {
        return false;
      }
    }

    function stripAIMetadataMarkers(text) {
      try {
        if (typeof deps.stripAIMetadataMarkers === 'function') return deps.stripAIMetadataMarkers(text);
      } catch (_) {}
      return String(text || '');
    }

    function recordAiEventMemory(rawText, cleanText, memoryOpts, cfg) {
      if (typeof deps.recordAiEventMemory !== 'function') return null;
      return deps.recordAiEventMemory(rawText, cleanText, memoryOpts, cfg);
    }

    function lastAiEventLocationStatus() {
      try {
        return String((typeof deps.lastAiEventLocationStatus === 'function' && deps.lastAiEventLocationStatus()) || '');
      } catch (_) {
        return '';
      }
    }

    function markLocationInTransit(reason) {
      try {
        if (typeof deps.markLocationInTransit === 'function') deps.markLocationInTransit(reason);
      } catch (_) {}
    }

    function applyNarrative(rawText, cfg, opts) {
      opts = opts || {};
      cfg = cfg || loadCfg();
      var beforeSnapshot = captureRuntimeSnapshot();
      try {
        return prepareNarrativeTextEffects(rawText, cfg, opts);
      } catch (e) {
        try { restoreRuntimeSnapshot(beforeSnapshot); } catch (_) {}
        warn('[AIStoryGen] AI transaction rolled back' + (opts.reason ? ' (' + opts.reason + ')' : ''), e);
        throw e;
      }
    }

    function commitNarrative(rawText, cfg, opts) {
      opts = opts || {};
      cfg = cfg || loadCfg();
      var beforeSnapshot = captureRuntimeSnapshot();
      try {
        var result = prepareNarrativeTextEffects(rawText, cfg, opts);
        var metadataText = result.cleanText;
        var locUpdated = false;
        if (opts.applyLocation !== false) {
          var hasLocationDirective = /\[LOC:|\[AI_META\]|\[AI_EVENT\]|\[AI_EVENT:/i.test(metadataText);
          var suppressLocationFallback = eventSuppressesLocationFallback(metadataText) || !hasLocationDirective;
          locUpdated = parseLocationMarker(metadataText);
          var lastChoiceText = getLastChoiceText();
          if (!locUpdated && !suppressLocationFallback && lastChoiceText) {
            locUpdated = inferLocationFromText(lastChoiceText, metadataText);
          }
        }
        result.metadataText = metadataText;
        result.cleanText = stripAIMetadataMarkers(metadataText);
        if (opts.recordMemory !== false) {
          var memoryOpts = Object.assign({
            name: '[AI]',
            reason: 'AI剧情事件',
            choiceText: getLastChoiceText() || '',
            source: opts.source || 'advance',
          }, opts.memory || {});
          result.event = recordAiEventMemory(String(rawText || ''), result.cleanText, memoryOpts, cfg);
        }
        result.locUpdated = !!locUpdated;
        result.latestLocationStatus = lastAiEventLocationStatus();
        if (opts.applyLocation !== false && !locUpdated && (result.latestLocationStatus === 'current' || result.latestLocationStatus === 'inTransit')) {
          markLocationInTransit('AI_EVENT locationStatus=' + result.latestLocationStatus);
        }
        return result;
      } catch (e) {
        try { restoreRuntimeSnapshot(beforeSnapshot, { syncMemory: true }); } catch (_) {}
        warn('[AIStoryGen] AI commit rolled back' + (opts.reason ? ' (' + opts.reason + ')' : ''), e);
        throw e;
      }
    }

    return {
      schemaVersion: publicSchemaVersion,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      applyNarrative: applyNarrative,
      commitNarrative: commitNarrative,
      captureSnapshot: captureGameSnapshot,
      restoreSnapshot: restoreGameSnapshot,
      captureRuntimeSnapshot: captureRuntimeSnapshot,
      restoreRuntimeSnapshot: restoreRuntimeSnapshot,
    };
  }

  var api = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: createTransactionEngine,
  };

  root.TransactionModule = api;
  window.AIStoryGenTransactionModule = api;
})();
