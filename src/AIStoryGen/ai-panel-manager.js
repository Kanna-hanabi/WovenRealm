/* ============================================================
 * AIStoryGen panel manager
 * Owns panel-layout scheduling, observer lifecycle, and debug status.
 * Concrete DOM ordering is injected from aiMacro.js for compatibility.
 * ============================================================ */
(function () {
  'use strict';

  var root = window.AIStoryGen = window.AIStoryGen || {};
  var MODULE_SCHEMA_VERSION = 1;
  var PUBLIC_SCHEMA_VERSION = 4;

  function createPanelManager(deps) {
    deps = deps || {};
    var timers = {};
    var runCount = 0;
    var lastAt = 0;
    var minFlushInterval = Math.max(0, Number(deps.minFlushInterval || 0) || 0);
    var publicSchemaVersion = deps.publicSchemaVersion || PUBLIC_SCHEMA_VERSION;
    var observerKey = deps.observerKey || '_aiChoiceOrderObserver';

    function warn(message, error) {
      try {
        if (typeof deps.warn === 'function') {
          deps.warn(message, error);
          return;
        }
        if (typeof console !== 'undefined' && console.warn) console.warn(message, error);
      } catch (_) {}
    }

    function layout() {
      return typeof deps.layout === 'function' ? !!deps.layout() : false;
    }

    function normalizeOrder() {
      return layout();
    }

    function flush(reason) {
      runCount += 1;
      lastAt = Date.now();
      try {
        if (typeof deps.runLayout === 'function') return !!deps.runLayout(reason || 'manual flush');
        return layout();
      } catch (e) {
        warn('[AIStoryGen] panel layout failed' + (reason ? ' (' + reason + ')' : ''), e);
        return false;
      }
    }

    function scheduleLayout(delay) {
      clearLegacyPixelObservers();
      delay = Math.max(0, Number(delay || 0) || 0);
      var now = Date.now();
      if (lastAt && now - lastAt < minFlushInterval) {
        delay = Math.max(delay, minFlushInterval - (now - lastAt));
      }
      if (delay <= 0) {
        flush('scheduled 0ms');
        return true;
      }
      var key = minFlushInterval > 0 ? 'layout' : String(delay);
      if (timers[key]) return false;
      timers[key] = setTimeout(function () {
        delete timers[key];
        flush('scheduled ' + delay + 'ms');
      }, delay || 0);
      return true;
    }

    function clearLegacyPixelObservers() {
      var cleared = 0;
      ['_apgAssistOrderObserver', '_apgPoseAssistOrderObserver'].forEach(function (key) {
        try {
          if (typeof window !== 'undefined' && window[key]) {
            if (typeof window[key].disconnect === 'function') window[key].disconnect();
            window[key] = null;
            cleared += 1;
          }
        } catch (_) {}
      });
      return cleared;
    }

    function isPixelOnlyMutations(mutations) {
      if (!mutations || !mutations.length) return false;
      if (typeof deps.isPixelOnlyMutations === 'function') {
        try { return !!deps.isPixelOnlyMutations(mutations); } catch (_) {}
      }
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i] && mutations[i].target;
        if (!(target && target.closest && target.closest('.apg-ai-assist, .apg-pixel-placeholder, .apg-pixel-result, .apg-pixel-controls, .apg-pixel-spinner'))) {
          return false;
        }
      }
      return true;
    }

    function getObserverRoot() {
      try {
        if (typeof deps.getObserverRoot === 'function') return deps.getObserverRoot();
      } catch (_) {}
      try {
        return document.getElementById('passages') || document.body;
      } catch (_) {
        return null;
      }
    }

    function installOrderObserver() {
      try {
        clearLegacyPixelObservers();
        if (window[observerKey]) window[observerKey].disconnect();
        var rootEl = getObserverRoot();
        if (!rootEl || typeof MutationObserver === 'undefined') return false;
        window[observerKey] = new MutationObserver(function (mutations) {
          if (isPixelOnlyMutations(mutations)) return;
          scheduleLayout(40);
        });
        window[observerKey].observe(rootEl, { childList: true });
        [0, 400, 1200, 3000].forEach(scheduleLayout);
        return true;
      } catch (e) {
        warn('[AIStoryGen] choice order observer failed', e);
        return false;
      }
    }

    function count(name) {
      try {
        if (typeof deps.countPanels === 'function') return Number(deps.countPanels(name)) || 0;
      } catch (_) {}
      return 0;
    }

    function getStatus() {
      return {
        pendingDelays: Object.keys(timers).map(function (key) {
          return /^\d+(?:\.\d+)?$/.test(key) ? Number(key) : key;
        }).sort(function (a, b) {
          if (typeof a === 'number' && typeof b === 'number') return a - b;
          return String(a).localeCompare(String(b));
        }),
        moving: !!(typeof window !== 'undefined' && window._aiPanelLayoutMoving),
        runCount: runCount,
        lastAt: lastAt,
        managedPanels: count('managed'),
        pixelPanels: count('pixel'),
        legacyPixelOrderObserver: !!(typeof window !== 'undefined' && window._apgAssistOrderObserver),
        legacyPoseOrderObserver: !!(typeof window !== 'undefined' && window._apgPoseAssistOrderObserver),
        orderObserver: !!(typeof window !== 'undefined' && window[observerKey])
      };
    }

    function dedupePixelPanels() {
      if (typeof deps.dedupePixelPanels === 'function') return deps.dedupePixelPanels();
      return 0;
    }

    function removeChoicePanels() {
      if (typeof deps.removeChoicePanels === 'function') return deps.removeChoicePanels();
      return undefined;
    }

    return {
      schemaVersion: publicSchemaVersion,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      layout: layout,
      normalizeOrder: normalizeOrder,
      scheduleLayout: scheduleLayout,
      flush: flush,
      getStatus: getStatus,
      installOrderObserver: installOrderObserver,
      dedupePixelPanels: dedupePixelPanels,
      removeChoicePanels: removeChoicePanels,
      clearLegacyPixelObservers: clearLegacyPixelObservers,
    };
  }

  var api = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: createPanelManager,
  };

  root.PanelManagerModule = api;
  window.AIStoryGenPanelManagerModule = api;
})();
