/* ============================================================
 * AIStoryGen state store
 * Unified save-state normalization, writeback, and emergency memory backup.
 * ============================================================ */
(function () {
  'use strict';

  var root = window.AIStoryGen = window.AIStoryGen || {};
  var SCHEMA_VERSION = 2;

  function jsonClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function createStateStore(deps) {
    deps = deps || {};
    var schemaVersion = deps.schemaVersion || SCHEMA_VERSION;
    var memoryBackupKey = deps.memoryBackupKey || 'aiStoryGen_saveScopedMemoryBackup_v1';
    var memoryBackupMax = deps.memoryBackupMax || 8;

    function clone(value) {
      try {
        if (typeof deps.clone === 'function') return deps.clone(value);
      } catch (_) {}
      return jsonClone(value);
    }

    function getMemorySaveId() {
      try {
        return String((deps.getMemorySaveId && deps.getMemorySaveId()) || '').trim();
      } catch (_) {
        return '';
      }
    }

    function setMemorySaveId(id) {
      id = String(id || '').trim();
      try {
        if (deps.setMemorySaveId) return String(deps.setMemorySaveId(id) || id).trim();
      } catch (_) {}
      return id;
    }

    function normalizeImportantMemoryEntry(entry) {
      if (deps.normalizeImportantMemoryEntry) return deps.normalizeImportantMemoryEntry(entry);
      entry = entry || {};
      return {
        name: String(entry.name || '[memory]'),
        text: String(entry.text || '').trim(),
        tag: String(entry.tag || 'story'),
        locked: !!entry.locked,
        savedAt: entry.savedAt || new Date().toISOString(),
      };
    }

    function normalizeMemory(mem) {
      mem = mem || {};
      var recent = Array.isArray(mem.recentBuf) ? mem.recentBuf : [];
      var ltm = Array.isArray(mem.longTermMem) ? mem.longTermMem : [];
      return {
        recentBuf: recent.filter(function (entry) {
          return entry && typeof entry.name === 'string' && typeof entry.text === 'string';
        }).map(function (entry) {
          return { name: entry.name, text: entry.text };
        }),
        longTermMem: ltm.filter(function (entry) {
          return entry && typeof entry.name === 'string' && typeof entry.text === 'string';
        }).map(function (entry) {
          return normalizeImportantMemoryEntry(entry);
        }),
      };
    }

    function memoryHasContent(mem) {
      mem = normalizeMemory(mem || {});
      return !!(mem.recentBuf.length || mem.longTermMem.length);
    }

    function newMemorySaveId() {
      return 'aimem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function ensureMemorySaveId(vars) {
      var id = getMemorySaveId();
      if (!id && vars && vars.aiStoryGenMemoryId) {
        id = setMemorySaveId(vars.aiStoryGenMemoryId);
      }
      if (!id) id = setMemorySaveId(newMemorySaveId());
      if (vars && typeof vars === 'object') vars.aiStoryGenMemoryId = id;
      return id;
    }

    function extractMemorySaveIdFromSave(save) {
      try {
        if (!save || !save.state) return '';
        return String(
          save.state.aiStoryGenMemoryId ||
          (save.state.variables && save.state.variables.aiStoryGenMemoryId) ||
          (save.state.active && save.state.active.variables && save.state.active.variables.aiStoryGenMemoryId) ||
          ''
        ).trim();
      } catch (_) {
        return '';
      }
    }

    function getStateVariables() {
      try {
        return deps.getStateVariables ? deps.getStateVariables() : null;
      } catch (_) {
        return null;
      }
    }

    function currentPassageName() {
      try {
        return deps.currentPassageName ? deps.currentPassageName() : '';
      } catch (_) {
        return '';
      }
    }

    function memoryFingerprint(vars) {
      vars = vars || getStateVariables() || {};
      var player = vars.player || {};
      return {
        memoryId: String(getMemorySaveId() || vars.aiStoryGenMemoryId || '').trim(),
        passage: String(currentPassageName() || ''),
        playerName: String(vars.name || vars.playerName || vars.playername || player.name || vars.saveName || '').trim(),
        gender: String((player && (player.gender_appearance || player.gender)) || vars.gender || ''),
        location: String(vars.location || vars.currentLocation || vars.location_name || ''),
      };
    }

    function readMemoryEmergencyBackups() {
      try {
        var raw = localStorage.getItem(memoryBackupKey);
        var data = raw ? JSON.parse(raw) : [];
        return Array.isArray(data) ? data : [];
      } catch (_) {
        return [];
      }
    }

    function writeMemoryEmergencyBackups(list) {
      list = Array.isArray(list) ? list.slice(0, memoryBackupMax) : [];
      try { localStorage.setItem(memoryBackupKey, JSON.stringify(list)); } catch (_) {}
      try {
        if (deps.idbSet) deps.idbSet(memoryBackupKey, list).catch(function () {});
      } catch (_) {}
    }

    function snapshotMemory() {
      try {
        return deps.snapshotMemory ? deps.snapshotMemory() : {};
      } catch (_) {
        return {};
      }
    }

    function persistMemoryEmergencyBackup(mem, reason) {
      mem = normalizeMemory(mem || snapshotMemory());
      if (!memoryHasContent(mem)) return;
      var vars = getStateVariables();
      var id = ensureMemorySaveId(vars);
      var fp = memoryFingerprint(vars);
      var list = readMemoryEmergencyBackups();
      list = list.filter(function (entry) {
        if (!entry) return false;
        if (entry.memoryId && entry.memoryId === id) return false;
        return !(entry.fingerprint && fp.passage && entry.fingerprint.passage === fp.passage && entry.fingerprint.playerName === fp.playerName && entry.fingerprint.gender === fp.gender);
      });
      list.unshift({
        memoryId: id,
        fingerprint: fp,
        memory: mem,
        reason: String(reason || ''),
        updatedAt: Date.now(),
      });
      writeMemoryEmergencyBackups(list);
    }

    function scoreMemoryEmergencyBackup(entry, fp, wantedId) {
      if (!entry || !entry.memory || !memoryHasContent(entry.memory)) return 0;
      var efp = entry.fingerprint || {};
      if (wantedId && entry.memoryId === wantedId) return 100;
      var score = 0;
      if (fp.memoryId && entry.memoryId === fp.memoryId) score += 80;
      if (fp.playerName && efp.playerName && fp.playerName === efp.playerName) score += 8;
      if (fp.gender && efp.gender && fp.gender === efp.gender) score += 4;
      if (fp.passage && efp.passage && fp.passage === efp.passage) score += 8;
      if (fp.location && efp.location && fp.location === efp.location) score += 4;
      return score;
    }

    function findMatchingMemoryEmergencyBackup(save) {
      var vars = (save && save.state && save.state.variables) || getStateVariables() || {};
      var wantedId = extractMemorySaveIdFromSave(save);
      if (wantedId) setMemorySaveId(wantedId);
      var fp = memoryFingerprint(vars);
      var best = null;
      var bestScore = 0;
      var list = readMemoryEmergencyBackups();
      for (var i = 0; i < list.length; i++) {
        var score = scoreMemoryEmergencyBackup(list[i], fp, wantedId);
        if (score > bestScore) {
          bestScore = score;
          best = list[i];
        }
      }
      if (best && (bestScore >= 80 || (bestScore >= 16 && fp.passage))) return best.memory;
      return null;
    }

    function normalizeEventLog(log) {
      if (!Array.isArray(log)) return [];
      return log.slice(-80).map(function (entry) {
        return clone(entry);
      }).filter(Boolean);
    }

    function normalizeItemStore(items) {
      try {
        if (deps.normalizeItemStoreArray) return deps.normalizeItemStoreArray(items);
      } catch (_) {}
      return Array.isArray(items) ? items.map(function (item) { return clone(item); }).filter(Boolean) : [];
    }

    function normalizeState(state) {
      state = state || {};
      var meta = (state.meta && typeof state.meta === 'object') ? clone(state.meta) : {};
      var memoryId = String(state.memoryId || state.saveId || meta.memoryId || meta.saveId || getMemorySaveId() || '').trim();
      var memory = normalizeMemory(state.memory || state.aiMemory || {});
      var scene = state.scene && typeof state.scene === 'object' ? clone(state.scene) : null;
      var intimateScene = state.intimateScene && typeof state.intimateScene === 'object' ? clone(state.intimateScene) : null;
      var items = Array.isArray(state.items) ? normalizeItemStore(state.items) : [];
      var eventLog = normalizeEventLog(state.eventLog);
      var config = state.config && typeof state.config === 'object'
        ? (deps.normalizeSaveScopedConfig ? deps.normalizeSaveScopedConfig(state.config) : clone(state.config))
        : null;
      return {
        schemaVersion: schemaVersion,
        memoryId: memoryId,
        memory: memory,
        scene: scene,
        intimateScene: intimateScene,
        items: items,
        eventLog: eventLog,
        config: config,
        meta: Object.assign({}, meta, {
          schemaVersion: schemaVersion,
          memoryId: memoryId,
          updatedAt: Date.now(),
        }),
      };
    }

    function patchStateField(vars, field, value) {
      if (!vars || typeof vars !== 'object') return;
      var state = vars.aiStoryGenState && typeof vars.aiStoryGenState === 'object'
        ? clone(vars.aiStoryGenState)
        : { schemaVersion: schemaVersion, meta: {} };
      state.schemaVersion = schemaVersion;
      state.meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
      state.meta.updatedAt = Date.now();
      state.meta.schemaVersion = schemaVersion;
      var memoryId = getMemorySaveId();
      if (memoryId) {
        state.memoryId = memoryId;
        state.meta.memoryId = memoryId;
      }
      if (value == null) delete state[field];
      else state[field] = clone(value);
      vars.aiStoryGenState = state;
    }

    function readFromSave(save) {
      var ss = save && save.state ? save.state : {};
      var vars = ss.variables || {};
      var activeVars = ss.active && ss.active.variables ? ss.active.variables : {};
      var state = ss.aiStoryGenState || vars.aiStoryGenState || activeVars.aiStoryGenState || {};
      var memory = state.memory || ss.aiMemory || ss.aiStoryGenMemory || vars.aiStoryGenMemory || activeVars.aiStoryGenMemory || {};
      var scene = state.scene || ss.aiStoryGenNavState || vars.aiStoryGenNavState || activeVars.aiStoryGenNavState || null;
      var intimateScene = state.intimateScene || ss.aiStoryGenIntimateScene || vars.aiStoryGenIntimateScene || activeVars.aiStoryGenIntimateScene || null;
      var items = Array.isArray(state.items) ? state.items
        : (Array.isArray(ss.aiStoryGenItems) ? ss.aiStoryGenItems
          : (Array.isArray(vars.aiStoryGenItems) ? vars.aiStoryGenItems
            : (Array.isArray(activeVars.aiStoryGenItems) ? activeVars.aiStoryGenItems : [])));
      var eventLog = Array.isArray(state.eventLog) ? state.eventLog
        : (Array.isArray(ss.aiStoryGenEventLog) ? ss.aiStoryGenEventLog
          : (Array.isArray(vars.aiStoryGenEventLog) ? vars.aiStoryGenEventLog
            : (Array.isArray(activeVars.aiStoryGenEventLog) ? activeVars.aiStoryGenEventLog : [])));
      var config = state.config || ss.aiStoryGenConfig || vars.aiStoryGenConfig || activeVars.aiStoryGenConfig || null;
      return normalizeState({
        schemaVersion: state.schemaVersion || 1,
        memoryId: state.memoryId || extractMemorySaveIdFromSave(save),
        memory: memory,
        scene: scene,
        intimateScene: intimateScene,
        items: items,
        eventLog: eventLog,
        config: config,
        meta: state.meta || {},
      });
    }

    function captureScene() {
      try {
        return deps.captureScene ? deps.captureScene() : null;
      } catch (_) {
        return null;
      }
    }

    function captureIntimateScene() {
      try {
        return deps.captureIntimateScene ? deps.captureIntimateScene() : null;
      } catch (_) {
        return null;
      }
    }

    function getItemStore() {
      try {
        return deps.getItemStore ? deps.getItemStore() : [];
      } catch (_) {
        return [];
      }
    }

    function build(reason) {
      var vars = getStateVariables();
      var memoryId = ensureMemorySaveId(vars);
      var eventLog = [];
      try { eventLog = normalizeEventLog(vars && vars.aiStoryGenEventLog); } catch (_) {}
      return normalizeState({
        memoryId: memoryId,
        memory: snapshotMemory(),
        scene: captureScene(),
        intimateScene: captureIntimateScene(),
        items: normalizeItemStore(getItemStore()),
        eventLog: eventLog,
        config: deps.captureSaveScopedConfig ? deps.captureSaveScopedConfig() : null,
        meta: {
          reason: String(reason || ''),
          passage: currentPassageName(),
          savedAt: Date.now(),
        },
      });
    }

    function writeToVariables(vars, aiState) {
      if (!vars || typeof vars !== 'object') return;
      aiState = normalizeState(aiState || {});
      vars.aiStoryGenState = clone(aiState);
      vars.aiStoryGenMemoryId = aiState.memoryId || ensureMemorySaveId(vars);
      vars.aiStoryGenMemoryUpdatedAt = Date.now();
      vars.aiStoryGenMemory = clone(aiState.memory);
      if (aiState.scene) vars.aiStoryGenNavState = clone(aiState.scene);
      else delete vars.aiStoryGenNavState;
      if (aiState.intimateScene) vars.aiStoryGenIntimateScene = clone(aiState.intimateScene);
      else delete vars.aiStoryGenIntimateScene;
      vars.aiStoryGenItems = clone(aiState.items || []);
      vars.aiStoryGenEventLog = clone(aiState.eventLog || []);
      if (aiState.config) vars.aiStoryGenConfig = clone(aiState.config);
      else delete vars.aiStoryGenConfig;
    }

    function writeToStateObject(stateObj, aiState) {
      if (!stateObj || typeof stateObj !== 'object') return;
      aiState = normalizeState(aiState || {});
      stateObj.aiStoryGenState = clone(aiState);
      stateObj.aiMemory = clone(aiState.memory);
      stateObj.aiStoryGenMemory = clone(aiState.memory);
      stateObj.aiStoryGenMemoryId = aiState.memoryId;
      stateObj.aiStoryGenMemoryUpdatedAt = Date.now();
      if (aiState.scene) stateObj.aiStoryGenNavState = clone(aiState.scene);
      else delete stateObj.aiStoryGenNavState;
      if (aiState.intimateScene) stateObj.aiStoryGenIntimateScene = clone(aiState.intimateScene);
      else delete stateObj.aiStoryGenIntimateScene;
      stateObj.aiStoryGenItems = clone(aiState.items || []);
      stateObj.aiStoryGenEventLog = clone(aiState.eventLog || []);
      if (aiState.config) stateObj.aiStoryGenConfig = clone(aiState.config);
      else delete stateObj.aiStoryGenConfig;
    }

    function writeToCurrentMoment(aiState) {
      aiState = normalizeState(aiState || build('current'));
      try { writeToVariables(getStateVariables(), aiState); } catch (_) {}
      try { if (typeof State !== 'undefined' && State.active && State.active.variables) writeToVariables(State.active.variables, aiState); } catch (_) {}
      try {
        if (typeof State !== 'undefined' && Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
          writeToVariables(State.history[State.activeIndex].variables, aiState);
        }
      } catch (_) {}
      try {
        if (typeof State !== 'undefined' && Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
          writeToVariables(State._history[State.activeIndex].variables, aiState);
        }
      } catch (_) {}
    }

    function writeToSave(save, aiState) {
      if (!save || !save.state) return;
      aiState = normalizeState(aiState || {});
      writeToStateObject(save.state, aiState);
      if (save.state.variables) writeToVariables(save.state.variables, aiState);
      if (save.state.active && save.state.active.variables) writeToVariables(save.state.active.variables, aiState);
      if (Array.isArray(save.state.history)) {
        var idx = save.state.activeIndex != null ? save.state.activeIndex : save.state.index;
        if (idx == null) idx = save.state.history.length - 1;
        if (save.state.history[idx] && save.state.history[idx].variables) {
          writeToVariables(save.state.history[idx].variables, aiState);
        }
      }
    }

    function syncCurrent(reason) {
      var aiState = build(reason || 'sync');
      writeToCurrentMoment(aiState);
      persistMemoryEmergencyBackup(aiState.memory, reason || 'state-store-sync');
      return aiState;
    }

    return {
      schemaVersion: schemaVersion,
      normalizeMemory: normalizeMemory,
      memoryHasContent: memoryHasContent,
      clone: clone,
      newMemorySaveId: newMemorySaveId,
      ensureMemorySaveId: ensureMemorySaveId,
      extractMemorySaveIdFromSave: extractMemorySaveIdFromSave,
      memoryFingerprint: memoryFingerprint,
      readMemoryEmergencyBackups: readMemoryEmergencyBackups,
      writeMemoryEmergencyBackups: writeMemoryEmergencyBackups,
      persistMemoryEmergencyBackup: persistMemoryEmergencyBackup,
      scoreMemoryEmergencyBackup: scoreMemoryEmergencyBackup,
      findMatchingMemoryEmergencyBackup: findMatchingMemoryEmergencyBackup,
      normalizeEventLog: normalizeEventLog,
      normalize: normalizeState,
      patchField: patchStateField,
      readFromSave: readFromSave,
      build: build,
      writeToVariables: writeToVariables,
      writeToStateObject: writeToStateObject,
      writeToCurrentMoment: writeToCurrentMoment,
      writeToSave: writeToSave,
      syncCurrent: syncCurrent,
    };
  }

  root.createStateStore = createStateStore;
  root.StateStoreModule = {
    schemaVersion: 1,
    create: createStateStore,
  };
  window.AIStoryGenStateStore = root.StateStoreModule;
})();
