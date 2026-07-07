/* AIStoryGen native scene bridge module.
 *
 * First split stage: own the public bridge API and lifecycle status shape while
 * keeping concrete game/DOM operations injected from aiMacro.js.
 */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function asFn(fn) {
    return typeof fn === 'function' ? fn : null;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function defaultStatus(reason) {
    return {
      schemaVersion: 3,
      reason: reason || '',
      passage: '',
      combatActive: false,
      nativeSexOrCombatPassage: false,
      shouldShowSexModeOption: false,
      sexTargets: [],
      targetPickerOpen: false,
      sexModeButtons: 0,
      endCombatControls: 0,
      customIntentInputs: 0,
      lastJump: null
    };
  }

  function create(deps) {
    deps = deps || {};
    var publicSchemaVersion = Number(deps.publicSchemaVersion || 3) || 3;

    function call(name, args, fallback) {
      var fn = asFn(deps[name]);
      if (!fn) return typeof fallback === 'function' ? fallback() : fallback;
      return fn.apply(null, args || []);
    }

    function getStatus(reason) {
      return call('getStatus', [reason || 'api'], function () {
        return defaultStatus(reason || 'api');
      });
    }

    function collectSexTargets(contextText) {
      return safeArray(call('collectSexTargets', [contextText], []));
    }

    function summarizeTarget(target) {
      if (!target) return null;
      return {
        label: String(target.label || target.npc || target.passage || '').trim(),
        npc: target.npc || '',
        passage: target.passage || '',
        manual: !!target.manual,
        custom: !!target.custom,
        structured: !!target.structured
      };
    }

    function collectSexTargetSummaries(contextText) {
      if (asFn(deps.collectSexTargetSummaries)) {
        return safeArray(call('collectSexTargetSummaries', [contextText], []));
      }
      return collectSexTargets(contextText).map(summarizeTarget).filter(Boolean);
    }

    var bridge = {
      schemaVersion: publicSchemaVersion,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,

      getStatus: getStatus,

      isCombatActive: function () {
        return !!call('isCombatActive', [], false);
      },

      isNativeSexOrCombatPassage: function (name) {
        return !!call('isNativeSexOrCombatPassage', [name], false);
      },

      shouldShowSexModeOption: function () {
        return !!call('shouldShowSexModeOption', [], false);
      },

      collectSexTargets: collectSexTargets,
      collectSexTargetSummaries: collectSexTargetSummaries,

      enterSexMode: function () {
        return call('enterSexMode', [], false);
      },

      showSexTargetPicker: function (targets) {
        return call('showSexTargetPicker', [targets || collectSexTargets()], false);
      },

      jumpSexTargets: function (targets) {
        return call('jumpSexTargets', [safeArray(targets).slice(0, 10)], false);
      },

      clearTargetPicker: function () {
        return call('clearTargetPicker', [], false);
      },

      prepareNativeModeJump: function () {
        return call('prepareNativeModeJump', [], false);
      },

      dedupeSexModeButtons: function () {
        return call('dedupeSexModeButtons', [], false);
      },

      injectSexModeEntry: function () {
        return call('injectSexModeEntry', [], false);
      },

      refreshControls: function (reason) {
        return call('refreshControls', [reason || 'api'], function () {
          return getStatus(reason || 'api');
        });
      },

      injectCombatIntentInputs: function () {
        return call('injectCombatIntentInputs', [], false);
      },

      ensureCombatControls: function (reason) {
        call('injectCombatIntentInputs', [], false);
        return getStatus(reason || 'combat controls');
      },

      injectEndCombatButton: function () {
        return call('injectEndCombatButton', [], false);
      },

      forceEndCombat: function (mode) {
        return call('forceEndCombat', [mode], false);
      },

      syncCombatLifecycle: function () {
        return call('syncCombatLifecycle', [], false);
      }
    };

    return bridge;
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create
  };

  root.AIStoryGen.NativeSceneBridgeModule = moduleApi;
  root.AIStoryGenNativeSceneBridgeModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
