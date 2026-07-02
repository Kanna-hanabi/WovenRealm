/* ============================================================
 * AIStoryGen - DoL AI Story Mod
 * Macros: <<aigen "instruction">>  <<aiconfig>>  <<aimemory>>
 * Config: localStorage key "aiStoryGen_cfg"
 * 
 * Integrates into the game's Settings page via JS injection.
 * Also provides standalone AIStoryGen_Config / _Demo passages.
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 1. 默认配置 ----------
  const CFG_KEY = 'aiStoryGen_cfg';
  const IDB_NAME = 'AIStoryGen';
  const IDB_STORE = 'settings';
  var _idbReady = false;
  var _idbDB = null;

  // IndexedDB helpers
  function initIDB() {
    if (_idbDB) return Promise.resolve(_idbDB);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () {
        _idbDB = req.result;
        _idbReady = true;
        resolve(_idbDB);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(key, value) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  window.AIStoryGen = window.AIStoryGen || {};
  const Core = window.AIStoryGenCore || window.AIStoryGen.Core;
  function _requireCore(name) {
    if (!Core || typeof Core[name] === 'undefined') {
      throw new Error('[AIStoryGen] ai-core.js must load before aiMacro.js: missing ' + name);
    }
    return Core[name];
  }
  const ApiClientModule = window.AIStoryGenApiClientModule || window.AIStoryGen.ApiClientModule;
  if (!ApiClientModule || !ApiClientModule.schemaVersion) {
    throw new Error('[AIStoryGen] ai-api-client.js must load before aiMacro.js');
  }
  const StoryRuntimeModule = window.AIStoryGenStoryRuntimeModule || window.AIStoryGen.StoryRuntimeModule;
  if (!StoryRuntimeModule || !StoryRuntimeModule.schemaVersion) {
    throw new Error('[AIStoryGen] ai-story-runtime.js must load before aiMacro.js');
  }
  const DEFAULT_CFG = _requireCore('DEFAULT_CFG');
  const _normalizeCfg = _requireCore('normalizeCfg');

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      var cfg = Object.assign({}, DEFAULT_CFG, raw ? JSON.parse(raw) : {});
      return _normalizeCfg(cfg);
    } catch (e) {
      var fallback = Object.assign({}, DEFAULT_CFG);
      return _normalizeCfg(fallback);
    }
  }
  function saveCfg(c) {
    c = _normalizeCfg(Object.assign({}, DEFAULT_CFG, c || {}));
    // localStorage: immediate sync save (always works as fallback)
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* quota exceeded, etc. */ }
    // IndexedDB: async save (no size limit, no sync blocking)
    try {
      idbSet(CFG_KEY, c).catch(function (e) {
        console.warn('[AIStoryGen] IndexedDB save failed, using localStorage fallback', e);
      });
    } catch (e) { /* IndexedDB not available */ }
    try {
      if (typeof _syncSaveScopedConfigToCurrentMoment === 'function') {
        setTimeout(function () { _syncSaveScopedConfigToCurrentMoment('saveCfg'); }, 0);
      }
    } catch (e) { /* state not ready */ }
  }

  // Try to restore config from IndexedDB on startup. localStorage is the immediate
  // source of truth, so an older IndexedDB backup must not overwrite fresh UI edits.
  try {
    idbGet(CFG_KEY).then(function (stored) {
      if (stored && typeof stored === 'object' && stored.apiKey !== undefined) {
        var localRaw = null;
        var localCfg = null;
        try { localRaw = localStorage.getItem(CFG_KEY); } catch (_) {}
        if (localRaw) {
          try { localCfg = JSON.parse(localRaw); } catch (_) { localCfg = null; }
        }
        var merged = _normalizeCfg(Object.assign({}, DEFAULT_CFG, stored, localCfg || {}));
        localStorage.setItem(CFG_KEY, JSON.stringify(merged));
        idbSet(CFG_KEY, merged).catch(function () {});
        console.log(localCfg ? '[AIStoryGen] config synced to IndexedDB from localStorage' : '[AIStoryGen] config restored from IndexedDB');
      }
    }).catch(function () {});
  } catch (e) { /* IndexedDB not available */ }

  window.AIStoryGen = window.AIStoryGen || {};
  window.AIStoryGen.VERSION = '0.1.315';
  try { console.log('[AIStoryGen] runtime version ' + window.AIStoryGen.VERSION); } catch (_) {}

  function _ensureClothingCnNameFallback(reason) {
    try {
      var st = (typeof setup !== 'undefined' && setup) ? setup : (window.SugarCube && window.SugarCube.setup) || window.setup;
      if (!st || !st.clothes || !Array.isArray(st.clothes.all)) return 0;
      var all = st.clothes.all;
      var byName = {};
      for (var i = 0; i < all.length; i++) {
        var item = all[i];
        if (!item || typeof item.name !== 'string' || !item.name) continue;
        byName[item.name] = item;
        if (item.cn_name_cap == null) item.cn_name_cap = item.cn_name || item.displayname || item.name;
        if (item.cn_name == null) item.cn_name = item.cn_name_cap || item.displayname || item.name;
      }
      var added = 0;
      var cnFallbackNames = {
        'bunny slippers': '兔子拖鞋'
      };
      function addName(name, template) {
        name = String(name || '').trim();
        if (!name || /^(?:none|naked|broken|split)$/i.test(name)) return;
        var fallbackCn = (template && (template.cn_name_cap || template.cn_name || template.displayname)) || cnFallbackNames[name] || name;
        if (byName[name]) {
          if (byName[name].cn_name_cap == null) byName[name].cn_name_cap = fallbackCn;
          if (byName[name].cn_name == null) byName[name].cn_name = byName[name].cn_name_cap || fallbackCn;
          return;
        }
        var fallback = {
          name: name,
          cn_name: fallbackCn,
          cn_name_cap: fallbackCn,
          displayname: fallbackCn,
          type: ['ai_fallback'],
          slot: ''
        };
        all.push(fallback);
        byName[name] = fallback;
        added++;
      }
      function addItem(item) {
        if (item && typeof item === 'object' && typeof item.name === 'string') addName(item.name, item);
      }
      Object.keys(st.clothes).forEach(function (slot) {
        var list = st.clothes[slot];
        if (Array.isArray(list)) list.forEach(addItem);
      });
      var V = null;
      try { V = (typeof State !== 'undefined' && State.variables) || (window.SugarCube && window.SugarCube.State && window.SugarCube.State.variables) || null; } catch (_) {}
      var clothingSlots = {
        over_upper: true, over_lower: true, upper: true, lower: true,
        under_upper: true, under_lower: true, over_head: true, head: true,
        face: true, neck: true, hands: true, legs: true, feet: true,
        genitals: true, handheld: true
      };
      function scanSlotObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function (key) {
          var val = obj[key];
          if (Array.isArray(val)) val.forEach(addItem);
          else addItem(val);
        });
      }
      function scanOutfit(outfit) {
        if (!outfit || typeof outfit !== 'object') return;
        if (typeof outfit.name === 'string') addName(outfit.name);
        Object.keys(outfit).forEach(function (key) {
          var val = outfit[key];
          if (clothingSlots[key] && typeof val === 'string') addName(val);
          else if (val && typeof val === 'object' && (key === 'outfitPrimary' || key === 'outfitSecondary')) {
            Object.keys(val).forEach(function (slot) {
              if (clothingSlots[slot] && typeof val[slot] === 'string') addName(val[slot]);
            });
          }
        });
      }
      if (V) {
        scanSlotObject(V.worn);
        scanSlotObject(V.carried);
        scanSlotObject(V.wardrobe);
        if (Array.isArray(V.outfit)) V.outfit.forEach(scanOutfit);
        else if (V.outfit && typeof V.outfit === 'object') Object.keys(V.outfit).forEach(function (key) { scanOutfit(V.outfit[key]); });
      }
      if (added) {
        try { console.log('[AIStoryGen] added clothing translation fallback entries: ' + added + (reason ? ' (' + reason + ')' : '')); } catch (_) {}
      }
      return added;
    } catch (e) {
      try { console.warn('[AIStoryGen] clothing translation fallback failed', e); } catch (_) {}
      return 0;
    }
  }

  try { _ensureClothingCnNameFallback('startup'); } catch (_) {}
  try {
    setTimeout(function () { _ensureClothingCnNameFallback('startup delayed'); }, 100);
    setTimeout(function () { _ensureClothingCnNameFallback('startup late'); }, 1000);
  } catch (_) {}
  try {
    if (typeof $ !== 'undefined' && $.fn && $(document).on) {
      $(document).on(':passagestart :passageinit :passagerender :passagedisplay', function (ev) {
        var name = '';
        try { name = (ev && ev.passage && ev.passage.title) || (typeof State !== 'undefined' && State.passage) || ''; } catch (_) {}
        _ensureClothingCnNameFallback(name || 'passage');
      });
    }
  } catch (_) {}
  window.AIStoryGen.ensureClothingCnNameFallback = _ensureClothingCnNameFallback;

    function _isOptionalAddonLoaded() { return false; }

  function _isOptionalAddonUnlocked() { return false; }

  function _setOptionalAddonUnlocked() { return false; }

  function _isHiddenAdultConfigField(field) { return false; }
  window.AIStoryGen.isOptionalAddonLoaded = _isOptionalAddonLoaded;
  window.AIStoryGen.isOptionalAddonUnlocked = _isOptionalAddonUnlocked;
  window.AIStoryGen.isApiConfigured = _isApiConfigured;
  window.AIStoryGen.refreshApiWarnBar = _refreshApiWarnBar;
  window.AIStoryGen.loadCfg = loadCfg;
  window.AIStoryGen.saveCfg = saveCfg;
  window.AIStoryGen.DEFAULT_CFG = DEFAULT_CFG;

  function _clearLegacyUILayoutMarkers($el) {
    var classes = ['ai-layout-auto', 'ai-layout-mobile', 'ai-layout-tablet', 'ai-layout-desktop', 'ai-layout-forced'];
    try {
      $($el || []).removeClass(classes.join(' '))
        .removeAttr('data-ai-layout-mode data-ai-layout-setting');
    } catch (_) {}
  }

  function _applyUILayoutMode(reason) {
    _clearLegacyUILayoutMarkers([document.documentElement, document.body]);
    try {
      window.AIStoryGen.currentLayoutMode = 'native';
      window.AIStoryGen.currentLayoutSetting = 'native';
    } catch (_) {}
    return { mode: 'native', setting: 'native', reason: reason || '' };
  }
  window.AIStoryGen.applyUILayoutMode = _applyUILayoutMode;

  function _applyUILayoutClassTo($el, reason) {
    var info = _applyUILayoutMode(reason);
    _clearLegacyUILayoutMarkers($el);
    return info;
  }

  // ---------- 1b-1e. 核心工具来自 ai-core.js ----------
  var AIErrorType = _requireCore('AIErrorType');
  var AIError = _requireCore('AIError');
  var userErrorMessage = _requireCore('userErrorMessage');
  var classifyError = _requireCore('classifyError');
  var getSafeV = _requireCore('getSafeV');
  var safeRead = _requireCore('safeRead');
  var checkNetwork = _requireCore('checkNetwork');
  var applyPostProcess = _requireCore('applyPostProcess');

  window.AIStoryGen.classifyError = classifyError;
  window.AIStoryGen.checkNetwork = checkNetwork;
  window.AIStoryGen.getSafeV = getSafeV;

  // ---------- 2. 剧情记忆系统：近期记忆 + 长期记忆 ----------
  const MEM_KEY = 'aiStoryGen_recentBuf';
  const LONGTERM_KEY = 'aiStoryGen_longTermMem';
  const MEMORY_BACKUP_KEY = 'aiStoryGen_saveScopedMemoryBackup_v1';
  const MEMORY_BACKUP_MAX = 8;
  const AI_STATE_SCHEMA_VERSION = 2;
  var _aiStateStoreReady = false;

  // -- 近期记忆（环形缓冲，用于AI上下文） --
  const recentBuf = [];
  window.AIStoryGen.recentBuf = recentBuf;

  // -- 长期记忆（按游戏存档隔离，不跨存档继承） --
  const longTermMem = [];
  window.AIStoryGen.longTermMem = longTermMem;
  var _aiMemorySaveBound = false;
  var _aiMemorySaveId = '';

  function _memoryEntry(name, text) {
    return {
      name: String(name || '[记忆]'),
      text: String(text || '').trim(),
      tag: '剧情',
      locked: false,
      savedAt: new Date().toISOString()
    };
  }

  function _normalizeImportantMemoryEntry(entry) {
    entry = entry || {};
    return {
      name: String(entry.name || '[记忆]'),
      text: String(entry.text || '').trim(),
      tag: String(entry.tag || '剧情'),
      locked: !!entry.locked,
      savedAt: entry.savedAt || new Date().toISOString()
    };
  }

  function _currentPassageName() {
    try {
      return (typeof State !== 'undefined' && State.passage) || '';
    } catch (e) {
      return '';
    }
  }

  function _isStartOrMainMenuPassage(name) {
    name = String(name || _currentPassageName() || '');
    return !name || name === 'Start';
  }

  function _normalizeSaveMemory(mem) {
    return _aiStateStore.normalizeMemory(mem);
  }

  function _replaceMemoryFromSave(mem) {
    mem = _normalizeSaveMemory(mem);
    recentBuf.length = 0;
    mem.recentBuf.forEach(function (entry) { recentBuf.push(entry); });
    longTermMem.length = 0;
    mem.longTermMem.forEach(function (entry) { longTermMem.push(entry); });
    _sanitizeMemoryBuffers();
  }

  function _snapshotMemoryForSave() {
    _sanitizeMemoryBuffers();
    return {
      recentBuf: recentBuf.map(function (entry) {
        return { name: String(entry.name || ''), text: String(entry.text || '') };
      }),
      longTermMem: longTermMem.map(function (entry) {
        return _normalizeImportantMemoryEntry(entry);
      })
    };
  }

  const StateStoreModule = window.AIStoryGenStateStore || window.AIStoryGen.StateStoreModule;
  if (!StateStoreModule || typeof StateStoreModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-state-store.js must load before aiMacro.js');
  }
  const TransactionModule = window.AIStoryGenTransactionModule || window.AIStoryGen.TransactionModule;
  if (!TransactionModule || typeof TransactionModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-transaction.js must load before aiMacro.js');
  }
  const LinkClassifierModule = window.AIStoryGenLinkClassifierModule || window.AIStoryGen.LinkClassifierModule;
  if (!LinkClassifierModule || typeof LinkClassifierModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-link-classifier.js must load before aiMacro.js');
  }
  const PageClassifierModule = window.AIStoryGenPageClassifierModule || window.AIStoryGen.PageClassifierModule;
  if (!PageClassifierModule || typeof PageClassifierModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-page-classifier.js must load before aiMacro.js');
  }
  const EventParserModule = window.AIStoryGenEventParserModule || window.AIStoryGen.EventParserModule;
  if (!EventParserModule || typeof EventParserModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-event-parser.js must load before aiMacro.js');
  }
  const EventSchemaModule = window.AIStoryGenEventSchemaModule || window.AIStoryGen.EventSchemaModule;
  if (!EventSchemaModule || !EventSchemaModule.schemaVersion) {
    throw new Error('[AIStoryGen] ai-event-schema.js must load before aiMacro.js');
  }
  const ItemSchemaModule = window.AIStoryGenItemSchemaModule || window.AIStoryGen.ItemSchemaModule;
  if (!ItemSchemaModule || !ItemSchemaModule.schemaVersion) {
    throw new Error('[AIStoryGen] ai-item-schema.js must load before aiMacro.js');
  }
  const EventValidatorModule = window.AIStoryGenEventValidatorModule || window.AIStoryGen.EventValidatorModule;
  if (!EventValidatorModule || typeof EventValidatorModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-event-validator.js must load before aiMacro.js');
  }
  const MemoryUIModule = window.AIStoryGenMemoryUIModule || window.AIStoryGen.MemoryUIModule;
  if (!MemoryUIModule || typeof MemoryUIModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-memory-ui.js must load before aiMacro.js');
  }
  const ConfigUIModule = window.AIStoryGenConfigUIModule || window.AIStoryGen.ConfigUIModule;
  if (!ConfigUIModule || typeof ConfigUIModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-config-ui.js must load before aiMacro.js');
  }
  const PanelManagerModule = window.AIStoryGenPanelManagerModule || window.AIStoryGen.PanelManagerModule;
  if (!PanelManagerModule || typeof PanelManagerModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-panel-manager.js must load before aiMacro.js');
  }
  const NativeEventGuardModule = window.AIStoryGenNativeEventGuardModule || window.AIStoryGen.NativeEventGuardModule;
  if (!NativeEventGuardModule || typeof NativeEventGuardModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-native-event-guard.js must load before aiMacro.js');
  }

  const AIEventValidator = EventValidatorModule.create({
    canonicalAIEventKey: EventParserModule.canonicalAIEventKey,
    normaliseText: _normaliseAIEventText,
    normaliseEventType: _normaliseAIEventType,
    normaliseLocation: _normaliseAIEventLocationValue,
    normaliseStatus: _normaliseAIEventStatusStrict,
    normaliseNameList: _normaliseAIEventNameList,
    parseInt: _parseAiEventInt,
    normaliseItems: _normaliseAIEventItemsField,
    normaliseStats: _normaliseAIEventStatsField,
    normaliseRelationships: _normaliseAIEventRelationshipsField,
    normaliseMoney: _normaliseAIEventMoneyField
  });
  const MemoryUI = MemoryUIModule.create({
    $: window.jQuery || window.$,
    getRecentBuf: function () { return recentBuf; },
    getLongTermMem: function () { return longTermMem; },
    normalizeImportantMemoryEntry: _normalizeImportantMemoryEntry,
    memoryEntry: _memoryEntry,
    saveMemoryBuffer: saveMemoryBuffer,
    loadCfg: loadCfg,
    callAI: function (prompt, opts) { return callAI(prompt, opts); },
    isNoUsefulLongTermRefineOutput: _isNoUsefulLongTermRefineOutput,
    refineLongTermMemoryBulkText: _refineLongTermMemoryBulkText,
    enforceRecentMemoryLimit: enforceRecentMemoryLimit,
    exportMemoryBuffer: exportMemoryBuffer,
    importMemoryBuffer: importMemoryBuffer,
    addImportantMemory: addImportantMemory,
    confirm: function (message) { return window.confirm(message); }
  });
  window.AIStoryGen.MemoryUI = MemoryUI;

  function _getMemorySaveIdForStateStore() {
    return _aiMemorySaveId;
  }

  function _setMemorySaveIdForStateStore(id) {
    _aiMemorySaveId = String(id || '').trim();
    return _aiMemorySaveId;
  }

  var AI_STORY_LOCAL_ONLY_CFG_KEYS = {
    apiKey: true,
    endpoint: true,
    model: true,
    highQualityEndpoint: true,
    highQualityModel: true
  };

  var AI_PIXEL_LOCAL_ONLY_CFG_KEYS = {
    llmEndpoint: true,
    llmKey: true,
    llmModel: true,
    imgEndpoint: true,
    imgKey: true,
    imgModel: true,
    specialImgEndpoint: true,
    specialImgModel: true,
    specialPoseControlNetModel: true
  };

  function _copyConfigExceptLocalOnly(source, blocked) {
    var out = {};
    if (!source || typeof source !== 'object') return out;
    Object.keys(source).forEach(function (k) {
      if (blocked && blocked[k]) return;
      var v = source[k];
      if (typeof v === 'function') return;
      try { out[k] = _safeCloneForAiState(v); } catch (_) { out[k] = v; }
    });
    return out;
  }

  function _loadPixelCfgForSaveScope() {
    try {
      if (window.AIPixelGen && typeof window.AIPixelGen.loadCfg === 'function') return window.AIPixelGen.loadCfg();
    } catch (_) {}
    try {
      var raw = localStorage.getItem('aiPixelGen_cfg');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function _savePixelCfgForSaveScope(next) {
    try {
      if (window.AIPixelGen && typeof window.AIPixelGen.saveCfg === 'function') {
        window.AIPixelGen.saveCfg(next);
        return;
      }
    } catch (_) {}
    try { localStorage.setItem('aiPixelGen_cfg', JSON.stringify(next || {})); } catch (_) {}
  }

  function _captureSaveScopedConfig() {
    return {
      schemaVersion: 1,
      story: _copyConfigExceptLocalOnly(loadCfg(), AI_STORY_LOCAL_ONLY_CFG_KEYS),
      pixel: _copyConfigExceptLocalOnly(_loadPixelCfgForSaveScope(), AI_PIXEL_LOCAL_ONLY_CFG_KEYS)
    };
  }

  function _syncSaveScopedConfigToCurrentMoment(reason) {
    try {
      if (typeof State === 'undefined') return;
      var scoped = _captureSaveScopedConfig();
      function write(vars) {
        if (!vars || typeof vars !== 'object') return;
        vars.aiStoryGenConfig = _safeCloneForAiState(scoped);
        _patchAIStoryGenStateField(vars, 'config', scoped);
      }
      write(_getStateVariables());
      if (State.active && State.active.variables) write(State.active.variables);
      if (Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        write(State.history[State.activeIndex].variables);
      }
      if (Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        write(State._history[State.activeIndex].variables);
      }
    } catch (e) {
      try { console.warn('[AIStoryGen] sync save-scoped config failed' + (reason ? ' (' + reason + ')' : ''), e); } catch (_) {}
    }
  }

  function _normaliseSaveScopedConfig(config) {
    config = config && typeof config === 'object' ? config : {};
    return {
      schemaVersion: 1,
      story: _copyConfigExceptLocalOnly(config.story || {}, AI_STORY_LOCAL_ONLY_CFG_KEYS),
      pixel: _copyConfigExceptLocalOnly(config.pixel || {}, AI_PIXEL_LOCAL_ONLY_CFG_KEYS)
    };
  }

  function _restoreSaveScopedConfig(config) {
    config = _normaliseSaveScopedConfig(config || {});
    var story = config.story || {};
    var pixel = config.pixel || {};
    if (Object.keys(story).length) {
      var currentStory = loadCfg();
      var storyLocal = {};
      Object.keys(AI_STORY_LOCAL_ONLY_CFG_KEYS).forEach(function (k) {
        if (currentStory[k] !== undefined) storyLocal[k] = currentStory[k];
      });
      saveCfg(Object.assign({}, currentStory, story, storyLocal));
    }
    if (Object.keys(pixel).length) {
      var currentPixel = _loadPixelCfgForSaveScope();
      var pixelLocal = {};
      Object.keys(AI_PIXEL_LOCAL_ONLY_CFG_KEYS).forEach(function (k) {
        if (currentPixel[k] !== undefined) pixelLocal[k] = currentPixel[k];
      });
      _savePixelCfgForSaveScope(Object.assign({}, currentPixel, pixel, pixelLocal));
    }
    try { $(document).trigger('AIStoryGen:configSaved', [loadCfg()]); } catch (_) {}
  }

  const _aiStateStore = StateStoreModule.create({
    schemaVersion: AI_STATE_SCHEMA_VERSION,
    memoryBackupKey: MEMORY_BACKUP_KEY,
    memoryBackupMax: MEMORY_BACKUP_MAX,
    normalizeImportantMemoryEntry: _normalizeImportantMemoryEntry,
    snapshotMemory: _snapshotMemoryForSave,
    getStateVariables: _getStateVariables,
    currentPassageName: _currentPassageName,
    clone: function (value) {
      try {
        if (typeof _cloneForAiSnapshot === 'function') return _cloneForAiSnapshot(value);
      } catch (_) {}
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    },
    normalizeItemStoreArray: _normaliseAiItemStoreArray,
    getItemStore: _getAiItemStore,
    captureScene: _captureAISaveStateForSave,
    captureSaveScopedConfig: _captureSaveScopedConfig,
    normalizeSaveScopedConfig: _normaliseSaveScopedConfig,
    idbSet: idbSet,
    getMemorySaveId: _getMemorySaveIdForStateStore,
    setMemorySaveId: _setMemorySaveIdForStateStore
  });
  window.AIStoryGen.stateStore = _aiStateStore;
  _aiStateStoreReady = true;

  function _memoryHasContent(mem) {
    return _aiStateStore.memoryHasContent(mem);
  }

  function _safeCloneForAiState(value) {
    return _aiStateStore.clone(value);
  }

  function _newMemorySaveId() {
    return _aiStateStore.newMemorySaveId();
  }

  function _ensureMemorySaveId(vars) {
    return _aiStateStore.ensureMemorySaveId(vars);
  }

  function _extractMemorySaveIdFromSave(save) {
    return _aiStateStore.extractMemorySaveIdFromSave(save);
  }

  function _memoryFingerprint(vars) {
    return _aiStateStore.memoryFingerprint(vars);
  }

  function _readMemoryEmergencyBackups() {
    return _aiStateStore.readMemoryEmergencyBackups();
  }

  function _writeMemoryEmergencyBackups(list) {
    return _aiStateStore.writeMemoryEmergencyBackups(list);
  }

  function _persistMemoryEmergencyBackup(mem, reason) {
    return _aiStateStore.persistMemoryEmergencyBackup(mem, reason);
  }

  function _scoreMemoryEmergencyBackup(entry, fp, wantedId) {
    return _aiStateStore.scoreMemoryEmergencyBackup(entry, fp, wantedId);
  }

  function _findMatchingMemoryEmergencyBackup(save) {
    return _aiStateStore.findMatchingMemoryEmergencyBackup(save);
  }

  function _normaliseAiStateEventLog(log) {
    return _aiStateStore.normalizeEventLog(log);
  }

  function _normalizeAIStoryGenState(state) {
    return _aiStateStore.normalize(state);
  }

  function _patchAIStoryGenStateField(vars, field, value) {
    return _aiStateStore.patchField(vars, field, value);
  }

  function _legacyAIStoryGenStateFromSave(save) {
    return _aiStateStore.readFromSave(save);
  }

  function _buildAIStoryGenStateForSave(reason) {
    return _aiStateStore.build(reason);
  }

  function _writeAIStoryGenStateToVariables(vars, aiState) {
    return _aiStateStore.writeToVariables(vars, aiState);
  }

  function _writeAIStoryGenStateToStateObject(stateObj, aiState) {
    return _aiStateStore.writeToStateObject(stateObj, aiState);
  }

  function _writeAIStoryGenStateToCurrentMoment(aiState) {
    return _aiStateStore.writeToCurrentMoment(aiState);
  }

  function _writeAIStoryGenStateToSave(save, aiState) {
    return _aiStateStore.writeToSave(save, aiState);
  }

  function _syncAIStoryGenStateToCurrentSave(reason) {
    return _aiStateStore.syncCurrent(reason);
  }

  function _stripHtmlForAiRecord(text) {
    text = String(text || '');
    text = text.replace(/<\s*br\s*\/?>/gi, '。 ');
    text = text.replace(/<[^>]+>/g, ' ');
    var map = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
    text = text.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, function (m) { return map[m] || ' '; });
    return text.replace(/\s+/g, ' ').trim();
  }

  function _removeAIEventBlocks(text) {
    return EventParserModule.removeAIEventBlocks(text);
  }

  function _cleanRecordText(text) {
    text = _removeAIEventBlocks(text);
    text = _stripHtmlForAiRecord(text);
    text = text
      .replace(/\[(?:ITEMS?|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, ' ')
      .replace(/\[STATS:\s*[^\]]+\]/gi, ' ')
      .replace(/\[[^\]]*(?:压力|疲劳|兴奋|性奋|疼痛|创伤|诱惑|自控|金钱|arousal|stress|pain|trauma|money)[^\]]*\]/gi, ' ')
      .replace(/🔄\s*刷新剧情|🔁\s*刷新选项|☆\s*收藏剧情进长期记忆|使用道具|纠正地点|强制调整剧情地点|手动选择到达地点|返回游戏|返回原版章节/g, ' ')
      .replace(/\[可拾取AI道具\][^。！？.!?]*(?:收入AI库存|不拿)?/g, ' ')
      .replace(/收入AI库存|不拿/g, ' ')
      .replace(/\s*\|\s*/g, '；')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }

  function _isRecordPollutionText(text) {
    var raw = String(text || '');
    var clean = _cleanRecordText(raw);
    if (!clean) return true;
    if (/<[^>]+>|style\s*=|color\s*:\s*#|<\/span/i.test(raw) && !/(你|主角|玩家|到达|进入|前往|离开|回到|遇见|交谈|获得|得到|找到|发现|捡到|拾起|支付|选择|决定|伊甸|罗宾|贝利|艾弗里|Alex|Robin|Bailey|Eden)/i.test(clean)) return true;
    if (/^(?:[\[\]【】\s;；,，。|+-]*)(?:压力|疲劳|兴奋|性奋|疼痛|创伤|诱惑|自控|金钱|arousal|stress|pain|trauma|money)\s*[+-]?\d+(?:\s*[;；,，|]\s*(?:压力|疲劳|兴奋|性奋|疼痛|创伤|诱惑|自控|金钱|arousal|stress|pain|trauma|money)\s*[+-]?\d+)*[\s;；,，。|+-]*$/i.test(clean)) return true;
    if (/^(?:刷新剧情|刷新选项|收藏剧情进长期记忆|使用道具|纠正地点|强制调整剧情地点|手动选择到达地点|返回游戏|返回原版章节|收入AI库存|不拿)+$/i.test(clean.replace(/\s+/g, ''))) return true;
    return false;
  }

  function _parseListField(value) {
    return EventParserModule.parseListField(value);
  }

  function _parseAIEventBlock(text) {
    var parsed = EventParserModule.parseAIEventBlock(text);
    return _validateAIEventData(parsed, String(text || ''));
  }

  function _normaliseAIEventText(value, maxLen) {
    var clean = _cleanRecordText(value);
    clean = clean.replace(/^\s*[:=]\s*/, '').replace(/\s+/g, ' ').trim();
    if (!clean || _isRecordPollutionText(clean)) return '';
    if (maxLen && clean.length > maxLen) clean = clean.slice(0, maxLen).trim();
    return clean;
  }

  function _normaliseAIEventNameList(value, maxItems, maxLen) {
    var out = [];
    _parseListField(value).forEach(function (part) {
      part = _normaliseAIEventText(cleanLabel(part), maxLen || 40);
      if (!part) return;
      if (/^(?:none|null|unknown|current|same|n\/a)$/i.test(part)) return;
      if (/^(?:ui|menu|button|sidebar|log|inventory|journal)$/i.test(part)) return;
      out.push(part);
    });
    return _dedupeTextList(out).slice(0, maxItems || 10).join(';');
  }

  function _normaliseAIEventLocationValue(value) {
    var raw = String(value || '').replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim();
    raw = cleanLabel(raw);
    if (!raw || /^(?:current|same|unchanged|none|null|unknown|here|n\/a)$/i.test(raw)) return '';
    if (/^(?:\u5f53\u524d|\u539f\u5730|\u4e0d\u53d8|\u672a\u77e5|\u65e0|\u8fd9\u91cc|\u672c\u5730)$/.test(raw)) return '';
    var common = _findCommonLocation(raw);
    if (common && common.raw && !_isUnsafeDirectPassage(common.raw)) return common.raw;
    var graphLoc = _findGraphLocation(raw);
    if (graphLoc) {
      var canonical = graphLoc.locId ? _findCommonLocationByLocId(graphLoc.locId) : null;
      if (!canonical && graphLoc.passage) canonical = _findCommonLocationByRaw(graphLoc.passage) || _findCommonLocationByPrefix(graphLoc.passage);
      var graphRaw = (canonical && canonical.raw) || graphLoc.passage || raw;
      graphRaw = _normalizePassageName(graphRaw);
      if (graphRaw && !_isUnsafeDirectPassage(graphRaw)) return graphRaw;
    }
    var normal = _normalizePassageName(raw);
    if (!normal || _isUnsafeDirectPassage(normal)) return '';
    try {
      if (typeof Story !== 'undefined' && Story && Story.has && !Story.has(normal)) return '';
    } catch (_) {}
    return normal;
  }

  function _normaliseAIEventStatusStrict(value) {
    var status = _normaliseAiEventStatus(value);
    return /^(arrived|inTransit|current)$/.test(status) ? status : '';
  }

  function _normaliseAIEventType(value) {
    var type = String(value || '').replace(/\s+/g, '_').toLowerCase().trim();
    var allowed = {
      scene: 1,
      travel: 1,
      conversation: 1,
      item: 1,
      state: 1,
      native_action: 1,
      combat: 1,
      other: 1
    };
    return allowed[type] ? type : '';
  }

  function _normaliseAIEventItemsField(value) {
    var items = [];
    _parseListField(value).forEach(function (token) {
      _expandAiItemTokens(token).forEach(function (part) {
        var item = _parseAiItemToken(part);
        if (item) items.push(item);
      });
    });
    return _mergeAiItemListByName(items).slice(0, 8).map(_formatRuntimeItemForEvent).filter(Boolean).join(';');
  }

  function _normaliseAIEventStatsField(value, rawText) {
    var out = [];
    var seen = {};
    var explicitMoneyDelta = _inferExplicitMoneyDeltaFromNarrative(rawText);
    _parseListField(value).forEach(function (part) {
      if (/^\s*money\s*[+-]/i.test(String(part || ''))) return;
      _pushNormalisedAiStatPart(out, seen, part, explicitMoneyDelta);
    });
    return out.join(';');
  }

  function _normaliseAIEventRelationshipsField(value) {
    var schema = _getAiNpcRelationSchema();
    var out = [];
    var seen = {};
    String(value || '').split(/[;\uff1b]/).forEach(function (entry) {
      entry = String(entry || '').trim();
      if (!entry) return;
      var npcName = '';
      var body = entry;
      var colon = entry.match(/^(.+?)\s*[:=]\s*(.+)$/);
      if (colon) {
        npcName = colon[1];
        body = colon[2];
      } else {
        var first = entry.match(/^([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s_\-]{0,32})\s+(.+)$/);
        if (first) {
          npcName = first[1];
          body = first[2];
        }
      }
      var npcKey = _resolveAiNpcKey(npcName);
      if (!npcKey) return;
      String(body || '').split(/[,\uff0c\u3001|]/).forEach(function (part) {
        var m = String(part || '').trim().match(/^(\w+)\s*([+-]\d+)/);
        if (!m) return;
        var spec = schema[m[1].toLowerCase()];
        if (!spec) return;
        var delta = parseInt(m[2], 10);
        if (!delta) return;
        var dedupe = npcKey + ':' + spec.key;
        if (seen[dedupe]) return;
        seen[dedupe] = true;
        out.push(npcKey + ':' + spec.key + (delta >= 0 ? '+' : '') + delta);
      });
    });
    return out.join(';');
  }

  function _normaliseAIEventMoneyField(value, rawText) {
    var raw = String(value || '').replace(/\s+/g, '').trim();
    var m = raw.match(/^[+-]?\d+$/);
    if (!m) return '';
    var val = parseInt(raw, 10);
    if (!val) return '';
    var explicitMoneyDelta = _inferExplicitMoneyDeltaFromNarrative(rawText);
    if (!explicitMoneyDelta) return '';
    if (Math.sign(explicitMoneyDelta) !== Math.sign(val)) return '';
    if (Math.abs(explicitMoneyDelta) !== Math.abs(val)) return '';
    return String(val);
  }

  function _validateAIEventData(data, rawText) {
    return AIEventValidator.validate(data, rawText);
  }

  function _parseStatsChangesFromText(text) {
    var changes = [];
    String(text || '').replace(/\[STATS:\s*([^\]]+)\]/gi, function (_, body) {
      String(body || '').split(',').forEach(function (part) {
        part = part.trim();
        if (/^\w+\s*[+-]\d+/.test(part)) changes.push(part.replace(/\s+/g, ''));
      });
      return '';
    });
    return changes;
  }

  function _parseExplicitItemNamesFromText(text) {
    var names = [];
    String(text || '').replace(/\[ITEMS?:\s*([^\]]+)\]/gi, function (_, body) {
      String(body || '').split(/[;\uff1b,\uff0c\u3001]/).forEach(function (token) {
        _expandAiItemTokens(token).forEach(function (part) {
          var item = _parseAiItemToken(part);
          if (item && item.name && names.indexOf(item.name) < 0) names.push(item.name);
        });
      });
      return '';
    });
    return names;
  }

  function _collectAiRuntimeItems(rawText, eventData) {
    var items = [];
    eventData = eventData || _parseAIEventBlock(rawText);
    _parseListField(eventData.itemsGained || eventData.items || '').forEach(function (token) {
      _expandAiItemTokens(token).forEach(function (part) {
        var item = _parseAiItemToken(part);
        if (item) items.push(item);
      });
    });
    String(rawText || '').replace(/\[ITEMS?:\s*([^\]]+)\]/gi, function (_, body) {
      String(body || '').split(/[;\uff1b,\uff0c\u3001]/).forEach(function (token) {
        _expandAiItemTokens(token).forEach(function (part) {
          var item = _parseAiItemToken(part);
          if (item) items.push(item);
        });
      });
      return '';
    });
    return _filterAiRuntimeItems(_mergeAiItemListByName(items));
  }

  function _collectAiRuntimeLostItems(rawText, eventData) {
    var items = [];
    eventData = eventData || _parseAIEventBlock(rawText);
    _parseListField(eventData.itemsLost || '').forEach(function (token) {
      _expandAiItemTokens(token).forEach(function (part) {
        var item = _parseAiItemToken(part);
        if (item) items.push(item);
      });
    });
    String(rawText || '').replace(/\[AI_ITEMS_USED:\s*([^\]]+)\]\s*/gi, function (_, body) {
      String(body || '').split(/[;\uff1b,\uff0c\u3001]/).forEach(function (token) {
        _expandAiItemTokens(token).forEach(function (part) {
          var item = _parseAiItemToken(part);
          if (item) items.push(item);
        });
      });
      return '';
    });
    return _filterAiRuntimeItems(_mergeAiItemListByName(items));
  }

  function _formatRuntimeItemForEvent(item) {
    return ItemSchemaModule.formatRuntimeItemForEvent(item);
  }

  function _getAiNpcRelationSchema() {
    return EventSchemaModule.getNpcRelationSchema();
  }

  function _getAiNpcRoot() {
    try {
      if (typeof C !== 'undefined' && C && C.npc) return C.npc;
      if (window.C && window.C.npc) return window.C.npc;
    } catch (_) {}
    return null;
  }

  function _getAiNpcNameList() {
    try {
      var st = (typeof setup !== 'undefined' && setup) ? setup : (window.SugarCube && window.SugarCube.setup) || window.setup;
      if (st && Array.isArray(st.NPCNameList)) return st.NPCNameList.slice();
    } catch (_) {}
    var root = _getAiNpcRoot();
    return root ? Object.keys(root) : [];
  }

  function _normaliseNpcLookupText(text) {
    return String(text || '').toLowerCase().replace(/[\s_\-·・'"\u2018\u2019\u201c\u201d]/g, '').trim();
  }

  function _resolveAiNpcKey(name) {
    var needle = _normaliseNpcLookupText(name);
    if (!needle) return '';
    var list = _getAiNpcNameList();
    var root = _getAiNpcRoot();
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i] || '');
      var npc = (root && root[key]) || (V && V[key]) || {};
      var aliases = [
        key,
        _toChineseName(key),
        npc.title,
        npc.name,
        npc.fullDescription,
        npc.description
      ];
      for (var j = 0; j < aliases.length; j++) {
        var alias = _normaliseNpcLookupText(aliases[j]);
        if (alias && alias === needle) return key;
      }
    }
    return '';
  }

  function _collectAiNpcRelationshipChanges(rawText, eventData) {
    eventData = eventData || _parseAIEventBlock(rawText);
    var schema = _getAiNpcRelationSchema();
    var raw = String(
      eventData.relationshipChanges ||
      eventData.npcRelationshipChanges ||
      eventData.npcRelations ||
      eventData.relationships ||
      ''
    ).trim();
    if (!raw) return [];
    var out = [];
    var seen = {};
    String(raw || '').split(/[;\uff1b]/).forEach(function (entry) {
      entry = String(entry || '').trim();
      if (!entry) return;
      var npcName = '';
      var body = entry;
      var colon = entry.match(/^(.+?)\s*[:=]\s*(.+)$/);
      if (colon) {
        npcName = colon[1];
        body = colon[2];
      } else {
        var first = entry.match(/^([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s_\-·・']{0,32})\s+(.+)$/);
        if (first) {
          npcName = first[1];
          body = first[2];
        }
      }
      var npcKey = _resolveAiNpcKey(npcName);
      if (!npcKey) return;
      String(body || '').split(/[,\uff0c\u3001|]/).forEach(function (part) {
        var m = String(part || '').trim().match(/^(\w+)\s*([+-]\d+)/);
        if (!m) return;
        var field = m[1].toLowerCase();
        var spec = schema[field];
        if (!spec) return;
        var delta = parseInt(m[2], 10);
        if (!delta) return;
        var dedupe = npcKey + ':' + spec.key;
        if (seen[dedupe]) return;
        seen[dedupe] = true;
        out.push({ npc: npcKey, field: spec.key, delta: delta, label: _toChineseName(npcKey) || npcKey });
      });
    });
    return out;
  }

  function _formatNpcRelationshipChangeForEvent(change) {
    return EventSchemaModule.formatNpcRelationshipChange(change);
  }

  function _dedupeTextList(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (value) {
      value = String(value || '').replace(/\s+/g, ' ').trim();
      if (!value) return;
      var key = value.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push(value);
    });
    return out;
  }

  function _parseAiEventInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) return fallback;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }

  function _normaliseAiEventStatus(value) {
    value = String(value || '').replace(/\s+/g, '').toLowerCase();
    if (!value) return '';
    if (/^(arrived|enter|entered|reached|changed|destination|done|到达|进入|抵达|已到达|已进入|地点变化)$/.test(value)) return 'arrived';
    if (/^(intransit|transit|moving|travel|travelling|traveling|ontheway|途中|路上|前往中|移动中)$/.test(value)) return 'inTransit';
    if (/^(current|same|unchanged|nochange|none|null|unknown|当前|原地|不变|未知)$/.test(value)) return 'current';
    return value;
  }

  function _aiEventIndicatesArrival(eventData) {
    var status = _normaliseAiEventStatus(eventData && (eventData.locationStatus || eventData.location_status || eventData.travelStatus || eventData.arrivalStatus));
    if (!status) return true;
    return status === 'arrived';
  }

  function _aiEventSuppressesLocationFallback(text) {
    var data = _parseAIEventBlock(text);
    var hasMarker = /\[AI_EVENT\]|\[AI_EVENT:/i.test(String(text || ''));
    if (!data || !Object.keys(data).length) return !!hasMarker;
    var status = _normaliseAiEventStatus(data.locationStatus || data.location_status || data.travelStatus || data.arrivalStatus);
    return status !== 'arrived';
  }

  function _lastAiEventSuppressesLocationFallback() {
    var log = _getAiEventLog();
    if (!log || !log.length) return false;
    var last = log[log.length - 1] || {};
    var status = _normaliseAiEventStatus(last.locationStatus || '');
    return status === 'current' || status === 'inTransit';
  }

  function _lastAiEventLocationStatus() {
    var log = _getAiEventLog();
    if (!log || !log.length) return '';
    var last = log[log.length - 1] || {};
    return _normaliseAiEventStatus(last.locationStatus || '');
  }

  function _aiEventPresentTargets(eventData) {
    eventData = eventData || {};
    return _dedupeTextList(
      _parseListField(eventData.presentTargets || eventData.present_targets || eventData.presentTargets || eventData.present_targets || '')
        .concat(_parseListField(eventData.presentCharacters || eventData.present_characters || ''))
        .concat(_parseListField(eventData.presentEntities || eventData.present_entities || ''))
    );
  }

  function _inferPresentTargetsFromEventText(text) {
    text = String(text || '').replace(/\s+/g, ' ');
    var out = { characters: [], entities: [] };
    if (!text) return out;
    var presentCue = /(身旁|旁边|面前|怀抱|肩|触碰|靠向|看着|望着|说|问|回答|微笑|回抱|拉住|牵住|站在|坐在|蹲在|走近|靠近|一起|正在|appears?|stands?|sits?|beside|near|with you|says?|asks?|smiles?|looks?|holds?|touches?)/i;
    var absentCue = /(离开|不在|回忆|想起|想象|梦|纸条|信|照片|日志|库存|left|gone|not here|remember|memory|dream|note|letter|photo|journal|inventory)/i;
    try {
      var candidates = typeof _getNativeSexCandidateTemplates === 'function' ? _getNativeSexCandidateTemplates() : [];
      candidates.forEach(function (candidate) {
        if (!candidate || !candidate.re || !candidate.re.test(text)) return;
        var match = text.match(candidate.re);
        var idx = match ? text.indexOf(match[0]) : -1;
        var ctx = idx >= 0 ? text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + 70)) : text;
        if (absentCue.test(ctx) || !presentCue.test(ctx)) return;
        if (/触手|狗|犬|狼|tentacle|dog|wolf/i.test(candidate.label || candidate.npc || '')) out.entities.push(candidate.label || candidate.npc);
        else out.characters.push(candidate.label || candidate.npc);
      });
    } catch (_) {}
    out.characters = _dedupeTextList(out.characters);
    out.entities = _dedupeTextList(out.entities);
    return out;
  }

  function _eventSummaryFromText(text, eventData) {
    var summary = _cleanRecordText((eventData && (eventData.summary || eventData.memory || eventData.eventSummary)) || '');
    if (!summary) {
      var clean = _cleanRecordText(text);
      var sentences = clean.split(/(?<=[。！？!?])\s+|[；;]/).map(function (s) { return s.trim(); }).filter(Boolean);
      summary = sentences.slice(0, 2).join(' ');
    }
    summary = summary.replace(/\s+/g, ' ').trim();
    if (_isRecordPollutionText(summary)) return '';
    if (summary.length > 220) summary = summary.slice(0, 220) + '...';
    return summary;
  }

  function _buildAiStoryEvent(rawText, displayText, opts) {
    opts = opts || {};
    var data = _parseAIEventBlock(rawText);
    var hasStructuredEvent = !!(data && typeof data === 'object' && Object.keys(data).length);
    var runtimeItems = _collectAiRuntimeItems(rawText, data);
    var runtimeStats = _collectAiRuntimeStatChanges(rawText, data, true);
    var runtimeNpcRelations = _collectAiNpcRelationshipChanges(rawText, data);
    var summary = _eventSummaryFromText(displayText || rawText, data);
    var loc = String(data.location || data.currentLocation || opts.location || _currentPassageName() || '').trim();
    var targetLoc = String(data.targetLocation || data.target_location || data.loc || '').trim();
    var inferredPresent = hasStructuredEvent ? { characters: [], entities: [] } : _inferPresentTargetsFromEventText(displayText || rawText);
    var presentCharacters = _dedupeTextList(_parseListField(data.presentCharacters || data.present_characters || data.characters || data.npcs || '').concat(inferredPresent.characters));
    var presentEntities = _dedupeTextList(_parseListField(data.presentEntities || data.present_entities || data.entities || '').concat(inferredPresent.entities));
    var presentTargets = _dedupeTextList(_parseListField(data.presentTargets || data.present_targets || data.presentTargets || data.present_targets || '').concat(presentCharacters).concat(presentEntities));
    var event = {
      id: 'aievt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      passage: _currentPassageName(),
      structuredEvent: hasStructuredEvent,
      eventType: String(data.eventType || data.event_type || (hasStructuredEvent ? 'story' : 'fallback')).trim(),
      locationStatus: _normaliseAiEventStatus(data.locationStatus || data.location_status || data.travelStatus || data.arrivalStatus || (hasStructuredEvent ? '' : 'current')),
      location: loc,
      targetLocation: targetLoc,
      choiceText: String(opts.choiceText || data.choice || '').trim(),
      narrative: _cleanRecordText(displayText || rawText).slice(0, 1200),
      summary: summary,
      characters: presentCharacters,
      presentCharacters: presentCharacters,
      presentEntities: presentEntities,
      presentTargets: presentTargets,
      memoryTags: _parseListField(data.memoryTags || data.tags || ''),
      memoryImportance: _parseAiEventInt(data.memoryImportance || data.importance, 0, 3, 1),
      itemsGained: _dedupeTextList(runtimeItems.map(_formatRuntimeItemForEvent).filter(Boolean)),
      itemsLost: _parseListField(data.itemsLost || ''),
      statChanges: _dedupeTextList(runtimeStats.parts),
      relationshipChanges: _dedupeTextList(runtimeNpcRelations.map(_formatNpcRelationshipChangeForEvent).filter(Boolean)),
      moneyChange: String(data.moneyChange || '').trim(),
      source: String(opts.source || 'ai'),
      createdAt: Date.now()
    };
    return event;
  }

  function _aiEventMemoryTags(event) {
    var tags = {};
    _parseListField(event && event.memoryTags || '').forEach(function (tag) {
      tag = String(tag || '').replace(/\s+/g, '').trim();
      if (tag) tags[tag] = true;
    });
    return tags;
  }

  function _isAiEventDurableMemory(event) {
    if (!event || !event.summary || event.memoryImportance <= 0) return false;
    var tags = _aiEventMemoryTags(event);
    var summary = String(event.summary || '');
    var hasRoute = !!(event.targetLocation && !/^(current|same|unknown)$/i.test(event.targetLocation) && event.targetLocation !== event.location);
    var hasRelationship = !!(event.relationshipChanges && event.relationshipChanges.length);
    var hasStoryItem = !!((event.itemsGained && event.itemsGained.length) || (event.itemsLost && event.itemsLost.length));
    var hasUsefulTag = !!(tags['主线顺序'] || tags['地点状态'] || tags['人物关系'] || tags['任务线索'] || tags['剧情物品'] || tags['未完成目标']);
    var hasUsefulText = /(约定|承诺|答应|拒绝|计划|目标|线索|调查|发现|秘密|证据|地图|笔记|钥匙|原石|硬币|到达|进入|前往|离开|回到|关系|信任|亲近|拥抱|邀请|等待|寻找|需要|尚未|仍需|下次)/.test(summary);
    if (_isNativeDataMemoryFact(summary)) return false;
    if (hasRelationship || hasRoute) return true;
    if (event.memoryImportance >= 2 && (hasUsefulTag || hasUsefulText || hasStoryItem)) return true;
    if (event.memoryImportance >= 3 && !tags['资源状态']) return true;
    return false;
  }

  function _aiEventDurableMemoryName(event) {
    var tags = _aiEventMemoryTags(event);
    var summary = String(event && event.summary || '');
    if (tags['人物关系'] || (event.relationshipChanges && event.relationshipChanges.length) || /(关系|信任|亲近|拥抱|邀请|等待|默许|拒绝|接纳)/.test(summary)) return '[人物关系]';
    if (tags['任务线索'] || tags['剧情物品'] || (event.itemsGained && event.itemsGained.length) || (event.itemsLost && event.itemsLost.length) || /(线索|证据|地图|笔记|钥匙|原石|硬币|遗迹|名片|石板)/.test(summary)) return '[线索道具]';
    if (tags['未完成目标'] || /(未完成|待|需要|下次|约定|承诺|计划|仍需|尚未|寻找|调查)/.test(summary)) return '[未完成目标]';
    if (tags['地点状态'] || (event.targetLocation && !/^(current|same|unknown)$/i.test(event.targetLocation))) return '[地点路线]';
    return '[重点剧情]';
  }

  function _buildAiEventDurableMemoryText(event) {
    if (!event || !event.summary) return '';
    var parts = [];
    var from = _zhPlaceLabelForMemory(event.location || '');
    var to = _zhPlaceLabelForMemory(event.targetLocation || '');
    if (to && from && to !== from && !/^(current|same|unknown)$/i.test(event.targetLocation || '')) {
      parts.push('地点路线：' + from + ' → ' + to);
    } else if (to && !/^(current|same|unknown)$/i.test(event.targetLocation || '')) {
      parts.push('地点：' + to);
    } else if (from && !/^(current|same|unknown)$/i.test(event.location || '')) {
      parts.push('地点：' + from);
    }
    parts.push('事件：' + event.summary);
    if (event.relationshipChanges && event.relationshipChanges.length) {
      parts.push('关系变化：' + event.relationshipChanges.join('；'));
    }
    if (event.itemsGained && event.itemsGained.length) {
      parts.push('剧情物品：获得 ' + event.itemsGained.join('；'));
    }
    if (event.itemsLost && event.itemsLost.length) {
      parts.push('剧情物品：失去 ' + event.itemsLost.join('；'));
    }
    var text = parts.join('。').replace(/\s+/g, ' ').trim();
    if (!text || _isNativeDataMemoryFact(text)) return '';
    return _shortenMemoryFact(text, 180);
  }

  function _recordDurableAiEventMemory(event) {
    if (!_isAiEventDurableMemory(event)) return false;
    var text = _buildAiEventDurableMemoryText(event);
    if (!text) return false;
    addImportantMemory(_aiEventDurableMemoryName(event), text, { silent: true, tag: '自动重点', auto: true });
    return true;
  }

  function _getAiEventLog() {
    var V = _getStateVariables();
    if (!V) return [];
    if (!Array.isArray(V.aiStoryGenEventLog)) V.aiStoryGenEventLog = [];
    return V.aiStoryGenEventLog;
  }

  function _saveAiEventToCurrentMoment(event) {
    var log = _getAiEventLog();
    if (!log || !event || !event.summary) return;
    log.push(event);
    if (log.length > 80) log.splice(0, log.length - 80);
    try { _patchAIStoryGenStateField(_getStateVariables(), 'eventLog', _normaliseAiStateEventLog(log)); } catch (_) {}
    try {
      if (typeof State !== 'undefined' && State.active && State.active.variables) {
        State.active.variables.aiStoryGenEventLog = _cloneForAiSnapshot(log);
        _patchAIStoryGenStateField(State.active.variables, 'eventLog', _normaliseAiStateEventLog(log));
      }
    } catch (_) {}
  }

  function _recordAiEventMemory(rawText, displayText, opts, cfg) {
    cfg = cfg || loadCfg();
    var event = _buildAiStoryEvent(rawText, displayText, opts);
    _saveAiEventToCurrentMoment(event);
    if (event.memoryImportance <= 0) return event;
    var durableChanged = _recordDurableAiEventMemory(event);
    if (!event.summary || cfg.recentMax <= 0) {
      if (durableChanged) saveMemoryBuffer();
      return event;
    }
    var label = opts && opts.name ? opts.name : '[AI]';
    var entryText = event.summary;
    if (event.location && entryText.indexOf('地点：') !== 0) entryText = '地点：' + event.location + '。事件：' + entryText;
    recentBuf.push({ name: label, text: entryText });
    enforceRecentMemoryLimit(cfg, opts && opts.reason || 'AI剧情事件');
    saveMemoryBuffer();
    compressMemories(cfg);
    return event;
  }

  function _recordNativeCombatActionMemory(partLabel, actionText) {
    try {
      var cfg = loadCfg();
      if (!cfg || !cfg.recentMax || cfg.recentMax <= 0) return;
      partLabel = String(partLabel || '').replace(/\s+/g, '').trim();
      actionText = String(actionText || '').replace(/\s+/g, '').trim();
      if (!actionText) return;
      var now = Date.now();
      var key = partLabel + '|' + actionText;
      var last = window.AIStoryGen._lastNativeCombatActionMemory || {};
      if (last.key === key && now - Number(last.at || 0) < 5000) return;
      window.AIStoryGen._lastNativeCombatActionMemory = { key: key, at: now };
      var display = '战斗动作：' + (partLabel ? partLabel + '选择' : '选择') + '“' + actionText + '”。';
      var lastEntry = recentBuf.length ? recentBuf[recentBuf.length - 1] : null;
      if (lastEntry && String(lastEntry.name || '') === '[战斗动作]' && String(lastEntry.text || '').indexOf(display) >= 0) return;
      _recordAiEventMemory(display, display, {
        name: '[战斗动作]',
        reason: '战斗动作',
        choiceText: actionText,
        source: 'nativeCombatAction'
      }, cfg);
    } catch (e) {
      try { console.warn('[AIStoryGen] native combat action memory failed', e); } catch (_) {}
    }
  }

  function _writeMemoryToVariables(vars, mem) {
    if (!vars || typeof vars !== 'object') return;
    vars.aiStoryGenMemoryId = _ensureMemorySaveId(vars);
    vars.aiStoryGenMemoryUpdatedAt = Date.now();
    var cleanMem = _normalizeSaveMemory(mem || _snapshotMemoryForSave());
    vars.aiStoryGenMemory = _cloneForAiSnapshot(cleanMem);
    _patchAIStoryGenStateField(vars, 'memory', cleanMem);
  }

  function _clearRuntimeMemory() {
    recentBuf.length = 0;
    longTermMem.length = 0;
  }

  function _getStateVariables() {
    try {
      return (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    } catch (e) {
      return null;
    }
  }

  function _syncMemoryToCurrentSave(reason) {
    var V = _getStateVariables();
    if (!V || !_aiMemorySaveBound || _isStartOrMainMenuPassage()) return;
    _ensureMemorySaveId(V);
    var mem = _snapshotMemoryForSave();
    _writeMemoryToVariables(V, mem);
    try { if (typeof State !== 'undefined' && State.active && State.active.variables) _writeMemoryToVariables(State.active.variables, mem); } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        _writeMemoryToVariables(State.history[State.activeIndex].variables, mem);
      }
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        _writeMemoryToVariables(State._history[State.activeIndex].variables, mem);
      }
    } catch (_) {}
    _writeAIStoryGenStateToCurrentMoment(_buildAIStoryGenStateForSave(reason || 'memory-sync'));
    _persistMemoryEmergencyBackup(mem, 'sync');
  }

  function _bindMemoryToCurrentStateIfNeeded() {
    if (_isStartOrMainMenuPassage()) {
      _aiMemorySaveBound = false;
      _aiMemorySaveId = '';
      _clearRuntimeMemory();
      return;
    }
    var V = _getStateVariables();
    if (!V || _aiMemorySaveBound) return;
    _aiMemorySaveBound = true;
    _ensureMemorySaveId(V);
    var savedMem = _normalizeSaveMemory(V.aiStoryGenMemory || {});
    var hasSavedMem = !!(savedMem.recentBuf.length || savedMem.longTermMem.length);
    var hasRuntimeMem = !!(recentBuf.length || longTermMem.length);
    if (hasSavedMem || !hasRuntimeMem) {
      _replaceMemoryFromSave(savedMem);
    } else {
      _syncMemoryToCurrentSave();
    }
  }

  for (var _ltmInitIdx = 0; _ltmInitIdx < longTermMem.length; _ltmInitIdx++) {
    longTermMem[_ltmInitIdx] = _normalizeImportantMemoryEntry(longTermMem[_ltmInitIdx]);
  }

  function _trimLongTermMem(cfg) {
    // Long-term memory is the player's editable archive, so it is intentionally
    // not capped by default. The short-term memory limit controls auto cleanup.
    return;
  }

  function addImportantMemory(name, text, opts) {
    opts = opts || {};
    text = _cleanRecordText(text);
    if (!text) return;
    if (opts.auto) {
      text = _refineLongTermMemoryText(text, name);
      if (!text) return;
    }
    var key = String(name || '') + '|' + text.slice(0, 120);
    for (var i = 0; i < longTermMem.length; i++) {
      if ((longTermMem[i].name + '|' + String(longTermMem[i].text || '').slice(0, 120)) === key) return;
    }
    var entry = _memoryEntry(name || '[重点]', text);
    entry.tag = String(opts.tag || entry.tag || '剧情');
    entry.locked = !!opts.locked;
    longTermMem.push(entry);
    _trimLongTermMem(loadCfg());
    if (!opts.silent) saveMemoryBuffer();
  }

  function _summarizeMemoryEntries(entries, label) {
    var refined = entries.map(function (e) {
      return _refineLongTermMemoryText(String(e.text || ''), e.name);
    }).filter(Boolean);
    var text = refined.join('；').replace(/\s+/g, ' ').trim();
    var limit = Math.max(300, Number(loadCfg().recentLimit || 600));
    if (text.length > limit) text = text.slice(0, limit) + '...';
    return text ? ((label || '剧情顺序') + '：' + text) : '';
  }

  function _stripMemoryBoilerplate(text) {
    text = _cleanRecordText(text);
    text = text.replace(/\b0\.5\.8\.10\b[\s\S]*?(?=(?:你|主角|玩家|AI|$))/g, '');
    text = text.replace(/\s*-?\(ML-v[\d.]+\)\s*/g, ' ');
    text = text.replace(/\b\.5\.8\.10\b/g, '');
    text = text.replace(/小贴士[：:][\s\S]*?(?=(?:你正|你的|疼痛|性奋|属性|$))/g, '');
    text = text.replace(/属性 社交 特质 日志 统计 成就 作弊 选项 存档/g, '');
    text = text.replace(/\(\d+\)[\s\S]*?(?=(?:\(\d+\)|Shift|$))/g, '');
    return text.replace(/\s+/g, ' ').trim();
  }

  function _isStaticSceneMemory(name, text) {
    name = String(name || '');
    text = _stripMemoryBoilerplate(text);
    if (/^(Bedroom|Bathroom|Kitchen|Hall|Orphanage|Wardrobe|Mirror|Sextoys Inventory)$/i.test(name)) {
      var hasEvent = /(获得|得到|找到|发现|捡到|失去|花费|支付|偷|拿走|收下|遇见|交谈|答应|拒绝|到达|离开|进入|前往|受伤|疼痛|压力|金钱|钱|现金|道具|钥匙|药|任务|约会|Robin|罗宾|Bailey|贝利|Avery|艾弗里|Eden|伊甸)/.test(text);
      var mostlyRoom = /(你正待在你的卧室|波浪形图案的壁纸|古董桌|超大熊玩偶|猫头鹰玩偶|兔耳多肉|猫咪的海报|你的床占据|衣服正放在|外面的走廊)/.test(text);
      if (mostlyRoom && !hasEvent) return true;
    }
    return false;
  }

  function _refineLongTermMemoryText(text, name) {
    var safeText = _refineLongTermMemoryTextSafe(text, name);
    if (safeText) return safeText;
    text = _stripMemoryBoilerplate(text);
    if (!text || _isNonStoryMemoryText(name, text) || _isStaticSceneMemory(name, text)) return '';

    var sentences = text.split(/(?<=[。！？!?])\s+|[；;]/).map(function (s) {
      return s.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    var keepers = [];
    var eventRe = /(获得|得到|找到|发现|捡到|拾起|失去|花费|支付|偷|拿走|收下|遇见|交谈|答应|拒绝|到达|离开|进入|前往|决定|选择|回到|返回|受伤|疼痛|压力|创伤|金钱|钱|现金|零钱|硬币|钞票|£|道具|钥匙|药|任务|约会|关系|好感|Robin|罗宾|Bailey|贝利|Avery|艾弗里|Eden|伊甸)/i;
    sentences.forEach(function (s) {
      if (eventRe.test(s)) keepers.push(s);
    });
    if (!keepers.length && /^\[AI\]/.test(String(name || ''))) keepers = sentences.slice(0, 2);
    var out = keepers.join(' ').trim();
    if (!out) return '';
    if (out.length > 260) out = out.slice(0, 260) + '...';
    return out;
  }

  function _longTermHasHan(text) {
    return /[\u4e00-\u9fff]/.test(String(text || ''));
  }

  function _normalizeLongTermRefineSource(text) {
    text = String(text || '');
    text = text.replace(/<\s*br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, ' ');
    text = _removeAIEventBlocks(text);
    text = text.replace(/\[(?:STATS|ITEMS?|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, ' ');
    text = text.replace(/\b0\.5\.8\.10\b|\b\.5\.8\.10\b|\s*-?\(ML-v[\d.]+\)\s*/gi, ' ');
    text = text.replace(/\ud83d\udd04\s*\u5237\u65b0\u5267\u60c5|\ud83d\udd01\s*\u5237\u65b0\u9009\u9879|\u2606\s*\u6536\u85cf\u5267\u60c5\u8fdb\u957f\u671f\u8bb0\u5fc6|\u4f7f\u7528\u9053\u5177|\u7ea0\u6b63\u5730\u70b9|\u8fd4\u56de\u6e38\u620f/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function _zhPlaceLabelForMemory(place) {
    place = String(place || '').trim();
    var map = {
      current: '',
      same: '',
      unknown: '',
      cabin: '\u4f0a\u7538\u5c0f\u5c4b',
      'Forest Cabin': '\u4f0a\u7538\u5c0f\u5c4b',
      'Eden Clearing': '\u4f0a\u7538\u5c0f\u5c4b\u5916\u7a7a\u5730',
      Forest: '\u68ee\u6797',
      Farm: '\u519c\u573a',
      'Bird Tower': '\u5de8\u9e70\u9ad8\u5854'
    };
    return map[place] != null ? map[place] : place;
  }

  function _memoryBucketForRefinedFact(text, title) {
    var hay = String(title || '') + ' ' + String(text || '');
    if (/(\u672a\u5b8c\u6210|\u5f85|\u9700\u8981|\u4e0b\u6b21|\u7ea6\u5b9a|\u627f\u8bfa|\u8ba1\u5212|\u76ee\u6807|\u8c03\u67e5|\u4ecd\u9700|\u5c1a\u672a|\u660e\u5929|\u51c6\u5907)/.test(hay)) return '\u672a\u5b8c\u6210\u76ee\u6807';
    if (/(\u5730\u70b9|\u8def\u7ebf|\u8def\u5f84|\u5230\u8fbe|\u8fdb\u5165|\u79bb\u5f00|\u524d\u5f80|\u56de\u5230|\u51fa\u53d1|\u6f5c\u5165|Cliff Street|Cafe Pancakes|Police|Barb Street|Forest Cabin|Eden Cabin|Wolf Cave|Bird Tower|town|Orphanage)/i.test(hay)) return '\u5730\u70b9\u4e0e\u8def\u7ebf';
    if (/(\u7ebf\u7d22|\u539f\u77f3|\u514b\u6717\u5e01|\u786c\u5e01|\u65e7\u7b14\u8bb0|\u730e\u4eba\u7b14\u8bb0|\u5730\u56fe|\u540d\u7247|\u77f3\u677f|\u9057\u8ff9|\u5730\u57fa|\u5c0f\u5f84|\u94c1\u7f50|\u90ae\u7968|\u5267\u60c5\u7269\u54c1|\u8bc1\u636e)/.test(hay)) return '\u7ebf\u7d22\u4e0e\u5267\u60c5\u7269\u54c1';
    if (/(NPC|\u5173\u7cfb|\u597d\u611f|\u4eb2\u8fd1|\u89e6\u78b0|\u62e5\u62b1|\u56de\u62b1|\u73af\u4f4f|\u56de\u5e94|\u62d2\u7edd|\u9ed8\u8bb8|\u63a5\u7eb3|\u7b49\u4f60|\u6ce8\u89c6|\u9080\u8bf7|\u64e6\u8fc7|\u4e0d\u518d\u62d2\u7edd)/i.test(hay)) return '\u4eba\u7269\u5173\u7cfb\u53d8\u5316';
    return '\u5f53\u524d\u5267\u60c5\u72b6\u6001';
  }

  function _cleanRefinedMemoryMeta(text) {
    text = _normalizeLongTermRefineSource(text);
    text = text.replace(/^###\s*/g, '');
    text = text.replace(/^\[[^\]]*(?:\u538b\u7f29\u91cd\u70b9|\u81ea\u52a8\u6574\u7406|\u7cbe\u70bc)[^\]]*\]\s*(?:\/\s*[^\n]+)?/g, '');
    text = text.replace(/^\[\d+\]\s*/g, '');
    text = text.replace(/^\(\s*(?:\u4e3b\u7ebf\u987a\u5e8f|\u5730\u70b9\u53d8\u5316|\u4eba\u7269\u5173\u7cfb|\u5f53\u524d\u5267\u60c5\u72b6\u6001|\u4eba\u7269\u5173\u7cfb\u53d8\u5316|\u672a\u5b8c\u6210\u7ebf\u7d22)[^)]*\)\s*-?\s*/g, '');
    text = text.replace(/^(?:\u4e3b\u7ebf\u987a\u5e8f|\u5730\u70b9\u53d8\u5316|\u4eba\u7269\u5173\u7cfb|\u5f53\u524d\u5267\u60c5\u72b6\u6001|\u4eba\u7269\u5173\u7cfb\u53d8\u5316|\u672a\u5b8c\u6210\u7ebf\u7d22)\s*\/\s*\u7cbe\u70bc\s*/g, '');
    text = text.replace(/\btag\s*:\s*[\w\u4e00-\u9fff-]+/gi, ' ');
    text = text.replace(/^\s*[-*]\s*/, '').replace(/\s+/g, ' ').trim();
    return text;
  }

  function _isNativeDataMemoryFact(text) {
    text = _normalizeLongTermRefineSource(text);
    if (!text) return true;
    if (/(\u6027\u522b|\u6280\u80fd|\u6ee1\u7ea7|\u66b4\u9732\u7656|\u6deb\u4e71|\u53d8\u6001|\u7a7f\u5deb\u5973\u670d|\u8349\u5c65|\u8db3\u888b|\u5934\u6234|\u9888\u6234|\u624b\u6234)/.test(text)) return true;
    if (/(\u623f\u79df\u4efb\u52a1|\u81ea\u7531\u4efb\u52a1|\u5269\u4f59\d+\u5929|\u91d1\u989d\d+|\u8fdb\u5ea6\d+)/.test(text)) return true;
    if (/(\u65e0|\u6ca1\u6709).{0,8}(\u91d1\u94b1|\u9053\u5177).{0,8}\u53d8\u5316/.test(text)) return true;
    if (/(\u538b\u529b|\u75b2\u52b3|\u6027\u594b|\u75bc\u75db|\u521b\u4f24|\u81ea\u63a7)\s*[+\-]\s*\d+/.test(text)) return true;
    if (/^(\u65e0)?(\u91d1\u94b1|\u9053\u5177|\u538b\u529b|\u75b2\u52b3|\u6027\u594b|\u75bc\u75db|\u521b\u4f24|\u81ea\u63a7|arousal|stress|pain|trauma|money)[+\-\d\uff0c, /\u65e0\u53d8\u5316]*$/i.test(text)) return true;
    if (/(\u6240\u6709\u6280\u80fd|\u793e\u4ea4|\u8fd0\u52a8|\u5b66\u4e1a|\u72af\u7f6a|\u62a4\u7406).*(1000|\u6ee1\u7ea7)/.test(text)) return true;
    return false;
  }

  function _shortenMemoryFact(text, limit) {
    text = _cleanRefinedMemoryMeta(text);
    limit = limit || 90;
    if (text.length > limit) text = text.slice(0, limit).trim() + '...';
    return text;
  }

  function _isNoUsefulLongTermRefineOutput(text) {
    text = _normalizeLongTermRefineSource(text);
    if (!text) return true;
    if (text.length <= 120 && /(\u6ca1\u6709|\u65e0|\u4e0d\u5b58\u5728).*(\u53ef\u4fdd\u7559|\u5173\u952e|\u5fc5\u8981|\u6570\u636e|\u4fe1\u606f)/.test(text)) return true;
    if (text.length <= 120 && /(no useful|no key|nothing to keep|no important)/i.test(text)) return true;
    return false;
  }

  function _refineLongTermMemoryTextSafe(text, name) {
    if (_isNoUsefulLongTermRefineOutput(text)) return '';
    var src = _normalizeLongTermRefineSource(text);
    if (!src || !_longTermHasHan(src)) return '';
    if (/(\u7248\u672c\u53f7|\u5b58\u6863\u540d|\u5f53\u524d\u8bbe\u7f6e|\u8bf7\u9009\u62e9\u6e38\u620f\u6a21\u5f0f)/.test(src)) return '';
    if (_isNativeDataMemoryFact(src)) return '';

    var place = '';
    var eventText = src;
    var locationOnlyMatch = src.match(/(?:AI\u5267\u60c5\u4e8b\u4ef6|AI\u5730\u70b9\u5267\u60c5)\s*[:\uff1a]\s*\u5730\u70b9\s*[:\uff1a]\s*([^\u3002.\n]+)\s*[\u3002.]?\s*$/);
    if (locationOnlyMatch) {
      place = _zhPlaceLabelForMemory(locationOnlyMatch[1]);
      return _shortenMemoryFact('\u5730\u70b9\uff1a' + place, 80);
    }
    var eventMatch = src.match(/AI\u5267\u60c5\u4e8b\u4ef6\s*[:\uff1a]\s*\u5730\u70b9\s*[:\uff1a]\s*([^\u3002.\n]+?)\s*[\u3002.]\s*\u4e8b\u4ef6\s*[:\uff1a]\s*([\s\S]*)/);
    if (eventMatch) {
      place = _zhPlaceLabelForMemory(eventMatch[1]);
      eventText = eventMatch[2] || '';
    }
    if (!eventText) eventText = src;

    var sentences = eventText.split(/(?<=[\u3002\uff01\uff1f!?])\s*/).map(function (s) {
      return s.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    var chosen = [];
    var importantRe = /(\u4f0a\u7538|\u7f57\u5bbe|\u4e9a\u5386\u514b\u65af|\u8d1d\u5229|\u60e0\u7279\u5c3c|\u5730\u70b9|\u8def\u7ebf|\u8def\u5f84|\u5230\u8fbe|\u8fdb\u5165|\u56de\u5230|\u79bb\u5f00|\u524d\u5f80|\u51fa\u53d1|\u5e2e|\u9664\u8349|\u6e05\u7406|\u91c7|\u62ff|\u62fe|\u83b7\u5f97|\u5f97\u5230|\u89e6\u78b0|\u62e5\u62b1|\u56de\u62b1|\u7b49\u4f60|\u9080\u8bf7|\u8be2\u95ee|\u62d2\u7edd|\u9ed8\u8bb8|\u730e\u5200|\u7089\u8fb9|\u6cc9\u6c34|\u5c0f\u5c4b|\u7a7a\u5730|\u539f\u77f3|\u514b\u6717\u5e01|\u786c\u5e01|\u65e7\u7b14\u8bb0|\u730e\u4eba\u7b14\u8bb0|\u5730\u56fe|\u540d\u7247|\u77f3\u677f|\u9057\u8ff9|\u5730\u57fa|\u5c0f\u5f84|\u94c1\u7f50|\u90ae\u7968|Cliff Street|Cafe Pancakes|Police|Barb Street|Forest Cabin|Eden Cabin|Wolf Cave|Bird Tower|town|Orphanage)/i;
    sentences.forEach(function (s) {
      if (chosen.length >= 2) return;
      if (importantRe.test(s)) chosen.push(s);
    });
    if (!chosen.length && /^\[?AI\]?/.test(String(name || ''))) chosen = sentences.slice(0, 1);
    if (!chosen.length) chosen = sentences.slice(0, 1);

    var body = chosen.join('');
    if (!body) return '';
    body = body.replace(/\s+/g, ' ').trim();
    if (_isNativeDataMemoryFact(body)) return '';
    if (place && !/^(current|same|unknown)$/i.test(place)) body = '\u5730\u70b9\uff1a' + place + '\u3002' + body;
    return _shortenMemoryFact(body, 120);
  }
  function _refineLongTermMemoryBulkText(raw) {
    var safeBulk = _refineLongTermMemoryBulkTextSafe(raw);
    if (safeBulk) return safeBulk;
    raw = _stripMemoryBoilerplate(raw);
    if (!raw) return '';
    var parts = raw.split(/\n(?=###\s+)|\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    var buckets = {
      '当前剧情状态': [],
      '人物关系变化': [],
      '未完成线索': []
    };
    var seen = {};
    function add(bucket, text) {
      text = _refineLongTermMemoryText(text, bucket);
      if (!text) return;
      text.split(/(?<=[。！？!?])\s+/).forEach(function (s) {
        s = s.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim();
        if (!s || s.length < 4) return;
        if (s.length > 90) s = s.slice(0, 90) + '...';
        var key = bucket + '|' + s;
        if (seen[key]) return;
        seen[key] = true;
        buckets[bucket].push(s);
      });
    }
    parts.forEach(function (part) {
      var text = part.replace(/^###\s*[^\n]+\n?/, '').trim();
      if (!text || _isNativeDataMemoryFact(text)) return;
      if (/(线索|未完成|待|需要|下次|约定|承诺|计划|目标|调查|仍需|尚未)/i.test(text)) add('未完成线索', text);
      else if (/(关系|好感|亲近|触碰|拥抱|回抱|环住|回应|拒绝|默许|接纳|等你|注视|邀请|擦过|Robin|Bailey|Avery|Eden|伊甸|罗宾|贝利|艾弗里)/i.test(text)) add('人物关系变化', text);
      else add('当前剧情状态', text);
    });
    return Object.keys(buckets).map(function (bucket) {
      var lines = buckets[bucket].slice(0, 8);
      if (!lines.length) return '';
      return '### ' + bucket + ' / 精炼\n' + lines.map(function (s) { return '- ' + s; }).join('\n');
    }).filter(Boolean).join('\n\n');
  }

  function _isNonStoryMemoryText(name, text) {
    name = String(name || '').trim();
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (_isRecordPollutionText(text)) return true;
    if (!name && !text) return true;
    if (name.indexOf('AIStoryGen_') === 0) return true;
    try {
      if (typeof _isGameMenuPassage === 'function' && _isGameMenuPassage(name)) return true;
    } catch (e) { /* menu blacklist not initialized yet */ }
    if (/^(Start|Settings|Attitudes|Traits|Social|Characteristics|Journal|Statistics|Save|Load|Cheats)$/i.test(name)) return true;

    var startSignals = 0;
    if (/本作品为虚构创作|成年受众|不得在任何缺乏年龄验证机制的平台上传播/.test(text)) startSignals++;
    if (/请选择游戏模式|基础开局|推荐初学者选择/.test(text)) startSignals++;
    if (/存档名[：:]|存档文件储存在浏览器缓存中/.test(text)) startSignals++;
    if (/当前设置[：:]|NPC性别|兽类外观|成就加成/.test(text)) startSignals++;
    if (startSignals >= 2) return true;

    if (/^(游戏设置|选项|存档|读档|统计|成就|作弊|态度|特质)\s*$/.test(text)) return true;
    return false;
  }

  function _sanitizeMemoryBuffers() {
    function keep(entry) {
      if (!entry || _isNonStoryMemoryText(entry.name, entry.text)) return false;
      entry.text = _cleanRecordText(entry.text);
      return !!entry.text;
    }
    var changed = false;
    for (var i = recentBuf.length - 1; i >= 0; i--) {
      if (!keep(recentBuf[i])) {
        recentBuf.splice(i, 1);
        changed = true;
      }
    }
    for (var j = longTermMem.length - 1; j >= 0; j--) {
      if (!keep(longTermMem[j])) {
        longTermMem.splice(j, 1);
        changed = true;
      }
    }
    return changed;
  }

  _sanitizeMemoryBuffers();

  function enforceRecentMemoryLimit(cfg, reason) {
    cfg = cfg || loadCfg();
    var max = Math.max(0, Number(cfg.recentMax || 0));
    var allowLongTerm = String(reason || '').indexOf('原版') !== 0;
    if (max <= 0) {
      if (recentBuf.length) {
        var removedAll = recentBuf.splice(0);
        if (allowLongTerm) {
          addImportantMemory('[自动整理]', _summarizeMemoryEntries(removedAll, reason || '短期记忆'), { silent: true, tag: '自动整理', auto: true });
        }
      }
      return;
    }
    if (recentBuf.length <= max) return;
    var overflow = recentBuf.splice(0, recentBuf.length - max);
    if (allowLongTerm) {
      var summary = _summarizeMemoryEntries(overflow, reason || '剧情顺序');
      if (summary) addImportantMemory('[自动整理]', summary, { silent: true, tag: '自动整理', auto: true });
    }
  }

  function saveMemoryBuffer() {
    try {
      _bindMemoryToCurrentStateIfNeeded();
      _sanitizeMemoryBuffers();
      _trimLongTermMem(loadCfg());
      _syncMemoryToCurrentSave();
      try {
        localStorage.removeItem(MEM_KEY);
        localStorage.removeItem(LONGTERM_KEY);
      } catch (_) {}
      try {
        idbSet(MEM_KEY, []).catch(function () {});
        idbSet(LONGTERM_KEY, []).catch(function () {});
      } catch (_) {}
    } catch (e) {
      console.warn('[AIStoryGen] failed to save memory to current save', e);
    }
  }

  // -- Memory summarization: compress oldest entries when buffer grows too large --
  var _summarizeBusy = false;
  function compressMemories(cfg) {
    if (_summarizeBusy) return;
    var trigger = (cfg.summarizeTrigger != null && cfg.summarizeTrigger >= 0) ? cfg.summarizeTrigger : 8;
    if (trigger <= 0 || recentBuf.length < trigger) return;
    var toCompress = [];
    for (var i = 0; i < recentBuf.length && toCompress.length < 3; i++) {
      if (recentBuf[i].name.indexOf('[摘要]') !== 0) toCompress.push(recentBuf[i]);
    }
    if (toCompress.length < 3) return;
    _summarizeBusy = true;
    var sourceText = toCompress.map(function(e){return e.text.slice(0, 200);}).join(' | ');
    var sumPrompt = cfg.language === 'zh'
      ? '将以下游戏剧情事件合并成一句简短中文摘要（30字以内，只陈述事实）：' + sourceText
      : 'Merge these game story events into one short English summary (under 20 words, facts only): ' + sourceText;
    callAI(sumPrompt, { highQuality: true, temperature: 0.2, max_tokens: 220 }).then(function(summary){
      var clean = (summary || '').replace(/^["']|["']$/g, '').trim();
      if (!clean || clean.length < 5) { _summarizeBusy = false; return; }
      var removeCount = toCompress.length;
      recentBuf.splice(0, removeCount);
      addImportantMemory('[压缩重点]', clean, { silent: true, tag: '压缩' });
      recentBuf.unshift({ name: '[摘要]', text: clean });
      while (recentBuf.length > cfg.recentMax) recentBuf.pop();
      saveMemoryBuffer();
      console.log('[AIStoryGen] memory compressed: ' + removeCount + ' → 1 summary');
      _summarizeBusy = false;
    }).catch(function(){ _summarizeBusy = false; });
  }

  /** Export memory buffer as downloadable JSON file (includes recent + long-term) */
  function exportMemoryBuffer() {
    var json = JSON.stringify({ recentBuf: recentBuf, longTermMem: longTermMem, playerStoryProfile: loadCfg().playerStoryProfile || '' }, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'AIStoryGen_memory_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Import memory from a JSON file, replace current buffer */
  function importMemoryBuffer(callback) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          // Support both old format (array) and new format ({ recentBuf, longTermMem })
          if (Array.isArray(data)) {
            recentBuf.length = 0;
            data.forEach(function (entry) {
              if (entry && typeof entry.name === 'string' && typeof entry.text === 'string') {
                recentBuf.push({ name: entry.name, text: entry.text });
              }
            });
          } else if (data && typeof data === 'object') {
            if (Array.isArray(data.recentBuf)) {
              recentBuf.length = 0;
              data.recentBuf.forEach(function (entry) {
                if (entry && typeof entry.name === 'string' && typeof entry.text === 'string') {
                  recentBuf.push({ name: entry.name, text: entry.text });
                }
              });
            }
            if (Array.isArray(data.longTermMem)) {
              longTermMem.length = 0;
              data.longTermMem.forEach(function (entry) {
                if (entry && typeof entry.name === 'string' && typeof entry.text === 'string') {
                  longTermMem.push(_normalizeImportantMemoryEntry(entry));
                }
              });
            }
            if (typeof data.playerStoryProfile === 'string') {
              var cfg = loadCfg();
              cfg.playerStoryProfile = data.playerStoryProfile;
              saveCfg(cfg);
            }
          }
          saveMemoryBuffer();
          if (callback) callback(null, recentBuf.length + longTermMem.length);
        } catch (err) {
          if (callback) callback(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  window.AIStoryGen.exportMemory = exportMemoryBuffer;
  window.AIStoryGen.importMemory = importMemoryBuffer;
  window.AIStoryGen.addLongTermMemory = addLongTermMemory;
  window.AIStoryGen.addImportantMemory = addImportantMemory;
  window.AIStoryGen.removeLongTermMemory = removeLongTermMemory;
  window.AIStoryGen.compressLongTermMemories = compressLongTermMemories;
  window.AIStoryGen.longTermMem = longTermMem;
  window.AIStoryGen.refineLongTermMemoryBulkText = _refineLongTermMemoryBulkText;
  window.AIStoryGen.getEventLog = _getAiEventLog;
  window.AIStoryGen.parseAIEventBlock = _parseAIEventBlock;



  function _getAISaveTitle() {
    try {
      var $src = $('#passages .passage .ai-replaced-content, #passages .passage .ai-narrative-wrap').last();
      var text = '';
      if ($src.length) {
        var $clone = $src.clone();
        $clone.find('a, button, input, select, textarea, script, style, .ai-choices, .ai-choices-end, .ai-nav-wrap, .ai-narrative-toolbar, .ai-item-use-panel, .ai-pickup-line, .ai-gen-loading').remove();
        text = ($clone.text() || '').replace(/\s+/g, ' ').trim();
      }
      if (!text && _aiReplaceSessionHTML) {
        var tmp = document.createElement('div');
        tmp.innerHTML = _aiReplaceSessionHTML;
        $(tmp).find('a, button, input, select, textarea, script, style, .ai-choices, .ai-choices-end, .ai-nav-wrap, .ai-narrative-toolbar, .ai-item-use-panel, .ai-pickup-line, .ai-gen-loading').remove();
        text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (!text) return '';
      text = text.replace(/^(?:\u5237\u65b0\u5267\u60c5|\u2606\s*\u6536\u85cf[^\s]*|\u2605\s*\u5df2\u6536\u85cf[^\s]*)\s*/g, '').trim();
      var firstSentence = text.split(/(?<=[\u3002\uff01\uff1f.!?])\s*/).filter(Boolean)[0] || text;
      if (firstSentence.length >= 18) text = firstSentence;
      if (text.length > 90) text = text.slice(0, 90).trim() + '\u2026';
      return text ? '[AI\u5267\u60c5] ' + text : '';
    } catch (_) {
      return '';
    }
  }

  function _refineLongTermMemoryBulkTextSafe(raw) {
    raw = String(raw || '').trim();
    if (!raw || !_longTermHasHan(raw)) return '';
    var parts = raw.split(/\n(?=###\s+)|\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) parts = [raw];
    var buckets = {
      '\u5f53\u524d\u5267\u60c5\u72b6\u6001': [],
      '\u5730\u70b9\u4e0e\u8def\u7ebf': [],
      '\u4eba\u7269\u5173\u7cfb\u53d8\u5316': [],
      '\u7ebf\u7d22\u4e0e\u5267\u60c5\u7269\u54c1': [],
      '\u672a\u5b8c\u6210\u76ee\u6807': []
    };
    var seen = {};
    function addFact(title, body) {
      var fact = _refineLongTermMemoryTextSafe(body, title);
      if (!fact) return;
      fact = _cleanRefinedMemoryMeta(fact);
      if (_isNativeDataMemoryFact(fact)) return;
      var bucket = _memoryBucketForRefinedFact(fact, title);
      if (!buckets[bucket]) bucket = '\u5f53\u524d\u5267\u60c5\u72b6\u6001';
      var key = bucket + '|' + fact;
      if (seen[key]) return;
      seen[key] = true;
      if (buckets[bucket].length < 6) buckets[bucket].push(fact);
    }
    parts.forEach(function (part) {
      var lines = part.split(/\n/);
      var title = '';
      if (/^###\s+/.test(lines[0] || '')) title = String(lines.shift() || '').replace(/^###\s*/, '').trim();
      var body = lines.join('\n').trim() || part;
      var candidates = [];
      lines.forEach(function (line) {
        line = String(line || '').replace(/^[-*]\s*/, '').trim();
        if (!line) return;
        line.split(/\s+-\s+(?=(?:\[\d+\]|\(?[\u4e00-\u9fff]))/).forEach(function (piece) {
          piece = piece.replace(/^[-*]\s*/, '').trim();
          if (piece) candidates.push(piece);
        });
      });
      if (!candidates.length) candidates = [body];
      candidates.forEach(function (piece) { addFact(title, piece); });
    });
    return Object.keys(buckets).map(function (bucket) {
      var lines = buckets[bucket];
      if (!lines.length) return '';
      return '### ' + bucket + ' / \u7cbe\u70bc\n' + lines.map(function (s) { return '- ' + s; }).join('\n');
    }).filter(Boolean).join('\n\n');
  }

  function _writeAISaveTitleToVariables(vars, title) {
    if (!vars || typeof vars !== 'object') return;
    if (title) vars.aiStoryGenSaveTitle = title;
    else delete vars.aiStoryGenSaveTitle;
  }

  function _syncAISaveTitleToCurrentState(title) {
    title = title || _getAISaveTitle();
    try { _writeAISaveTitleToVariables(_getStateVariables(), title); } catch (_) {}
    try { if (typeof State !== 'undefined' && State.active && State.active.variables) _writeAISaveTitleToVariables(State.active.variables, title); } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        _writeAISaveTitleToVariables(State.history[State.activeIndex].variables, title);
      }
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        _writeAISaveTitleToVariables(State._history[State.activeIndex].variables, title);
      }
    } catch (_) {}
    return title;
  }

  function _patchDolSaveDetailTitle(saveSlot, title) {
    title = title || _getAISaveTitle();
    if (!title) return false;
    try {
      var raw = localStorage.getItem('dolSaveDetails');
      if (!raw) return false;
      var details = JSON.parse(raw);
      if (!details || typeof details !== 'object') return false;
      var target = null;
      if (saveSlot === 'autosave' || saveSlot === 'auto') {
        if (!details.autosave) details.autosave = {};
        target = details.autosave;
      } else {
        var slot = parseInt(saveSlot, 10);
        if (isNaN(slot)) return false;
        if (!Array.isArray(details.slots)) details.slots = [];
        if (!details.slots[slot]) details.slots[slot] = {};
        target = details.slots[slot];
      }
      target.id = (typeof Story !== 'undefined' && Story.domId) || target.id || '';
      target.title = title;
      target.date = Date.now();
      if (!target.metadata) target.metadata = {};
      target.metadata.aiStoryGen = true;
      target.metadata.aiStoryGenTitle = title;
      localStorage.setItem('dolSaveDetails', JSON.stringify(details));
      return true;
    } catch (e) {
      try { console.warn('[AIStoryGen] patch save detail title failed', e); } catch (_) {}
      return false;
    }
  }

  function _patchRecentAISaveDetailTitle(saveSlot) {
    var title = _syncAISaveTitleToCurrentState();
    if (!title) return;
    setTimeout(function () { _patchDolSaveDetailTitle(saveSlot, title); }, 0);
    setTimeout(function () { _patchDolSaveDetailTitle(saveSlot, title); }, 120);
  }

  function _guessRecentSaveSlotFromElement(el) {
    try {
      var node = el;
      while (node && node !== document) {
        var attrs = [node.getAttribute && node.getAttribute('data-save-slot'), node.getAttribute && node.getAttribute('data-slot'), node.id, node.name, node.className].join(' ');
        var m = String(attrs || '').match(/(?:slot|save)[^\d]{0,8}(\d+)/i) || String(attrs || '').match(/\b([0-7])\b/);
        if (m) return parseInt(m[1], 10);
        node = node.parentNode;
      }
    } catch (_) {}
    return null;
  }

  function _installAISaveRuntimeHooks() {
    window.AIStoryGen._saveRuntimeHooksInstalled = true;
    if (!window.AIStoryGen._saveCaptureHookInstalled) {
      window.AIStoryGen._saveCaptureHookInstalled = true;
      document.addEventListener('click', function (ev) {
        try {
          var el = ev && ev.target;
          if (!el || !el.closest) return;
          var btn = el.closest('a, button, input');
          if (!btn) return;
          var txt = ((btn.innerText || btn.textContent || btn.value || '') + ' ' + (btn.id || '') + ' ' + (btn.name || '')).replace(/\s+/g, ' ').trim();
          if (/(\u5b58\u6863|\u4fdd\u5b58|save)/i.test(txt)) {
            _syncAIStateBeforePossibleSave();
            setTimeout(function () { _patchRecentAISaveDetailTitle(_guessRecentSaveSlotFromElement(btn)); }, 80);
          }
        } catch (_) {}
      }, true);
    }
    try {
      if (typeof Save !== 'undefined' && Save.slots && typeof Save.slots.save === 'function' && !Save.slots.save._aiStoryGenWrapped) {
        var slotDesc = Object.getOwnPropertyDescriptor(Save.slots, 'save');
        if (!slotDesc || slotDesc.writable !== false) {
          var originalSlotSave = Save.slots.save;
          var wrappedSlotSave = function (slot, title, metadata) {
            _syncAIStateBeforePossibleSave();
            var result = originalSlotSave.apply(this, arguments);
            if (result) _patchRecentAISaveDetailTitle(slot);
            return result;
          };
          wrappedSlotSave._aiStoryGenWrapped = true;
          Save.slots.save = wrappedSlotSave;
        }
      }
    } catch (e1) { try { console.warn('[AIStoryGen] slot save hook failed', e1); } catch (_) {} }
    try {
      if (typeof Save !== 'undefined' && Save.autosave && typeof Save.autosave.save === 'function' && !Save.autosave.save._aiStoryGenWrapped) {
        var autoDesc = Object.getOwnPropertyDescriptor(Save.autosave, 'save');
        if (!autoDesc || autoDesc.writable !== false) {
          var originalAutoSave = Save.autosave.save;
          var wrappedAutoSave = function () {
            _syncAIStateBeforePossibleSave();
            var result = originalAutoSave.apply(this, arguments);
            if (result) _patchRecentAISaveDetailTitle('autosave');
            return result;
          };
          wrappedAutoSave._aiStoryGenWrapped = true;
          Save.autosave.save = wrappedAutoSave;
        }
      }
    } catch (e2) { try { console.warn('[AIStoryGen] autosave hook failed', e2); } catch (_) {} }
    try {
      if (typeof Save !== 'undefined' && typeof Save.serialize === 'function' && !Save.serialize._aiStoryGenWrapped) {
        var serializeDesc = Object.getOwnPropertyDescriptor(Save, 'serialize');
        if (!serializeDesc || serializeDesc.writable !== false) {
          var originalSerialize = Save.serialize;
          var wrappedSerialize = function () {
            _syncAIStateBeforePossibleSave();
            return originalSerialize.apply(this, arguments);
          };
          wrappedSerialize._aiStoryGenWrapped = true;
          Save.serialize = wrappedSerialize;
        }
      }
    } catch (e3) { try { console.warn('[AIStoryGen] serialize hook failed', e3); } catch (_) {} }
    try {
      if (window.idb && typeof window.idb.saveState === 'function' && !window.idb.saveState._aiStoryGenWrapped) {
        var idbDesc = Object.getOwnPropertyDescriptor(window.idb, 'saveState');
        if (!idbDesc || idbDesc.writable !== false) {
          var originalIdbSave = window.idb.saveState;
          var wrappedIdbSave = function (slot) {
            _syncAIStateBeforePossibleSave();
            var result = originalIdbSave.apply(this, arguments);
            _patchRecentAISaveDetailTitle(slot === 0 || slot === '0' ? 'autosave' : slot);
            return result;
          };
          wrappedIdbSave._aiStoryGenWrapped = true;
          window.idb.saveState = wrappedIdbSave;
        }
      }
    } catch (e4) { try { console.warn('[AIStoryGen] idb save hook failed', e4); } catch (_) {} }
  }
  _installAISaveRuntimeHooks();
  // === 存档系统集成：AI记忆随 DoL 游戏存档一起读写 ===
  // 将 AI 记忆注入 SugarCube save 对象中，实现按存档隔离的记忆持久化。
  // On save: inject current AI memory into the save object
  if (typeof Save !== 'undefined' && Save.onSave) {
    Save.onSave.add(function (save) {
      try {
        _bindMemoryToCurrentStateIfNeeded();
        var aiState = _syncAIStoryGenStateToCurrentSave('onSave');
        _writeAIStoryGenStateToSave(save, aiState);
        if (aiState.scene) {
          var aiSaveTitle = _syncAISaveTitleToCurrentState();
          if (aiSaveTitle) {
            save.title = aiSaveTitle;
            save.state.aiStoryGenSaveTitle = aiSaveTitle;
            if (!save.metadata) save.metadata = {};
            save.metadata.aiStoryGen = true;
            save.metadata.aiStoryGenTitle = aiSaveTitle;
          }
        }
      } catch (e) { /* ignore */ }
    });
  }
  // On load: restore AI memory from the save object (fires via DoL's custom :onloadsave event)
  $(document).on(':onloadsave', function (ev) {
    try {
      var save = ev && ev.save;
      var aiState = _legacyAIStoryGenStateFromSave(save);
      _restoreSaveScopedConfig(aiState.config);
      if (aiState.memoryId) _aiMemorySaveId = aiState.memoryId;
      var memFromBackup = null;
      if (!_memoryHasContent(aiState.memory)) {
        memFromBackup = _findMatchingMemoryEmergencyBackup(save);
        if (_memoryHasContent(memFromBackup)) {
          aiState.memory = _normalizeSaveMemory(memFromBackup);
          if (!_aiMemorySaveId) aiState.memoryId = _ensureMemorySaveId(save && save.state && save.state.variables);
        }
      }
      if (_memoryHasContent(aiState.memory)) {
        _replaceMemoryFromSave(aiState.memory);
        _aiMemorySaveBound = true;
        console.log('[AIStoryGen] AI memory restored from ' + (memFromBackup ? 'emergency backup' : 'save') + ' (recent=' + recentBuf.length + ', longTerm=' + longTermMem.length + ')');
      } else {
        _replaceMemoryFromSave({});
        _aiMemorySaveBound = true;
        console.log('[AIStoryGen] save has no AI memory; started empty memory for this save');
      }
      _replaceAiItemStoreFromSave(aiState.items || []);
      _writeAIStoryGenStateToCurrentMoment(aiState);
      _persistAiItemStore();
      _replaceAISaveStateFromSave(aiState.scene || null);
      console.log('[AIStoryGen] AI item inventory restored from save (items=' + _getAiItemStore().length + ')');
    } catch (e) {
      console.warn('[AIStoryGen] onloadsave restore error', e);
    }
  });

  // -- 长期记忆管理 --
  /** Add a narrative entry to long-term memory (player manually bookmarks) */
  function addLongTermMemory(name, text) {
    addImportantMemory(name, text, { tag: '收藏' });
    console.log('[AIStoryGen] long-term memory added: ' + name);
  }
  /** Remove a long-term memory by index */
  function removeLongTermMemory(index) {
    if (index >= 0 && index < longTermMem.length) {
      longTermMem.splice(index, 1);
      saveMemoryBuffer();
    }
  }
  /** Compress long-term memories: AI summarizes multiple entries into one */
  function compressLongTermMemories(cfg) {
    var trigger = cfg.longTermCompressTrigger || 5;
    if (longTermMem.length < trigger * 2) return;
    // Only compress non-summary entries
    var toCompress = longTermMem.filter(function (e) { return e.name.indexOf('[LTSummary]') !== 0; });
    if (toCompress.length < trigger * 2) return;
    var batch = toCompress.slice(0, trigger);
    var sourceText = batch.map(function (e) { return e.text.slice(0, 150); }).join(' | ');
    var sumPrompt = cfg.language === 'zh'
      ? '将以下游戏剧情事件合并成一句简短中文摘要（50字以内，只陈述关键事实）：' + sourceText
      : 'Merge these game story events into one short English summary (under 30 words, facts only): ' + sourceText;
    return callAI(sumPrompt, { highQuality: true, temperature: 0.2, max_tokens: 260 }).then(function (summary) {
      var clean = (summary || '').replace(/^["']|["']$/g, '').trim();
      if (!clean || clean.length < 5) return;
      // Remove compressed entries
      for (var i = 0; i < trigger && longTermMem.length > 0; i++) {
        longTermMem.shift();
      }
      longTermMem.push(_normalizeImportantMemoryEntry({ name: '[LTSummary]', text: clean, tag: '压缩', savedAt: new Date().toISOString() }));
      saveMemoryBuffer();
      console.log('[AIStoryGen] long-term memory compressed: ' + trigger + ' → 1 summary');
    }).catch(function () {});
  }

  function _refreshOriginalEventModeFromLink() {
    var id = String(_aiReplaceOriginalLinkId || '');
    if (!id) return _aiReplaceOriginalEventMode;
    var $orig = $('[data-ai-origid]').filter(function () {
      return String($(this).attr('data-ai-origid') || '') === id && !$(this).hasClass('ai-injected-link');
    }).first();
    if ($orig.length) {
      _aiReplaceOriginalEventMode = _isOriginalEventActionLink($orig, _aiReplaceTargetPassage, _aiReplaceTargetLabel);
    }
    return _aiReplaceOriginalEventMode;
  }

  function _repairStaleEventModeUI($scope) {
    if (_aiReplaceOriginalEventMode) return;
    ($scope || $('#passages')).find('.ai-continue-link,.ai-back-link').each(function () {
      var $a = $(this);
      var txt = ($a.text() || '').trim();
      if (/\u786e\u8ba4\u6267\u884c|Confirm/i.test(txt)) {
        var $wrap = $a.closest('.ai-nav-wrap');
        if ($wrap.length) $wrap.remove();
        else $a.remove();
      }
    });
  }

  $(document).on(':passagedisplay', function (ev) {
    try {
      _installAISaveRuntimeHooks();
      var name = (ev && ev.passage && ev.passage.title) || _currentPassageName();
      _clearStaleMoorEventQueue('passagedisplay ' + name);
      if (_isStartOrMainMenuPassage(name)) {
        _aiMemorySaveBound = false;
        _clearRuntimeMemory();
        try {
          localStorage.removeItem(MEM_KEY);
          localStorage.removeItem(LONGTERM_KEY);
        } catch (_) {}
        return;
      }
      _bindMemoryToCurrentStateIfNeeded();
      setTimeout(_renderAiItemsInLog, 50);
    } catch (e) {
      console.warn('[AIStoryGen] save-scoped memory bind error', e);
    }
  });

  $(document).on('click', 'a, button', function () {
    try {
      var txt = ($(this).text() || '').replace(/\s+/g, ' ').trim();
      var id = String(this.id || '');
      if (/(\u5b58\u6863|\u4fdd\u5b58|save)/i.test(txt + ' ' + id)) {
        _syncAIStateBeforePossibleSave();
      }
    } catch (_) {}
    setTimeout(_renderAiItemsInLog, 80);
    setTimeout(_renderAiItemsInLog, 300);
  });

  $(document).on(':passagedisplay', function (ev) {
    try {
      const cfg = loadCfg();
      if (!cfg.recentMax || cfg.recentMax <= 0) return;
      const name = (ev && ev.passage && ev.passage.title) || (typeof State !== 'undefined' && State.passage) || '';
      if (!name) return;
      if (name.indexOf('AIStoryGen_') === 0) return;
      if (_isNonStoryMemoryText(name, '')) return;

      const $body = $('#passages .passage');
      if (!$body.length) return;
      const $clone = $body.clone();
      // Remove interactive elements and AI-story artifacts
      $clone.find('a, button, img, input, select, script, style, .macro-link, .gameplayLinks, .sidebar, #storyBanner, .ai-choices, .ai-replaced-content, .ai-narrative-wrap, .ai-narrative-section, .ai-original-wrap[style*="display:none"], .ai-gen, .ai-memory-section, .ai-memory-inline, .ai-injected-row, .ai-choices-end, .ai-nav-wrap, .ai-back-to-game').remove();
      let text = ($clone.text() || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      // Strip known boilerplate / notification text
      text = text.replace(/本游戏完全免费[\s\S]*?举报他[！!]/g, '');
      text = text.replace(/你已经有段时间没导出存档了[\s\S]*?/g, '');
      text = text.replace(/\|\s*\|\s*\|/g, '');
      text = _cleanRecordText(text);
      if (!text || text.length < 5) return;
      if (_isNonStoryMemoryText(name, text)) return;
      if (_isStaticSceneMemory(name, text)) return;
      if (_isRecordPollutionText(text)) return;

      const limit = cfg.recentLimit || 600;
      if (text.length > limit) text = text.slice(0, limit) + '…';

      recentBuf.push({ name: name, text: text });
      enforceRecentMemoryLimit(cfg, '原版剧情顺序');
      saveMemoryBuffer();
    } catch (e) {
      console.warn('[AIStoryGen] recent capture error', e);
    }
  });

  // Auto-inject <<aichoices>> at bottom of every passage when enabled
  var _autoChoicesBusy = false;
  var _autoChoicesBusyTimer = null; // timeout protection for lock
  var _sessionAutoPaused = false; // 会话级暂停自动生成
  var _autoChoicesSuppressedUntil = 0; // temporary suppression after pure native return
  var _lastChoicesData = null;  // saved choices for re-render on cancel
  var _currentAbortController = null;  // AbortController for active API call

  function _createTimedAbortController(timeoutMs) {
    var controller = new AbortController();
    timeoutMs = Math.max(5000, parseInt(timeoutMs, 10) || 45000);
    var timer = setTimeout(function () {
      try { controller.abort(); } catch (_) {}
    }, timeoutMs);
    return {
      controller: controller,
      signal: controller.signal,
      clear: function () {
        try { clearTimeout(timer); } catch (_) {}
      }
    };
  }

  function _suppressAutoChoices(reason, ms) {
    _autoChoicesSuppressedUntil = Date.now() + (ms || 4500);
    if (_autoChoicesEnsureTimer) {
      clearTimeout(_autoChoicesEnsureTimer);
      _autoChoicesEnsureTimer = null;
    }
    try { console.log('[AIStoryGen] suppress auto choices' + (reason ? ': ' + reason : '') + ' until ' + _autoChoicesSuppressedUntil); } catch (_) {}
  }
  function _isAutoChoicesSuppressed() {
    return _autoChoicesSuppressedUntil && Date.now() < _autoChoicesSuppressedUntil;
  }
  function _releaseAutoChoicesBusy(reason) {
    if (_autoChoicesBusy) {
      console.log('[AIStoryGen] _autoChoicesBusy released' + (reason ? ': ' + reason : ''));
    }
    _autoChoicesBusy = false;
    if (_autoChoicesBusyTimer) {
      clearTimeout(_autoChoicesBusyTimer);
      _autoChoicesBusyTimer = null;
    }
  }
  // AI replace mode: intercept game links and replace passage with AI content
  var _aiReplaceActive = false;      // true when AI has replaced passage content
  var _aiReplaceRoundCount = 0;      // rounds of AI narrative in current replace session
  var _aiReplaceTargetLabel = '';    // Q1-4: destination label (e.g. "住宅区街道")
  var _aiReplaceTargetPassage = '';  // Q1-4: destination passage name
  var _aiReplaceOriginPassage = '';  // passage name when AI replace started (reset on sidebar nav)
  var _aiReplaceSessionHTML = '';    // cached overlay HTML — survives same-passage DOM rebuild
  var DEFAULT_REPLACE_MAX_ROUNDS = Infinity; // AI exploration is unlimited; the counter is kept for history only.

  // -- Game menu passages: blacklisted from AI link injection / auto choices --
  function _isGameMenuPassage(name) {
    return !!LinkClassifierModule.isGameMenuPassage(name);
  }

  // DOM-level detection: check if current page is a shop/UI page (not story content)
  // Only uses high-confidence signals to avoid false positives on story passages.
  function _isShopOrUIPage() {
    var $passage = $('#passages .passage');
    if (!$passage.length) return false;
    var links = [];
    $passage.find('a').each(function () {
      links.push({
        text: $(this).text(),
        passage: String($(this).attr('data-passage') || '')
      });
    });
    return PageClassifierModule.isShopOrUIPage({
      passageName: (typeof State !== 'undefined' && State.passage) || '',
      pageText: ($passage.text() || '').replace(/\s+/g, ' ').trim(),
      markers: {
        wardrobeLike: $passage.find('#wardrobe, #mirror-container, .wardrobe, #clothing, .clothing-manager, #outfit').length > 0,
        shopTableLike: $passage.find('table.shop, table.store, table.inventory, #shop-table').length > 0
      },
      links: links
    });
  }

  // -- DoL location index for LOC tracking. `raw` is always a playable passage. --
  // Built from the original game's passage/location scan; `locId` is the game's $location value.
  var _aiCommonLocations = [
    { raw: 'Bedroom', label: '\u5367\u5ba4', locId: 'home', aliases: ['\u5367\u5ba4', '\u623f\u95f4', '\u5bb6\u91cc', 'bedroom', 'home'] },
    { raw: 'Bathroom', label: '\u6d74\u5ba4', locId: 'home', aliases: ['\u6d74\u5ba4', '\u6d17\u624b\u95f4', '\u6d17\u6fa1\u95f4', 'bathroom'] },
    { raw: 'Kitchen', label: '\u53a8\u623f', locId: 'home', aliases: ['\u53a8\u623f', 'kitchen'] },
    { raw: 'Garden', label: '\u82b1\u56ed', locId: 'home', aliases: ['\u82b1\u56ed', '\u9662\u5b50', 'garden'] },
    { raw: 'Orphanage', label: '\u5b64\u513f\u9662', locId: 'home', aliases: ['\u5b64\u513f\u9662', 'orphanage'] },
    { raw: 'Domus Street', label: '\u5b85\u90b8\u8857', locId: 'town', aliases: ['\u5b85\u90b8\u8857', 'domus', 'domus street'] },
    { raw: 'Barb Street', label: '\u5012\u94a9\u8857', locId: 'town', aliases: ['\u5012\u94a9\u8857', 'barb', 'barb street'] },
    { raw: 'Elk Street', label: '\u9e8b\u9e7f\u8857', locId: 'town', aliases: ['\u9e8b\u9e7f\u8857', '\u9e8b\u9e7f\u8857\u516c\u5bd3', 'elk', 'elk street'] },
    { raw: 'Danube Street', label: '\u591a\u7459\u6cb3\u8857', locId: 'town', aliases: ['\u591a\u7459\u6cb3\u8857', '\u591a\u7459\u6cb3\u516c\u5bd3', 'danube', 'danube street'] },
    { raw: 'High Street', label: '\u9ad8\u8857', locId: 'town', aliases: ['\u9ad8\u8857', 'high street'] },
    { raw: 'Residential Alleyways', label: '\u4f4f\u5b85\u533a\u5c0f\u5df7', locId: 'alley', aliases: ['\u5c0f\u5df7', '\u5df7\u5b50', '\u4f4f\u5b85\u5c0f\u5df7', 'alley', 'residential alley'] },
    { raw: 'Commercial Alleyways', label: '\u5546\u4e1a\u533a\u5c0f\u5df7', locId: 'alley', aliases: ['\u5546\u4e1a\u8857\u5c0f\u5df7', '\u5546\u4e1a\u533a\u5c0f\u5df7', 'commercial alley'] },
    { raw: 'Industrial Alleyways', label: '\u5de5\u4e1a\u533a\u5c0f\u5df7', locId: 'alley', aliases: ['\u5de5\u4e1a\u533a', '\u5de5\u4e1a\u5c0f\u5df7', 'industrial alley'] },
    { raw: 'Drain Water', label: '\u6392\u6c34\u6e20', locId: 'drain', aliases: ['\u6392\u6c34\u6e20', '\u6c9f\u6e20', '\u6392\u6c34\u9053', 'drain'] },
    { raw: 'Shopping Centre', label: '\u8d2d\u7269\u4e2d\u5fc3', locId: 'shopping_centre', aliases: ['\u5546\u573a', '\u8d2d\u7269\u4e2d\u5fc3', 'shopping centre', 'mall'] },
    { raw: 'Adult Shop', label: '\u60c5\u8da3\u7528\u54c1\u5e97', locId: 'adult_shop', aliases: ['\u60c5\u8da3\u7528\u54c1\u5e97', '\u6027\u7528\u54c1\u5e97', 'addon shop', 'adult shop'] },
    { raw: 'Cafe Pancakes', label: '\u5496\u5561\u9986', locId: 'cafe', aliases: ['\u5496\u5561\u9986', '\u5496\u5561\u5385', '\u5496\u5561\u5e97', 'cafe', 'pancakes'] },
    { raw: 'Dance Studio', label: '\u821e\u8e48\u5ba4', locId: 'dance_studio', aliases: ['\u821e\u8e48\u5ba4', '\u821e\u8e48\u6559\u5ba4', 'dance studio'] },
    { raw: 'Police Station', label: '\u8b66\u5bdf\u5c40', locId: 'police_station', aliases: ['\u8b66\u5bdf\u5c40', '\u8b66\u5c40', 'police station'] },
    { raw: 'Hospital Foyer', label: '\u533b\u9662', locId: 'hospital', aliases: ['\u533b\u9662', '\u533b\u9662\u5927\u5385', 'hospital', 'hospital foyer'] },
    { raw: "Doctor Harper's Office", label: '\u54c8\u73c0\u533b\u751f\u8bca\u5ba4', locId: 'hospital', aliases: ['\u8bca\u5ba4', '\u54c8\u73c0\u533b\u751f\u8bca\u5ba4', 'doctor office', "doctor harper's office"] },
    { raw: 'School Front Courtyard', label: '\u5b66\u6821', locId: 'school', aliases: ['\u5b66\u6821', '\u5b66\u6821\u524d\u9662', 'school'] },
    { raw: 'School Library', label: '\u5b66\u6821\u56fe\u4e66\u9986', locId: 'school', aliases: ['\u56fe\u4e66\u9986', '\u5b66\u6821\u56fe\u4e66\u9986', 'school library'] },
    { raw: 'School Pool', label: '\u5b66\u6821\u6cf3\u6c60', locId: 'pool', aliases: ['\u6cf3\u6c60', '\u5b66\u6821\u6cf3\u6c60', 'school pool'] },
    { raw: 'Temple', label: '\u795e\u6bbf', locId: 'temple', aliases: ['\u795e\u6bbf', '\u4fee\u9053\u9662', '\u6559\u5802', 'temple'] },
    { raw: 'Temple Jordan', label: '\u7ea6\u65e6\u7684\u795e\u6bbf\u623f\u95f4', locId: 'temple', aliases: ['\u7ea6\u65e6\u7684\u623f\u95f4', '\u7ea6\u65e6\u7684\u795e\u6bbf\u623f\u95f4', 'temple jordan'] },
    { raw: 'Temple Jordan Room', label: '\u7ea6\u65e6\u7684\u623f\u95f4', locId: 'temple', aliases: ['\u7ea6\u65e6\u623f\u95f4', '\u7ea6\u65e6\u7684\u623f\u95f4', 'temple jordan room'] },
    { raw: 'Churchyard', label: '\u6559\u5802\u5ead\u9662', locId: 'churchyard', aliases: ['\u6559\u5802\u5ead\u9662', '\u6559\u5802', '\u5893\u5730', 'churchyard', 'church'] },
    { raw: 'Dilapidated Temple', label: '\u8352\u5e9f\u795e\u6bbf', locId: 'old_temple', aliases: ['\u8352\u5e9f\u795e\u6bbf', '\u65e7\u795e\u6bbf', 'dilapidated temple', 'old temple'] },
    { raw: 'Brothel', label: '\u5993\u9662', locId: 'brothel', aliases: ['\u5993\u9662', 'brothel'] },
    { raw: "Briar's Office", label: '\u5e03\u8d56\u5c14\u529e\u516c\u5ba4', locId: 'brothel', aliases: ['\u5e03\u8d56\u5c14\u529e\u516c\u5ba4', "briar's office"] },
    { raw: 'Strip Club', label: '\u8131\u8863\u821e\u4ff1\u4e50\u90e8', locId: 'strip_club', aliases: ['\u8131\u8863\u821e\u4ff1\u4e50\u90e8', '\u4ff1\u4e50\u90e8', 'strip club'] },
    { raw: 'Pub', label: '\u9152\u5427', locId: 'pub', aliases: ['\u9152\u5427', '\u9152\u9986', 'pub', 'bar'] },
    { raw: 'Spa', label: '\u6c34\u7597\u4e2d\u5fc3', locId: 'spa', aliases: ['\u6c34\u7597\u4e2d\u5fc3', '\u6c34\u7597', 'spa'] },
    { raw: 'Park', label: '\u516c\u56ed', locId: 'park', aliases: ['\u516c\u56ed', 'park'] },
    { raw: 'Beach', label: '\u6d77\u6ee9', locId: 'beach', aliases: ['\u6d77\u6ee9', '\u6d77\u8fb9', 'beach'] },
    { raw: 'Docks', label: '\u7801\u5934', locId: 'docks', aliases: ['\u7801\u5934', '\u6e2f\u53e3', 'docks'] },
    { raw: 'Museum', label: '\u535a\u7269\u9986', locId: 'museum', aliases: ['\u535a\u7269\u9986', 'museum'] },
    { raw: 'Office Agency', label: '\u529e\u516c\u697c', locId: 'office', aliases: ['\u529e\u516c\u697c', '\u529e\u516c\u5ba4', 'office'] },
    { raw: 'Forest', label: '\u68ee\u6797', locId: 'forest', aliases: ['\u68ee\u6797', 'forest'] },
    { raw: 'Forest Cabin', label: '\u4f0a\u7538\u5c0f\u5c4b', locId: 'cabin', aliases: ['\u4f0a\u7538\u5c0f\u5c4b', '\u68ee\u6797\u5c0f\u5c4b', '\u5c0f\u6728\u5c4b', 'eden cabin', 'forest cabin', 'cabin'] },
    { raw: 'Forest Shop Entrance', label: '\u68ee\u6797\u5546\u5e97', locId: 'forest_shop', aliases: ['\u68ee\u6797\u5546\u5e97', '\u683c\u5a01\u5170\u5546\u5e97', 'forest shop'] },
    { raw: 'Wolf Cave', label: '\u72fc\u6d1e', locId: 'wolf_cave', aliases: ['\u72fc\u6d1e', '\u72fc\u7a74', 'wolf cave', 'forest wolf cave'] },
    { raw: 'Wolf Cave Rank', label: '\u72fc\u6d1e\u7b49\u7ea7', locId: 'wolf_cave', aliases: ['\u72fc\u6d1e\u7b49\u7ea7', '\u72fc\u7fa4\u5730\u4f4d', 'wolf cave rank'] },
    { raw: 'Lake Shore', label: '\u6e56\u8fb9', locId: 'lake', aliases: ['\u6e56\u6cca', '\u6e56\u8fb9', '\u6e56\u5cb8', 'lake', 'lake shore'] },
    { raw: 'Lake Ruin', label: '\u6e56\u4e2d\u9057\u8ff9', locId: 'lake_ruin', aliases: ['\u6e56\u4e2d\u9057\u8ff9', '\u6e56\u5e95\u9057\u8ff9', 'lake ruin'] },
    { raw: 'Moor', label: '\u8352\u539f', locId: 'moor', aliases: ['\u8352\u539f', 'moor'] },
    { raw: 'Castle', label: '\u57ce\u5821', locId: 'castle', aliases: ['\u57ce\u5821', '\u57ce\u5821\u5ead\u9662', 'castle'] },
    { raw: 'Bird Tower', label: '\u9ad8\u5854', locId: 'tower', aliases: ['\u9ad8\u5854', '\u5854\u697c', '\u77f3\u5854', '\u96c4\u9e70\u5de2\u7a74', '\u96c4\u9e70\u9ad8\u5854', '\u5de8\u9e70\u9ad8\u5854', '\u5927\u9e70\u9ad8\u5854', '\u5927\u9e70\u5de2', '\u9e70\u5de2', '\u66f4\u9ad8\u7684\u77f3\u5854', 'tower', 'bird tower', 'great hawk tower'] },
    { raw: 'Manor Garden', label: '\u51ef\u62c9\u5c14\u5e84\u56ed\u524d\u82b1\u56ed', locId: 'kylar_manor', aliases: ['\u51ef\u62c9\u5c14\u5e84\u56ed', '\u51ef\u62c9\u5c14\u5bb6', '\u5e84\u56ed\u82b1\u56ed', 'manor garden', 'kylar manor'] },
    { raw: 'Manor Lab', label: '\u51ef\u62c9\u5c14\u5e84\u56ed\u5b9e\u9a8c\u5ba4', locId: 'kylar_manor', aliases: ['\u51ef\u62c9\u5c14\u5b9e\u9a8c\u5ba4', '\u5e84\u56ed\u5b9e\u9a8c\u5ba4', 'manor lab'] },
    { raw: 'Manor Lab Clean', label: '\u51ef\u62c9\u5c14\u5e84\u56ed\u5b9e\u9a8c\u5ba4\u6e05\u7406', locId: 'kylar_manor', aliases: ['\u6e05\u7406\u51ef\u62c9\u5c14\u5b9e\u9a8c\u5ba4', 'manor lab clean'] },
    { raw: 'Manor Kylar Room', label: '\u51ef\u62c9\u5c14\u5367\u5ba4', locId: 'kylar_manor', aliases: ['\u51ef\u62c9\u5c14\u7684\u623f\u95f4', '\u51ef\u62c9\u5c14\u5367\u5ba4', 'kylar room', 'manor kylar room'] },
    { raw: 'Manor Garden Trim', label: '\u51ef\u62c9\u5c14\u5e84\u56ed\u4fee\u526a\u6811\u7bf1', locId: 'kylar_manor', aliases: ['\u4fee\u526a\u6811\u7bf1', '\u5e84\u56ed\u4fee\u526a\u6811\u7bf1', 'manor garden trim'] },
    { raw: 'Farm Work', label: '\u4e9a\u5386\u514b\u65af\u519c\u573a', locId: 'alex_farm', aliases: ['\u519c\u573a', '\u519c\u820d', '\u9e21\u820d', '\u72ac\u820d', '\u72d7\u820d', '\u725b\u68da', '\u8c37\u4ed3', '\u7267\u573a', '\u827e\u5229\u514b\u65af', '\u4e9a\u5386\u514b\u65af', 'farm', 'alex farm', 'Alex'] },
    { raw: 'Farm Cottage', label: '\u4e9a\u5386\u514b\u65af\u5c0f\u5c4b', locId: 'alex_cottage', aliases: ['\u4e9a\u5386\u514b\u65af\u5c0f\u5c4b', '\u519c\u573a\u5c0f\u5c4b', 'farm cottage', 'alex cottage'] },
    { raw: 'Farmland', label: '\u519c\u7530', locId: 'farm', aliases: ['\u519c\u7530', '\u5730\u4e0b\u519c\u573a', 'farmland'] },
    { raw: 'Farm Barn', label: '\u8c37\u4ed3', locId: 'farm', aliases: ['\u8c37\u4ed3', '\u519c\u573a\u8c37\u4ed3', 'barn', 'farm barn'] },
    { raw: 'Estate', label: '\u5e84\u56ed', locId: 'estate', aliases: ['\u5e84\u56ed', '\u519c\u573a\u5e84\u56ed', 'estate'] },
    { raw: 'Riding School', label: '\u9a91\u672f\u5b66\u6821', locId: 'riding_school', aliases: ['\u9a91\u672f\u5b66\u6821', '\u9a6c\u672f\u5b66\u6821', 'riding school'] },
    { raw: 'Farmers Centre', label: '\u519c\u592b\u4e2d\u5fc3', locId: 'factory', aliases: ['\u519c\u592b\u4e2d\u5fc3', '\u5de5\u5382', 'farmers centre', 'factory'] },
    { raw: 'Sewers Commercial', label: '\u4e0b\u6c34\u9053', locId: 'sewers', aliases: ['\u4e0b\u6c34\u9053', '\u5546\u4e1a\u533a\u4e0b\u6c34\u9053', 'sewers', 'commercial sewers'] },
    { raw: 'Sewers Industrial', label: '\u5de5\u4e1a\u533a\u4e0b\u6c34\u9053', locId: 'sewers', aliases: ['\u5de5\u4e1a\u533a\u4e0b\u6c34\u9053', 'industrial sewers'] },
    { raw: 'Sewers Lake', label: '\u4e0b\u6c34\u9053\u6e56\u6cca', locId: 'sewers', aliases: ['\u4e0b\u6c34\u9053\u6e56\u6cca', '\u5730\u4e0b\u6e56', 'sewers lake'] },
    { raw: 'Trash', label: '\u5783\u573e\u573a', locId: 'landfill', aliases: ['\u5783\u573e\u573a', '\u5e9f\u54c1\u573a', 'landfill', 'trash'] },
    { raw: 'Elk Compound', label: '\u9e8b\u9e7f\u8857\u636e\u70b9', locId: 'compound', aliases: ['\u9e8b\u9e7f\u8857\u636e\u70b9', '\u636e\u70b9', 'elk compound', 'compound'] },
    { raw: 'Underground Cell', label: '\u5730\u4e0b\u533a\u57df', locId: 'underground', aliases: ['\u5730\u4e0b\u533a\u57df', '\u5730\u4e0b\u7262\u623f', 'underground'] },
    { raw: 'Asylum', label: '\u7cbe\u795e\u75c5\u9662', locId: 'asylum', aliases: ['\u7cbe\u795e\u75c5\u9662', '\u75af\u4eba\u9662', 'asylum'] },
    { raw: 'Prison Yard', label: '\u76d1\u72f1', locId: 'prison', aliases: ['\u76d1\u72f1', '\u76d1\u72f1\u9662\u5b50', 'prison', 'prison yard'] },
    { raw: 'Pirate Deck', label: '\u6d77\u76d7\u8239', locId: 'pirate_ship', aliases: ['\u6d77\u76d7\u8239', '\u8239\u7532\u677f', 'pirate ship', 'pirate deck'] },
    { raw: 'Arcade', label: '\u8857\u673a\u5385', locId: 'arcade', aliases: ['\u8857\u673a\u5385', '\u6e38\u620f\u5385', 'arcade'] },
    { raw: 'Pillory', label: '\u67b7\u5211\u53f0', locId: 'town', aliases: ['\u67b7\u5211\u53f0', 'pillory'] },
    { raw: 'Bus', label: '\u516c\u4ea4\u8f66', locId: 'bus', aliases: ['\u516c\u4ea4\u8f66', '\u5df4\u58eb', 'bus'] },
  ];
  var _aiAvailableDestinations = [];   // [{ raw, label }] populated at AI start
  var _aiCurrentLocationLabel = '';    // dynamic AI current location label
  var _aiCurrentLocationPassage = '';  // dynamic AI current location passage name
  var _aiLocationArrived = false;      // true when AI has indicated arrival at a known location
  var _aiLastLocationDecision = null;  // last LocationController arrival decision
  var _aiReplaceOriginalLinkId = '';    // original game link to trigger after AI narration
  var _aiReplaceOriginalEventMode = false; // true for original event/action links that must resolve immediately
  var _lastChoiceText = '';            // last user-chosen option text for LOC inference
  var _lastNarrativePrompt = '';       // last prompt used for narrative (for regen button)
  var _aiNarrativeWrap = null;         // dedicated container for AI narrative in normal mode (page-turn)

  const LocationControllerModule = window.AIStoryGenLocationControllerModule || window.AIStoryGen.LocationControllerModule;
  if (!LocationControllerModule || typeof LocationControllerModule.create !== 'function') {
    throw new Error('[AIStoryGen] ai-location-controller.js must load before aiMacro.js');
  }

  function _getLocationRuntimeState() {
    var statePassage = '';
    try { statePassage = (typeof State !== 'undefined' && State.passage) || ''; } catch (_) {}
    return {
      currentLocationPassage: _aiCurrentLocationPassage || '',
      replaceTargetPassage: _aiReplaceTargetPassage || '',
      replaceOriginPassage: _aiReplaceOriginPassage || '',
      statePassage: statePassage
    };
  }

  const _aiLocationTools = LocationControllerModule.create({
    commonLocations: _aiCommonLocations,
    cleanLabel: cleanLabel,
    currentState: _getLocationRuntimeState,
    getAvailableDestinations: function () { return _aiAvailableDestinations; },
    getLocationGraph: function () {
      try {
        return (typeof window !== 'undefined' && window.AIStoryGenLocationGraph && window.AIStoryGenLocationGraph.nodes)
          ? window.AIStoryGenLocationGraph
          : null;
      } catch (_) {
        return null;
      }
    },
    storyHas: function (raw) {
      try { return typeof Story !== 'undefined' && Story.has && Story.has(raw); } catch (_) { return false; }
    },
    isUnsafeDirectPassage: function (raw) {
      return /^(Moor|Bog)$/i.test(String(raw || '')) || /^Prison\b/i.test(String(raw || ''));
    }
  });
  window.AIStoryGen.locationTools = _aiLocationTools;

  // Clean label text: strip hotkey annotations e.g. "(Shift+3)", "(0:01)", "(A)", "(4)"
  function cleanLabel(text) {
    if (!text) return '';
    return text.replace(/\(Shift\+\d+\)/gi, '')
               .replace(/\(\d+:\d+\)/g, '')
               .replace(/\([A-F]\)/g, '')
               .replace(/\((£)?\d+(\.\d+)?(\s?£)?\)/g, '')  // (4), (£1.50) etc.
               .replace(/\([^)]{1,6}\)/g, '')   // short parenthetical annotations like "(富人区)"
               .replace(/\s+/g, ' ')
               .trim();
  }

  function _getAiLocationState() {
    return {
      passage: _aiCurrentLocationPassage || '',
      label: _aiCurrentLocationLabel || '',
      arrived: !!_aiLocationArrived
    };
  }

  function _setAiLocationState(rawPassage, label, reason, opts) {
    opts = opts || {};
    rawPassage = _normalizePassageName(rawPassage || '');
    if (!rawPassage) return false;
    _aiCurrentLocationPassage = rawPassage;
    _aiCurrentLocationLabel = _resolveLocationDisplay(rawPassage, label || '') || rawPassage;
    _aiLocationArrived = opts.arrived !== false;
    try {
      console.log('[AIStoryGen] location set' + (reason ? ' (' + reason + ')' : '') + ': ' + _aiCurrentLocationLabel + ' (' + _aiCurrentLocationPassage + '), arrived=' + _aiLocationArrived);
    } catch (_) {}
    return true;
  }

  function _setAiLocationLabelOnly(label, reason, opts) {
    opts = opts || {};
    label = _resolveLocationDisplay('', label || '') || cleanLabel(label || '') || String(label || '').trim();
    if (!label) return false;
    _aiCurrentLocationPassage = '';
    _aiCurrentLocationLabel = label;
    _aiLocationArrived = opts.arrived !== false;
    try {
      console.log('[AIStoryGen] location label set' + (reason ? ' (' + reason + ')' : '') + ': ' + _aiCurrentLocationLabel + ', arrived=' + _aiLocationArrived);
    } catch (_) {}
    return true;
  }

  function _clearAiLocationState(reason) {
    _aiCurrentLocationLabel = '';
    _aiCurrentLocationPassage = '';
    _aiLocationArrived = false;
    try { if (reason) console.log('[AIStoryGen] location state cleared: ' + reason); } catch (_) {}
  }

  function _markAiLocationInTransit(reason) {
    if (_aiReplaceActive) {
      _aiLocationArrived = false;
      try { if (reason) console.log('[AIStoryGen] location state in transit: ' + reason); } catch (_) {}
      return;
    }
    _clearAiLocationState(reason || 'location in transit');
  }

  function _getArriveTargetPassage() {
    if (_aiLocationArrived && _aiCurrentLocationPassage) return _normalizePassageName(_aiCurrentLocationPassage);
    if (_aiReplaceActive && _aiReplaceTargetPassage) return _normalizePassageName(_aiReplaceTargetPassage);
    try {
      if (typeof State !== 'undefined' && State.passage) return _normalizePassageName(State.passage);
    } catch (_) {}
    return '';
  }

  // Resolve a raw passage name to Chinese label via _aiCommonLocations (exact + prefix match)
  function _looksLikeRawLocationLabel(label) {
    return _aiLocationTools.looksLikeRawLocationLabel(label);
  }

  function _resolveLocationLabel(passageName) {
    return _aiLocationTools.resolveLabel(passageName);
  }

  function _resolveLocationDisplay(raw, label) {
    return _aiLocationTools.resolveDisplay(raw, label);
  }

  function _findCommonLocation(rawOrLabel) {
    return _aiLocationTools.findCommon(rawOrLabel);
  }

  function _findCommonLocationByRaw(rawPassage) {
    return _aiLocationTools.findCommonByRaw(rawPassage);
  }

  function _findCommonLocationByLocId(locId) {
    return _aiLocationTools.findCommonByLocId(locId);
  }

  function _findCommonLocationByPrefix(rawPassage) {
    return _aiLocationTools.findCommonByPrefix(rawPassage);
  }

  function _getLocationGraph() {
    return _aiLocationTools.getGraph();
  }

  function _findGraphLocation(rawOrLabel) {
    return _aiLocationTools.findGraph(rawOrLabel);
  }

  function _pushManualArriveCandidate(list, seen, raw, label) {
    return _aiLocationTools.pushManualArriveCandidate(list, seen, raw, label);
  }

  function _getAvailableDestination(raw) {
    return _aiLocationTools.getAvailableDestination(raw);
  }

  function _isGraphExitTo(baseRaw, destRaw) {
    return _aiLocationTools.isGraphExitTo(baseRaw, destRaw);
  }

  function _isGraphAdjacentToAnyBase(destRaw) {
    return _aiLocationTools.isGraphAdjacentToAnyBase(destRaw);
  }

  function _locationHasExplicitLongDistanceTransition(eventData, sourceText) {
    return _aiLocationTools.locationHasExplicitLongDistanceTransition(eventData, sourceText);
  }

  function _evaluateAiLocationArrival(rawPassage, opts) {
    return _aiLocationTools.evaluateArrivalCandidate(rawPassage, opts || {});
  }

  function _rememberLocationDecision(decision) {
    _aiLastLocationDecision = decision ? Object.assign({}, decision, { at: Date.now() }) : null;
    return decision;
  }

  function _applyAiLocationCandidate(rawPassage, label, reason, opts) {
    opts = opts || {};
    rawPassage = _normalizePassageName(rawPassage || '');
    if (!rawPassage) return false;
    var decision = _rememberLocationDecision(_evaluateAiLocationArrival(rawPassage, opts));
    var display = _resolveLocationDisplay(rawPassage, label || '') || rawPassage;
    if (decision.allowed && decision.arrived) {
      _setAiLocationState(rawPassage, display, reason || 'location candidate', { arrived: true });
      return true;
    }
    _setAiLocationState(rawPassage, display, (reason || 'location candidate') + ' (pending)', { arrived: false });
    try {
      console.log('[AIStoryGen] location kept pending: ' + display + ' (' + rawPassage + '), reason=' + decision.reason);
    } catch (_) {}
    return true;
  }

  function _collectManualArriveCandidates(primaryPassage) {
    return _aiLocationTools.collectManualArriveCandidates(primaryPassage);
  }

  function _isStableManualArrivePassage(rawPassage) {
    rawPassage = _normalizePassageName(rawPassage || '');
    if (!rawPassage || _isUnsafeDirectPassage(rawPassage)) return false;
    if (_findCommonLocationByRaw(rawPassage)) return true;
    var graphLoc = _findGraphLocation(rawPassage);
    if (graphLoc && graphLoc.locId) {
      var canonical = _findCommonLocationByLocId(graphLoc.locId);
      if (canonical && canonical.raw === rawPassage) return true;
    }
    var available = _getAvailableDestination(rawPassage);
    if (available && /^(page|graph|manual)$/i.test(String(available.source || ''))) return true;
    return false;
  }

  function _forceManualArriveTo(rawPassage) {
    rawPassage = _normalizePassageName(rawPassage || '');
    if (!rawPassage) return false;
    if (_isUnsafeDirectPassage(rawPassage)) {
      _warnUnsafeDirectPassage(rawPassage);
      return false;
    }
    if (!_isStableManualArrivePassage(rawPassage)) {
      var cfgStable = loadCfg();
      var stableLabel = _resolveLocationDisplay(rawPassage, '') || rawPassage;
      _setAiLocationState(rawPassage, stableLabel, 'manual arrive target only', { arrived: false });
      _showAIUserMessage(cfgStable.language === 'zh'
        ? ('已把目标地点标记为「' + stableLabel + '」，但没有直接跳转：这个目标不像稳定原版地点入口，直接进入可能缺少前置数据。')
        : ('Marked "' + stableLabel + '" as the target, but did not jump directly because it does not look like a stable native location entry.'), true);
      return false;
    }
    try {
      if (typeof Story !== 'undefined' && Story.has && !Story.has(rawPassage)) {
        _showAIUserMessage((loadCfg().language === 'zh' ? '\u65e0\u6cd5\u5230\u8fbe\uff1a' : 'Cannot arrive at: ') + rawPassage, true);
        return false;
      }
    } catch (_) {}
    _pushCurrentToAiRoundHistory();
    _setAiLocationState(rawPassage, '', 'manual arrive correction');
    try { console.log('[AIStoryGen] manual arrive correction: ' + _aiCurrentLocationLabel + ' (' + rawPassage + ')'); } catch (_) {}
    if (_aiReplaceActive) {
      _finishAiReplaceAndGo(rawPassage, { skipOriginal: true, preserveRoundHistory: true });
    } else {
      _finishNormalAiAndGo(rawPassage, { preserveRoundHistory: true });
    }
    return true;
  }

  function _normalizePassageName(passageName) {
    return _aiLocationTools.normalizePassage(passageName);
  }

  function _setAiCurrentLocation(loc, reason) {
    if (!loc || !loc.raw) return false;
    return _setAiLocationState(loc.raw, loc.label || '', reason || 'manual');
  }

  var LocationController = {
    schemaVersion: 2,
    getState: _getAiLocationState,
    setCurrent: function (rawPassage, label, reason, opts) {
      return _setAiLocationState(rawPassage, label, reason || 'controller', opts);
    },
    setLabelOnly: function (label, reason, opts) {
      return _setAiLocationLabelOnly(label, reason || 'controller label', opts);
    },
    clear: function (reason) {
      _clearAiLocationState(reason || 'controller');
    },
    normalizePassage: _normalizePassageName,
    resolveLabel: _resolveLocationLabel,
    resolveDisplay: _resolveLocationDisplay,
    findCommon: _findCommonLocation,
    findGraph: _findGraphLocation,
    collectManualArriveCandidates: _collectManualArriveCandidates,
    forceManualArriveTo: _forceManualArriveTo,
    evaluateArrivalCandidate: function (rawPassage, opts) {
      return _evaluateAiLocationArrival(rawPassage, opts || {});
    },
    getLastDecision: function () {
      return _cloneForAiSnapshot(_aiLastLocationDecision || null);
    },
    canDirectPlayPassage: _canDirectPlayPassage,
    navigateToNativePassage: function (targetPassage, opts) {
      return _navigateToNativePassage(targetPassage, opts || {});
    },
    getArriveTargetPassage: function () {
      return _getArriveTargetPassage();
    },
    parseMarker: function (text) {
      return parseLocationMarker(text);
    },
    inferFromText: function (choiceText, aiText) {
      return inferLocationFromText(choiceText, aiText);
    },
    syncOriginalPassage: function () {
      return syncOriginalPassageToCurrentLocation();
    }
  };
  window.AIStoryGen.locationController = LocationController;
  window.AIStoryGen.LocationController = LocationController;

  function _inferPriorityLocationFromText(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    var hasHawk = /(\u5de8\u9e70|\u5927\u9e70|\u96c4\u9e70|\u9e70\u96bc|\u9e70\u5de2|\u7fbd\u6bdb|great\s*hawk|hawk|eagle)/i.test(text);
    var hasTower = /(\u9ad8\u5854|\u5854\u697c|\u77f3\u5854|\u5854\u9876|\u5de2\u7a74|tower)/i.test(text);
    if (hasHawk && hasTower) {
      var tower = _findCommonLocation('Bird Tower');
      return tower ? _applyAiLocationCandidate(tower.raw, tower.label, 'bird tower narrative', {
        source: 'priority-text',
        status: 'arrived',
        sourceText: text
      }) : false;
    }
    if (/(\u66f4\u9ad8\u7684\u77f3\u5854|\u5854\u9876\u7684\u5e73\u53f0|\u91d1\u8272\u7684\u773c\u775b|\u5c55\u5f00\u53cc\u7ffc)/.test(text)) {
      var tower2 = _findCommonLocation('Bird Tower');
      return tower2 ? _applyAiLocationCandidate(tower2.raw, tower2.label, 'bird tower details', {
        source: 'priority-text',
        status: 'arrived',
        sourceText: text
      }) : false;
    }
    return false;
  }

  function _rescueLegacyPassageIfNeeded(passageName) {
    var raw = String(passageName || '').trim();
    try {
      if (raw && typeof Story !== 'undefined' && Story.has && Story.has(raw)) return false;
    } catch (_) {}
    var normalized = _normalizePassageName(raw);
    if (!raw || normalized === raw) return false;
    try {
      if (typeof Story !== 'undefined' && Story.has && Story.has(normalized) && typeof Engine !== 'undefined' && Engine.play) {
        console.log('[AIStoryGen] rescued legacy passage "' + raw + '" -> "' + normalized + '"');
        setTimeout(function () { Engine.play(normalized); }, 0);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function _isInvalidPrisonDirectState(passageName) {
    var raw = _normalizePassageName(passageName || '');
    if (!/^Prison\b/i.test(raw)) return false;
    try {
      var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
      if (!V) return false;
      return !V.prison || typeof V.prison !== 'object';
    } catch (_) {
      return false;
    }
  }

  function _clearUnsafePrisonAiState() {
    try {
      _pendingAISaveState = null;
      _aiReplaceActive = false;
      _aiReplaceOriginPassage = '';
      _aiReplaceTargetLabel = '';
      _aiReplaceTargetPassage = '';
      _aiReplaceOriginalLinkId = '';
      _aiReplaceOriginalEventMode = false;
      _clearAiLocationState('unsafe prison direct state');
      _clearAiRoundHistory();
      var V = _getStateVariables();
      if (V && V.aiStoryGenNavState && /^Prison\b/i.test(String(V.aiStoryGenNavState.passage || ''))) {
        delete V.aiStoryGenNavState;
      }
    } catch (_) {}
  }

  function _rescueInvalidPrisonDirectState(passageName, phase) {
    if (!_isInvalidPrisonDirectState(passageName)) return false;
    _clearUnsafePrisonAiState();
    try {
      console.warn('[AIStoryGen] rescued invalid Prison direct state from ' + passageName + ' during ' + (phase || 'unknown'));
    } catch (_) {}
    try {
      var safe = 'Beach';
      if (typeof Story !== 'undefined' && Story.has && !Story.has(safe)) safe = 'Domus Street';
      if (typeof Engine !== 'undefined' && Engine.play && (typeof Story === 'undefined' || !Story.has || Story.has(safe))) {
        setTimeout(function () {
          try {
            _markAISaveRestoreSuppressed(2500);
            Engine.play(safe);
            _showAIUserMessage('\u5df2\u963b\u6b62\u76f4\u63a5\u8fdb\u5165\u539f\u7248\u76d1\u72f1\u4e8b\u4ef6\u94fe\uff0c\u5e76\u5c06\u9875\u9762\u6062\u590d\u5230\u6d77\u6ee9\u3002', false);
          } catch (_) {}
        }, 0);
        return true;
      }
    } catch (_) {}
    return true;
  }

  function _isOriginalEventActionLink($link, targetPassage, linkText) {
    var rowText = '';
    try {
      var $parent = $link && $link.parent ? $link.parent() : null;
      rowText = $parent && $parent.length ? ($parent.text() || '') : '';
    } catch (_) {}
    var text = (String(linkText || '') + ' ' + rowText).replace(/\s+/g, ' ');
    return /(\u4fe1\u4efb|\u5de5\u8d44|\u652f\u4ed8|\u4ed8\u94b1|\u6ca1\u94b1|\u91d1\u94b1|\u00a3|\$|trust|wage|pay|money)/i.test(text);
  }

  function _cleanAIUtilityLinkText(value) {
    return LinkClassifierModule.cleanLinkText(value);
  }

  function _isSettingsOrUtilityLink(targetPassage, linkText, rowText) {
    return LinkClassifierModule.isSettingsOrUtilityLink(targetPassage, linkText, rowText);
  }

  function _shouldSkipAIStoryLink($link, targetPassage, linkText) {
    var classifierRowText = '';
    try {
      classifierRowText = ($link && $link.parent && $link.parent().text ? $link.parent().text() : '') || '';
    } catch (_) {}
    return LinkClassifierModule.shouldSkipAIStoryLink({
      targetPassage: targetPassage,
      linkText: linkText,
      rowText: classifierRowText
    });
  }

  $(document).on(':passagedisplay', function (ev) {
    var name = (ev && ev.passage && ev.passage.title) || (typeof State !== 'undefined' && State.passage) || '';
    if (_rescueInvalidPrisonDirectState(name, 'passagedisplay legacy rescue')) return;
    _rescueLegacyPassageIfNeeded(name);
  });

  function _applyGenericStreetLocation(raw, sourceText) {
    raw = String(raw || '').trim();
    sourceText = String(sourceText || '');
    if (!/(街道|街上|路边|巷口|地面|地上|地表|街角|street|surface|road|alley)/i.test(raw + ' ' + sourceText)) return false;
    var dest = null;
    for (var i = 0; i < _aiAvailableDestinations.length; i++) {
      var d = _aiAvailableDestinations[i];
      if (/街|Street|Road/i.test(d.label + ' ' + d.raw)) { dest = d; break; }
    }
    if (dest) {
      _setAiLocationState(dest.raw, dest.label, 'generic street destination');
    } else if (_aiReplaceOriginPassage) {
      _setAiLocationState(_aiReplaceOriginPassage, _resolveLocationLabel(_aiReplaceOriginPassage) || '街道', 'generic street origin');
    } else {
      _setAiLocationLabelOnly('街道', 'generic street label');
    }
    console.log('[AIStoryGen] location matched (generic street): ' + _aiCurrentLocationLabel + (_aiCurrentLocationPassage ? ' (' + _aiCurrentLocationPassage + ')' : ''));
    return true;
  }

  // Parse time annotation from choice text: "前往公园散步 (0:10)" → 10
  function parseTimeFromChoice(text) {
    if (!text) return 0;
    var m = text.match(/\((\d+):(\d+)\)\s*$/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  // Infer default time cost from action keywords
  function inferDefaultTimeCost(text) {
    if (!text) return 5;
    var t = text.toLowerCase();
    if (/移动|前往|去|走到|到达|离开|返回|跑去|走去|赶到/.test(t)) return 10;
    if (/查看|看|观察|检查|搜索|寻找/.test(t)) return 5;
    if (/聊天|交谈|说|问|告诉|打招呼|搭讪/.test(t)) return 10;
    if (/休息|等待|躺|坐|睡|发呆/.test(t)) return 15;
    if (/游泳|跑步|锻炼/.test(t)) return 20;
    return 5;
  }

  // Advance game time using the game's built-in <<pass>> macro
  function advanceGameTime(minutes) {
    if (!minutes || minutes <= 0) return;
    try {
      // Use game's <<pass N>> macro for correct time advancement
      // This properly updates Time.hour, Time.minute, timeStamp, and all game internals
      var d = document.createElement('span');
      new Wikifier(d, '<<pass ' + Math.round(minutes) + '>>');

      // Refresh sidebar clock DOM from updated Time object
      var timeStr = String(Time.hour).padStart(2, '0') + ':' + String(Time.minute).padStart(2, '0');
      function updateClockInContainer($container) {
        $container.find('*').addBack().each(function () {
          // Check direct text nodes of this element for time pattern
          var node = this;
          for (var ci = 0; ci < node.childNodes.length; ci++) {
            var tn = node.childNodes[ci];
            if (tn.nodeType === 3) { // text node
              var m = tn.textContent.match(/(\d{1,2}:\d{2})/);
              if (m) tn.textContent = tn.textContent.replace(m[1], timeStr);
            }
          }
        });
      }
      updateClockInContainer($('#stats .centered-elements'));
      updateClockInContainer($('#storyCaptionContent .centered-elements'));
      // Flash visual indicator
      var $indicator = $('#ai-time-indicator');
      if (!$indicator.length) {
        $indicator = $('<div id="ai-time-indicator" style="position:fixed;top:50px;left:50%;transform:translateX(-50%);background:rgba(100,140,220,0.9);color:#fff;padding:4px 12px;border-radius:4px;font-size:0.85em;z-index:99999;opacity:0;transition:opacity 0.3s;pointer-events:none;"></div>');
        $('body').append($indicator);
      }
      $indicator.text('⏱ +' + minutes + ' min → ' + timeStr).css('opacity', '1');
      setTimeout(function () { $indicator.css('opacity', '0'); }, 1500);
      console.log('[AIStoryGen] time advanced: +' + minutes + 'min → ' + timeStr);
    } catch (e) {
      console.warn('[AIStoryGen] advanceGameTime error:', e);
    }
  }

  // Parse [LOC: passage_name] or [LOC: 中文名] from AI output
  // Returns true if location was updated
  function _extractAIMetadataLocation(text) {
    return EventParserModule.extractAIMetadataLocation(text);
  }

  function _stripAIMetadataMarkers(text) {
    return EventParserModule.stripAIMetadataMarkers(text);
  }

  function parseLocationMarker(text) {
    text = String(text || '');
    var metaLoc = _extractAIMetadataLocation(text);
    if (metaLoc) text += '\n[LOC: ' + metaLoc + ']';
    var eventData = _parseAIEventBlock(text);
    var eventStatus = _normaliseAiEventStatus(eventData && (eventData.locationStatus || eventData.location_status || eventData.travelStatus || eventData.arrivalStatus || '')) || '';
    var eventLoc = eventData && (eventData.targetLocation || eventData.target_location || eventData.loc || '');
    if (eventLoc && _aiEventIndicatesArrival(eventData) && !/^(none|null|current|same|unknown|无|当前|不变)$/i.test(String(eventLoc))) {
      text += '\n[LOC: ' + eventLoc + ']';
    }
    var match = text.match(/\[LOC:\s*([^\]]+)\]/i);
    if (!match) return false;
    var raw = _normalizePassageName(match[1].trim());
    // Try exact match in available destinations first
    for (var i = 0; i < _aiAvailableDestinations.length; i++) {
      var d = _aiAvailableDestinations[i];
      if (raw === d.raw || raw === d.label) {
        _applyAiLocationCandidate(d.raw, d.label, 'LOC available destination', {
          source: d.source || 'available',
          status: eventStatus || 'arrived',
          eventData: eventData,
          sourceText: text
        });
        console.log('[AIStoryGen] location moved to: ' + d.label + ' (' + d.raw + ')');
        return true;
      }
    }
    // Try fuzzy match in destinations: raw contains label or vice versa
    for (var i = 0; i < _aiAvailableDestinations.length; i++) {
      var d = _aiAvailableDestinations[i];
      if (raw.indexOf(d.label) !== -1 || d.label.indexOf(raw) !== -1) {
        _applyAiLocationCandidate(d.raw, d.label, 'LOC fuzzy destination', {
          source: d.source || 'available-fuzzy',
          status: eventStatus || 'arrived',
          eventData: eventData,
          sourceText: text
        });
        console.log('[AIStoryGen] location matched (fuzzy): ' + d.label + ' (' + d.raw + ')');
        return true;
      }
    }
    // Try common locations table (works in both replace and normal mode)
    for (var i = 0; i < _aiCommonLocations.length; i++) {
      var loc = _aiCommonLocations[i];
      if (raw === loc.raw || raw === loc.label) {
        _applyAiLocationCandidate(loc.raw, loc.label, 'LOC common location', {
          source: 'common',
          status: eventStatus || 'arrived',
          eventData: eventData,
          sourceText: text
        });
        console.log('[AIStoryGen] location matched (common): ' + loc.label + ' (' + loc.raw + ')');
        return true;
      }
      for (var j = 0; j < (loc.aliases || []).length; j++) {
        if (raw === loc.aliases[j]) {
          _applyAiLocationCandidate(loc.raw, loc.label, 'LOC common alias', {
            source: 'common-alias',
            status: eventStatus || 'arrived',
            eventData: eventData,
            sourceText: text
          });
          console.log('[AIStoryGen] location matched (common alias): ' + loc.label + ' (' + loc.raw + ')');
          return true;
        }
      }
    }
    // Check Story.has as last resort
    if (typeof Story !== 'undefined' && Story.has && Story.has(raw)) {
      _applyAiLocationCandidate(raw, _resolveLocationLabel(raw), 'LOC Story.has', {
        source: 'story',
        status: eventStatus || 'arrived',
        eventData: eventData,
        sourceText: text
      });
      console.log('[AIStoryGen] location moved to: ' + _aiCurrentLocationLabel + ' (via Story.has)');
      return true;
    }
    if (_applyGenericStreetLocation(raw, text)) return true;
    console.log('[AIStoryGen] LOC marker ignored (not matched): ' + raw);
    return false;
  }

  // Infer location from user choice + AI narrative text when AI didn't emit [LOC]
  function inferLocationFromText(choiceText, aiText) {
    // Always try to detect — allow overriding stale location from previous round
    var text = (choiceText || '') + ' ' + (aiText || '');
    if (_inferPriorityLocationFromText(text)) return true;
    var fallbackTarget = null;
    if (_aiReplaceActive && _aiReplaceTargetPassage) {
      var targetRaw = _normalizePassageName(_aiReplaceTargetPassage || '');
      var targetLabel = cleanLabel(_aiReplaceTargetLabel || '') || _resolveLocationLabel(targetRaw);
      var targetAliases = [];
      for (var ti = 0; ti < _aiCommonLocations.length; ti++) {
        if (_aiCommonLocations[ti].raw === targetRaw || _aiCommonLocations[ti].label === targetLabel) {
          targetAliases = _aiCommonLocations[ti].aliases || [];
          if (!targetLabel) targetLabel = _aiCommonLocations[ti].label;
          break;
        }
      }
      var targetMentioned = (targetRaw && text.indexOf(targetRaw) !== -1) || (targetLabel && text.indexOf(targetLabel) !== -1);
      for (var ta = 0; !targetMentioned && ta < targetAliases.length; ta++) {
        if (targetAliases[ta] && text.indexOf(targetAliases[ta]) !== -1) targetMentioned = true;
      }
      if (targetMentioned) {
        _applyAiLocationCandidate(targetRaw, targetLabel || targetRaw, 'clicked target mention', {
          source: 'clicked-target',
          status: 'arrived',
          sourceText: text
        });
        console.log('[AIStoryGen] location inferred from clicked target: ' + _aiCurrentLocationLabel + ' (' + _aiCurrentLocationPassage + ')');
        return true;
      }
      if (/(\u5230\u8fbe|\u8fdb\u5165|\u8d70\u8fdb|\u6765\u5230|arrive|enter|reach)/i.test(text)) {
        fallbackTarget = { raw: targetRaw, label: targetLabel || targetRaw };
      }
    }
    for (var i = 0; i < _aiAvailableDestinations.length; i++) {
      var d = _aiAvailableDestinations[i];
      if (text.indexOf(d.label) !== -1 || text.indexOf(d.raw) !== -1) {
        _applyAiLocationCandidate(d.raw, d.label, 'text available destination', {
          source: d.source || 'available',
          status: 'arrived',
          sourceText: text
        });
        console.log('[AIStoryGen] location inferred from text: ' + d.label + ' (' + d.raw + ')');
        return true;
      }
      var aliases = d.aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (text.indexOf(aliases[j]) !== -1) {
          _applyAiLocationCandidate(d.raw, d.label, 'text available alias', {
            source: d.source || 'available-alias',
            status: 'arrived',
            sourceText: text
          });
          console.log('[AIStoryGen] location inferred (alias): ' + d.label + ' (' + d.raw + ')');
          return true;
        }
      }
    }
    // Also check common locations table (handles normal mode)
    for (var i = 0; i < _aiCommonLocations.length; i++) {
      var loc = _aiCommonLocations[i];
      if (text.indexOf(loc.label) !== -1 || text.indexOf(loc.raw) !== -1) {
        _applyAiLocationCandidate(loc.raw, loc.label, 'text common location', {
          source: 'common',
          status: 'arrived',
          sourceText: text
        });
        console.log('[AIStoryGen] location inferred (common): ' + loc.label + ' (' + loc.raw + ')');
        return true;
      }
      for (var j = 0; j < (loc.aliases || []).length; j++) {
        if (text.indexOf(loc.aliases[j]) !== -1) {
          _applyAiLocationCandidate(loc.raw, loc.label, 'text common alias', {
            source: 'common-alias',
            status: 'arrived',
            sourceText: text
          });
          console.log('[AIStoryGen] location inferred (common alias): ' + loc.label + ' (' + loc.raw + ')');
          return true;
        }
      }
    }
    if (_applyGenericStreetLocation('', text)) return true;
    if (fallbackTarget && fallbackTarget.raw) {
      _applyAiLocationCandidate(fallbackTarget.raw, fallbackTarget.label, 'fallback target', {
        source: 'fallback-target',
        status: 'arrived',
        sourceText: text
      });
      console.log('[AIStoryGen] location inferred from fallback target: ' + fallbackTarget.label + ' (' + fallbackTarget.raw + ')');
      return true;
    }
    return false;
  }

  // Collect available destinations from passage links + common locations (shared helper)
  function _pushAvailableDestination(raw, label, loc, source) {
    raw = _normalizePassageName(raw || '');
    if (!raw) return;
    if (_isUnsafeDirectPassage(raw)) return;
    loc = loc || _findCommonLocation(raw);
    var graphLoc = _findGraphLocation(raw);
    label = _resolveLocationDisplay(raw, label || (loc && loc.label) || (graphLoc && graphLoc.label)) || raw;
    var aliases = loc && loc.aliases ? loc.aliases : (graphLoc && graphLoc.aliases ? graphLoc.aliases : []);
    source = source || 'unknown';
    for (var di = 0; di < _aiAvailableDestinations.length; di++) {
      if (_aiAvailableDestinations[di].raw === raw) {
        if (!_aiAvailableDestinations[di].label && label) _aiAvailableDestinations[di].label = label;
        if (!_aiAvailableDestinations[di].aliases && aliases.length) _aiAvailableDestinations[di].aliases = aliases;
        if (!_aiAvailableDestinations[di].source || _aiAvailableDestinations[di].source === 'common' || source === 'page' || source === 'graph') {
          _aiAvailableDestinations[di].source = source;
        }
        return;
      }
    }
    _aiAvailableDestinations.push({
      raw: raw,
      label: label || raw,
      aliases: aliases,
      locId: (loc && loc.locId) || (graphLoc && graphLoc.locId) || '',
      source: source
    });
  }

  function _currentGraphPassage() {
    if (_aiLocationArrived && _aiCurrentLocationPassage) return _normalizePassageName(_aiCurrentLocationPassage);
    if (_aiReplaceActive && _aiReplaceTargetPassage) return _normalizePassageName(_aiReplaceTargetPassage);
    try {
      if (typeof State !== 'undefined' && State.passage) return _normalizePassageName(State.passage);
    } catch (_) {}
    return '';
  }

  function _pushGraphExitsFor(raw) {
    var graphLoc = _findGraphLocation(raw);
    if (!graphLoc || !graphLoc.exits || !graphLoc.exits.length) return 0;
    var count = 0;
    for (var i = 0; i < graphLoc.exits.length; i++) {
      var e = graphLoc.exits[i];
      if (!e || !e.passage) continue;
      if (_isUnsafeDirectPassage(e.passage)) continue;
      _pushAvailableDestination(e.passage, e.label || e.passage, null, 'graph');
      count++;
    }
    return count;
  }

  function _collectDestinations($passage) {
    _aiAvailableDestinations = [];
    $passage.find('a[data-passage], .link-internal[data-passage]').each(function () {
      var $a = $(this);
      var raw = _normalizePassageName(($a.attr('data-passage') || '').trim());
      var label = cleanLabel($a.text());
      if (raw && label && !_isGameMenuPassage(raw) && raw.indexOf('AIStoryGen_') !== 0) {
        _pushAvailableDestination(raw, label, null, 'page');
      }
    });
    _pushGraphExitsFor(_currentGraphPassage());
    // Merge common locations (filtered by Story.has existence)
    for (var ci = 0; ci < _aiCommonLocations.length; ci++) {
      var loc = _aiCommonLocations[ci];
      try {
        if (typeof Story !== 'undefined' && Story.has && Story.has(loc.raw)) {
          _pushAvailableDestination(loc.raw, loc.label, loc, 'common');
        }
      } catch (_) {}
    }
  }

  // Build a block listing known places to the AI for LOC instruction
  function buildKnownPlacesBlock() {
    var lines = [];
    var seen = {};
    var currentRaw = _currentGraphPassage();
    var currentNode = _findGraphLocation(currentRaw);
    if (currentNode) {
      lines.push('<current_map>');
      lines.push('current: ' + (currentNode.label || currentNode.passage || currentRaw) + ' -> [LOC: ' + (currentNode.passage || currentRaw) + ']' + (currentNode.locId ? ' (location: ' + currentNode.locId + ')' : ''));
      if (currentNode.exits && currentNode.exits.length) {
        lines.push('adjacent_places:');
        for (var gi = 0; gi < currentNode.exits.length && gi < 16; gi++) {
          var ge = currentNode.exits[gi];
          if (!ge || !ge.passage) continue;
          lines.push('  - ' + (ge.label || ge.passage) + ' -> [LOC: ' + ge.passage + ']' + (ge.via && ge.via.length ? ' via ' + ge.via.join(' / ') : ''));
          seen[ge.passage] = true;
        }
      }
      lines.push('</current_map>');
    }
    lines.push('<known_places>');
    // Add all indexed locations. `raw` is a real playable passage; locId is only a hint.
    for (var i = 0; i < _aiCommonLocations.length; i++) {
      var loc = _aiCommonLocations[i];
      var ok = false;
      try { if (typeof Story !== 'undefined' && Story.has && Story.has(loc.raw)) ok = true; } catch (_) {}
      if (ok && !seen[loc.raw]) {
        seen[loc.raw] = true;
        lines.push('  ' + loc.label + ' -> [LOC: ' + loc.raw + ']' + (loc.locId ? ' (location: ' + loc.locId + ')' : ''));
      }
    }
    // Add captured destinations from the current native page.
    for (var i = 0; i < _aiAvailableDestinations.length; i++) {
      var d = _aiAvailableDestinations[i];
      if (!d.raw || seen[d.raw]) continue;
      seen[d.raw] = true;
      lines.push('  ' + d.label + ' -> [LOC: ' + d.raw + ']' + (d.locId ? ' (location: ' + d.locId + ')' : ''));
    }
    lines.push('</known_places>');
    return lines.join('\n');
  }

  function buildKnownNpcNamesBlock() {
    var list = _getAiNpcNameList();
    var map = _getRuntimeChineseNameMap();
    var lines = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i] || '').trim();
      if (!key || seen[key]) continue;
      var zh = map[key] || map[key.replace(/\s+/g, '')] || '';
      if (!zh || zh === key || !_hasChineseText(zh)) continue;
      seen[key] = true;
      lines.push('  ' + key + ' = ' + zh);
      if (lines.length >= 80) break;
    }
    if (!lines.length) return '';
    return [
      '<npc_name_aliases>',
      'Use these canonical Chinese NPC names exactly. Do not invent alternate translations.',
      lines.join('\n'),
      '</npc_name_aliases>'
    ].join('\n');
  }

  function buildLocationResponseFormatBlock(defaultPassage) {
    var fallback = defaultPassage || (_aiReplaceActive ? _aiReplaceTargetPassage : '') || 'current';
    return [
      '<response_format>',
      'Write normal narrative prose first.',
      'At the very end, append exactly one metadata block on its own lines:',
      '[AI_META]{"location":"' + fallback + '"}[/AI_META]',
      'The location value must be one raw passage id from <known_places>, such as "Bird Tower", "Hospital Foyer", "Farm Work", or "Temple".',
      'Prefer the current or adjacent places listed in <current_map>. Do not jump to an unrelated map unless the story clearly uses transport, abduction, rescue, or another special transition.',
      'Do not use location ids like "tower" or "hospital" when a matching raw passage exists; use the listed raw passage.',
      'Use "current" only if the character did not enter a new known place.',
      'Do not put location decisions in prose only; the game reads this metadata block.',
      '</response_format>'
    ].join('\n');
  }

  function buildAIEventResponseFormatBlock() {
    var nonMoneyStatAllowlist = _formatAiRuntimeNonMoneyStatAllowlist();
    var lines = [
      '<ai_event_format>',
      'After the prose and metadata markers, append exactly one hidden event block. This AI_EVENT block is the authoritative structured result used by the game:',
      '[AI_EVENT]',
      'summary=one concise factual sentence about what actually happened',
      'eventType=scene|travel|conversation|item|state|native_action|combat|other',
      'location=current raw passage or known place name',
      'targetLocation=current if unchanged, otherwise destination raw passage',
      'locationStatus=current|inTransit|arrived. Use arrived only when the player has actually entered that known place; use inTransit when still on the way.',
      'characters=visible named characters only, separated by semicolons',
      'presentCharacters=physically present named characters only, separated by semicolons',
      'presentEntities=physically present animals, creatures, tentacles, or other entities only, separated by semicolons',
      'presentTargets=only characters/entities physically present in the current scene, or empty',
    ];
    lines = lines.concat([
      'memoryTags=主线顺序;地点状态;人物关系;任务线索;剧情物品;未完成目标 as applicable',
      'memoryImportance=0-3 where 0=ignore, 1=normal recent event, 2=important story route/relationship/clue/object/goal, 3=major long-term fact',
      'itemsGained=short concrete inventory item names only, or empty',
      'itemsLost=short concrete inventory item names only when items are consumed, broken, given away, or lost; otherwise empty',
      'moneyChange=signed pence amount such as -8000 or +250, or empty. Use this field only when the prose explicitly states the same exact money amount and the reason for the gain/loss. If the amount is not written in prose, or if you are guessing a challenge reward/cost, leave moneyChange empty.',
      'statChanges=arousal+5;stress-10 etc, or empty. Non-money stats go here. Do not put money in statChanges unless it exactly matches moneyChange for legacy compatibility. Allowed non-money stat keys: ' + nonMoneyStatAllowlist,
      'relationshipChanges=NPCKeyOrVisibleName:love+1,trust+1 etc, or empty. Allowed relationship keys: love,lust,dom,rage,trust. Only use NPCs listed in <state>; never invent names.',
      '[/AI_EVENT]',
      'If you also output legacy [STATS] or [ITEMS] markers, they must match AI_EVENT exactly. Never output conflicting values between prose, markers, and AI_EVENT. Never infer or invent money from words like found, discovered, searched, took, entered, challenge, or reward; money requires an explicit amount in prose and matching moneyChange.',
      'The event block is for the game system. Do not put UI text, buttons, HTML, menus, sidebars, feelings as items, open doors, rooms, scenery, or full sentences in item fields.',
      'If unsure about a structured field, leave it empty or use current. Do not invent presentCharacters, presentEntities, presentTargets, relationshipChanges, or targetLocation.',
      '</ai_event_format>'
    ]);
    return lines.join('\n');
  }

  // Show dynamic "end exploration" button that follows AI's current location
  function _isNativeCombatActive() {
    try {
      var V = getV();
      return !!(V && safeRead(function () { return V.combat; }, 0) === 1);
    } catch (e) {
      return false;
    }
  }

    function _isPublicOptionalModeEnabled() { return false; }

  function _clearOptionalAddonUi() {}

function _isNativeCombatFinishPassage(name) {
    name = String(name || (typeof State !== 'undefined' ? State.passage : '') || '').trim();
    if (!name) return false;
    if (/\b(?:Fight|Combat|Tentacles?)\b.*\bFinish\b/i.test(name)) return true;
    if (/^(?:Forest Tentacles Finish|Wolf Cave Fight(?: Duo)? Finish)$/i.test(name)) return true;
    return false;
  }

  function _isNativeSexOrCombatPassage(name) {
    if (_isNativeCombatActive()) return true;
    name = String(name || (typeof State !== 'undefined' ? State.passage : '') || '').trim();
    if (!name) return false;
    if (_isNativeCombatFinishPassage(name)) return true;
    if (/^(?:Beast addon|Beast Rape|Tentacle addon|Street Tentacle addon|Farm Alex addon|Bed .* addon|Combat|Start Combat|End Combat)$/i.test(name)) return true;
    if (/(?:\bSex\b|\bRape\b|\bCombat\b)/i.test(name) && !/^addon Shop$/i.test(name)) return true;
    return false;
  }

  // Sync the underlying game passage to match AI's current location
  function syncOriginalPassageToCurrentLocation() {
    if (!_aiReplaceActive || !_aiLocationArrived) return;
    var targetPassage = _normalizePassageName(_aiCurrentLocationPassage);
    if (!targetPassage) return;
    if (typeof Engine === 'undefined' || !Engine.play) return;

    console.log('[AIStoryGen] syncing origin passage → ' + targetPassage);
    try {
      // Save current AI overlay DOM before switching
      var $aiWrap = $('#passages .passage .ai-replaced-content');
      var aiHTML = $aiWrap.length ? $aiWrap.html() : '';
      var $choicesPanels = $('#passages .ai-choices, #passages .ai-choices-end').detach();

      // Set resync flag so :passagedisplay hook knows to re-overlay
      _aiResyncTarget = targetPassage;
      _aiResyncAIHTML = aiHTML;
      if (_isUnsafeDirectPassage(targetPassage)) {
        _warnUnsafeDirectPassage(targetPassage);
        return;
      }
      if (_triggerOriginalLinkToPassage(targetPassage, 'sync original passage')) return;
      Engine.play(targetPassage);
    } catch (e) {
      console.warn('[AIStoryGen] sync failed', e);
    }
  }
  var _aiResyncTarget = '';
  var _aiResyncAIHTML = '';

  // -- AI navigation history: persist AI replace state across backward/forward --
  // _aiNavHistory: passage-level save for cross-passage restore
  // _aiRoundHistory: AI-internal backward stack (each entry = one AI narrative round)
  // _aiForwardStack: AI-internal forward stack
  var _aiNavHistory = {};
  var _aiRoundHistory = [];
  var _aiForwardStack = [];
  var _pendingAISaveState = null;
  var _suppressAISaveRestoreUntil = 0;

  function _isAISaveRestoreSuppressed() {
    var now = Date.now();
    if (_suppressAISaveRestoreUntil && now < _suppressAISaveRestoreUntil) return true;
    try {
      var sessionUntil = Number(sessionStorage.getItem('AIStoryGenSuppressRestoreUntil') || 0);
      if (sessionUntil && now < sessionUntil) return true;
      if (sessionUntil) sessionStorage.removeItem('AIStoryGenSuppressRestoreUntil');
    } catch (_) {}
    try {
      var V = _getStateVariables();
      var stateUntil = Number(V && V.aiStoryGenSuppressRestoreUntil || 0);
      if (stateUntil && now < stateUntil) return true;
      if (stateUntil && V) delete V.aiStoryGenSuppressRestoreUntil;
    } catch (_) {}
    return false;
  }

  function _clearAISaveNavigationState(reason, opts) {
    opts = opts || {};
    _pendingAISaveState = null;
    _aiNavHistory = {};
    _aiResyncTarget = '';
    _aiResyncAIHTML = '';
    if (!opts.preserveRoundHistory) _clearAiRoundHistory();
    _markAISaveRestoreSuppressed(2500);

    function clearVars(vars) {
      if (!vars || typeof vars !== 'object') return;
      delete vars.aiStoryGenNavState;
      delete vars.aiStoryGenSaveTitle;
      _patchAIStoryGenStateField(vars, 'scene', null);
      vars.aiStoryGenSuppressRestoreUntil = _suppressAISaveRestoreUntil;
    }

    try { clearVars(_getStateVariables()); } catch (_) {}
    try { if (typeof State !== 'undefined' && State.active && State.active.variables) clearVars(State.active.variables); } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        clearVars(State.history[State.activeIndex].variables);
      }
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        clearVars(State._history[State.activeIndex].variables);
      }
    } catch (_) {}
      try { console.log('[AIStoryGen] cleared AI navigation save state: ' + (reason || 'exit AI')); } catch (_) {}
  }

  function _restoreOriginalFromNormalAIOverlay(reason) {
    try {
      var $passage = $('#passages .passage');
      if (!$passage.length) return false;
      var changed = false;
      if (_aiNarrativeWrap && _aiNarrativeWrap.parentNode) {
        _aiNarrativeWrap.parentNode.removeChild(_aiNarrativeWrap);
        changed = true;
      }
      _aiNarrativeWrap = null;
      var $origWrap = $passage.find('.ai-original-wrap');
      if ($origWrap.length) {
        $origWrap.replaceWith($origWrap.contents());
        changed = true;
      }
      if (changed) {
        _suppressAutoChoices(reason || 'restore original page', 5000);
        $('#passages .ai-choices, #passages .ai-choices-end').remove();
        $passage.find('.ai-injected-row, .ai-injected-link').remove();
        _clearAiRoundHistory();
        _clearAISaveNavigationState(reason || 'restore original page');
        setTimeout(function () { injectAILinkClones(); }, 50);
      }
      return changed;
    } catch (e) {
      try { console.warn('[AIStoryGen] restore original from normal AI overlay failed', e); } catch (_) {}
      return false;
    }
  }

  function _markAISaveRestoreSuppressed(ms) {
    _suppressAISaveRestoreUntil = Date.now() + (ms || 2500);
    try { sessionStorage.setItem('AIStoryGenSuppressRestoreUntil', String(_suppressAISaveRestoreUntil)); } catch (_) {}
    try { console.log('[AIStoryGen] suppress restore until ' + _suppressAISaveRestoreUntil); } catch (_) {}
  }

  var _aiSnapshotKeys = [
    'hour', 'minute', 'day', 'weekday', 'month', 'year',
    'arousal', 'stress', 'pain', 'trauma', 'awareness', 'lewdity',
    'tiredness', 'fatigue', 'control', 'drunk', 'drugged', 'hallucinogen',
    'money', 'purity', 'beauty', 'charm', 'lust',
    'aiStoryGenItems',
    'skulduggery', 'danceskill', 'swimmingskill', 'athletics', 'tending', 'housekeeping',
    'seductionskill', 'oralskill', 'vaginalskill', 'analskill', 'handskill', 'feetskill',
    'penileskill', 'chestskill', 'thighskill', 'bottomskill',
    'science', 'maths', 'english', 'history'
  ];

  function _cloneForAiSnapshot(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function _captureGameSnapshot() {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V) return null;
    var snap = {};
    _aiSnapshotKeys.forEach(function (key) {
      if (V[key] !== undefined) snap[key] = _cloneForAiSnapshot(V[key]);
    });
    snap.__aiNpcRelations = _captureAiNpcRelationSnapshot();
    return snap;
  }

  function _captureAiNpcRelationSnapshot() {
    var schema = _getAiNpcRelationSchema();
    var fields = Object.keys(schema);
    var root = _getAiNpcRoot();
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    var snap = {};
    _getAiNpcNameList().forEach(function (name) {
      var row = {};
      var hasAny = false;
      var cNpc = root && root[name];
      var vNpc = V && V[name];
      fields.forEach(function (field) {
        row[field] = {};
        if (cNpc && cNpc[field] !== undefined) {
          row[field].c = _cloneForAiSnapshot(cNpc[field]);
          hasAny = true;
        }
        if (vNpc && vNpc[field] !== undefined) {
          row[field].v = _cloneForAiSnapshot(vNpc[field]);
          hasAny = true;
        }
      });
      if (hasAny) snap[name] = row;
    });
    return snap;
  }

  function _restoreAiNpcRelationSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    var root = _getAiNpcRoot();
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    Object.keys(snap).forEach(function (name) {
      var row = snap[name] || {};
      Object.keys(row).forEach(function (field) {
        var value = row[field] || {};
        if (root && root[name] && Object.prototype.hasOwnProperty.call(value, 'c')) root[name][field] = _cloneForAiSnapshot(value.c);
        if (V && V[name] && Object.prototype.hasOwnProperty.call(value, 'v')) V[name][field] = _cloneForAiSnapshot(value.v);
      });
    });
  }

  function _refreshGameVisualState() {
    try {
      var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
      if (V && V.hour != null && V.minute != null) {
        var timeStr = String(V.hour).padStart(2, '0') + ':' + String(V.minute).padStart(2, '0');
        $('#stats .centered-elements, #storyCaptionContent .centered-elements').each(function () {
          $(this).contents().filter(function () {
            return this.nodeType === 3 && /\d{1,2}:\d{2}/.test(this.textContent);
          }).each(function () {
            this.textContent = this.textContent.replace(/\d{1,2}:\d{2}/, timeStr);
          });
        });
      }
      if (V && V.money != null) {
        var moneyStr = '£' + Number(V.money || 0).toLocaleString('en-GB');
        $('#stats, #ui-bar, #ui-bar-body, #storyCaption, #storyCaptionContent, #sidebardescription').each(function () {
          $(this).contents().filter(function () {
            return this.nodeType === 3 && /£\s*[\d,]+(?:\.\d+)?/.test(this.textContent);
          }).each(function () {
            this.textContent = this.textContent.replace(/£\s*[\d,]+(?:\.\d+)?/, moneyStr);
          });
          $(this).find('*').contents().filter(function () {
            return this.nodeType === 3 && /£\s*[\d,]+(?:\.\d+)?/.test(this.textContent);
          }).each(function () {
            this.textContent = this.textContent.replace(/£\s*[\d,]+(?:\.\d+)?/, moneyStr);
          });
        });
        var statsEl = document.getElementById('stats');
        if (statsEl && /£\s*[\d,]+(?:\.\d+)?/.test(statsEl.textContent || '')) {
          statsEl.childNodes.forEach(function (node) {
            if (node.nodeType === 3 && /£\s*[\d,]+(?:\.\d+)?/.test(node.textContent)) {
              node.textContent = node.textContent.replace(/£\s*[\d,]+(?:\.\d+)?/, moneyStr);
            }
          });
        }
      }
    } catch (_) {}
    try {
      var captionIds = ['paincaption','arousalcaption','tirednesscaption','stresscaption','traumacaption','controlcaption','allurecaption','druggedcaption'];
      captionIds.forEach(function (cid) {
        var el = document.getElementById(cid);
        if (el && typeof Wikifier !== 'undefined') {
          try {
            var tmp = document.createElement('span');
            new Wikifier(tmp, '<<' + cid + '>>');
            el.innerHTML = tmp.innerHTML;
          } catch (_) {}
        }
      });
    } catch (_) {}
    try {
      if (typeof window.Dynamic !== 'undefined' && window.Dynamic.render) window.Dynamic.render();
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && State.temporary) State.temporary().forcerender = true;
    } catch (_) {}
  }

  function _restoreGameSnapshot(snap) {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V || !snap) return;
    Object.keys(snap).forEach(function (key) {
      if (key === '__aiNpcRelations') return;
      V[key] = _cloneForAiSnapshot(snap[key]);
    });
    _restoreAiNpcRelationSnapshot(snap.__aiNpcRelations);
    try {
      if (Object.prototype.hasOwnProperty.call(snap, 'aiStoryGenItems')) {
        _persistAiItemStore();
        _renderAiItemsInLog();
      }
    } catch (_) {}
    _refreshGameVisualState();
    console.log('[AIStoryGen] restored game snapshot for AI round');
  }

  function _captureAiLocationRuntimeState() {
    return {
      currentLocationLabel: _aiCurrentLocationLabel || '',
      currentLocationPassage: _aiCurrentLocationPassage || '',
      locationArrived: !!_aiLocationArrived,
      availableDestinations: _cloneForAiSnapshot(_aiAvailableDestinations || []),
      lastLocationDecision: _cloneForAiSnapshot(_aiLastLocationDecision || null),
      replaceTargetLabel: _aiReplaceTargetLabel || '',
      replaceTargetPassage: _aiReplaceTargetPassage || '',
      replaceOriginalLinkId: _aiReplaceOriginalLinkId || '',
      replaceOriginalEventMode: !!_aiReplaceOriginalEventMode,
      lastChoiceText: _lastChoiceText || ''
    };
  }

  function _restoreAiLocationRuntimeState(loc) {
    loc = loc || {};
    _aiCurrentLocationLabel = String(loc.currentLocationLabel || '');
    _aiCurrentLocationPassage = _normalizePassageName(loc.currentLocationPassage || '');
    _aiLocationArrived = !!loc.locationArrived;
    _aiAvailableDestinations = _cloneForAiSnapshot(loc.availableDestinations || []);
    _aiLastLocationDecision = _cloneForAiSnapshot(loc.lastLocationDecision || null);
    _aiReplaceTargetLabel = String(loc.replaceTargetLabel || '');
    _aiReplaceTargetPassage = _normalizePassageName(loc.replaceTargetPassage || '');
    _aiReplaceOriginalLinkId = String(loc.replaceOriginalLinkId || '');
    _aiReplaceOriginalEventMode = !!loc.replaceOriginalEventMode;
    _lastChoiceText = String(loc.lastChoiceText || '');
  }

  function _captureAIRuntimeSnapshot() {
    return {
      game: _captureGameSnapshot(),
      memory: _snapshotMemoryForSave(),
      pickupCandidates: _cloneForAiSnapshot(_aiPickupCandidates || {}),
      pendingItemUses: _cloneForAiSnapshot(_pendingAiItemUses || []),
      location: _captureAiLocationRuntimeState()
    };
  }

  function _restoreAIRuntimeSnapshot(snap, opts) {
    opts = opts || {};
    if (!snap) return;
    try { _restoreGameSnapshot(snap.game); } catch (_) {}
    try { _replaceMemoryFromSave(snap.memory || {}); } catch (_) {}
    try { _aiPickupCandidates = _cloneForAiSnapshot(snap.pickupCandidates || {}); } catch (_) {}
    try { _pendingAiItemUses = _cloneForAiSnapshot(snap.pendingItemUses || []); } catch (_) {}
    try { _restoreAiLocationRuntimeState(snap.location || {}); } catch (_) {}
    if (opts.syncMemory) {
      try { _syncMemoryToCurrentSave('transaction-rollback'); } catch (_) {}
    }
  }

  function _restoreAiRoundStackSnapshot(history, forward) {
    try {
      _aiRoundHistory.length = 0;
      (Array.isArray(history) ? history : []).forEach(function (entry) {
        var cloned = _cloneAiRoundEntryForSave(entry);
        if (cloned) _aiRoundHistory.push(cloned);
      });
      _aiForwardStack.length = 0;
      (Array.isArray(forward) ? forward : []).forEach(function (entry) {
        var cloned = _cloneAiRoundEntryForSave(entry);
        if (cloned) _aiForwardStack.push(cloned);
      });
    } catch (_) {}
  }

  function _cloneAiRoundEntryForSave(entry) {
    if (!entry || !entry.aiHTML) return null;
    return {
      aiHTML: String(entry.aiHTML || ''),
      roundCount: Number(entry.roundCount || 0),
      mode: entry.mode === 'normal' ? 'normal' : 'replace',
      gameSnapshot: _cloneForAiSnapshot(entry.gameSnapshot || null),
      pickupCandidates: _cloneForAiSnapshot(entry.pickupCandidates || {})
    };
  }

  function _cloneAiRoundStackForSave(stack) {
    if (!Array.isArray(stack) || !stack.length) return [];
    var out = [];
    var start = Math.max(0, stack.length - 20);
    for (var i = start; i < stack.length; i++) {
      var entry = _cloneAiRoundEntryForSave(stack[i]);
      if (entry) out.push(entry);
    }
    return out;
  }

  function _restoreAiRoundStacksFromSaved(saved) {
    if (!saved || typeof saved !== 'object') return false;
    var history = Array.isArray(saved.roundHistory) ? saved.roundHistory : [];
    var forward = Array.isArray(saved.forwardStack) ? saved.forwardStack : [];
    _aiRoundHistory.length = 0;
    _aiForwardStack.length = 0;
    history.forEach(function (entry) {
      var cloned = _cloneAiRoundEntryForSave(entry);
      if (cloned) _aiRoundHistory.push(cloned);
    });
    forward.forEach(function (entry) {
      var cloned = _cloneAiRoundEntryForSave(entry);
      if (cloned) _aiForwardStack.push(cloned);
    });
    return !!(_aiRoundHistory.length || _aiForwardStack.length);
  }

  function _hydrateAiRoundHistoryFromSave() {
    if (_aiRoundHistory.length || _aiForwardStack.length) return false;
    try {
      var saved = _pendingAISaveState || _getAISaveStateFromCurrentVariables();
      if (!saved) return false;
      return _restoreAiRoundStacksFromSaved(saved);
    } catch (_) {
      return false;
    }
  }

  function _captureAISaveStateForSave() {
    try {
      if (_isAISaveRestoreSuppressed()) return null;
      var passageName = (typeof State !== 'undefined' && State.passage) || _currentPassageName();
      var mode = '';
      var aiHTML = '';
      if (_aiReplaceActive) {
        mode = 'replace';
        var $replaceWrap = $('#passages .passage .ai-replaced-content');
        aiHTML = $replaceWrap.length ? $replaceWrap.html() : (_aiReplaceSessionHTML || '');
        passageName = _aiReplaceOriginPassage || passageName;
      } else {
        var $normalWrap = $('#passages .passage .ai-narrative-wrap');
        if ($normalWrap.length) {
          mode = 'normal';
          aiHTML = $normalWrap.html() || '';
        }
      }
      if (!mode || !aiHTML) return null;
      return {
        mode: mode,
        passage: passageName || '',
        aiHTML: aiHTML,
        targetLabel: _aiReplaceTargetLabel || '',
        targetPassage: _aiReplaceTargetPassage || '',
        originalLinkId: _aiReplaceOriginalLinkId || '',
        originalEventMode: !!_aiReplaceOriginalEventMode,
        roundCount: _aiReplaceRoundCount || 0,
        currentLocationLabel: _aiCurrentLocationLabel || '',
        currentLocationPassage: _aiCurrentLocationPassage || '',
        locationArrived: !!_aiLocationArrived,
        replaceSessionHTML: _aiReplaceSessionHTML || '',
        roundHistory: _cloneAiRoundStackForSave(_aiRoundHistory),
        forwardStack: _cloneAiRoundStackForSave(_aiForwardStack),
        savedAt: Date.now()
      };
    } catch (e) {
      try { console.warn('[AIStoryGen] capture AI save state failed', e); } catch (_) {}
      return null;
    }
  }

  function _writeAISaveStateToVariables(vars, navState) {
    if (!vars || typeof vars !== 'object') return;
    if (navState) vars.aiStoryGenNavState = _cloneForAiSnapshot(navState);
    else delete vars.aiStoryGenNavState;
    _patchAIStoryGenStateField(vars, 'scene', navState || null);
  }

  function _syncAISaveStateToCurrentSave() {
    if (_isAISaveRestoreSuppressed()) {
      var clearV = _getStateVariables();
      if (clearV) _writeAISaveStateToVariables(clearV, null);
      try { if (typeof State !== 'undefined' && State.active && State.active.variables) _writeAISaveStateToVariables(State.active.variables, null); } catch (_) {}
      return null;
    }
    var navState = _captureAISaveStateForSave();
    var V = _getStateVariables();
    if (V) _writeAISaveStateToVariables(V, navState);
    try { if (typeof State !== 'undefined' && State.active && State.active.variables) _writeAISaveStateToVariables(State.active.variables, navState); } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        _writeAISaveStateToVariables(State.history[State.activeIndex].variables, navState);
      }
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        _writeAISaveStateToVariables(State._history[State.activeIndex].variables, navState);
      }
    } catch (_) {}
    return navState;
  }

  function _replaceAISaveStateFromSave(navState) {
    if (navState && typeof navState === 'object' && navState.aiHTML && navState.passage) {
      if (/^Prison\b/i.test(String(navState.passage || ''))) {
        _pendingAISaveState = null;
        return;
      }
      _pendingAISaveState = _cloneForAiSnapshot(navState);
      setTimeout(function () {
        var currentPassage = (typeof State !== 'undefined' && State.passage) || _currentPassageName();
        if (_isNativeSexOrCombatPassage(currentPassage)) {
          _pendingAISaveState = null;
          return;
        }
        _restoreAISaveStateIfNeeded(currentPassage);
      }, 300);
    } else {
      _pendingAISaveState = null;
    }
  }

  function _syncAIStateBeforePossibleSave() {
    try {
      _installAISaveRuntimeHooks();
      _bindMemoryToCurrentStateIfNeeded();
      _syncAIStoryGenStateToCurrentSave('pre-save');
      _syncAISaveTitleToCurrentState();
      _persistAiItemStore();
    } catch (e) {
      try { console.warn('[AIStoryGen] pre-save sync failed', e); } catch (_) {}
    }
  }

  function _getAISaveStateFromCurrentVariables() {
    try {
      var V = _getStateVariables();
      var nav = V && V.aiStoryGenNavState;
      if (nav && typeof nav === 'object' && nav.aiHTML && nav.passage) return nav;
    } catch (_) {}
    try {
      if (typeof State !== 'undefined' && State.active && State.active.variables) {
        var activeNav = State.active.variables.aiStoryGenNavState;
        if (activeNav && typeof activeNav === 'object' && activeNav.aiHTML && activeNav.passage) return activeNav;
      }
    } catch (_) {}
    return null;
  }

  function _restoreAISaveStateIfNeeded(passageName) {
    try {
      if (_isAISaveRestoreSuppressed()) {
        _pendingAISaveState = null;
        return false;
      }
      var saved = _pendingAISaveState || _getAISaveStateFromCurrentVariables();
      if (!saved || !saved.aiHTML) return false;
      if (/^Prison\b/i.test(String(saved.passage || ''))) {
        _pendingAISaveState = null;
        _clearUnsafePrisonAiState();
        return false;
      }
      if (_isNativeSexOrCombatPassage(passageName)) {
        _pendingAISaveState = null;
        return false;
      }
      if (saved.passage && passageName && saved.passage !== passageName && _isStartOrMainMenuPassage(passageName)) return false;
      if (saved.passage && passageName && saved.passage !== passageName) {
        try { console.warn('[AIStoryGen] restoring AI save state across passage mismatch saved="' + saved.passage + '" current="' + passageName + '"'); } catch (_) {}
      }
      var $passage = $('#passages .passage');
      if (!$passage.length) return false;

      $passage.find('.ai-replaced-content, .ai-narrative-wrap').remove();
      var $existingOriginal = $passage.find('.ai-original-wrap');
      if ($existingOriginal.length) $existingOriginal.replaceWith($existingOriginal.contents());
      $('#passages .ai-choices, #passages .ai-choices-end').remove();

      var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
      _hidePassageOriginalContent($passage);
      if ($overlayKeep.length) $passage.append($overlayKeep);

      if (saved.mode === 'normal') {
        _aiReplaceActive = false;
        _aiNarrativeWrap = document.createElement('div');
        _aiNarrativeWrap.className = 'ai-narrative-wrap';
        _aiNarrativeWrap.innerHTML = saved.aiHTML;
        $passage[0].appendChild(_aiNarrativeWrap);
      } else {
        _aiReplaceActive = true;
        _aiReplaceOriginPassage = saved.passage || passageName || '';
        _aiReplaceTargetLabel = saved.targetLabel || '';
        _aiReplaceTargetPassage = _normalizePassageName(saved.targetPassage || '');
        _aiReplaceOriginalLinkId = saved.originalLinkId || '';
        _aiReplaceOriginalEventMode = !!saved.originalEventMode;
        _aiReplaceRoundCount = Number(saved.roundCount || 0);
        if (saved.currentLocationPassage) {
          _setAiLocationState(saved.currentLocationPassage, saved.currentLocationLabel || '', 'restore saved AI location', { arrived: !!saved.locationArrived });
        } else if (saved.currentLocationLabel) {
          _setAiLocationLabelOnly(saved.currentLocationLabel, 'restore saved AI location label', { arrived: !!saved.locationArrived });
        } else {
          _clearAiLocationState('restore saved AI location empty');
        }
        _aiReplaceSessionHTML = saved.replaceSessionHTML || saved.aiHTML || '';
        var $aiWrap = $('<div class="ai-replaced-content"></div>').html(saved.aiHTML);
        $passage.append($aiWrap);
        _repairStaleEventModeUI($aiWrap);
        _refreshOriginalEventModeFromLink();
      }
      _restoreAiRoundStacksFromSaved(saved);

      _pendingAISaveState = null;
      setTimeout(function () { injectAILinkClones(); }, 50);
      autoInjectChoices(passageName || saved.passage || '');
      console.log('[AIStoryGen] restored AI save state for passage="' + (passageName || saved.passage || '') + '"');
      return true;
    } catch (e) {
      console.warn('[AIStoryGen] restore AI save state failed', e);
      return false;
    }
  }

  // -- Narrative cache: { location_hour_dangerLevel: { text, time } } --
  var _narrativeCache = {};

  function getCachedNarrative(key, cfg) {
    var ttl = (cfg.cacheTTLMinutes || 5) * 60 * 1000;
    var entry = _narrativeCache[key];
    if (entry && (Date.now() - entry.time) < ttl) {
      return entry.text;
    }
    delete _narrativeCache[key];
    return null;
  }

  function setCachedNarrative(key, text) {
    _narrativeCache[key] = { text: text, time: Date.now() };
    // Limit cache size
    var keys = Object.keys(_narrativeCache);
    while (keys.length > 30) { delete _narrativeCache[keys[0]]; keys.shift(); }
  }

  function _getMaxRounds() {
    return DEFAULT_REPLACE_MAX_ROUNDS;
  }

  function restoreOriginalPassage() {
    if (!_aiReplaceActive) return;
    var $passage = $('#passages .passage');
    if ($passage.length) {
      // Remove AI overlay content
      $passage.find('.ai-replaced-content').remove();
      // Unwrap original content (restore visibility) — use replaceWith to preserve text nodes
      var $owRestore = $passage.find('.ai-original-wrap');
      if ($owRestore.length) $owRestore.replaceWith($owRestore.contents());
    }
    _aiReplaceActive = false;
    _aiReplaceOriginPassage = '';
    _aiReplaceOriginalLinkId = '';
    _aiReplaceOriginalEventMode = false;
    _aiReplaceSessionHTML = '';
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    _clearAISaveNavigationState('restore original passage');
    _suppressAutoChoices('restore original passage', 5000);
    // Re-inject fresh AI link clones with working handlers
    setTimeout(function () { injectAILinkClones(); }, 50);
  }
  window.AIStoryGen.restoreOriginalPassage = restoreOriginalPassage;

  function _triggerOriginalAiLink() {
    var id = String(_aiReplaceOriginalLinkId || '').trim();
    if (!id) return false;
    var el = null;
    try {
      el = $('[data-ai-origid]').filter(function () {
        return String($(this).attr('data-ai-origid') || '') === id && !$(this).hasClass('ai-injected-link');
      }).get(0) || null;
    } catch (_) {}
    if (!el) return false;
    try {
      console.log('[AIStoryGen] finishing AI by triggering original link: ' + id);
      el.click();
      return true;
    } catch (e) {
      console.warn('[AIStoryGen] original link trigger failed', e);
      return false;
    }
  }

  function _triggerOriginalLinkToPassage(targetPassage, reason) {
    var dest = _normalizePassageName(targetPassage || '');
    if (!dest) return false;
    var el = null;
    try {
      $('#passages .passage a[data-passage]').each(function () {
        if (el) return;
        var $a = $(this);
        if ($a.closest('.ai-narrative-section,.ai-choices,.ai-choices-end,.ai-injected-row,.ai-item-use-panel,.ai-memory-inline,.ai-pixel-panel,.ai-pixelgen-panel').length) return;
        var passage = _normalizePassageName($a.attr('data-passage') || '');
        if (passage === dest) el = this;
      });
    } catch (_) {}
    if (!el) return false;
    try {
      console.log('[AIStoryGen] finishing AI by triggering native passage link: ' + dest + (reason ? ' (' + reason + ')' : ''));
      el.click();
      return true;
    } catch (e) {
      console.warn('[AIStoryGen] native passage link trigger failed', e);
      return false;
    }
  }

  function _canDirectPlayPassage(targetPassage) {
    var dest = _normalizePassageName(targetPassage || '');
    if (!dest || _isUnsafeDirectPassage(dest)) return false;
    try {
      if (typeof Story !== 'undefined' && Story.has && !Story.has(dest)) return false;
    } catch (_) {}
    return true;
  }

  function _navigateToNativePassage(targetPassage, opts) {
    opts = opts || {};
    var dest = _normalizePassageName(targetPassage || '');
    if (!dest) return false;
    var reason = opts.reason || 'AI native navigation';
    if (_isUnsafeDirectPassage(dest)) {
      _warnUnsafeDirectPassage(dest);
      return false;
    }
    if (opts.preferOriginalAiLink && _triggerOriginalAiLink()) {
      return true;
    }
    if (_triggerOriginalLinkToPassage(dest, reason)) {
      return true;
    }
    if (opts.allowDirect === false || !_canDirectPlayPassage(dest)) {
      return false;
    }
    if (typeof Engine !== 'undefined' && Engine.play) {
      _markAISaveRestoreSuppressed(opts.suppressMs || 2500);
      try { console.log('[AIStoryGen] native navigation via Engine.play: ' + dest + (reason ? ' (' + reason + ')' : '')); } catch (_) {}
      Engine.play(dest);
      return true;
    }
    return false;
  }

  function _isUnsafeDirectPassage(targetPassage) {
    var dest = _normalizePassageName(targetPassage || '');
    if (!dest) return false;
    if (/^(Moor|Bog)$/i.test(dest)) return true;
    // Prison passages are event-chain internals. They require original prison
    // variables to be initialised first, so direct AI/manual arrival can crash
    // widgets such as <<prison_end>> with an undefined $prison object.
    if (/^Prison\b/i.test(dest)) return true;
    return false;
  }

  function _warnUnsafeDirectPassage(targetPassage) {
    var cfg = loadCfg();
    var label = _resolveLocationLabel(targetPassage) || targetPassage;
    _showAIUserMessage(cfg.language === 'zh'
      ? ('\u672a\u76f4\u63a5\u8df3\u8f6c\u5230\u300c' + label + '\u300d\uff1a\u8fd9\u4e2a\u5730\u70b9\u5c5e\u4e8e\u539f\u7248\u4e8b\u4ef6\u94fe\uff0c\u9700\u8981\u901a\u8fc7\u5f53\u524d\u9875\u9762\u7684\u539f\u7248\u5165\u53e3\u8fdb\u5165\uff0c\u907f\u514d\u7ed5\u8fc7\u524d\u7f6e\u6570\u636e\u5bfc\u81f4\u62a5\u9519\u3002')
      : ('Did not jump directly to "' + label + '": this passage belongs to a native event chain and must be entered through a native link to avoid missing setup data.'), true);
    return;
    _showAIUserMessage(cfg.language === 'zh'
      ? ('未直接跳转到「' + label + '」：这个地点会生成原版事件/NPC，需要通过当前页面的原版入口进入，避免侧边栏 NPC 脱离控制错误。')
      : ('Did not jump directly to "' + label + '": this location creates native events/NPCs and must be entered through a native link to avoid NPC state errors.'), true);
  }

  function _removeStaleMoorErrorDom() {
    try {
      $('#storyCaptionContent span.red, #story-caption span.red, #ui-bar span.red').filter(function () {
        return /Moor|流程中生成的NPC|脱离控制|Vrelnir/i.test($(this).text() || '');
      }).remove();
      $('.error-reporter-btn').each(function () {
        try {
          if (!window.Errors || !Errors.log || !Errors.log.length) $(this).hide();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function _removeMalformedAIEventDom() {
    try {
      var badErrorRe = /Error evaluating = sigil|scene is not defined|Forest is not defined|current is not defined/i;
      var repaired = false;
      $('#passages .error-view, #passages .macro-error, #passages .error, #passages tw-error, #passages .red').filter(function () {
        return badErrorRe.test(String($(this).text() || ''));
      }).each(function () {
        repaired = true;
        $(this).remove();
      });
      $('#passages .ai-narrative-section, #passages .ai-story-choice-result, #passages .ai-generated-story').each(function () {
        var $section = $(this);
        var text = String($section.text() || '');
        if (!/\[(?:AI_EVENT|AI_META|LOC:)/i.test(text) && !badErrorRe.test(text)) return;
        var cleaned = _stripAIMetadataMarkers(text)
          .replace(/\b(?:summary|eventType|location|targetLocation|locationStatus|characters|presentCharacters|presentEntities|presentTargets|presentTargets|memoryTags|memoryImportance|itemsGained|itemsLost|statChanges)\s*=?\s*[^。\n]*(?=\s+(?:summary|eventType|location|targetLocation|locationStatus|characters|presentCharacters|presentEntities|presentTargets|presentTargets|memoryTags|memoryImportance|itemsGained|itemsLost|statChanges)\s*=|$)/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned && cleaned !== text) {
          var $keep = $section.children('.ai-narrative-toolbar, .ai-pickup-line, .ai-stats-line').detach();
          repaired = true;
          $section.text(cleaned);
          if ($keep.length) $section.append($keep);
        }
      });
      if (repaired) {
        _clearAiLocationState('repair malformed AI event UI');
      }
    } catch (_) {}
  }

  function _clearStaleMoorEventQueue(reason) {
    try {
      if (typeof State === 'undefined' || !State.variables) return false;
      var current = String(State.passage || '').trim();
      if (/^(Moor|Bog)$/i.test(current)) return false;
      var V = State.variables;
      var ev = V.event;
      if (!ev || !Array.isArray(ev.buffer)) return false;
      var before = ev.buffer.length;
      ev.buffer = ev.buffer.filter(function (entry) {
        var area = entry && entry.area;
        if (!Array.isArray(area)) return true;
        var joined = area.join('|');
        return !(/^Moor$/i.test(String(area[0] || '')) && /eventsmoorlow|beastNEWinit/i.test(joined));
      });
      if (ev.buffer.length === before) return false;
      _removeStaleMoorErrorDom();
      try { console.log('[AIStoryGen] cleared stale Moor event queue after AI direct navigation' + (reason ? ': ' + reason : '')); } catch (_) {}
      setTimeout(function () {
        _removeStaleMoorErrorDom();
        try {
          if (typeof UIBar !== 'undefined' && UIBar.update) UIBar.update();
          if (typeof Engine !== 'undefined' && Engine.show) Engine.show();
        } catch (_) {}
        setTimeout(_removeStaleMoorErrorDom, 50);
      }, 0);
      return true;
    } catch (e) {
      try { console.warn('[AIStoryGen] stale Moor event cleanup failed', e); } catch (_) {}
      return false;
    }
  }

  function _finishAiReplaceAndGo(targetPassage, opts) {
    opts = opts || {};
    var dest = _normalizePassageName(targetPassage || _aiCurrentLocationPassage || _aiReplaceTargetPassage || '');
    if (!dest) {
      restoreOriginalPassage();
      return;
    }
    var $passage = $('#passages .passage');
    if ($passage.length) {
      $passage.find('.ai-replaced-content').remove();
      var $ow = $passage.find('.ai-original-wrap');
      if ($ow.length) $ow.replaceWith($ow.contents());
    }
    _aiReplaceActive = false;
    _aiReplaceOriginPassage = '';
    _aiReplaceTargetLabel = '';
    _aiReplaceTargetPassage = '';
    _aiReplaceOriginalEventMode = false;
    _clearAiLocationState('finish AI replace');
    _aiReplaceSessionHTML = '';
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    _clearAISaveNavigationState('finish AI replace to ' + dest, { preserveRoundHistory: !!opts.preserveRoundHistory });
    var didNavigate = _navigateToNativePassage(dest, {
      preferOriginalAiLink: !opts.skipOriginal,
      reason: opts.skipOriginal ? 'arrive/manual correction' : 'finish AI replace'
    });
    _aiReplaceOriginalLinkId = '';
    _aiReplaceOriginalEventMode = false;
    if (!didNavigate) {
      try { console.warn('[AIStoryGen] finish AI replace could not navigate to: ' + dest); } catch (_) {}
    }
  }

  function _finishNormalAiAndGo(targetPassage, opts) {
    opts = opts || {};
    var dest = _normalizePassageName(targetPassage || _aiCurrentLocationPassage || '');
    if (!dest) return false;
    var $passage = $('#passages .passage');
    if (_aiNarrativeWrap && _aiNarrativeWrap.parentNode) {
      _aiNarrativeWrap.parentNode.removeChild(_aiNarrativeWrap);
      _aiNarrativeWrap = null;
    }
    if ($passage.length) {
      $passage.find('.ai-narrative-wrap').remove();
      var $ow = $passage.find('.ai-original-wrap');
      if ($ow.length) $ow.replaceWith($ow.contents());
    }
    _clearAiLocationState('finish normal AI');
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    _clearAISaveNavigationState('finish normal AI to ' + dest, { preserveRoundHistory: !!opts.preserveRoundHistory });
    return _navigateToNativePassage(dest, { reason: 'normal AI finish' });
  }

  // -- AI round-level navigation: push/pop within a single AI session --

  function _captureCurrentAiRound() {
    if (_aiReplaceActive) {
      var $aiWrap = $('#passages .passage .ai-replaced-content');
      if (!$aiWrap.length) return null;
      var html = $aiWrap.html();
      if (!html || !html.trim()) return null;
      return { aiHTML: html, roundCount: _aiReplaceRoundCount, mode: 'replace', gameSnapshot: _captureGameSnapshot(), pickupCandidates: _cloneForAiSnapshot(_aiPickupCandidates || {}) };
    }
    var normalWrap = (_aiNarrativeWrap && _aiNarrativeWrap.parentNode) ? _aiNarrativeWrap : null;
    if (!normalWrap) {
      normalWrap = $('#passages .passage .ai-narrative-wrap').get(0) || null;
      if (normalWrap) _aiNarrativeWrap = normalWrap;
    }
    if (normalWrap && normalWrap.innerHTML && normalWrap.innerHTML.trim()) {
      return { aiHTML: normalWrap.innerHTML, roundCount: _aiReplaceRoundCount, mode: 'normal', gameSnapshot: _captureGameSnapshot(), pickupCandidates: _cloneForAiSnapshot(_aiPickupCandidates || {}) };
    }
    return null;
  }

  function _restoreAiRoundEntry(entry) {
    if (!entry || !entry.aiHTML) return;
    var $passage = $('#passages .passage');
    if (!$passage.length) return;

    if (entry.mode === 'replace') {
      var $aiWrap = $passage.find('.ai-replaced-content');
      if (!$aiWrap.length) {
        _hidePassageOriginalContent($passage);
        $aiWrap = $('<div class="ai-replaced-content"></div>');
        $passage.append($aiWrap);
      }
      $aiWrap.empty().html(entry.aiHTML);
      _updateReplaceSessionHTML();
    } else {
      if (!_aiNarrativeWrap || !_aiNarrativeWrap.parentNode) {
        _aiNarrativeWrap = document.createElement('div');
        _aiNarrativeWrap.className = 'ai-narrative-wrap';
        var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
        if (!$passage.find('.ai-original-wrap').length) _hidePassageOriginalContent($passage);
        if ($overlayKeep.length) $passage.append($overlayKeep);
        $passage[0].appendChild(_aiNarrativeWrap);
      }
      _aiNarrativeWrap.innerHTML = entry.aiHTML;
    }

    _aiReplaceRoundCount = entry.roundCount != null ? entry.roundCount : 0;
    _restoreGameSnapshot(entry.gameSnapshot);
    _aiPickupCandidates = _cloneForAiSnapshot(entry.pickupCandidates || {});
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    _releaseAutoChoicesBusy('restore AI round');
    if (_aiReplaceActive) {
      autoInjectChoices(_aiReplaceOriginPassage, _aiReplaceTargetLabel, _aiReplaceTargetPassage);
    } else {
      autoInjectChoices(typeof State !== 'undefined' ? State.passage : '');
    }
  }

  function _restoreNormalFromAi() {
    var $passage = $('#passages .passage');
    if (_aiNarrativeWrap) {
      if (_aiNarrativeWrap.parentNode) _aiNarrativeWrap.parentNode.removeChild(_aiNarrativeWrap);
      _aiNarrativeWrap = null;
    }
    if ($passage.length) {
      var $ow = $passage.find('.ai-original-wrap');
      if ($ow.length) $ow.replaceWith($ow.contents());
    }
    _clearAiRoundHistory();
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    _suppressAutoChoices('restore normal AI to native page', 5000);
    setTimeout(function () { injectAILinkClones(); _refreshApiWarnBar(); }, 50);
  }

  // Save current AI overlay state to round history (called before each new AI round)
  function _pushCurrentToAiRoundHistory() {
    var snap = _captureCurrentAiRound();
    if (!snap) return;
    var last = _aiRoundHistory.length ? _aiRoundHistory[_aiRoundHistory.length - 1] : null;
    if (last && last.mode === snap.mode && last.roundCount === snap.roundCount && last.aiHTML === snap.aiHTML) {
      return;
    }
      _aiRoundHistory.push(snap);
    while (_aiRoundHistory.length > 20) _aiRoundHistory.shift();
    _syncAISaveStateToCurrentSave();
    console.log('[AIStoryGen] pushed AI round history, size=' + _aiRoundHistory.length + ', round=' + snap.roundCount);
  }

  function _tryAiBackward() {
    _hydrateAiRoundHistoryFromSave();
    if (_aiRoundHistory.length > 0) {
      _aiBackward();
      return true;
    }
    if (_aiReplaceActive) {
      _releaseAutoChoicesBusy('blocked empty AI backward');
      autoInjectChoices(_aiReplaceOriginPassage || (typeof State !== 'undefined' ? State.passage : ''), _aiReplaceTargetLabel, _aiReplaceTargetPassage);
      _showAIUserMessage(loadCfg().language === 'zh' ? '已经是当前AI剧情的最早记录。请使用下方“到达/返回原版章节”离开AI剧情。' : 'This is the earliest AI story record. Use the bottom return/arrive button to leave AI story.', false);
      return true;
    }
    if (_aiNarrativeWrap && _aiNarrativeWrap.innerHTML.trim()) {
      _releaseAutoChoicesBusy('blocked empty normal AI backward');
      autoInjectChoices(typeof State !== 'undefined' ? State.passage : '');
      _showAIUserMessage(loadCfg().language === 'zh' ? '已经是当前AI剧情的最早记录。请使用下方“返回原版章节”离开AI剧情。' : 'This is the earliest AI story record. Use the bottom return button to leave AI story.', false);
      return true;
    }
    return false;
  }

  function _tryAiForward() {
    _hydrateAiRoundHistoryFromSave();
    if (_aiForwardStack.length > 0) {
      _aiForward();
      return true;
    }
    return false;
  }

  // Navigate backward within AI rounds. Returns true if handled.
  function _aiBackward() {
    if (_aiRoundHistory.length === 0) return false;

    var cur = _captureCurrentAiRound();
    if (cur) _aiForwardStack.push(cur);

    var prev = _aiRoundHistory.pop();
    _restoreAiRoundEntry(prev);
    _syncAISaveStateToCurrentSave();

    console.log('[AIStoryGen] AI backward to round ' + prev.roundCount + ', remaining history=' + _aiRoundHistory.length);
    return true;
  }

  // Navigate forward within AI rounds. Returns true if handled.
  function _aiForward() {
    if (_aiForwardStack.length === 0) return false;

    var cur = _captureCurrentAiRound();
    if (cur) _aiRoundHistory.push(cur);

    var next = _aiForwardStack.pop();
    _restoreAiRoundEntry(next);
    _syncAISaveStateToCurrentSave();

    console.log('[AIStoryGen] AI forward to round ' + next.roundCount + ', remaining forward=' + _aiForwardStack.length);
    return true;
  }

  // Clear AI round history (called when exiting AI mode)
  function _clearAiRoundHistory() {
    _aiRoundHistory.length = 0;
    _aiForwardStack.length = 0;
    _syncAISaveStateToCurrentSave();
  }

  // -- Passage-level AI state save/restore for cross-passage navigation --
  // Call this BEFORE SugarCube replaces the DOM (in :passageinit or Engine hook).
  function saveCurrentAINavState() {
    if (_isAISaveRestoreSuppressed()) return;
    if (!_aiReplaceActive || !_aiReplaceOriginPassage) return;
    try {
      var $aiWrap = $('#passages .passage .ai-replaced-content');
      var aiHTML = $aiWrap.length ? $aiWrap.html() : '';
      // Don't save if there's nothing to save
      if (!aiHTML) {
        console.log('[AIStoryGen] save AI nav state skipped — no AI content in DOM');
        return;
      }
      _aiNavHistory[_aiReplaceOriginPassage] = {
        aiHTML: aiHTML,
        targetLabel: _aiReplaceTargetLabel,
        targetPassage: _aiReplaceTargetPassage,
        originalLinkId: _aiReplaceOriginalLinkId,
        originalEventMode: _aiReplaceOriginalEventMode,
        roundCount: _aiReplaceRoundCount,
        savedAt: Date.now()
      };
      console.log('[AIStoryGen] saved AI nav state for passage="' + _aiReplaceOriginPassage + '" htmlLen=' + aiHTML.length);
    } catch (e) {
      console.warn('[AIStoryGen] save AI nav state failed', e);
    }
  }

  // Restore AI replace state from navigation history if available for current passage
  function restoreAINavStateIfNeeded(passageName) {
    try {
      if (_isAISaveRestoreSuppressed()) return false;
      var saved = _aiNavHistory[passageName];
      if (!saved) return false;
      // Don't restore stale entries (>5 min)
      if (Date.now() - saved.savedAt > 5 * 60 * 1000) {
        delete _aiNavHistory[passageName];
        return false;
      }

      console.log('[AIStoryGen] restoring AI nav state for passage="' + passageName + '"');

      var $passage = $('#passages .passage');
      if (!$passage.length) return false;

      // Clean up any leftover AI panels from previous passages
      $passage.find('.ai-replaced-content').remove();
      var $owNav = $passage.find('.ai-original-wrap');
      if ($owNav.length) $owNav.replaceWith($owNav.contents());
      $('#passages .ai-choices').remove();

      // Hide original passage content (same pattern as handleLocationReplace)
      var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
      _hidePassageOriginalContent($passage);
      if ($overlayKeep.length) $passage.append($overlayKeep);

      // Restore AI replace state variables
      _aiReplaceActive = true;
      _aiReplaceOriginPassage = passageName;
      _aiReplaceTargetLabel = saved.targetLabel;
      _aiReplaceTargetPassage = _normalizePassageName(saved.targetPassage);
      _aiReplaceOriginalLinkId = saved.originalLinkId || '';
      _aiReplaceOriginalEventMode = !!saved.originalEventMode;
      _aiReplaceRoundCount = saved.roundCount;
      _refreshOriginalEventModeFromLink();

      // Restore AI content
      var $aiWrap = $('<div class="ai-replaced-content"></div>');
      $aiWrap.html(saved.aiHTML);
      $passage.append($aiWrap);
      _repairStaleEventModeUI($aiWrap);

      // Auto-generate fresh AI choices for continued exploration
      if (!_aiReplaceOriginalEventMode) autoInjectChoices(passageName, saved.targetLabel, saved.targetPassage);

      // Clean up old entry (one-shot restore)
      delete _aiNavHistory[passageName];

      return true;
    } catch (e) {
      console.warn('[AIStoryGen] restore AI nav state failed', e);
      return false;
    }
  }

  function _isApiConfigured(cfg) {
    cfg = cfg || loadCfg();
    var localEndpoint = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(cfg.endpoint || '');
    return (!!(cfg.apiKey && String(cfg.apiKey).trim().length > 3)) || localEndpoint;
  }

  function _apiNotConfiguredText(cfg) {
    cfg = cfg || loadCfg();
    return cfg.language === 'zh'
      ? '请先在「设置 → AI 设置」或侧边栏 OPTIONS → AI 设置 中配置 API 密钥，才能使用 AI 功能。'
      : 'Configure your API Key in Settings → AI Settings (or OPTIONS overlay) before using AI features.';
  }

  function _makeApiWarnBlock(cfg, opts) {
    opts = opts || {};
    var $w = $('<div class="ai-api-warn ai-gen-error"></div>')
      .css({
        margin: opts.compact ? '0.4em 0' : '0.8em 0',
        padding: '0.6em 1em',
        border: '1px solid #c44',
        background: 'rgba(200, 40, 40, 0.2)',
        color: '#ff6666',
        textAlign: 'center',
        fontWeight: 'bold',
        lineHeight: '1.45',
      })
      .text(_apiNotConfiguredText(cfg));
    if (opts.bar) $w.addClass('ai-api-warn-bar');
    if (opts.userMsg) $w.addClass('ai-user-msg');
    return $w;
  }

  function _showAIUserMessage(msg, persistent) {
    $('#passages > .ai-user-msg').remove();
    var $m = _makeApiWarnBlock(loadCfg(), { userMsg: true }).text(msg);
    $('#passages').prepend($m);
    if (!persistent) {
      setTimeout(function () { $m.fadeOut(400, function () { $(this).remove(); }); }, 10000);
    }
  }

  function _clearAIUserMessage() {
    try { $('#passages > .ai-user-msg').remove(); } catch (e) {}
  }

  function _appendChoiceRetryButton($container, cfg, onRetry) {
    if (!$container || !$container.length || typeof onRetry !== 'function') return;
    $container.find('.ai-choices-retry-row').remove();
    var retryTxt = cfg.language === 'zh' ? '刷新选项' : 'Refresh choices';
    var $row = $('<div class="ai-choices-retry-row" style="margin-top:0.5em;"></div>');
    var $btn = $('<button class="ai-regen-btn"></button>').text(retryTxt);
    $btn.on('click', function () {
      $row.remove();
      onRetry();
    });
    $row.append($btn);
    $container.append($row);
  }

  function _refreshApiWarnBar() {
    var cfg = loadCfg();
    $('#passages > .ai-api-warn-bar').remove();
    if (_isApiConfigured(cfg)) return;
    if (typeof State !== 'undefined' && State.passage && _isGameMenuPassage(State.passage)) return;
    $('#passages').append(_makeApiWarnBlock(cfg, { bar: true }));
  }

  function _preflightAI(cfg) {
    if (!_isApiConfigured(cfg)) {
      throw new AIError(AIErrorType.NOT_CONFIGURED, _apiNotConfiguredText(cfg));
    }
    if (!cfg.endpoint) {
      throw new AIError(AIErrorType.NOT_CONFIGURED,
        cfg.language === 'zh' ? '未配置 API 地址。' : 'API endpoint not set.');
    }
  }

  function _recoverFromFailedReplace(cfg, errMsg) {
    var $passage = $('#passages .passage');
    if ($passage.length) {
      $passage.find('.ai-replaced-content').remove();
      var $ow = $passage.find('.ai-original-wrap');
      if ($ow.length) $ow.replaceWith($ow.contents());
    }
    _aiReplaceActive = false;
    _aiReplaceOriginPassage = '';
    _aiReplaceSessionHTML = '';
    _clearAiRoundHistory();
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    if (errMsg) _showAIUserMessage(errMsg);
    setTimeout(function () { injectAILinkClones(); }, 50);
  }

  function _hidePassageOriginalContent($passage) {
    if (!$passage || !$passage.length) return;
    $passage.find('.ai-injected-row').remove();
    if ($passage.find('> .ai-original-wrap, .ai-original-wrap').length) return;
    var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
    var wrapDiv = document.createElement('div');
    wrapDiv.className = 'ai-original-wrap';
    wrapDiv.style.display = 'none';
    var passageEl = $passage[0];
    while (passageEl.childNodes.length > 0) {
      wrapDiv.appendChild(passageEl.childNodes[0]);
    }
    passageEl.appendChild(wrapDiv);
    if ($overlayKeep.length) $passage.append($overlayKeep);
  }

  function _hasActiveAIOverlay($passage) {
    if (!$passage || !$passage.length) $passage = $('#passages .passage');
    if (!$passage.length) return false;
    return $passage.find('.ai-replaced-content, .ai-narrative-wrap').length > 0
      || $passage.find('.ai-gen-loading').length > 0;
  }

  function _updateReplaceSessionHTML() {
    if (!_aiReplaceActive) {
      _aiReplaceSessionHTML = '';
      return;
    }
    var $aiWrap = $('#passages .passage .ai-replaced-content');
    if ($aiWrap.length) _aiReplaceSessionHTML = $aiWrap.html();
  }

  // Re-apply cached AI overlay when SugarCube rebuilds the same passage mid-session
  function _reapplyReplaceOverlay($passage) {
    if (!$passage || !$passage.length) $passage = $('#passages .passage');
    if (!$passage.length || !_aiReplaceActive || !_aiReplaceSessionHTML) return false;
    if ($passage.find('.ai-replaced-content').length) return false;

    $passage.find('.ai-injected-row').remove();
    var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
    if (!$passage.find('.ai-original-wrap').length) {
      var wrapDiv = document.createElement('div');
      wrapDiv.className = 'ai-original-wrap';
      wrapDiv.style.display = 'none';
      var passageEl = $passage[0];
      while (passageEl.childNodes.length > 0) {
        wrapDiv.appendChild(passageEl.childNodes[0]);
      }
      passageEl.appendChild(wrapDiv);
      if ($overlayKeep.length) $passage.append($overlayKeep);
    }
    $passage.append($('<div class="ai-replaced-content"></div>').html(_aiReplaceSessionHTML));
    console.log('[AIStoryGen] re-applied AI replace overlay after passage re-render');
    return true;
  }

  // Safety: unhide original content when wrap is hidden but no AI overlay is present (prevents blank page)
  function _ensurePassageContentVisible() {
    var $passage = $('#passages .passage');
    if (!$passage.length) return false;
    var $origWrap = $passage.find('.ai-original-wrap');
    if ($origWrap.length) {
      var hidden = $origWrap.filter(function () {
        return this.style.display === 'none' || $(this).css('display') === 'none';
      });
      if (hidden.length && _isNativeCombatFinishPassage()) {
        console.warn('[AIStoryGen] restoring native combat settlement controls');
        hidden.replaceWith(hidden.contents());
        _removeAIChoicePanels();
        $passage.find('.ai-injected-row, .ai-injected-link').remove();
        return true;
      }
      if (hidden.length && !_hasActiveAIOverlay($passage)) {
        console.warn('[AIStoryGen] recovering hidden original content (no active AI overlay)');
        hidden.replaceWith(hidden.contents());
        if (_aiReplaceActive) {
          _aiReplaceActive = false;
          _aiReplaceOriginPassage = '';
          _aiReplaceSessionHTML = '';
          _clearAiRoundHistory();
        }
        setTimeout(function () { injectAILinkClones(); }, 50);
        return true;
      }
    }
    // Stale replace flag: overlay lost after passage rebuild
    if (_aiReplaceActive && !_hasActiveAIOverlay($passage) && !$origWrap.length) {
      console.warn('[AIStoryGen] clearing stale AI replace state (overlay lost after passage rebuild)');
      _aiReplaceActive = false;
      _aiReplaceOriginPassage = '';
      _aiReplaceSessionHTML = '';
      _clearAiRoundHistory();
      setTimeout(function () { injectAILinkClones(); }, 50);
      return true;
    }
    return false;
  }

  // Back-compat alias
  function _ensureOriginalVisible() {
    _ensurePassageContentVisible();
  }

  function _removeAIChoicePanels() {
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
  }

  var _aiPanelLayoutTimers = {};
  var _aiPanelLayoutLastAt = 0;
  var _aiPanelLayoutRunCount = 0;
  var _AI_PANEL_LAYOUT_STALE_MS = 500;
  var _AI_PANEL_MANAGED_SELECTOR = '.ai-choices, .ai-choices-end, .ai-back-to-game, .ai-reload-scene-panel, .ai-item-use-panel, .ai-memory-inline, .ai-gen-loading';
  var _AI_PANEL_PIXEL_SELECTOR = '.apg-ai-assist';

  function _releaseAIStoryPanelLayoutLock(reason) {
    try {
      window._aiPanelLayoutMoving = false;
      window._apgAssistOrderMoving = false;
      window._aiPanelLayoutMovingAt = 0;
      window._aiPanelLayoutMoveToken = null;
      if (reason && window.console && console.debug) console.debug('[AIStoryGen] panel layout lock released: ' + reason);
    } catch (_) {}
  }

  function _placeAIChoicesContainer($container) {
    if (!_placeAIManagedPanel($container)) return false;
    _scheduleAIChoicePixelReposition(300);
    _scheduleAIChoicePixelReposition(900);
    return true;
  }

  function _placeAIManagedPanel($container) {
    var $passages = $('#passages');
    if (!$passages.length || !$container || !$container.length) return false;
    var node = $container[0];
    var $firstPixel = $passages.children(_AI_PANEL_PIXEL_SELECTOR).first();
    if ($firstPixel.length && node !== $firstPixel[0]) {
      if (node.nextSibling !== $firstPixel[0]) $firstPixel.before(node);
    } else {
      if ($passages[0].lastElementChild !== node) $passages.append(node);
    }
    _scheduleAIChoicePixelReposition(0);
    return true;
  }

  function _directPanelChildren(selector) {
    return $('#passages').children(selector).toArray();
  }

  function _dedupeDirectPanels(selector, keyFn) {
    var seen = {};
    var removed = 0;
    $(_directPanelChildren(selector).reverse()).each(function () {
      var key = keyFn ? keyFn(this) : selector;
      key = String(key || selector);
      if (seen[key]) {
        $(this).remove();
        removed++;
        return;
      }
      seen[key] = true;
    });
    return removed;
  }

  function _panelKindForNode(node) {
    var $node = $(node);
    if ($node.hasClass('ai-choices')) return 'choices';
    if ($node.hasClass('ai-choices-end')) return 'choices-end';
    if ($node.hasClass('ai-back-to-game')) return 'back-to-game';
    if ($node.hasClass('ai-addon-target-picker')) return 'addon-target-picker';
    if ($node.hasClass('ai-native-addon-picker')) return 'native-addon-picker';
    if ($node.hasClass('ai-reload-scene-panel')) return 'reload-scene';
    if ($node.hasClass('ai-item-use-panel')) return 'item-use';
    if ($node.hasClass('ai-memory-inline')) return 'memory-inline';
    if ($node.hasClass('ai-gen-loading')) return 'loading';
    return 'managed';
  }

  function _dedupePixelPanels() {
    return _dedupeDirectPanels(_AI_PANEL_PIXEL_SELECTOR, function (node) {
      return 'pixel:' + ($(node).attr('data-apg-mode') || 'scene');
    });
  }

  function _dedupeManagedPanels() {
    return _dedupeDirectPanels('.ai-reload-scene-panel, .ai-item-use-panel, .ai-memory-inline', function (node) {
      return _panelKindForNode(node);
    });
  }

  function _layoutAIStoryPanels() {
    var $root = $('#passages');
    if (!$root.length || !$root.find('.passage').length) return false;
    if (window._aiPanelLayoutMoving) {
      var movingAt = Number(window._aiPanelLayoutMovingAt || 0) || 0;
      if (movingAt && Date.now() - movingAt < _AI_PANEL_LAYOUT_STALE_MS) return false;
      _releaseAIStoryPanelLayoutLock('stale');
    }
    _dedupePixelPanels();
    _dedupeManagedPanels();
    var pixels = _directPanelChildren(_AI_PANEL_PIXEL_SELECTOR);
    var managed = _directPanelChildren(_AI_PANEL_MANAGED_SELECTOR);
    if (!pixels.length && !managed.length) return false;

    var desired = managed.concat(pixels);
    var children = $root.children().toArray();
    var start = children.length - desired.length;
    var alreadyOrdered = start >= 0;
    if (alreadyOrdered) {
      for (var oi = 0; oi < desired.length; oi++) {
        if (children[start + oi] !== desired[oi]) {
          alreadyOrdered = false;
          break;
        }
      }
    }
    if (alreadyOrdered) return false;

    var changed = false;
    var moveToken = String(Date.now()) + ':' + Math.random();
    window._aiPanelLayoutMoving = true;
    window._apgAssistOrderMoving = true;
    window._aiPanelLayoutMovingAt = Date.now();
    window._aiPanelLayoutMoveToken = moveToken;
    try {
      for (var mi = 0; mi < managed.length; mi++) {
        $root.append(managed[mi]);
        changed = true;
      }
      for (var pi = 0; pi < pixels.length; pi++) {
        $root.append(pixels[pi]);
        changed = true;
      }
    } finally {
      if (window._aiPanelLayoutMoveToken === moveToken) _releaseAIStoryPanelLayoutLock('complete');
    }
    return changed;
  }

  function _runAIStoryPanelLayout(reason) {
    return _aiPanelManagerEngine.flush(reason || 'manual flush');
  }

  function _normalizeAIStoryPanelOrder() {
    return _aiPanelManagerEngine.normalizeOrder();
  }

  function _repositionAIChoicesAbovePixel() {
    return _aiPanelManagerEngine.normalizeOrder();
  }

  function _scheduleAIChoicePixelReposition(delay) {
    return _aiPanelManagerEngine.scheduleLayout(delay);
  }

  var _autoChoicesEnsureTimer = null;
  var _lastAutoChoicesEnsureKey = '';

  function scheduleEnsureAutoChoices(reason, delay) {
    if (_isAutoChoicesSuppressed()) return;
    if (_autoChoicesEnsureTimer) clearTimeout(_autoChoicesEnsureTimer);
    _autoChoicesEnsureTimer = setTimeout(function () {
      _autoChoicesEnsureTimer = null;
      try {
        if (_isAutoChoicesSuppressed()) return;
        var cfg = loadCfg();
        if (!cfg.autoChoices || cfg.autoChoices <= 0) return;
        if (_autoChoicesBusy) return;
        var name = (typeof State !== 'undefined' && State.passage) || '';
        if (!name || _isGameMenuPassage(name)) return;
        if (!_aiReplaceActive && _isNativeCombatFinishPassage(name)) {
          _removeAIChoicePanels();
          return;
        }
        var V_check = getV();
        if (V_check && safeRead(function(){return V_check.combat;},0)===1) return;
        if (_isShopOrUIPage()) return;
        if ($('#passages .ai-choices, #passages .ai-choices-end, #passages .ai-gen-loading').length) return;
        var key = name + '|' + ($('#passages .passage').text() || '').replace(/\s+/g, ' ').slice(0, 160);
        if (_lastAutoChoicesEnsureKey === key) return;
        _lastAutoChoicesEnsureKey = key;
        console.log('[AIStoryGen] ensuring missing AI choices' + (reason ? ': ' + reason : ''));
        autoInjectChoices(name, '', '', { force: true });
      } catch (e) {
        console.warn('[AIStoryGen] ensure AI choices failed', e);
      }
    }, delay == null ? 600 : delay);
  }

  var _aiPixelAssistRefreshTimer = null;
  function _scheduleAIPixelAssistRefresh(reason, delay) {
    if (_aiPixelAssistRefreshTimer) clearTimeout(_aiPixelAssistRefreshTimer);
    _aiPixelAssistRefreshTimer = setTimeout(function () {
      _aiPixelAssistRefreshTimer = null;
      try {
        var pixel = window.AIPixelGen;
        if (!pixel || typeof pixel.injectAIStoryAssist !== 'function') return;
        if (typeof pixel.isEnabled === 'function' && !pixel.isEnabled()) return;
        pixel.injectAIStoryAssist();
      } catch (e) {
        try { console.warn('[AIStoryGen] pixel assist refresh failed' + (reason ? ' (' + reason + ')' : ''), e); } catch (_) {}
      }
    }, delay == null ? 250 : delay);
  }

  function _installAIChoiceOrderObserver() {
    return _aiPanelManagerEngine.installOrderObserver();
  }

  var PanelManager = PanelManagerModule.create({
    publicSchemaVersion: 4,
    minFlushInterval: 90,
    layout: _layoutAIStoryPanels,
    runLayout: function (reason) {
      try {
        return _layoutAIStoryPanels();
      } catch (e) {
        try { console.warn('[AIStoryGen] panel layout failed' + (reason ? ' (' + reason + ')' : ''), e); } catch (_) {}
        return false;
      }
    },
    getObserverRoot: function () {
      return document.getElementById('passages') || document.body;
    },
    countPanels: function (kind) {
      return kind === 'pixel'
        ? _directPanelChildren(_AI_PANEL_PIXEL_SELECTOR).length
        : _directPanelChildren(_AI_PANEL_MANAGED_SELECTOR).length;
    },
    dedupePixelPanels: _dedupePixelPanels,
    removeChoicePanels: _removeAIChoicePanels,
    warn: function (message, err) {
      try { console.warn(message, err); } catch (_) {}
    }
  });
  var _aiPanelManagerEngine = PanelManager;
  window.AIStoryGen.panelManager = PanelManager;
  window.AIStoryGen.PanelManager = PanelManager;
  window.AIStoryGen.layoutPanels = function () { return PanelManager.layout(); };
  window.AIStoryGen.normalizePanelOrder = function () { return PanelManager.normalizeOrder(); };
  window.AIStoryGen.repositionChoicesAbovePixel = function () { return PanelManager.normalizeOrder(); };

  function autoInjectChoices(title, targetLabel, targetPassage, opts) {
    opts = opts || {};
    if (!opts.force && !_aiReplaceActive && _isAutoChoicesSuppressed()) return;
    if (opts.force && !_aiReplaceActive && _isAutoChoicesSuppressed()) return;
    if (_autoChoicesBusy) {
      if (!opts.force) return;
      _releaseAutoChoicesBusy('forced auto choices restart');
      try { restoreErrorReporter(); } catch (_) {}
    }
    var cfg = loadCfg();
    // In AI replace mode, always allow choice generation regardless of autoChoices setting
    if (!_aiReplaceActive && !opts.force && (!cfg.autoChoices || cfg.autoChoices <= 0)) return;
    if (!_aiReplaceActive && !opts.force && _sessionAutoPaused) return; // 会话暂停中
    var name = title || (typeof State !== 'undefined' && State.passage) || '';
    if (!name) return;
    if (name.indexOf('AIStoryGen_') === 0) return;
    if (_isGameMenuPassage(name)) return;
    if (!_aiReplaceActive && _isNativeCombatFinishPassage(name)) {
      _removeAIChoicePanels();
      return;
    }
    var V_forChoices = getV();
    if (V_forChoices && safeRead(function(){return V_forChoices.combat;},0)===1) {
      _removeAIChoicePanels();
      $('#passages > .ai-addon-standalone').remove();
      return;
    }
    // Note: _isShopOrUIPage is NOT checked here — it's only used in injectAILinkClones.
    // DOM heuristics are too fragile for blocking AI options; passage name blacklist is the primary defense.

    // Clean up any leftover AI panels from previous passages
    _removeAIChoicePanels();

    // Safety: ensure original content is visible (not hidden from a previous round)
    _ensureOriginalVisible();

    if (!_isApiConfigured(cfg)) {
      var $containerNoKey = $('<div class="ai-choices ai-choices-auto"></div>');
      $containerNoKey.append(_makeApiWarnBlock(cfg));
      _placeAIChoicesContainer($containerNoKey);
      _scheduleAIPixelAssistRefresh('api warning choices', 300);
      _refreshApiWarnBar();
      return;
    }

    _autoChoicesBusy = true;
    // Timeout protection: auto-release lock after 30s
    if (_autoChoicesBusyTimer) clearTimeout(_autoChoicesBusyTimer);
    _autoChoicesBusyTimer = setTimeout(function () {
      if (_autoChoicesBusy) {
        console.warn('[AIStoryGen] _autoChoicesBusy lock released by timeout (30s)');
        _releaseAutoChoicesBusy('timeout');
      }
    }, 30000);
    suppressErrorReporter();
    var $passages = $('#passages');
    if (!$passages.length) { _releaseAutoChoicesBusy('missing passages'); return; }

    var $container = $('<div class="ai-choices ai-choices-auto"></div>');
    var loadingTxt = cfg.language === 'zh' ? 'AI 正在生成选项…' : 'AI generating choices…';
    var $loading = $('<div class="ai-choices-loading ai-gen-loading"></div>').text(loadingTxt);
    $container.append($loading);
    _placeAIChoicesContainer($container);

    var choiceRequest = _createTimedAbortController(45000);
    _currentAbortController = choiceRequest.controller;
    generateChoices(cfg, '', choiceRequest.signal, targetLabel, targetPassage).then(function (choices) {
      choiceRequest.clear();
      if (_currentAbortController === choiceRequest.controller) _currentAbortController = null;
      $loading.remove();

      // Q2: In AI replace mode, append a fixed "continue original story" option.
      // Use the originally clicked game link target, not the AI-inferred current
      // location, so this cannot collapse into a same-page refresh.
      var destPassage = targetPassage || _aiReplaceTargetPassage || _aiCurrentLocationPassage;
      if (_aiReplaceActive && !_aiReplaceOriginalEventMode && destPassage) {
        var skipTxt = cfg.language === 'zh'
          ? '\u{1F6A9} \u7EE7\u7EED\u539F\u5267\u60C5'
          : '\u{1F6A9} Continue story';
        choices.push('__SKIP__' + skipTxt + '__TARGET__' + destPassage);
      }

      // Q3: Show round progress indicator at top of choices panel
      if (_aiReplaceActive) {
        var roundInfo = cfg.language === 'zh'
          ? ('\u25C6 \u63A2\u7D22\u8F6E\u6B21 ' + _aiReplaceRoundCount + '\uFF08\u53EF\u968F\u65F6\u7EE7\u7EED\u539F\u5267\u60C5\uFF09')
          : ('\u25C6 Round ' + _aiReplaceRoundCount + ' (story continuation is always available)');
        var $roundInfo = $('<div class="ai-round-info" style="text-align:center;color:#b4a078;font-size:0.85em;margin-bottom:0.3em;"></div>').text(roundInfo);
        $container.append($roundInfo);
      }

      renderChoices($container, choices, cfg);
      _scheduleAIPixelAssistRefresh('auto choices rendered', 300);

      // Original passage content remains visible above AI choices.
      // Hiding only happens in advanceWithNarrative (once AI narrative replaces it).
      _ensureOriginalVisible();

      _releaseAutoChoicesBusy('auto choices complete');
      restoreErrorReporter();
    }).catch(function (err) {
      choiceRequest.clear();
      if (_currentAbortController === choiceRequest.controller) _currentAbortController = null;
      if (err && err.name === 'AbortError') {
        err = new Error(cfg.language === 'zh' ? '连接超时 (45秒)' : 'Request timed out (45s)');
      }
      $loading.removeClass('ai-gen-loading').addClass('ai-choices-error');
      $loading.text((cfg.language === 'zh' ? '选项生成失败: ' : 'Choice error: ') + (err && err.message ? err.message : err));
      _releaseAutoChoicesBusy('auto choices failed');
      restoreErrorReporter();
      _appendChoiceRetryButton($container, cfg, function () {
        $container.remove();
        autoInjectChoices(title, targetLabel, targetPassage);
      });
      _scheduleAIPixelAssistRefresh('auto choices failed', 300);
    });
  }

  // Inject "AI版" clones below each game link in the passage
  function _forceRefreshChoicesFromToolbar(narrativeName) {
    _releaseAutoChoicesBusy('toolbar refresh');
    _lastAutoChoicesEnsureKey = '';
    try { restoreErrorReporter(); } catch (_) {}
    $('#passages .ai-choices, #passages .ai-choices-end').remove();
    var currentPassage = (typeof State !== 'undefined' && State.passage) || '';
    if (!_aiReplaceActive && _isNativeCombatFinishPassage(currentPassage)) {
      _ensureOriginalVisible();
      _showAIUserMessage(loadCfg().language === 'zh' ? '战斗结算页保留原版继续选项。' : 'Native continue option is preserved on combat settlement pages.', false);
      return;
    }
    var title = _aiReplaceActive ? (_aiReplaceOriginPassage || currentPassage) : currentPassage;
    var targetLabel = _aiReplaceActive ? (_aiReplaceTargetLabel || narrativeName || '') : '';
    var targetPassage = _aiReplaceActive ? (_aiReplaceTargetPassage || _aiCurrentLocationPassage || '') : '';
    _showAIUserMessage(loadCfg().language === 'zh' ? '正在刷新选项…' : 'Refreshing choices...', false);
    autoInjectChoices(title, targetLabel, targetPassage, { force: true });
  }

  function injectAILinkClones() {
    var cfg = loadCfg();
    if (!cfg.aiReplaceLinks) return;
    if (!_isApiConfigured(cfg)) {
      $('#passages .ai-injected-row').remove();
      _refreshApiWarnBar();
      return;
    }

    // Skip menu/shop/UI pages by passage name first
    var curPassage = (typeof State !== 'undefined' && State.passage) || '';
    if (_isGameMenuPassage(curPassage)) {
      $('#passages .ai-injected-row').remove();
      return;
    }
    if (_isNativeCombatActive() || _isNativeSexOrCombatPassage(curPassage)) {
      $('#passages .ai-injected-row, #passages .ai-injected-link').remove();
      $('#passages .ai-choices, #passages .ai-choices-end').remove();
      return;
    }

    var $passage = $('#passages .passage');
    if (!$passage.length) return;
    // Skip shop/UI pages by DOM detection
    if (_isShopOrUIPage()) {
      $passage.find('.ai-injected-row').remove();
      $('#passages .ai-choices').remove();
      return;
    }
    $passage.find('.ai-injected-row').remove();

    $passage.find('a[data-passage]').each(function () {
      var $orig = $(this);
      // Skip links inside AI-generated content
      if ($orig.closest('.ai-narrative-section').length) return;
      // Skip links to game menu passages (Shift+4 Settings, Shift+5 Attitudes, etc.)
      var tp = $orig.attr('data-passage');
      if (_isGameMenuPassage(tp)) return;
      // Avoid double-injection — check if an AI row already follows
      if ($orig.next('.ai-injected-row').length) return;

      var linkText = $orig.clone().children().remove().end().text().trim();
      var targetPassage = $orig.attr('data-passage');
      if (!linkText || linkText.length < 2 || !targetPassage) return;
      if (_shouldSkipAIStoryLink($orig, targetPassage, linkText)) return;
      var origId = $orig.attr('data-ai-origid');
      if (!origId) {
        origId = 'ai-orig-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        $orig.attr('data-ai-origid', origId);
      }
      var isEventAction = _isOriginalEventActionLink($orig, targetPassage, linkText);

      // Create a compact AI affordance below the original without duplicating
      // the destination text, so the vanilla game link remains easy to click.
      var $aiLink = $('<span class="ai-injected-link"></span>');
      $aiLink.text('   [剧情生成]')
        .attr('data-ai-target', targetPassage)
        .attr('data-ai-text', linkText)
        .attr('data-ai-origid', origId)
        .attr('data-ai-event', isEventAction ? '1' : '0')
        .attr('title', linkText + ' [剧情生成]')
        .data('ai-target', targetPassage)
        .data('ai-text', linkText)
        .data('ai-origid', origId)
        .data('ai-event', isEventAction ? '1' : '0');
      var $row = $('<span class="ai-injected-row"></span>').append($aiLink);
      $row.insertAfter($orig);
    });
    _refreshApiWarnBar();
  }

  // Capturing-phase click handler — runs before SugarCube link navigation
  document.addEventListener('click', function (e) {
    var target = e.target && e.target.closest ? e.target.closest('.ai-injected-link') : null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var $t = $(target);
    var tp = $t.data('ai-target') || $t.attr('data-ai-target');
    var txt = $t.data('ai-text') || $t.attr('data-ai-text');
    var origId = $t.data('ai-origid') || $t.attr('data-ai-origid') || '';
    var eventMode = String($t.data('ai-event') || $t.attr('data-ai-event') || '') === '1';
    if (!tp || !txt) return;
    console.log('[AIStoryGen] [AI] link clicked →', tp, txt);
    var cfg = loadCfg();
    try {
      _preflightAI(cfg);
    } catch (preErr) {
      console.warn('[AIStoryGen] [AI] link preflight failed', preErr);
      _showAIUserMessage(preErr.message || String(preErr), true);
      return;
    }
    handleLocationReplace(tp, txt, origId, eventMode);
  }, true);
  window.AIStoryGen.injectAILinkClones = injectAILinkClones;

  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('#passages a[data-passage]') : null;
    if (!link) return;
    if (link.closest && link.closest('.ai-injected-link, .ai-choices, .ai-replaced-content, .ai-narrative-wrap, .ai-back-to-game')) return;
    _clearStaleNativeEventLoopForLink(link, 'original link click');
    if (_aiReplaceActive) return;
    if (!_aiNarrativeWrap && !document.querySelector('#passages .ai-narrative-wrap')) return;
    _markAISaveRestoreSuppressed(5000);
    _clearAiRoundHistory();
    try {
      var V = _getStateVariables();
      if (V) {
        delete V.aiStoryGenNavState;
        V.aiStoryGenSuppressRestoreUntil = _suppressAISaveRestoreUntil;
      }
    } catch (_) {}
  }, true);

  // -- Suppress DoL NPC validation errors during AI activity --
  // (Kylar/Kylar-related NPCs may trigger false-positive errors when generated
  //  in passages with NPC limits, especially during prolonged AI exploration)
  function suppressErrorReporter() {
    // Hide the error overlay button
    var $errBtn = $('.error-reporter-btn');
    if ($errBtn.length) $errBtn.hide();
    // Hide sidebar red error text (e.g. "事件错误")
    $('#storyCaptionContent button .red').closest('button').hide();
    // Also hide any visible error overlay
    $('#errorOverlay').hide();
  }
  function restoreErrorReporter() {
    var $errBtn = $('.error-reporter-btn');
    if ($errBtn.length) $errBtn.show();
    $('#storyCaptionContent button .red').closest('button').show();
  }

  // -- SugarCube navigation hooks for AI state persistence --

  // :passageinit fires BEFORE the new passage DOM is built.
  // Save AI state for cross-passage restore, then clear round history.
  $(document).on(':passageinit', function (ev) {
    var initTitle = (ev && ev.passage && ev.passage.title) || '';
    _closeAiItemUseDialog();
    if (_rescueInvalidPrisonDirectState(initTitle, 'passageinit')) return;
    if (_aiReplaceActive) {
      var newTitle = initTitle;
      if (newTitle && newTitle !== _aiReplaceOriginPassage) {
        saveCurrentAINavState();
        _clearAiRoundHistory();
        console.log('[AIStoryGen] :passageinit saved AI state before navigating to "' + newTitle + '"');
      }
    }
  });

  // :passagedisplay fires AFTER the new passage is rendered in DOM.
  $(document).on(':passagedisplay', function (ev) {
    var title = (ev && ev.passage && ev.passage.title) || '';
    if (_rescueInvalidPrisonDirectState(title, 'passagedisplay')) {
      _ensurePassageContentVisible();
      return;
    }

    // Prevent blank page: hidden original wrap with no AI overlay
    _ensurePassageContentVisible();
    _cleanupInlineAiInventorySections();
    _removeMalformedAIEventDom();

    // Try to restore AI replace state from navigation history (cross-passage forward)
    if (_restoreAISaveStateIfNeeded(title)) {
      return;
    }

    // Try to restore AI replace state from navigation history (cross-passage forward)
    if (restoreAINavStateIfNeeded(title)) {
      setTimeout(function () { injectAILinkClones(); }, 50);
      return;
    }

    // Handle resync: LOC tracking triggered a passage switch, re-overlay AI content
    if (_aiResyncTarget && title === _aiResyncTarget) {
      var $rpassage = $('#passages .passage');
      if ($rpassage.length && _aiResyncAIHTML) {
        $rpassage.find('.ai-replaced-content, .ai-original-wrap').remove();
        var $roverlayKeep = $rpassage.children('#customOverlayContainer, #debugOverlay').detach();
        // Use childNodes to capture text nodes too
        var wrapDiv = document.createElement('div');
        wrapDiv.className = 'ai-original-wrap';
        wrapDiv.style.display = 'none';
        while ($rpassage[0].childNodes.length > 0) {
          wrapDiv.appendChild($rpassage[0].childNodes[0]);
        }
        $rpassage[0].appendChild(wrapDiv);
        if ($roverlayKeep.length) $rpassage.append($roverlayKeep);
        var $rAiWrap = $('<div class="ai-replaced-content"></div>').html(_aiResyncAIHTML);
        $rpassage.append($rAiWrap);
        // Refresh destinations from new passage
        _collectDestinations($rpassage);
        console.log('[AIStoryGen] resync complete — AI overlay restored on passage: ' + title);
      }
      _aiResyncTarget = '';
      _aiResyncAIHTML = '';
      setTimeout(function () { injectAILinkClones(); }, 50);
      return;
    }

    // Same passage re-rendered while AI replace active — restore cached overlay
    if (_aiReplaceActive && _aiReplaceOriginPassage && title === _aiReplaceOriginPassage) {
      var $livePassage = $('#passages .passage');
      if ($livePassage.length && !$livePassage.find('.ai-replaced-content').length && _aiReplaceSessionHTML) {
        _reapplyReplaceOverlay($livePassage);
        setTimeout(function () { injectAILinkClones(); }, 50);
        autoInjectChoices(title, _aiReplaceTargetLabel, _aiReplaceTargetPassage);
        return;
      }
    }

    if (_aiReplaceActive && _aiReplaceOriginPassage && title !== _aiReplaceOriginPassage) {
      _clearAiRoundHistory();
      _aiReplaceActive = false;
      _aiReplaceOriginPassage = '';
    }

    if (!_aiReplaceActive && _isAISaveRestoreSuppressed() && $('#passages .passage .ai-narrative-wrap, #passages .passage .ai-original-wrap').length) {
      _restoreOriginalFromNormalAIOverlay('native passage navigation');
    }

    // Reset AI narrative container and location tracking on passage change (normal mode)
    _aiNarrativeWrap = null;
    if (!_aiReplaceActive) {
      _clearAiLocationState('normal passage change');
    }

    autoInjectChoices(title);
    setTimeout(function () {
      injectAILinkClones();
      _refreshApiWarnBar();
      _scheduleAIChoicePixelReposition(0);
      scheduleEnsureAutoChoices('passagedisplay follow-up', 900);
    }, 50);
    _scheduleAIChoicePixelReposition(350);
    _scheduleAIChoicePixelReposition(1000);
    setTimeout(_installAIChoiceOrderObserver, 120);
  });

  // === NAVIGATION INTERCEPT (capturing-phase DOM click interception) ===
  // DoL's SugarCube has all API methods locked (non-configurable, non-writable):
  //   - State.activeIndex: getter-only, configurable:false
  //   - State.backward/forward/show: configurable:false, writable:false
  //   - SugarCube.Engine.backward/forward: configurable:false, writable:false
  // So we intercept clicks on #history-backward / #history-forward via capturing
  // phase — which fires BEFORE SugarCube's jQuery handlers on the target element.
  (function installNavHooks() {
    function aiNavActive() {
      return _aiRoundHistory.length > 0 ||
        _aiReplaceActive ||
        !!(_aiNarrativeWrap && _aiNarrativeWrap.innerHTML && _aiNarrativeWrap.innerHTML.trim());
    }
    function isBackwardBtn(el) {
      if (!el) return false;
      if (el.id === 'history-backward' || el.id === 'backwords') return true;
      if (el.closest && (el.closest('#history-backward') || el.closest('#backwords'))) return true;
      return false;
    }
    function isForwardBtn(el) {
      if (!el) return false;
      if (el.id === 'history-forward') return true;
      if (el.closest && el.closest('#history-forward')) return true;
      return false;
    }

    document.addEventListener('click', function navCapture(e) {
      var target = e.target;

      if (isBackwardBtn(target) || (target.parentElement && isBackwardBtn(target.parentElement))) {
        _releaseAutoChoicesBusy('history backward');
        if (_tryAiBackward()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }

      if (isForwardBtn(target) || (target.parentElement && isForwardBtn(target.parentElement))) {
        if (_tryAiForward()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }
    }, true);

    document.addEventListener('keydown', function aiNavKeyCapture(e) {
      if (!aiNavActive()) return;

      var key = e.key || '';
      var isBackKey = key === 'Backspace' || (key === 'ArrowLeft' && (e.altKey || e.metaKey));
      var isForwardKey = key === 'ArrowRight' && (e.altKey || e.metaKey);
      if (!isBackKey && !isForwardKey) return;

      var target = e.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;

      if (isBackKey) {
        _releaseAutoChoicesBusy('keyboard history backward');
        if (_tryAiBackward()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }

      if (isForwardKey && _tryAiForward()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, true);

    console.log('[AIStoryGen] AI navigation hooks installed (history buttons + keyboard)');
  })();

  // NOTE: DoL sidebar buttons (Social/Stats/Traits/...) use <<overlayReplace>>
  // which displays a fixed overlay (#customOverlayContainer) WITHOUT switching passage.
  // No special click monitoring is needed — just keep the overlay container outside
  // of the .ai-original-wrap (handled in handleLocationReplace).

  function _ensureAiItemStore() {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V) return null;
    if (!Array.isArray(V.aiStoryGenItems)) V.aiStoryGenItems = [];
    return V.aiStoryGenItems;
  }

  function _normaliseAiItemStoreArray(items) {
    var result = [];
    if (!Array.isArray(items)) return result;
    items.forEach(function (item) {
      var name = _normaliseAiItemName(item && item.name);
      if (_isLegacyConsumedAiItemName(name) || _isLegacyConsumedAiItemName(item && item.name)) return;
      if (_isBadAiItemName(name)) return;
      result.push({
        id: String(item.id || ('aiitem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7))),
        name: name,
        qty: Math.max(1, parseInt(item.qty, 10) || 1),
        ai: true,
        tag: item.tag || 'AI道具',
        type: item.type || item.category || _classifyAiItem({ name: name }),
        description: _cleanAiItemSourceSummary(item.description || item.source || ''),
        passage: String(item.passage || ''),
        sourceLocation: String(item.sourceLocation || item.passage || ''),
        source: _normaliseAiItemSource(item.source),
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
        usable: item.usable !== false,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now()
      });
    });
    if (result.length > 100) result.splice(0, result.length - 100);
    return result;
  }

  function _replaceAiItemStoreFromSave(items) {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V) return [];
    V.aiStoryGenItems = _normaliseAiItemStoreArray(items);
    return V.aiStoryGenItems;
  }

  function _syncAiItemsToCurrentMoment() {
    try {
      if (typeof State === 'undefined') return;
      var items = _cloneForAiSnapshot(_getAiItemStore());
      _patchAIStoryGenStateField(_getStateVariables(), 'items', items);
      if (State.active && State.active.variables) {
        State.active.variables.aiStoryGenItems = _cloneForAiSnapshot(items);
        _patchAIStoryGenStateField(State.active.variables, 'items', items);
      }
      if (Array.isArray(State.history) && State.activeIndex != null && State.history[State.activeIndex] && State.history[State.activeIndex].variables) {
        State.history[State.activeIndex].variables.aiStoryGenItems = _cloneForAiSnapshot(items);
        _patchAIStoryGenStateField(State.history[State.activeIndex].variables, 'items', items);
      }
      if (Array.isArray(State._history) && State.activeIndex != null && State._history[State.activeIndex] && State._history[State.activeIndex].variables) {
        State._history[State.activeIndex].variables.aiStoryGenItems = _cloneForAiSnapshot(items);
        _patchAIStoryGenStateField(State._history[State.activeIndex].variables, 'items', items);
      }
    } catch (e) {
      try { console.warn('[AIStoryGen] sync AI items to current moment failed', e); } catch (_) {}
    }
  }

  function _persistAiItemStore() {
    _syncAiItemsToCurrentMoment();
  }

  var _pendingAiItemUses = [];
  var _lastAiItemsUsedForTurn = [];
  var _aiPickupCandidates = {};
  var _aiItemUseDialogState = null;

  function _getAiItemStore() {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V || !Array.isArray(V.aiStoryGenItems)) return [];
    for (var i = V.aiStoryGenItems.length - 1; i >= 0; i--) {
      var entry = V.aiStoryGenItems[i];
      if (!entry || _isBadAiItemName(entry.name) || _isLegacyConsumedAiItemName(entry.name)) V.aiStoryGenItems.splice(i, 1);
      else entry.source = _normaliseAiItemSource(entry.source);
    }
    return V.aiStoryGenItems;
  }

  function _translateAiItemNameToChinese(name) {
    return ItemSchemaModule.translateItemNameToChinese(name);
  }

  function _normaliseAiItemName(name) {
    return ItemSchemaModule.normaliseAiItemName(name);
  }

  function _isLegacyConsumedAiItemName(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return false;
    return /(?:\(|\uff08)\s*(?:\u5df2\u4f7f\u7528|used|consumed)\s*(?:\)|\uff09)\s*$/i.test(name);
  }

  function _aiItemComparableName(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^(?:itemsGained|items_gained|items)\s*[:=]\s*/i, '').trim();
    name = name.replace(/\s*[\(\uff08]\s*(?:gained|obtained|acquired|\u83b7\u5f97|\u5df2\u83b7\u5f97)\s*[\)\uff09]\s*$/i, '').trim();
    name = name.replace(/\s*(?:x|\u00d7|\*)\s*\d+\s*$/i, '').trim();
    var normalized = '';
    try { normalized = _normaliseAiItemName(name); } catch (_) { normalized = ''; }
    return String(normalized || name).toLowerCase().replace(/[\s_\-·・'"\u2018\u2019\u201c\u201d]/g, '').trim();
  }

  function _currentWornAiItemNameSet() {
    var set = {};
    try {
      var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
      var worn = V && V.worn;
      if (!worn || typeof worn !== 'object') return set;
      Object.keys(worn).forEach(function (slot) {
        var item = worn[slot];
        if (!item || typeof item !== 'object') return;
        [
          item.name,
          item.name_cap,
          item.displayName,
          item.display_name,
          item.label,
          item.cn_name,
          item.cnName
        ].forEach(function (value) {
          var key = _aiItemComparableName(value);
          if (key && key !== 'naked') set[key] = true;
        });
      });
    } catch (_) {}
    return set;
  }

  function _isCurrentWornAiItemName(name, wornSet) {
    var key = _aiItemComparableName(name);
    if (!key) return false;
    wornSet = wornSet || _currentWornAiItemNameSet();
    return !!wornSet[key];
  }

  function _filterAiRuntimeItems(items) {
    var wornSet = _currentWornAiItemNameSet();
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var name = _normaliseAiItemName(item && item.name);
      if (_isBadAiItemName(name)) return false;
      if (_isCurrentWornAiItemName(name, wornSet) || _isCurrentWornAiItemName(item && item.name, wornSet)) return false;
      return true;
    });
  }

  function _normaliseAiItemSource(source) {
    source = String(source || '').replace(/\s+/g, ' ').trim();
    source = _removeAIEventBlocks(source);
    source = source.replace(/\[(?:ITEMS?|STATS|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();
    if (source.length > 130) {
      var firstSentence = source.split(/(?<=[。！？.!?])\s*/).filter(Boolean)[0] || source;
      source = firstSentence.length <= 130 ? firstSentence : source.slice(0, 130);
    }
    return source;
  }

  function _getAiItemRawSource(source) {
    source = String(source || '').replace(/\s+/g, ' ').trim();
    source = _removeAIEventBlocks(source);
    source = source.replace(/\[(?:ITEMS?|STATS|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();
    if (source.length > 4000) source = source.slice(0, 4000).trim();
    return source;
  }

  function _cleanAiItemSourceSummary(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    text = text.replace(/^(?:摘要|来源|物品来源|AI摘要)\s*[:：]\s*/i, '').trim();
    text = _removeAIEventBlocks(text);
    text = text.replace(/\[(?:ITEMS?|STATS|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();
    if (text.length > 130) text = text.slice(0, 130).trim();
    return text;
  }

  function _summarizeAiItemSourceInBackground(sourceText, itemNames) {
    sourceText = String(sourceText || '').replace(/\s+/g, ' ').trim();
    itemNames = (itemNames || []).filter(Boolean);
    if (!sourceText || !itemNames.length) return;
    var cfg = loadCfg();
    if (!_isApiConfigured(cfg) || typeof callAI !== 'function') return;
    var prompt = cfg.language === 'zh'
      ? [
          '请把下面这段游戏剧情整理成“AI物品来源描述”，用于库存里显示。',
          '要求：',
          '- 中文输出，130字以内。',
          '- 只说明玩家如何获得这些物品，以及关键地点/对象。',
          '- 不要复述完整剧情，不要写心理描写、环境铺陈、长句。',
          '- 不要输出列表、标题、引号或括号标记。',
          '物品：' + itemNames.join('、'),
          '剧情：' + sourceText
        ].join('\n')
      : [
          'Summarise this game narrative into an inventory item source note.',
          'Rules: <=130 characters, one concise sentence, mention how the player obtained the item(s), no title, no list, no metadata.',
          'Items: ' + itemNames.join(', '),
          'Narrative: ' + sourceText
        ].join('\n');
    callAI(prompt, { highQuality: true, temperature: 0.2, max_tokens: 220 }).then(function (summary) {
      summary = _cleanAiItemSourceSummary(summary);
      if (!summary) return;
      var store = _ensureAiItemStore();
      if (!store) return;
      var changed = false;
      store.forEach(function (entry) {
        if (!entry || itemNames.indexOf(entry.name) === -1) return;
        entry.source = summary;
        entry.description = summary;
        entry.updatedAt = Date.now();
        changed = true;
      });
      if (changed) {
        _persistAiItemStore();
        _renderAiItemsInLog();
      }
    }).catch(function () {
      // Keep the local fallback summary if the backend is unavailable.
    });
  }

  function _isBadAiItemName(name) {
    return ItemSchemaModule.isBadAiItemName(name);
  }

  function _isBadAiItemPhrase(text) {
    return ItemSchemaModule.isBadAiItemPhrase(text);
  }

  function _escapeAiHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function _parseAiItemToken(token) {
    return ItemSchemaModule.parseAiItemToken(token);
  }

  function _inferAiItemsFromNarrative(text) {
    text = String(text || '').replace(/\s+/g, ' ');
    var found = [];
    var patterns = [
      /(?:\u83b7\u5f97|\u5f97\u5230|\u627e\u5230|\u53d1\u73b0|\u6361\u5230|\u62fe\u8d77|\u7ffb\u51fa|\u62ff\u5230|\u6536\u4e0b|\u5077\u5230|\u62ff\u8d70)\s*(?:\u4e86|\u5230)?\s*([^\uff0c\u3002\uff01\uff1f\uff1b;,.!?]{2,40})(?=[\uff0c\u3002\uff01\uff1f\uff1b;,.!?]|$)/g,
      /(?:\u8fd9\u91cc\u5806\u653e\u7740|\u8fd9\u91cc\u6709|\u65c1\u8fb9\u6709|\u4f60\u770b\u5230)\s*([^\uff0c\u3002\uff01\uff1f\uff1b;,.!?]{2,40})(?=[\uff0c\u3002\uff01\uff1f\uff1b;,.!?]|$)/g
    ];
    patterns.forEach(function (re) {
      var m;
      while ((m = re.exec(text))) {
        _expandAiItemTokens(m[1]).forEach(function (part) {
          var item = _parseAiItemToken(part);
          if (!item) return;
          if (/(\u4ec0\u4e48|\u4e1c\u897f|\u7269\u54c1|\u8d35\u91cd\u7269\u54c1|\u503c\u94b1\u7684\u4e1c\u897f|\u7ebf\u7d22|\u673a\u4f1a|\u58f0\u97f3|\u811a\u6b65|\u6c14\u5473|\u611f\u89c9|\u63a7\u5236|\u638c\u63a7)/.test(item.name)) return;
          found.push(item);
        });
      }
    });
    return found;
  }

  function _mergeAiItemListByName(items) {
    return ItemSchemaModule.mergeAiItemListByName(items);
  }

  function _recordAiItems(items, sourceText) {
    var store = _ensureAiItemStore();
    items = _filterAiRuntimeItems(_mergeAiItemListByName(items));
    if (!store || !items.length) return [];
    var cfg = loadCfg();
    var added = [];
    var summarizeNames = [];
    items.forEach(function (item) {
      var name = _normaliseAiItemName(item && item.name);
      var qty = Math.max(1, parseInt(item && item.qty, 10) || 1);
      if (_isBadAiItemName(name)) return;
      var existing = store.find(function (entry) { return entry && entry.name === name; });
      if (existing) {
        existing.qty = Math.max(1, parseInt(existing.qty, 10) || 1) + qty;
        existing.updatedAt = Date.now();
      } else {
        store.push({
          id: 'aiitem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
          name: name,
          qty: qty,
          ai: true,
          tag: cfg.language === 'zh' ? 'AI道具' : 'AI item',
          type: _classifyAiItem({ name: name }),
          description: _cleanAiItemSourceSummary(sourceText),
          passage: (typeof State !== 'undefined' && State.passage) || '',
          sourceLocation: (typeof State !== 'undefined' && State.passage) || '',
          source: _normaliseAiItemSource(sourceText),
          tags: [],
          usable: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      added.push({ name: name, qty: qty });
      if (summarizeNames.indexOf(name) === -1) summarizeNames.push(name);
    });
    if (store.length > 100) store.splice(0, store.length - 100);
    _persistAiItemStore();
    _renderAiItemsInLog();
    _summarizeAiItemSourceInBackground(sourceText, summarizeNames);
    return added;
  }

  function _expandAiItemTokens(token) {
    return ItemSchemaModule.expandAiItemTokens(token);
  }

  function _queueAiItemPickupCandidates(items, sourceText) {
    var cleaned = _filterAiRuntimeItems(_mergeAiItemListByName(items));
    if (!cleaned.length) return null;
    var id = 'aipick_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    _aiPickupCandidates[id] = {
      id: id,
      items: cleaned,
      source: _getAiItemRawSource(sourceText),
      createdAt: Date.now()
    };
    return _aiPickupCandidates[id];
  }

  function _formatAiPickupItems(items) {
    var cleaned = _filterAiRuntimeItems(_mergeAiItemListByName(items || []));
    return cleaned.map(function (item) {
      return _escapeAiHtml(item.name) + (item.qty > 1 ? ' x' + item.qty : '');
    }).join('\u3001');
  }

  function _makeAiPickupLine(candidate) {
    if (!candidate || !candidate.items || !candidate.items.length) return '';
    candidate.items = _filterAiRuntimeItems(_mergeAiItemListByName(candidate.items));
    if (!candidate.items.length) return '';
    return [
      '<div class="ai-pickup-line" data-ai-pickup-id="' + _escapeAiHtml(candidate.id) + '">',
      '<span class="ai-items-line">[\u53ef\u62fe\u53d6AI\u9053\u5177] ' + _formatAiPickupItems(candidate.items) + '</span> ',
      '<button type="button" class="ai-pickup-btn" data-ai-pickup-action="take">\u6536\u5165AI\u5e93\u5b58</button>',
      '<button type="button" class="ai-pickup-btn" data-ai-pickup-action="skip">\u4e0d\u62ff</button>',
      '</div>'
    ].join('');
  }

  function _consumeAiItems(items) {
    var store = _ensureAiItemStore();
    if (!store || !items || !items.length) return [];
    var consumed = [];
    items.forEach(function (item) {
      var name = _normaliseAiItemName(item && item.name);
      var qty = Math.max(1, parseInt(item && item.qty, 10) || 1);
      if (_isBadAiItemName(name)) return;
      var existing = store.find(function (entry) { return entry && entry.name === name; });
      if (!existing) return;
      var have = Math.max(1, parseInt(existing.qty, 10) || 1);
      var used = Math.min(have, qty);
      existing.qty = have - used;
      existing.updatedAt = Date.now();
      consumed.push({ name: name, qty: used });
    });
    for (var i = store.length - 1; i >= 0; i--) {
      if (!store[i] || Math.max(0, parseInt(store[i].qty, 10) || 0) <= 0) store.splice(i, 1);
    }
    _persistAiItemStore();
    _renderAiItemsInLog();
    return consumed;
  }

  function _isAiItemConsumableByDefault(item) {
    var name = _normaliseAiItemName(item && item.name);
    if (!name) return false;
    var type = String(item && (item.type || item.category) || _classifyAiItem({ name: name }));
    if (type === 'food') return true;
    return /(\u679c|\u91ce\u679c|\u6811\u8393|\u91ce\u8393|\u8393|\u6d46\u679c|\u6a31\u6843|\u82f9\u679c|\u68a8|\u8461\u8404|\u8336|\u9152|\u996e|\u836f|\u836f\u5242|\u836f\u7247|berry|berries|raspberry|fruit|drink|potion|medicine|pill)/i.test(name);
  }

  function _visibleAiItemUsageText(raw) {
    var text = String(raw || '');
    try { text = _removeAIEventBlocks(text); } catch (_) {}
    return text
      .replace(/\[AI_ITEMS_USED:\s*([^\]]+)\]\s*/gi, '')
      .replace(/\[(?:ITEMS?|STATS|LOC|AI_META)[^\]]*\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _isAiItemMentionedInVisibleText(raw, item) {
    var name = _normaliseAiItemName(item && item.name);
    if (!name) return true;
    var text = _visibleAiItemUsageText(raw);
    if (!text) return false;
    if (text.indexOf(name) >= 0) return true;
    if (/(\u8393|\u6d46\u679c|berry|berries|raspberry)/i.test(name)) {
      return /(\u8393|\u6d46\u679c|\u91ce\u679c|\u679c\u5b50|berry|berries|raspberry)/i.test(text);
    }
    return false;
  }

  function _appendMissingAiItemUsageLine(raw, selectedItems) {
    selectedItems = Array.isArray(selectedItems) ? selectedItems : [];
    var missing = selectedItems.filter(function (item) {
      return item && item.name && !_isAiItemMentionedInVisibleText(raw, item);
    });
    if (!missing.length) return raw;
    var visible = missing.map(function (item) {
      var qty = Math.max(1, parseInt(item.qty, 10) || 1);
      return _escapeAiHtml(item.name) + (qty > 1 ? ' x' + qty : '');
    }).join('\u3001');
    return String(raw || '').trim() + '<br><span class="ai-items-line">[AI\u9053\u5177\u4f7f\u7528] \u4f60\u4f7f\u7528\u4e86' + visible + '\u3002</span>';
  }

  function parseAndApplyAiItemUsage(text) {
    var raw = String(text || '');
    var eventData = _parseAIEventBlock(raw);
    var used = _collectAiRuntimeLostItems(raw, eventData);
    var selectedForTurn = _cloneForAiSnapshot(_lastAiItemsUsedForTurn || []);
    var autoConsumed = selectedForTurn.filter(_isAiItemConsumableByDefault).map(function (item) {
      return {
        name: item.name,
        qty: Math.max(1, parseInt(item.qty, 10) || 1)
      };
    });
    if (autoConsumed.length) used = _mergeAiItemListByName((used || []).concat(autoConsumed));
    if (selectedForTurn.length) raw = _appendMissingAiItemUsageLine(raw, selectedForTurn);
    raw = raw.replace(/\[AI_ITEMS_USED:\s*([^\]]+)\]\s*/gi, function (_, body) {
      return '';
    });
    var consumed = _consumeAiItems(used);
    if (consumed.length) {
      var visible = consumed.map(function (item) {
        return _escapeAiHtml(item.name) + (item.qty > 1 ? ' x' + item.qty : '');
      }).join('\u3001');
      raw = raw.trim() + '<br><span class="ai-items-line">[AI\u9053\u5177\u5df2\u6d88\u8017] ' + visible + '</span>';
    }
    return raw;
  }

  function _formatAiItemListForPrompt(items) {
    items = Array.isArray(items) ? items : [];
    return items.map(function (item) {
      return String(item.name || '').trim() + ' x' + Math.max(1, parseInt(item.qty, 10) || 1);
    }).filter(Boolean).join('; ');
  }

  function _findAiItemStoreEntryForUse(item) {
    var store = _getAiItemStore();
    if (!store || !store.length || !item) return null;
    var id = String(item.id || '').trim();
    var name = _normaliseAiItemName(item.name || '');
    if (id) {
      for (var i = 0; i < store.length; i++) {
        if (store[i] && String(store[i].id || '') === id) return store[i];
      }
    }
    if (name) {
      for (var j = 0; j < store.length; j++) {
        if (store[j] && _normaliseAiItemName(store[j].name || '') === name) return store[j];
      }
    }
    return null;
  }

  function _cleanAiItemPromptDetail(text, limit) {
    text = String(text || '')
      .replace(/\[(?:AI_EVENT|\/AI_EVENT|ITEMS?|STATS|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    limit = Math.max(40, Math.min(240, parseInt(limit, 10) || 120));
    return text.length > limit ? text.slice(0, limit) + '...' : text;
  }

  function _inferAiItemUseHint(item) {
    var name = _normaliseAiItemName(item && item.name);
    var type = String(item && (item.type || item.category) || _classifyAiItem(item || {}));
    if (type === 'food') return '食用、饮用或作为临时补给，正文应体现味道、饱腹/解渴/恢复或不适等即时效果';
    if (type === 'key') return '用于开锁、开启、进入、确认权限或解决阻挡';
    if (type === 'tool') return '作为工具或随身物件参与当前动作，帮助移动、采集、修理、遮挡、防护或互动';
    if (type === 'clue') return '用于查看、比对、追踪线索或推动判断';
    if (type === 'accessory') return '作为佩戴物、信物、伪装、交易物或情绪/关系触发物参与剧情';
    if (/(\u8393|\u6d46\u679c|\u91ce\u679c|\u679c\u5b50|berry|berries|raspberry|fruit)/i.test(name)) {
      return '食用或作为食物补给，正文应体现味道、解渴/恢复、弄脏手指或留下残渣等具体效果';
    }
    return '根据物品名称和来源判断合理用途，让它改变玩家动作、互动方式、环境反馈或下一步结果';
  }

  function _buildAiItemEffectContext(items, cfg, actionText) {
    items = Array.isArray(items) ? items : [];
    var lines = [];
    items.forEach(function (picked) {
      if (!picked || !picked.name) return;
      var storeItem = _findAiItemStoreEntryForUse(picked) || {};
      var merged = Object.assign({}, storeItem, picked);
      var qty = Math.max(1, parseInt(picked.qty, 10) || 1);
      var type = String(merged.type || merged.category || _classifyAiItem(merged));
      var desc = _cleanAiItemPromptDetail(merged.description || merged.source || '', 130);
      var source = _cleanAiItemPromptDetail(merged.sourceLocation || merged.passage || '', 60);
      var parts = [
        '- name=' + String(picked.name || '').trim(),
        'qty=' + qty,
        'type=' + type,
        'categoryLabel=' + _aiItemCategoryLabel(type),
        'useHint=' + _inferAiItemUseHint(merged)
      ];
      if (desc) parts.push('details=' + desc);
      if (source) parts.push('sourceLocation=' + source);
      lines.push(parts.join('; '));
    });
    if (!lines.length) return '';
    var action = _cleanAiItemPromptDetail(actionText || '', 100);
    var zh = !cfg || cfg.language === 'zh';
    return [
      '<item_effect_context>',
      action ? (zh ? '玩家本轮选择：' : 'Player action this turn: ') + action : '',
      lines.join('\n'),
      zh
        ? '这些是玩家确认要在本轮剧情中使用的物品详情。正文必须让物品影响行动过程或结果，而不是只在结尾标记里列出。'
        : 'These are the item details for this turn. The prose must let the items affect the action process or result, not merely list them in metadata.',
      '</item_effect_context>'
    ].filter(Boolean).join('\n');
  }

  function _takePendingAiItemUses() {
    var items = _pendingAiItemUses.slice();
    _pendingAiItemUses.length = 0;
    _lastAiItemsUsedForTurn = _cloneForAiSnapshot(items || []);
    return items;
  }

  function _buildAiItemUseBlock(items, cfg, actionText) {
    items = Array.isArray(items) ? items : [];
    if (!items.length) return '';
    var list = _formatAiItemListForPrompt(items);
    if (!list) return '';
    var effectContext = _buildAiItemEffectContext(items, cfg, actionText);
    if (cfg && cfg.language === 'zh') {
      return [
        '<ai_items_to_use>',
        list,
        '</ai_items_to_use>',
        effectContext,
        '\u73a9\u5bb6\u672c\u8f6e\u5df2\u786e\u8ba4\u4f7f\u7528\u4e0a\u9762\u7684AI\u9053\u5177\u3002\u4e0b\u4e00\u9875\u5267\u60c5\u5fc5\u987b\u8ba9\u6bcf\u4e2a\u5df2\u9009\u9053\u5177\u4ee5\u51c6\u786e\u540d\u79f0\u51fa\u73b0\u5728\u6b63\u6587\u91cc\uff0c\u5e76\u771f\u6b63\u53c2\u4e0e\u73a9\u5bb6\u884c\u52a8\u3002\u4e0d\u8981\u5ffd\u7565\uff0c\u4e0d\u8981\u53ea\u5728\u5143\u6570\u636e\u4e2d\u8bb0\u5f55\u3002',
        '\u5982\u679c\u9053\u5177\u6709 <item_effect_context> \u91cc\u7684 details/useHint\uff0c\u5fc5\u987b\u4f18\u5148\u6309\u8fd9\u4e9b\u4fe1\u606f\u5199\u5b83\u7684\u7528\u6cd5\u548c\u6548\u679c\u3002',
        '\u5982\u679c\u67d0\u4e2aAI\u9053\u5177\u5728\u5267\u60c5\u4e2d\u88ab\u6d88\u8017\u3001\u635f\u574f\u3001\u9001\u51fa\u6216\u4e22\u5931\uff0c\u5728 AI_EVENT \u91cc\u5199 itemsLost=\u9053\u5177\u540d x1; \u9053\u5177\u540d x2\u3002\u4e5f\u53ef\u517c\u5bb9\u9644\u52a0 [AI_ITEMS_USED: \u9053\u5177\u540d x1; \u9053\u5177\u540d x2]\u3002',
        '\u5982\u679c\u9053\u5177\u53ea\u662f\u5c55\u793a\u3001\u62ff\u51fa\u3001\u77ed\u6682\u4f7f\u7528\u540e\u6536\u56de\uff0citemsLost \u7559\u7a7a\uff0c\u7cfb\u7edf\u4f1a\u8ba9\u5b83\u56de\u5230AI\u5e93\u5b58\u3002'
      ].join('\n');
    }
    return [
      '<ai_items_to_use>',
      list,
      '</ai_items_to_use>',
      effectContext,
      'The player has confirmed using the AI items above this turn. The next story prose must mention every selected item by exact name and make it meaningfully participate in the action.',
      'If <item_effect_context> includes details/useHint, use that information first to decide how the item is used and what effect it has.',
      'If an item is consumed, broken, given away, or lost, write itemsLost=item name x1; item name x2 in AI_EVENT. You may also append [AI_ITEMS_USED: item name x1; item name x2] for compatibility.',
      'If the item is only shown, held, or briefly used and returned to the backpack, leave itemsLost empty.'
    ].join('\n');
  }

  function parseAndApplyNpcRelationships(text) {
    var raw = String(text || '');
    var eventData = _parseAIEventBlock(raw);
    var changes = _collectAiNpcRelationshipChanges(raw, eventData);
    if (!changes.length) return raw;
    var cfg = loadCfg();
    var limit = Math.max(1, Math.min(10, parseInt(cfg.npcRelationChangeLimit, 10) || 5));
    var root = _getAiNpcRoot();
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    var schema = _getAiNpcRelationSchema();
    var applied = [];
    changes.forEach(function (change) {
      if (!change || !change.npc || !schema[change.field]) return;
      var delta = Math.max(-limit, Math.min(limit, parseInt(change.delta, 10) || 0));
      if (!delta) return;
      var targets = [];
      if (root && root[change.npc] && root[change.npc][change.field] !== undefined) targets.push(root[change.npc]);
      if (V && V[change.npc] && V[change.npc][change.field] !== undefined && targets.indexOf(V[change.npc]) < 0) targets.push(V[change.npc]);
      if (!targets.length) return;
      targets.forEach(function (npc) {
        var nextVal = (Number(npc[change.field]) || 0) + delta;
        npc[change.field] = Math.max(-1000, Math.min(1000, nextVal));
      });
      applied.push({
        label: change.label || _toChineseName(change.npc) || change.npc,
        field: change.field,
        delta: delta
      });
    });
    if (!applied.length) return raw;
    var visible = applied.map(function (change) {
      var spec = schema[change.field] || { label: change.field };
      var color = change.delta >= 0 ? '#8f8' : '#f88';
      return '<span style="color:' + color + ';font-size:0.85em;">' +
        _escapeAiHtml(change.label) + ' ' + _escapeAiHtml(spec.label) + ' ' +
        (change.delta >= 0 ? '+' : '') + change.delta + '</span>';
    }).join(' | ');
    return raw.trim() + '<br><span class="ai-stats-line ai-npc-rel-line">[ ' + visible + ' ]</span>';
  }

  function _renderAiItemUsePanel($panel, $msg, $button, cfg) {
    var items = _getAiItemStore();
    $panel.empty();
    $msg.removeClass('ok err').empty();
    if (!items.length) {
      $panel.append($('<div class="ai-log-items-empty"></div>').text('\u6682\u65e0\u53ef\u7528AI\u9053\u5177'));
      return;
    }
    var $list = $('<div class="ai-item-use-list"></div>');
    items.forEach(function (item, idx) {
      var qty = Math.max(1, parseInt(item.qty, 10) || 1);
      var id = 'ai-use-item-' + Date.now().toString(36) + '-' + idx;
      var $row = $('<label class="ai-item-use-row"></label>');
      var $check = $('<input type="checkbox" class="ai-item-use-check">')
        .attr('id', id)
        .data('item-id', item.id || '')
        .data('item-name', item.name || '')
        .data('item-qty', qty);
      $row.append($check);
      $row.append($('<span class="ai-item-use-name"></span>').text(String(item.name || '').trim()));
      $row.append($('<span class="ai-item-use-qty"></span>').text('x' + qty));
      $list.append($row);
    });
    var $actions = $('<div class="ai-item-use-actions"></div>');
    var $ok = $('<button class="ai-choice-btn ai-item-use-ok" type="button"></button>').text('\u786e\u8ba4\u4f7f\u7528');
    var $clear = $('<button class="ai-choice-btn ai-item-use-clear" type="button"></button>').text('\u53d6\u6d88\u9009\u62e9');
    $ok.on('click', function () {
      var picked = [];
      $panel.find('.ai-item-use-check:checked').each(function () {
        var $c = $(this);
        picked.push({
          id: String($c.data('item-id') || ''),
          name: String($c.data('item-name') || ''),
          qty: Math.max(1, parseInt($c.data('item-qty'), 10) || 1)
        });
      });
      _pendingAiItemUses = picked;
      _updateAiItemUseButtonLabel($button, cfg || loadCfg());
      if (picked.length) {
        $msg.removeClass('err').addClass('ok').text('\u5df2\u9009\u62e9\uff1a' + _formatAiItemListForPrompt(picked) + '\u3002\u4e0b\u6b21AI\u5267\u60c5\u4f1a\u4f7f\u7528\u8fd9\u4e9b\u9053\u5177\u3002');
      } else {
        $msg.removeClass('ok').addClass('err').text('\u8bf7\u5148\u9009\u62e9\u8981\u4f7f\u7528\u7684AI\u9053\u5177\u3002');
      }
    });
    $clear.on('click', function () {
      _pendingAiItemUses.length = 0;
      $panel.find('.ai-item-use-check').prop('checked', false);
      _updateAiItemUseButtonLabel($button, cfg || loadCfg());
      $msg.removeClass('err').addClass('ok').text('\u5df2\u53d6\u6d88\u672c\u8f6e\u9053\u5177\u4f7f\u7528\u3002');
    });
    $actions.append($ok).append($clear);
    $panel.append($list).append($actions);
  }

  function parseAndApplyAiItems(text) {
    var raw = String(text || '');
    var eventData = _parseAIEventBlock(raw);
    var items = _collectAiRuntimeItems(raw, eventData);
    raw = raw.replace(/\[ITEMS?:\s*([^\]]+)\]\s*/gi, function (_, body) {
      return '';
    });
    // Inventory candidates must be explicit. Do not infer items from free prose.
    var candidate = _queueAiItemPickupCandidates(items, raw);
    if (candidate) raw = raw.trim() + '<br>' + _makeAiPickupLine(candidate);
    return raw;
  }

  function _renderAiItemsInLog() {
    try {
      _getAiItemStore();
      _cleanupInlineAiInventorySections();
    } catch (e) {
      console.warn('[AIStoryGen] cleanup AI items failed', e);
    }
  }

  function _cleanupInlineAiInventorySections() {
    $('.ai-log-items-section').remove();
    $('.ai-memory-inline').remove();
    $('a.ai-back-link').filter(function () {
      return /AI\s*记忆|AI\s*璁板繂|Memory/i.test(String($(this).text() || ''));
    }).remove();
  }

  function _classifyAiItem(item) {
    var name = String(item && item.name || '').trim();
    if (/(\u94a5\u5319|\u94a5|\u9501|key|lock)/i.test(name)) return 'key';
    if (/(\u6212\u6307|\u9879\u94fe|\u8033\u73af|\u624b\u956f|\u5fbd\u7ae0|\u53d1\u5939|\u9970\u54c1|ring|necklace|earring|bracelet|badge|clip)/i.test(name)) return 'accessory';
    if (/(\u5200|\u5251|\u68cd|\u5de5\u5177|\u9524|\u94f2|\u94c1\u9539|\u7ef3|\u53e3\u7434|\u4f1e|knife|tool|hammer|shovel|rope|harmonica|umbrella)/i.test(name)) return 'tool';
    if (/(\u98df|\u996d|\u7cd6|\u6c34|\u725b\u5976|\u9762\u5305|\u72d7\u7cae|\u9e21\u86cb|\u679c|\u91ce\u679c|\u6811\u8393|\u91ce\u8393|\u8393|\u6d46\u679c|food|water|milk|bread|candy|feed|egg|berry|berries|raspberry|fruit)/i.test(name)) return 'food';
    if (/(\u4fe1|\u7eb8|\u7b14\u8bb0|\u7167\u7247|\u5730\u56fe|\u7ebf\u7d22|\u65e5\u8bb0|letter|note|photo|map|clue|journal|diary)/i.test(name)) return 'clue';
    return 'other';
  }

  function _aiItemCategoryLabel(key) {
    var map = {
      all: '\u5168\u90e8',
      key: '\u94a5\u5319',
      accessory: '\u9970\u54c1',
      tool: '\u5de5\u5177',
      food: '\u98df\u7269',
      clue: '\u7ebf\u7d22',
      other: '\u5176\u4ed6'
    };
    return map[key] || map.other;
  }

  function _discardAiItem(itemId) {
    var store = _ensureAiItemStore();
    if (!store || !itemId) return false;
    for (var i = store.length - 1; i >= 0; i--) {
      if (store[i] && store[i].id === itemId) {
        store.splice(i, 1);
        _persistAiItemStore();
        return true;
      }
    }
    return false;
  }

  function _buildAiInventoryOverlay($root, activeCategory) {
    var items = _getAiItemStore();
    $root.empty().addClass('ai-inventory-page');
    $root.append($('<h2></h2>').text('AI\u5e93\u5b58'));
    activeCategory = activeCategory || 'all';

    var categories = ['all', 'key', 'accessory', 'tool', 'food', 'clue', 'other'];
    var $cats = $('<div class="ai-inventory-cats"></div>');
    categories.forEach(function (cat) {
      var count = cat === 'all'
        ? items.length
        : items.filter(function (item) { return _classifyAiItem(item) === cat; }).length;
      var $cat = $('<button type="button" class="ai-inventory-cat"></button>')
        .toggleClass('active', cat === activeCategory)
        .attr('data-ai-inventory-cat', cat)
        .text(_aiItemCategoryLabel(cat) + (count ? ' ' + count : ''));
      $cat.on('click', function () { _buildAiInventoryOverlay($root, cat); });
      $cats.append($cat);
    });
    $root.append($cats);

    if (!items.length) {
      $root.append($('<div class="ai-log-items-empty"></div>').text('\u6682\u65e0AI\u9053\u5177'));
      return;
    }
    var shown = activeCategory === 'all'
      ? items.slice()
      : items.filter(function (item) { return _classifyAiItem(item) === activeCategory; });
    if (!shown.length) {
      $root.append($('<div class="ai-log-items-empty"></div>').text('\u8fd9\u4e00\u7c7b\u6682\u65e0AI\u9053\u5177'));
      return;
    }
    var $list = $('<div class="ai-inventory-list"></div>');
    shown.forEach(function (item) {
      var qty = Math.max(1, parseInt(item.qty, 10) || 1);
      var $row = $('<div class="ai-inventory-row"></div>');
      $row.append($('<span class="ai-log-item-tag"></span>').text('AI\u9053\u5177'));
      $row.append($('<span class="ai-inventory-cat-label"></span>').text(_aiItemCategoryLabel(_classifyAiItem(item))));
      $row.append($('<span class="ai-inventory-name"></span>').text(String(item.name || '').trim()));
      $row.append($('<span class="ai-inventory-qty"></span>').text('x' + qty));
      var $discard = $('<button type="button" class="ai-inventory-discard"></button>').text('\u4e22\u5f03');
      $discard.on('click', function () {
        if (!_discardAiItem(item.id)) return;
        _pendingAiItemUses = _pendingAiItemUses.filter(function (picked) { return picked && picked.id !== item.id; });
        _buildAiInventoryOverlay($root, activeCategory);
      });
      $row.append($discard);
      if (item.source) $row.append($('<div class="ai-log-item-source"></div>').text(String(item.source || '')));
      $list.append($row);
    });
    $root.append($list);
  }

  function _buildAiMemoryOverlay($root) {
    if (MemoryUI && typeof MemoryUI.buildOverlay === 'function') {
      return MemoryUI.buildOverlay($root);
    }
    $root.empty().addClass('ai-memory-page ai-cfg');
    $root.append($('<h2></h2>').text('AI记忆'));
    var $body = $('<div class="ai-memory-body"></div>');
    var $msg = $('<div class="ai-cfg-msg"></div>');
    renderMemoryEntries($body, $msg);
    $root.append($body).append($msg);
  }

  function injectAiInventoryLogTab() {
    _cleanupInlineAiInventorySections();
    setTimeout(_cleanupInlineAiInventorySections, 50);
    setTimeout(_cleanupInlineAiInventorySections, 250);
    var overlay = document.getElementById('customOverlay');
    var $tabBar = $('#overlayTabs');
    var $content = $('#customOverlayContent');
    if (!$tabBar.length || !$content.length) return;
    if (overlay && overlay.getAttribute('data-overlay') === 'options') return;
    var tabText = ($tabBar.text() || '') + ' ' + (overlay ? (overlay.getAttribute('data-overlay') || '') : '');
    if (!/(\u65e5\u5fd7|\u7b14\u8bb0|log|journal|note)/i.test(tabText)) return;
    var $closeBtn = $('#overlayTabs .customOverlayClose');
    function addLogTab(id, label, buildFn) {
      if ($('#' + id).length) return;
      var $btn = $('<button></button>').attr('id', id).text(label);
      $btn.on('click', function () {
        $('#overlayTabs button').removeClass('tab-selected');
        $btn.addClass('tab-selected');
        var $wrap = $('<div></div>');
        $content.empty().append($wrap);
        buildFn($wrap);
      });
      if ($closeBtn.length) $btn.insertBefore($closeBtn);
      else $tabBar.append($btn);
    }

    addLogTab('aiMemoryTab', 'AI记忆', function ($wrap) {
      _buildAiMemoryOverlay($wrap);
    });
    addLogTab('aiInventoryTab', 'AI\u5e93\u5b58', function ($wrap) {
      $wrap.addClass('ai-inventory-wrap');
      _buildAiInventoryOverlay($wrap);
    });
  }

  function scheduleAiInventoryTabInjection(delay) {
    setTimeout(injectAiInventoryLogTab, delay || 0);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.ai-pickup-btn') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var line = btn.closest('.ai-pickup-line');
    var id = line ? line.getAttribute('data-ai-pickup-id') : '';
    if (line && line.getAttribute('data-ai-pickup-processed') === '1') return;
    if (line) line.setAttribute('data-ai-pickup-processed', '1');
    var candidate = id ? _aiPickupCandidates[id] : null;
    if (!candidate) {
      if (line) line.remove();
      return;
    }
    var action = btn.getAttribute('data-ai-pickup-action') || '';
    if (action === 'take') {
      var added = _recordAiItems(candidate.items, candidate.source);
      if (line) {
        if (added && added.length) {
          line.innerHTML = '<span class="ai-items-line">[AI\u9053\u5177\u5df2\u6536\u5165] ' + _formatAiPickupItems(added) + '</span>';
        } else {
          line.innerHTML = '<span class="ai-items-line">[AI\u9053\u5177] \u6ca1\u6709\u53ef\u6536\u5165\u7684\u6709\u6548AI\u9053\u5177</span>';
        }
      }
    } else {
      if (line) line.innerHTML = '<span class="ai-items-line">[AI\u9053\u5177] \u672a\u62fe\u53d6</span>';
    }
    delete _aiPickupCandidates[id];
  }, true);

  function _inferMoneyDeltaFromNarrative(text) {
    text = String(text || '');
    var moneyWords = '(?:钱|金钱|现金|零钱|硬币|钞票|纸币|钱包|coin|coins|cash|money|note|notes|purse|wallet)';
    var gainWords = '(?:找到|发现|捡到|拾起|翻出|获得|拿到|得到|收下|收入|偷到|偷走|find|found|pick up|picked up|take|took|gain|gained|earn|earned|steal|stole)';
    var neg = new RegExp('(?:没|没有|未|no|not|nothing).{0,12}' + moneyWords, 'i');
    if (neg.test(text)) return 0;
    var positive = new RegExp(gainWords + '[\\s\\S]{0,40}' + moneyWords + '|' + moneyWords + '[\\s\\S]{0,40}' + gainWords, 'i');
    if (!positive.test(text)) return 0;

    var pound = text.match(/[£￡]\s*(\d+(?:\.\d{1,2})?)/);
    if (pound) return Math.max(1, Math.round(parseFloat(pound[1]) * 100));

    var numeric = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:英镑|镑|元|块|便士|pence|p)\b/i);
    if (numeric) {
      var amount = parseFloat(numeric[1]);
      return /便士|pence|p\b/i.test(numeric[0]) ? Math.max(1, Math.round(amount)) : Math.max(1, Math.round(amount * 100));
    }

    // Money must be explicit. Do not invent a default amount from keywords.
    return 0;
  }

  function _updateAiItemUseButtonLabel($btn, cfg) {
    if (!$btn || !$btn.length) return;
    var base = cfg && cfg.language === 'zh' ? '\u4f7f\u7528\u9053\u5177' : 'Use items';
    var count = Array.isArray(_pendingAiItemUses) ? _pendingAiItemUses.length : 0;
    $btn.text(count > 0 ? base + '（已选' + count + '）' : base);
  }

  function _closeAiItemUseDialog() {
    try { $(document).off('keydown.aiItemUseDialog'); } catch (_) {}
    try { $('.ai-item-use-backdrop').remove(); } catch (_) {}
    _aiItemUseDialogState = null;
  }

  function _initialAiItemUseSelection() {
    var selected = {};
    (_pendingAiItemUses || []).forEach(function (item) {
      if (!item || !item.id) return;
      selected[String(item.id)] = {
        id: String(item.id || ''),
        name: String(item.name || ''),
        qty: Math.max(1, parseInt(item.qty, 10) || 1)
      };
    });
    return selected;
  }

  function _syncAiItemUseDialogSelection($dialog) {
    if (!_aiItemUseDialogState) return;
    $dialog.find('.ai-item-use-dialog-row').each(function () {
      var $row = $(this);
      var id = String($row.attr('data-ai-item-id') || '');
      if (!id) return;
      var max = Math.max(1, parseInt($row.attr('data-ai-item-max'), 10) || 1);
      var qty = Math.max(0, Math.min(max, parseInt($row.attr('data-ai-item-qty'), 10) || 0));
      if (qty <= 0) {
        delete _aiItemUseDialogState.selected[id];
        return;
      }
      _aiItemUseDialogState.selected[id] = {
        id: id,
        name: String($row.attr('data-ai-item-name') || ''),
        qty: qty
      };
    });
  }

  function _renderAiItemUseDialogBody($dialog, $button, cfg) {
    if (!_aiItemUseDialogState) return;
    var items = _getAiItemStore();
    var activeCategory = _aiItemUseDialogState.category || 'all';
    var categories = ['all', 'key', 'accessory', 'tool', 'food', 'clue', 'other'];
    var $body = $dialog.find('.ai-item-use-dialog-body').empty();

    var $cats = $('<div class="ai-inventory-cats ai-item-use-dialog-cats"></div>');
    categories.forEach(function (cat) {
      var count = cat === 'all'
        ? items.length
        : items.filter(function (item) { return _classifyAiItem(item) === cat; }).length;
      var $cat = $('<button type="button" class="ai-inventory-cat"></button>')
        .toggleClass('active', cat === activeCategory)
        .attr('data-ai-inventory-cat', cat)
        .text(_aiItemCategoryLabel(cat) + (count ? ' ' + count : ''));
      $cat.on('click', function () {
        _syncAiItemUseDialogSelection($dialog);
        _aiItemUseDialogState.category = cat;
        _renderAiItemUseDialogBody($dialog, $button, cfg);
      });
      $cats.append($cat);
    });
    $body.append($cats);

    if (!items.length) {
      $body.append($('<div class="ai-log-items-empty"></div>').text('\u6682\u65e0\u53ef\u7528AI\u9053\u5177'));
      return;
    }

    var shown = activeCategory === 'all'
      ? items.slice()
      : items.filter(function (item) { return _classifyAiItem(item) === activeCategory; });
    if (!shown.length) {
      $body.append($('<div class="ai-log-items-empty"></div>').text('\u8fd9\u4e00\u7c7b\u6682\u65e0AI\u9053\u5177'));
      return;
    }

    var $list = $('<div class="ai-inventory-list ai-item-use-dialog-list"></div>');
    shown.forEach(function (item) {
      var id = String(item.id || '');
      var name = String(item.name || '').trim();
      var maxQty = Math.max(1, parseInt(item.qty, 10) || 1);
      var selected = id && _aiItemUseDialogState.selected[id];
      var pickedQty = selected ? Math.max(1, Math.min(maxQty, parseInt(selected.qty, 10) || 1)) : 0;
      var $row = $('<div class="ai-inventory-row ai-item-use-dialog-row"></div>')
        .attr('data-ai-item-id', id)
        .attr('data-ai-item-name', name)
        .attr('data-ai-item-max', maxQty)
        .attr('data-ai-item-qty', pickedQty)
        .toggleClass('is-selected', pickedQty > 0);
      var $selectedBadge = $('<span class="ai-item-use-dialog-selected-badge"></span>').text('\u5df2\u7528');
      var $minus = $('<button type="button" class="ai-item-use-dialog-qty-btn" aria-label="\u51cf\u5c11\u4f7f\u7528\u6570\u91cf"></button>').text('-');
      var $plus = $('<button type="button" class="ai-item-use-dialog-qty-btn" aria-label="\u589e\u52a0\u4f7f\u7528\u6570\u91cf"></button>').text('+');
      var $qtyValue = $('<span class="ai-item-use-dialog-qty-value"></span>').text('x' + pickedQty);
      var $discard = $('<button type="button" class="ai-item-use-dialog-delete"></button>').text('\u5220\u9664');
      function refreshRowVisual() {
        var on = pickedQty > 0;
        $row.toggleClass('is-selected', on);
        $minus.prop('disabled', pickedQty <= 0);
        $plus.prop('disabled', pickedQty >= maxQty);
        $row.attr('data-ai-item-qty', pickedQty);
        $qtyValue.text('x' + pickedQty);
      }
      function setQty(nextQty) {
        pickedQty = Math.max(0, Math.min(maxQty, parseInt(nextQty, 10) || 0));
        refreshRowVisual();
        _syncAiItemUseDialogSelection($dialog);
      }
      $row.on('click', function (ev) {
        if ($(ev.target).closest('button,input,a,label').length) return;
        setQty(pickedQty > 0 ? 0 : 1);
      });
      $minus.on('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setQty(pickedQty - 1);
      });
      $plus.on('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setQty(pickedQty + 1);
      });
      $discard.on('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!_discardAiItem(id)) return;
        delete _aiItemUseDialogState.selected[id];
        _pendingAiItemUses = _pendingAiItemUses.filter(function (picked) { return picked && picked.id !== id; });
        _updateAiItemUseButtonLabel($button, cfg);
        $dialog.find('.ai-item-use-dialog-msg').removeClass('err').addClass('ok').text('\u5df2\u5220\u9664\uff1a' + name);
        _renderAiItemUseDialogBody($dialog, $button, cfg);
      });
      refreshRowVisual();
      $row.append($('<span class="ai-item-use-dialog-pick"></span>').append($selectedBadge));
      $row.append($('<span class="ai-log-item-tag"></span>').text('AI\u9053\u5177'));
      $row.append($('<span class="ai-inventory-cat-label"></span>').text(_aiItemCategoryLabel(_classifyAiItem(item))));
      $row.append($('<span class="ai-inventory-name"></span>').text(name));
      $row.append($('<span class="ai-inventory-qty"></span>').text('持有 x' + maxQty));
      $row.append($('<div class="ai-item-use-dialog-qty-wrap"></div>').append($('<span></span>').text('\u4f7f\u7528')).append($minus).append($qtyValue).append($plus));
      $row.append($discard);
      if (item.source) $row.append($('<div class="ai-log-item-source"></div>').text(String(item.source || '')));
      $list.append($row);
    });
    $body.append($list);
  }

  function _openAiItemUseDialog($button, cfg) {
    _closeAiItemUseDialog();
    cfg = cfg || loadCfg();
    _aiItemUseDialogState = {
      category: 'all',
      selected: _initialAiItemUseSelection()
    };
    var $backdrop = $('<div class="ai-item-use-backdrop" role="presentation"></div>');
    var $dialog = $('<div class="ai-item-use-dialog" role="dialog" aria-modal="true"></div>');
    var $title = $('<div class="ai-item-use-dialog-title"></div>').text(cfg.language === 'zh' ? '选择使用 AI 道具' : 'Choose AI items');
    var $close = $('<button type="button" class="ai-item-use-dialog-close" aria-label="Close"></button>').text('×');
    var $body = $('<div class="ai-item-use-dialog-body"></div>');
    var $msg = $('<div class="ai-cfg-msg ai-item-use-dialog-msg"></div>');
    var $actions = $('<div class="ai-item-use-dialog-actions"></div>');
    var $confirm = $('<button type="button" class="ai-choice-btn ai-item-use-dialog-confirm"></button>').text(cfg.language === 'zh' ? '确认使用' : 'Confirm');
    var $cancel = $('<button type="button" class="ai-choice-btn ai-item-use-dialog-cancel"></button>').text(cfg.language === 'zh' ? '取消' : 'Cancel');
    $dialog.append($('<div class="ai-item-use-dialog-head"></div>').append($title).append($close));
    $dialog.append($body).append($msg);
    $actions.append($confirm).append($cancel);
    $dialog.append($actions);
    $backdrop.append($dialog);
    $('body').append($backdrop);

    function closeOnly() {
      _closeAiItemUseDialog();
    }
    $close.on('click', closeOnly);
    $cancel.on('click', closeOnly);
    $backdrop.on('click', function (ev) {
      if (ev.target === $backdrop[0]) closeOnly();
    });
    $(document).on('keydown.aiItemUseDialog', function (ev) {
      if (ev.key === 'Escape') closeOnly();
    });
    $confirm.on('click', function () {
      _syncAiItemUseDialogSelection($dialog);
      var picked = Object.keys(_aiItemUseDialogState.selected).map(function (id) {
        return _aiItemUseDialogState.selected[id];
      }).filter(function (item) { return item && item.name; });
      _pendingAiItemUses = picked;
      _updateAiItemUseButtonLabel($button, cfg);
      if (picked.length) {
        _showAIUserMessage((cfg.language === 'zh' ? '已选择AI道具：' : 'Selected AI items: ') + _formatAiItemListForPrompt(picked), false);
      } else {
        _showAIUserMessage(cfg.language === 'zh' ? '本轮未选择AI道具。' : 'No AI items selected this turn.', false);
      }
      _closeAiItemUseDialog();
    });
    _renderAiItemUseDialogBody($dialog, $button, cfg);
    setTimeout(function () { try { $dialog.find('button, input').filter(':visible').first().focus(); } catch (_) {} }, 0);
  }

  function _parseAiMoneyAmount(raw, hadCurrency) {
    raw = String(raw || '').replace(/,/g, '').trim();
    if (!raw) return 0;
    var n = parseFloat(raw);
    if (!isFinite(n) || n <= 0) return 0;
    // DoL stores money as pence. Explicit pound signs are converted; plain
    // numeric story amounts are treated as the same unit used by [STATS: money].
    return hadCurrency ? Math.max(1, Math.round(n * 100)) : Math.max(1, Math.round(n));
  }

  function _parseChineseMoneyNumber(raw) {
    raw = String(raw || '').replace(/\s+/g, '').trim();
    if (!raw) return 0;
    var digits = {
      '\u96f6': 0, '\u3007': 0,
      '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2,
      '\u4e09': 3, '\u56db': 4, '\u4e94': 5,
      '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9
    };
    var smallUnits = { '\u5341': 10, '\u767e': 100, '\u5343': 1000 };
    var largeUnits = { '\u4e07': 10000, '\u842c': 10000, '\u4ebf': 100000000, '\u5104': 100000000 };
    var total = 0;
    var section = 0;
    var number = 0;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (Object.prototype.hasOwnProperty.call(digits, ch)) {
        number = digits[ch];
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(smallUnits, ch)) {
        section += (number || 1) * smallUnits[ch];
        number = 0;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(largeUnits, ch)) {
        section += number;
        total += (section || 1) * largeUnits[ch];
        section = 0;
        number = 0;
        continue;
      }
      return 0;
    }
    return total + section + number;
  }

  function _inferExplicitMoneyDeltaFromNarrative(text) {
    var raw = _removeAIEventBlocks(String(text || ''))
      .replace(/\[STATS:\s*[^\]]+\]/gi, ' ')
      .replace(/\[(?:ITEMS?|AI_ITEMS_USED|LOC|AI_META)[^\]]*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return 0;
    var isSpend = /(\u4e70|\u8d2d|\u4e70\u4e0b|\u8d2d\u4e70|\u652f\u4ed8|\u4ed8\u7ed9|\u4ed8\u4e86|\u82b1\u8d39|\u82b1\u4e86|\u552e\u4ef7|\u4ef7\u683c|\u8981\u4ef7|\u6210\u4ea4|\u6263\u9664|buy|bought|pay|paid|spend|spent|cost|price|purchase)/i.test(raw);
    var isGain = /(\u627e\u5230|\u53d1\u73b0|\u83b7\u5f97|\u5f97\u5230|\u8d5a|\u5356\u51fa|\u6536\u5230|\u6536\u5165|find|found|gain|gained|earn|earned|sell|sold|receive|received)/i.test(raw);
    if (!isSpend && !isGain) return 0;
    var amounts = [];
    var re = /([\u00a3\uffe1\u5143])?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\u5143|\u4fbf\u58eb|pence|p)?/gi;
    var m;
    while ((m = re.exec(raw))) {
      var before = raw.slice(Math.max(0, m.index - 24), m.index);
      var after = raw.slice(re.lastIndex, Math.min(raw.length, re.lastIndex + 24));
      var windowText = before + m[0] + after;
      if (!/(\u94b1|\u91d1\u94b1|\u73b0\u91d1|\u4ef7|\u552e|\u4e70|\u8d2d|\u652f\u4ed8|\u4ed8|\u82b1|\u6263|\u5b9d\u77f3|\u82f1\u9551|\u9551|gem|\u00a3|\uffe1|\u5143|money|cash|price|cost|pay|paid|buy|bought|purchase)/i.test(windowText)) continue;
      var hadCurrency = !!m[1] || /(\u5143|\u4fbf\u58eb|pence|p)/i.test(m[0]);
      var amount = _parseAiMoneyAmount(m[2], /[\u00a3\uffe1]/.test(m[1] || '') || (/(\u5143)/.test(m[0]) ? false : false));
      if (amount) amounts.push(amount);
    }
    var cnRe = /([\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u842c\u4ebf\u5104]{1,16})\s*(?:\u82f1\u9551|\u9551|\u5143|\u4fbf\u58eb)?/g;
    while ((m = cnRe.exec(raw))) {
      before = raw.slice(Math.max(0, m.index - 24), m.index);
      after = raw.slice(cnRe.lastIndex, Math.min(raw.length, cnRe.lastIndex + 24));
      windowText = before + m[0] + after;
      if (!/(\u94b1|\u91d1\u94b1|\u73b0\u91d1|\u4ef7|\u552e|\u4e70|\u8d2d|\u652f\u4ed8|\u4ed8|\u82b1|\u6263|\u5b9d\u77f3|\u82f1\u9551|\u9551|gem|money|cash|price|cost|pay|paid|buy|bought|purchase)/i.test(windowText)) continue;
      amount = _parseChineseMoneyNumber(m[1]);
      if (amount) amounts.push(amount);
    }
    if (!amounts.length) return 0;
    var picked = Math.max.apply(Math, amounts);
    return isSpend ? -picked : picked;
  }

  function _getAiRuntimeStatSchema() {
    return EventSchemaModule.getRuntimeStatSchema();
  }

  function _resolveAiRuntimeStat(key) {
    return EventSchemaModule.resolveRuntimeStat(key);
  }

  function _getAiRuntimeStatLabel(key) {
    return EventSchemaModule.getRuntimeStatLabel(key);
  }

  function _getAiRuntimeStatLimit(key, defaultLimit) {
    return EventSchemaModule.getRuntimeStatLimit(key, defaultLimit);
  }

  function _formatAiRuntimeStatAllowlist() {
    return EventSchemaModule.formatRuntimeStatAllowlist();
  }

  function _formatAiRuntimeNonMoneyStatAllowlist() {
    return _formatAiRuntimeStatAllowlist()
      .split(/\s*,\s*/)
      .filter(function (key) { return String(key || '').toLowerCase() !== 'money'; })
      .join(', ');
  }

  function _pushNormalisedAiStatPart(out, seen, part, explicitMoneyDelta) {
    return EventSchemaModule.pushNormalisedStatPart(out, seen, part, explicitMoneyDelta);
  }

  function _collectAiRuntimeStatChanges(rawText, eventData, includeNarrativeMoney) {
    var explicitMoneyDelta = _inferExplicitMoneyDeltaFromNarrative(rawText);
    var out = [];
    var seen = {};
    eventData = eventData || _parseAIEventBlock(rawText);
    var allowLegacyMoneyMarker = !!eventData.moneyChange;
    if (eventData.moneyChange) {
      _pushNormalisedAiStatPart(out, seen, 'money' + (String(eventData.moneyChange).charAt(0) === '-' ? '' : '+') + eventData.moneyChange, explicitMoneyDelta);
    }
    _parseListField(eventData.statChanges || eventData.stats || '').forEach(function (part) {
      _pushNormalisedAiStatPart(out, seen, part, explicitMoneyDelta);
    });
    _parseStatsChangesFromText(rawText).forEach(function (part) {
      if (/^\s*money\s*[+-]/i.test(String(part || '')) && !allowLegacyMoneyMarker) return;
      _pushNormalisedAiStatPart(out, seen, part, explicitMoneyDelta);
    });
    return { parts: out, explicitMoneyDelta: explicitMoneyDelta };
  }

  // Parse [STATS: arousal+5, stress-10] from AI output and apply to game state
  function parseAndApplyStats(text) {
    var runtimeStats = _collectAiRuntimeStatChanges(text, null, true);
    var match = text.match(/\[STATS:\s*([^\]]+)\]/i);
    var explicitMoneyDelta = runtimeStats.explicitMoneyDelta;
    var inferredMoney = 0;
    if (!runtimeStats.parts.length && !inferredMoney) return text;
    // Remove raw [STATS: ...] line — we'll add a visible version back
    var cleanText = match ? text.replace(/\[STATS:\s*[^\]]+\]\s*/gi, '').trim() : text;
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    if (!V) return cleanText;
    var keyMap = {
      'arousal': 'arousal', 'stress': 'stress', 'pain': 'pain',
      'trauma': 'trauma', 'awareness': 'awareness', 'lewdity': 'lewdity',
      'fatigue': 'tiredness', 'purity': 'purity',
      'exhibitionism': 'exhibitionism', 'promiscuity': 'promiscuity',
      'deviancy': 'deviancy', 'masochism': 'masochism',
      'skulduggery': 'skulduggery', 'swimming': 'swimming',
      'athletics': 'athletics', 'tending': 'tending', 'seduction': 'seduction',
      'willpower': 'willpower', 'physique': 'physique', 'dancing': 'dancing',
      'housekeeping': 'housekeeping', 'science': 'science', 'english': 'english',
      'maths': 'maths', 'history': 'history', 'money': 'money',
      'beauty': 'beauty', 'charm': 'charm', 'lust': 'lust',
      'control': 'control', 'drunk': 'drunk', 'drugged': 'drugged',
      'hallucinogen': 'hallucinogen'
    };
    var cfg = loadCfg();
    var defaultLimit = Math.max(0, parseInt(cfg.statChangeLimit, 10) || 50);
    var statLimits = {
      money: Math.max(100000, defaultLimit * 200),
    };
    function clampDelta(key, val) {
      var limit = _getAiRuntimeStatLimit(key, defaultLimit);
      if (limit <= 0) return 0;
      return Math.max(-limit, Math.min(limit, val));
    }
    var zhNames = { arousal: '兴奋', stress: '压力', pain: '疼痛', trauma: '创伤', awareness: '觉知', lewdity: '淫乱', tiredness: '疲劳', purity: '纯洁', exhibitionism: '暴露癖', promiscuity: '淫乱癖', deviancy: '变态癖', masochism: '受虐癖', skulduggery: '偷窃', swimming: '游泳', athletics: '运动', tending: '护理', seduction: '诱惑', willpower: '意志力', physique: '体质', dancing: '舞蹈', housekeeping: '家政', science: '科学', english: '英语', maths: '数学', history: '历史', money: '金钱', beauty: '美貌', charm: '魅力', lust: '性欲', control: '自控', drunk: '醉酒', drugged: '药物', hallucinogen: '致幻' };
    var parts = runtimeStats.parts.slice();
    if (inferredMoney) parts.push('money' + (inferredMoney >= 0 ? '+' : '') + inferredMoney);
    var changed = [];
    parts.forEach(function (part) {
      var m = part.match(/(\w+)\s*([+-]\d+)/);
      if (!m) return;
      var key = m[1].toLowerCase();
      var val = parseInt(m[2], 10);
      var statSpec = _resolveAiRuntimeStat(key);
      if (!statSpec) return;
      var mappedKey = statSpec.target;
      if (mappedKey === 'money' && explicitMoneyDelta && Math.sign(explicitMoneyDelta) === Math.sign(val) && Math.abs(explicitMoneyDelta) !== Math.abs(val)) {
        console.warn('[AIStoryGen] money marker adjusted to match narrative amount: marker=' + val + ', narrative=' + explicitMoneyDelta);
        val = explicitMoneyDelta;
      }
      if (V[mappedKey] !== undefined) {
        var appliedVal = clampDelta(mappedKey, val);
        if (!appliedVal) return;
        var nextVal = (Number(V[mappedKey]) || 0) + appliedVal;
        V[mappedKey] = mappedKey === 'money'
          ? Math.max(0, nextVal)
          : Math.max(0, Math.min(20000, nextVal));
        changed.push(mappedKey + (appliedVal >= 0 ? '+' : '') + appliedVal);
      }
    });
    if (changed.length) {
      console.log('[AIStoryGen] stats applied:', changed.join(', '));
      // Build visible stats line like the original game
      var visible = changed.map(function (c) {
        var m = c.match(/(\w+)([+-]\d+)/);
        if (!m) return c;
        var label = _getAiRuntimeStatLabel(m[1]) || m[1];
        var isMoney = String(m[1] || '').toLowerCase() === 'money';
        var color = isMoney
          ? (m[2].charAt(0) === '+' ? '#8f8' : '#f88')
          : (m[2].charAt(0) === '+' ? '#f88' : '#8f8');
        return '<span style="color:' + color + ';font-size:0.85em;">' + label + ' ' + m[2] + '</span>';
      }).join(' | ');
      cleanText += '<br><span class="ai-stats-line">[ ' + visible + ' ]</span>';

      _refreshGameVisualState();
      setTimeout(_refreshGameVisualState, 50);
      setTimeout(_refreshGameVisualState, 250);

      // Refresh DoL sidebar stat bars and canvas immediately
      // DoL statmeters use <<paincaption>>/<<arousalcaption>> widgets that only
      // re-render on passage transition. Force-refresh them via Wikifier.
      try {
        var captionIds = ['paincaption','arousalcaption','tirednesscaption','stresscaption','traumacaption','controlcaption','allurecaption','druggedcaption'];
        captionIds.forEach(function (cid) {
          var el = document.getElementById(cid);
          if (el && typeof Wikifier !== 'undefined') {
            try {
              var tmp = document.createElement('span');
              new Wikifier(tmp, '<<' + cid + '>>');
              el.innerHTML = tmp.innerHTML;
            } catch (_) {}
          }
        });
      } catch (_) {}
      // Refresh sidebar description (clothing/appearance), body image, etc.
      try {
        if (typeof Wikifier !== 'undefined' && window.passage) {
          $('#sidebardescription').each(function () {
            try { Wikifier.wikifyEval(this.innerHTML); } catch (_) {}
          });
        }
      } catch (_) {}
      // DoL Dynamic canvas render
      try {
        if (typeof window.Dynamic !== 'undefined' && window.Dynamic.render) {
          window.Dynamic.render();
        }
      } catch (_) {}
      // Also trigger SugarCube's passage display for non-Dynamic sidebar elements
      try {
        if (typeof State !== 'undefined' && State.temporary) {
          State.temporary().forcerender = true;
        }
      } catch (_) {}
    }
    return cleanText;
  }

  // Append AI narrative to passage — preserves game content above
  function _prepareAiNarrativeTextEffects(rawText, cfg, opts) {
    opts = opts || {};
    cfg = cfg || loadCfg();
    var cleanText = parseAndApplyStats(rawText);
    cleanText = parseAndApplyNpcRelationships(cleanText);
    cleanText = parseAndApplyAiItems(cleanText);
    cleanText = parseAndApplyAiItemUsage(cleanText);
    if (opts.postProcess !== false) cleanText = applyPostProcess(cleanText, cfg);
    if (cfg.language === 'zh') cleanText = _localizeNamesInText(cleanText);
    return {
      ok: true,
      rawText: String(rawText || ''),
      cleanText: cleanText,
      metadataText: cleanText,
      reason: opts.reason || ''
    };
  }

  var _aiTransactionEngine = TransactionModule.create({
    publicSchemaVersion: 5,
    loadCfg: loadCfg,
    captureRuntimeSnapshot: _captureAIRuntimeSnapshot,
    restoreRuntimeSnapshot: _restoreAIRuntimeSnapshot,
    captureGameSnapshot: _captureGameSnapshot,
    restoreGameSnapshot: _restoreGameSnapshot,
    prepareNarrativeTextEffects: _prepareAiNarrativeTextEffects,
    getLastChoiceText: function () { return _lastChoiceText || ''; },
    parseLocationMarker: parseLocationMarker,
    inferLocationFromText: inferLocationFromText,
    eventSuppressesLocationFallback: _aiEventSuppressesLocationFallback,
    stripAIMetadataMarkers: _stripAIMetadataMarkers,
    recordAiEventMemory: _recordAiEventMemory,
    lastAiEventLocationStatus: _lastAiEventLocationStatus,
    markLocationInTransit: _markAiLocationInTransit,
    warn: function (message, err) {
      try { console.warn(message, err); } catch (_) {}
    }
  });

  function _applyAiNarrativeTransaction(rawText, cfg, opts) {
    return _aiTransactionEngine.applyNarrative(rawText, cfg, opts);
    opts = opts || {};
    cfg = cfg || loadCfg();
    var beforeSnapshot = _captureAIRuntimeSnapshot();
    try {
      return _prepareAiNarrativeTextEffects(rawText, cfg, opts);
    } catch (e) {
      try { _restoreAIRuntimeSnapshot(beforeSnapshot); } catch (_) {}
      try { console.warn('[AIStoryGen] AI transaction rolled back' + (opts.reason ? ' (' + opts.reason + ')' : ''), e); } catch (_) {}
      throw e;
    }
  }

  function _commitAiNarrativeTransaction(rawText, cfg, opts) {
    return _aiTransactionEngine.commitNarrative(rawText, cfg, opts);
    opts = opts || {};
    cfg = cfg || loadCfg();
    var beforeSnapshot = _captureAIRuntimeSnapshot();
    try {
      var result = _prepareAiNarrativeTextEffects(rawText, cfg, opts);
      var metadataText = result.cleanText;
      var locUpdated = false;
      if (opts.applyLocation !== false) {
        var hasLocationDirective = /\[LOC:|\[AI_META\]|\[AI_EVENT\]|\[AI_EVENT:/i.test(metadataText);
        var suppressLocationFallback = _aiEventSuppressesLocationFallback(metadataText) || !hasLocationDirective;
        locUpdated = parseLocationMarker(metadataText);
        if (!locUpdated && !suppressLocationFallback && _lastChoiceText) {
          locUpdated = inferLocationFromText(_lastChoiceText, metadataText);
        }
      }
      result.metadataText = metadataText;
      result.cleanText = _stripAIMetadataMarkers(metadataText);
      if (opts.recordMemory !== false) {
        var memoryOpts = Object.assign({
          name: '[AI]',
          reason: 'AI剧情事件',
          choiceText: _lastChoiceText || '',
          source: opts.source || 'advance'
        }, opts.memory || {});
        result.event = _recordAiEventMemory(String(rawText || ''), result.cleanText, memoryOpts, cfg);
      }
      result.locUpdated = !!locUpdated;
      result.latestLocationStatus = _lastAiEventLocationStatus();
      if (opts.applyLocation !== false && !locUpdated && (result.latestLocationStatus === 'current' || result.latestLocationStatus === 'inTransit')) {
        _markAiLocationInTransit('AI_EVENT locationStatus=' + result.latestLocationStatus);
      }
      return result;
    } catch (e) {
      try { _restoreAIRuntimeSnapshot(beforeSnapshot, { syncMemory: true }); } catch (_) {}
      try { console.warn('[AIStoryGen] AI commit rolled back' + (opts.reason ? ' (' + opts.reason + ')' : ''), e); } catch (_) {}
      throw e;
    }
  }

  var AITransaction = {
    schemaVersion: 5,
    applyNarrative: function (rawText, cfg, opts) {
      return _applyAiNarrativeTransaction(rawText, cfg, opts);
    },
    commitNarrative: function (rawText, cfg, opts) {
      return _commitAiNarrativeTransaction(rawText, cfg, opts);
    },
    captureSnapshot: function () {
      return _captureGameSnapshot();
    },
    restoreSnapshot: function (snapshot) {
      _restoreGameSnapshot(snapshot);
    },
    captureRuntimeSnapshot: function () {
      return _captureAIRuntimeSnapshot();
    },
    restoreRuntimeSnapshot: function (snapshot, opts) {
      _restoreAIRuntimeSnapshot(snapshot, opts);
    }
  };
  window.AIStoryGen.transaction = AITransaction;
  window.AIStoryGen.AITransaction = AITransaction;

  function advanceWithNarrative(text) {
    var cfg = loadCfg();
    var currentPassageName = (typeof State !== 'undefined' && State.passage) || '';
    var preserveNativeCombatUI = !_aiReplaceActive && (_isNativeCombatActive() || _isNativeSexOrCombatPassage(currentPassageName));
    var txResult = _commitAiNarrativeTransaction(text, cfg, {
      reason: 'advance narrative',
      source: 'advance',
      recordMemory: true,
      applyLocation: true,
      memory: {
        name: '[AI]',
        reason: 'AI剧情事件',
        choiceText: _lastChoiceText || '',
        source: 'advance'
      }
    });
    var cleanText = txResult.cleanText;

    var locUpdated = !!txResult.locUpdated;
    if (_aiReplaceActive && locUpdated && _aiLocationArrived) {
      // Do NOT sync immediately - Engine.play() destroys the current DOM mid-render.
      // The sync will occur when user clicks the arrival button or uses skip-to-destination.
      console.log('[AIStoryGen] location arrived during replace mode, deferring sync');
    }
    // Append AI narrative — in replace mode, clear page for "page-turn" effect
    var $passage = $('#passages .passage');
    if ($passage.length) {
      var $section = $('<div class="ai-narrative-section"></div>');
      try { new Wikifier($section[0], cleanText); } catch (e) { $section.text(cleanText); }
      if (_aiReplaceActive) {
        // Push current AI content to round history BEFORE replacing it
        _pushCurrentToAiRoundHistory();
        // Clear forward stack (new round invalidates forward history)
        _aiForwardStack.length = 0;
        // Replace mode: only update the AI overlay, original content stays hidden underneath
        var $aiWrap = $passage.find('.ai-replaced-content');
        if ($aiWrap.length) {
          $aiWrap.empty().append($section);
        } else {
          $aiWrap = $('<div class="ai-replaced-content"></div>').append($section);
          $passage.append($aiWrap);
        }
        _appendNarrativeToolbar($section, _aiReplaceTargetLabel || _lastChoiceText, cleanText, _lastNarrativePrompt);
        _updateReplaceSessionHTML();
      } else {
        // Normal mode: store reference to dedicated AI narrative container, clear old content first
        if (preserveNativeCombatUI) {
          var $staleHiddenOriginal = $passage.find('.ai-original-wrap');
          if ($staleHiddenOriginal.length) $staleHiddenOriginal.replaceWith($staleHiddenOriginal.contents());
        }
        if (!_aiNarrativeWrap || !_aiNarrativeWrap.parentNode) {
          _aiNarrativeWrap = document.createElement('div');
          _aiNarrativeWrap.className = 'ai-narrative-wrap';
          $passage.find('.ai-injected-row').remove();
          if (preserveNativeCombatUI) {
            // Combat/addon-combat pages contain live native controls. Never hide them
            // when a generic AI narrative is generated on top of the page.
            var $hiddenOriginal = $passage.find('.ai-original-wrap');
            if ($hiddenOriginal.length) $hiddenOriginal.replaceWith($hiddenOriginal.contents());
          } else {
            // Hide original passage content (game links are stale after AI advance)
            var $overlayKeep = $passage.children('#customOverlayContainer, #debugOverlay').detach();
            _hidePassageOriginalContent($passage);
            if ($overlayKeep.length) $passage.append($overlayKeep);
          }
          $passage[0].appendChild(_aiNarrativeWrap);
        } else {
          _pushCurrentToAiRoundHistory();
          _aiForwardStack.length = 0;
        }
        // Clear old narrative and append new
        _aiNarrativeWrap.innerHTML = '';
        _aiNarrativeWrap.appendChild($section[0]);
        _appendNarrativeToolbar($section, _lastChoiceText || (typeof State !== 'undefined' ? State.passage : ''), cleanText, _lastNarrativePrompt);
      }
      try { $section[0].scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
    }
    _syncAISaveStateToCurrentSave();

    _autoChoicesBusy = false;
    $('#passages .ai-choices').remove();

    if (preserveNativeCombatUI) {
      return;
    }

    if (_aiReplaceActive) {
      // Replace mode: auto-generate new choices.
      _aiReplaceRoundCount++;
      autoInjectChoices(typeof State !== 'undefined' ? State.passage : '');
    } else {
      // Normal mode: auto-generate new choices immediately (no "continue" button)
      autoInjectChoices(typeof State !== 'undefined' ? State.passage : '');
    }
  }

  /** In-place narrative refresh after regen (no new choice round). */
  function _renderNarrativeIntoSection($section, rawText, narrativeName, prompt) {
    var cfg = loadCfg();
    var txResult = _commitAiNarrativeTransaction(rawText, cfg, {
      reason: 'render narrative refresh',
      source: 'refresh',
      recordMemory: false,
      applyLocation: true
    });
    var cleanText = txResult.cleanText;
    $section.empty();
    try { new Wikifier($section[0], cleanText); } catch (e) { $section.text(cleanText); }
    _appendNarrativeToolbar($section, narrativeName, cleanText, prompt);
    if (_aiReplaceActive) _updateReplaceSessionHTML();
    _syncAISaveStateToCurrentSave();
    return cleanText;
  }

  async function _regenerateNarrativeSection($section, narrativeName, prompt) {
    var cfg = loadCfg();
    try {
      _preflightAI(cfg);
    } catch (e) {
      _showAIUserMessage(e.message || e, true);
      return;
    }
    if (!prompt) {
      _showAIUserMessage(cfg.language === 'zh' ? '无法重新生成：缺少原始指令' : 'Cannot regenerate: no prompt stored', true);
      return;
    }
    var $toolbar = $section.find('.ai-narrative-toolbar');
    var $regenBtn = $toolbar.find('.ai-regen-narrative-link');
    if ($regenBtn.prop('disabled')) return;
    $regenBtn.prop('disabled', true).css('opacity', '0.5');
    var loadTxt = cfg.language === 'zh' ? '重新生成中…' : 'Regenerating…';
    var $loading = $('<div class="ai-gen-loading" style="text-align:center;padding:0.5em 0;color:#b4a078;"></div>').text(loadTxt);
    $toolbar.before($loading);
    var regenSuffix = cfg.language === 'zh'
      ? '\n\n<instruction>请重新生成一版完全不同的叙事（与上一版有明显差异），仍遵守相同的状态与场景约束。不要重复上一版的句子。</instruction>'
      : '\n\n<instruction>Regenerate a clearly different version (distinct from the previous one), same state/scene constraints. Do not repeat prior sentences.</instruction>';
    try {
      var text = await callAI(prompt + regenSuffix, { storyStyle: true });
      $loading.remove();
      _renderNarrativeIntoSection($section, text, narrativeName, prompt);
    } catch (e) {
      $loading.remove();
      $regenBtn.prop('disabled', false).css('opacity', '1');
      _showAIUserMessage((cfg.language === 'zh' ? '重新生成失败: ' : 'Regen failed: ') + (e.message || e));
    }
  }

  /** Toolbar: regen + bookmark links below each AI narrative section */
  function _appendNarrativeToolbar($section, narrativeName, narrativeText, prompt) {
    if (prompt) _lastNarrativePrompt = prompt;
    $section.find('.ai-narrative-toolbar').remove();
    var cfg = loadCfg();
    var regenLabel = cfg.language === 'zh' ? '🔄 刷新剧情' : '🔄 Refresh story';
    var choicesLabel = cfg.language === 'zh' ? '🔁 刷新选项' : '🔁 Refresh choices';
    var bookmarkLabel = cfg.language === 'zh' ? '☆ 收藏剧情进长期记忆' : '☆ Bookmark';
    var $bar = $('<div class="ai-narrative-toolbar"></div>');
    var $regen = $('<a class="ai-regen-narrative-link" href="javascript:void(0)"></a>').text(regenLabel);
    var $choices = $('<a class="ai-refresh-choices-link" href="javascript:void(0)"></a>').text(choicesLabel);
    var $bookmark = $('<a class="ai-bookmark-link" href="javascript:void(0)"></a>').text(bookmarkLabel);
    var storedPrompt = prompt || _lastNarrativePrompt;
    var storedName = narrativeName;
    $regen.on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _regenerateNarrativeSection($section, storedName, storedPrompt);
    });
    $choices.on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _forceRefreshChoicesFromToolbar(storedName);
    });
    $bookmark.on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var sameButton = this;
      var $clone = $section.clone();
      $clone.find('.ai-narrative-toolbar, .ai-gen-loading').remove();
      var curText = ($clone.text() || narrativeText || '').trim();
      addLongTermMemory(storedName, curText);
      $(sameButton).text(cfg.language === 'zh' ? '★ 已收藏进长期记忆' : '★ Saved').css('color', '#c0a060');
      setTimeout(function () { $(sameButton).text(bookmarkLabel).css('color', '#b4a078'); }, 2000);
    });
    $bar.append($regen).append($choices).append($bookmark);
    $section.append($bar);
  }

  function _appendBookmarkButton($section, narrativeName, narrativeText, prompt) {
    _appendNarrativeToolbar($section, narrativeName, narrativeText, prompt);
  }

  window.AIStoryGen.autoInjectChoices = autoInjectChoices;
  window.AIStoryGen.advanceWithNarrative = advanceWithNarrative;

  // Handle intercepted game link → replace passage with AI-generated location narrative
  async function handleLocationReplace(targetPassage, linkText, originalLinkId, originalEventMode) {
    targetPassage = _normalizePassageName(targetPassage);
    var cfg = loadCfg();
    if (!cfg.aiReplaceLinks) return;
    if (_aiReplaceActive) return;

    try {
      _preflightAI(cfg);
    } catch (preErr) {
      console.warn('[AIStoryGen] location replace preflight failed', preErr);
      _showAIUserMessage(preErr.message || preErr, true);
      _refreshApiWarnBar();
      return;
    }

    var $passage = $('#passages .passage');
    if (!$passage.length) return;

    // Hide original passage content (wrap in hidden div — never leaves DOM)
    _hidePassageOriginalContent($passage);
    _aiReplaceActive = true;
    _aiReplaceRoundCount = 0;  // reset round counter
    _aiReplaceTargetLabel = linkText;
    _aiReplaceTargetPassage = targetPassage;
    _aiReplaceOriginalLinkId = String(originalLinkId || '');
    _aiReplaceOriginalEventMode = !!originalEventMode;
    _aiReplaceOriginPassage = (typeof State !== 'undefined' && State.passage) || '';

    // Reset LOC tracking for this session
    _aiAvailableDestinations = [];
    _setAiLocationState(targetPassage, cleanLabel(linkText), 'start AI replace target', { arrived: false });

    // Capture available destinations from passage links (cleaned labels)
    _collectDestinations($passage);

    // Create AI content wrapper and show loading inside it
    var $aiWrap = $('<div class="ai-replaced-content"></div>');
    var loadingTxt = cfg.language === 'zh'
      ? 'AI 正在生成【' + linkText + '】的剧情…'
      : 'AI generating [' + linkText + ']...';
    var $loading = $('<div class="ai-gen-loading" style="text-align:center;padding:2em 0;">' + loadingTxt + '</div>');
    $aiWrap.append($loading);
    $passage.append($aiWrap);
    _updateReplaceSessionHTML();
    $('#passages .ai-choices').remove();

    // Build prompt: tell AI to generate narrative about this specific location
    var state = buildState(cfg);
    var scene = buildScene();
    var cacheKey = (scene.location || '') + '_' + (scene.hour || '') + '_' + (scene.dangerLevel || '');

    var sceneBlock = [
      'location: ' + (scene.location || 'unknown'),
      'area: ' + (scene.area || 'unknown'),
      'time: day ' + (scene.day || '?') + ', ' + (scene.weekday || '?') + ', hour ' + (scene.hour || '?'),
      'nearby: ' + (scene.nearby || 'alone'),
      (scene.schoolActive ? 'school is in session' : ''),
      (scene.schoolDay ? 'today is a school day' : ''),
      (scene.moonPhase ? 'moon: ' + scene.moonPhase : ''),
      'atmosphere: ' + (scene.dangerLevel || 'neutral'),
    ].filter(function(s){return s!=='';}).join('\n');
    var atmosphereHint = scene.dangerLevel === 'dangerous'
      ? (cfg.language === 'zh' ? '当前为危险区域——气氛应紧张不安、潜伏威胁。' : 'This is a dangerous area — tense, threatening atmosphere.')
      : scene.dangerLevel === 'wilderness'
      ? (cfg.language === 'zh' ? '当前为野外——自然环境、未知与暴露感。' : 'This is wilderness — nature, unknowns, exposure.')
      : scene.dangerLevel === 'night'
      ? (cfg.language === 'zh' ? '当前为深夜——昏暗不安、隐秘行为。' : 'This is night — dim, uneasy, clandestine.')
      : scene.dangerLevel === 'safe'
      ? (cfg.language === 'zh' ? '当前为安全区域——日常、放松的基调。' : 'This is a safe area — everyday, relaxed tone.')
      : '';
    var stateLines = cfg.language === 'zh'
      ? [
          '<state>',
          JSON.stringify(state, null, 2),
          '</state>',
          '',
          '注意：上面的 <state> 数据是玩家当前的真实游戏状态。',
          '你必须在生成剧情时利用这些数据——不是逐条罗列，而是自然地融入叙事中。',
          '例如：压力高→角色焦躁不安、失误；服装破损→路人目光、羞耻感；',
          '技能高→对应行为更轻松自信；声望高→被认出、被议论；',
          '房租快到期→焦虑在心头萦绕；猫耳/翅膀→试图隐藏或引来好奇。',
          '★ NPC好感度是关键驱动力（非常重要）：',
          '　• love高→NPC温柔、关心、主动靠近；love低→冷淡、公事公办',
          '　• dom高→NPC支配欲强、命令口气；dom低→顺从、小心翼翼',
          '　• lust高→NPC目光炽热、肢体接触、性暗示；lust低→保持距离',
          '　• rage高→NPC怒气冲冲、找茬；trust高→NPC坦诚、分享秘密',
          '　• isLoveInterest→NPC对主角有独占欲，看到主角与他人亲近会嫉妒',
          '　• nearbyNpcs→在场NPC必须出现在叙事中，根据其好感度设定反应',
          '这些驱动条件不应生硬堆砌，而是作为叙事的底色。',
          '',
        ].join('\n')
      : [
          '<state>',
          JSON.stringify(state, null, 2),
          '</state>',
          '',
          'IMPORTANT: The <state> above contains the player\'s real-time game state.',
          'You MUST weave this data into the narrative naturally — not as a checklist, but as narrative texture.',
          'Examples: high pain → limping/winced; torn clothes → stares/shame;',
          'high skills → confident action; fame → recognition/whispers;',
          'rent due → anxiety simmering; cat ears → hiding them or drawing curiosity.',
          '★ NPC relationship data is a CRITICAL driver (very important):',
          '　• high love→NPC is gentle, caring, seeks closeness; low love→cold, transactional',
          '　• high dom→NPC is commanding, dominant tone; low dom→submissive, careful',
          '　• high lust→NPC stares intensely, touches, romantic tension; low lust→keeps distance',
          '　• high rage→NPC is angry, looking for trouble; high trust→NPC confides secrets',
          '　• isLoveInterest→NPC is possessive, gets jealous seeing the player with others',
          '　• nearbyNpcs→NPCs present MUST appear in narrative, reacting per their relationship stats',
          'These are narrative drivers, not items to enumerate.',
          '',
        ].join('\n');
    var promptText = cfg.language === 'zh'
      ? [
          stateLines,
          buildRecentBlock(),
          buildCurrentAiStoryBlock(),
          buildNativeContextAuthorityBlock(),
          buildKnownNpcNamesBlock(),
          '<scene>',
          sceneBlock,
          '</scene>',
          '<instruction>',
          '玩家刚刚选择了前往【' + linkText + '】（target passage: ' + targetPassage + '）。',
          _aiReplaceOriginalEventMode ? '这是一个原版事件动作选项。只描写玩家准备/执行该动作的过程，不要生成新的选择，不要宣称已经修改金钱、信任或技能；真实结算将由游戏原版选项完成。' : '',
          '请为到达该目的地的过程生成一段叙事（2-3个短段），用第二人称现在时，符合游戏风格。',
          '★ 叙事重点：描述玩家"正在前往"目标地点的过渡过程——离开、行走、到达。不要在原地无休止地描写环境。',
          '你必须让剧情对 <state> 中的玩家身体状态、服装、技能、声望、任务、NPC好感度做出自然反应。',
          atmosphereHint ? atmosphereHint : '',
          '可以引入途中的随机遭遇或环境描写，但不要破坏第四面墙。',
          buildKnownPlacesBlock(),
          buildLocationResponseFormatBlock(targetPassage),
          '★★★ 必须遵守位置标记规则 ★★★',
          '如果你在叙事过程中让主角进入了上面任何一个已知地点，必须在叙事末尾输出该地点的标记！',
          '例如：主角走到神殿门前 → 输出 [LOC: Temple] 或 [LOC: 神殿]',
          '例如：主角推门进入咖啡馆坐下 → 输出 [LOC: Cafe Pancakes] 或 [LOC: 咖啡馆]',
          '中英文都可以，系统都能识别。不要漏掉这个标记！',
          buildAIEventResponseFormatBlock(),
          '注意：不要在叙事结尾生成"继续前往"等链接或选项，系统会自动添加。',
          '</instruction>',
        ].join('\n')
      : [
          stateLines,
          buildRecentBlock(),
          buildCurrentAiStoryBlock(),
          buildNativeContextAuthorityBlock(),
          buildKnownNpcNamesBlock(),
          '<scene>',
          sceneBlock,
          '</scene>',
          '<instruction>',
          'The player chose to go to [' + linkText + '] (target passage: ' + targetPassage + ').',
          _aiReplaceOriginalEventMode ? 'This is a native game event/action choice. Describe the lead-in and action only. Do not create new choices or claim that money, trust, or skills were changed; the native game link will perform the real settlement.' : '',
          'Generate a transition narrative of ARRIVING at this destination (2-3 paragraphs), second-person present tense, game style.',
          '★ Focus: describe the player "on the way" to the destination — leaving, walking, arriving. Do NOT spin endless location description.',
          'You MUST make the narrative react naturally to the player\'s body state, clothing, skills, fame, quests, and NPC relationships from <state>.',
          atmosphereHint ? atmosphereHint : '',
          'Include encounters or environmental details along the way. No meta commentary.',
          buildKnownPlacesBlock(),
          buildLocationResponseFormatBlock(targetPassage),
          buildAIEventResponseFormatBlock(),
          'Note: Do NOT generate "Continue to..." links or choices at the end — the system adds navigation automatically.',
          '</instruction>',
        ].join('\n');

    _lastNarrativePrompt = promptText;

    // Check narrative cache for same location+time
    if (cfg.cacheEnabled && cfg.cacheEnabled > 0) {
      var cached = getCachedNarrative(cacheKey, cfg);
      if (cached) {
        $aiWrap.empty();
        var $cachedSection = $('<div class="ai-narrative-section"></div>');
        try { new Wikifier($cachedSection[0], cached); } catch (e) { $cachedSection.text(cached); }
        $aiWrap.append($cachedSection);
        _appendNarrativeToolbar($cachedSection, linkText, cached, promptText);
        if (_aiReplaceOriginalEventMode) {
        var $navWrap2 = $('<div class="ai-nav-wrap" style="text-align:center;margin-top:1.5em;padding:0.5em 0;"></div>');
        var navLabel2 = cfg.language === 'zh' ? '→ 继续原剧情' : '→ Continue story';
        var $navLink2 = $('<a class="ai-continue-link" style="font-size:1.1em;font-weight:bold;" href="javascript:void(0)">' + navLabel2 + '</a>');
        $navLink2.on('click', function (e) {
          e.preventDefault();
          _finishAiReplaceAndGo(targetPassage);
        });
        $navWrap2.append($navLink2);
        $aiWrap.append($navWrap2);
        }
        _updateReplaceSessionHTML();
        if (!_aiReplaceOriginalEventMode) autoInjectChoices(typeof State !== 'undefined' ? State.passage : '', linkText, targetPassage);
        return;
      }
    }

    try {
      suppressErrorReporter();
      _autoChoicesBusy = true;  // block concurrent autoInjectChoices from :passagedisplay
      var text = await callAI(promptText, { storyStyle: true });
      var rawNarrativeText = String(text || '');
      var txResult = _applyAiNarrativeTransaction(text, cfg, { reason: 'location replace first narrative', postProcess: false });
      var cleanText = txResult.cleanText;

      // Parse LOC marker and sync if AI has arrived at a known location
      parseLocationMarker(cleanText);
      cleanText = _stripAIMetadataMarkers(cleanText);
      // NOTE: Do NOT call syncOriginalPassageToCurrentLocation() here on first generation.
      // Engine.play() during handleLocationReplace causes the passage to switch mid-render,
      // destroying the AI overlay DOM. The sync will happen naturally when the player clicks
      // "到达" or uses the skip-to-destination button.

      // Re-query live passage — DOM may have been rebuilt during the API call
      $passage = $('#passages .passage');
      if (!$passage.length) return;

      $aiWrap = $passage.find('.ai-replaced-content');
      if (!$aiWrap.length && _aiReplaceActive) {
        _hidePassageOriginalContent($passage);
        $aiWrap = $('<div class="ai-replaced-content"></div>');
        $passage.append($aiWrap);
      } else if (!$aiWrap.length) {
        _ensurePassageContentVisible();
        return;
      }

      // Replace loading with AI content inside the overlay wrapper
      $aiWrap.empty();
      var $section = $('<div class="ai-narrative-section"></div>');
      try { new Wikifier($section[0], cleanText); } catch (e) { $section.text(cleanText); }
      $aiWrap.append($section);
      _appendNarrativeToolbar($section, linkText, cleanText, promptText);

      // If the AI has not arrived yet, provide a direct native fallback link.
      // Once arrived, the generated AI choices panel supplies the "到达" button.
      if (_aiReplaceOriginalEventMode) {
        // Always append a guaranteed navigation link to the actual target passage
        // This ensures the player can always progress to the destination, regardless
        // of what the AI generated. Without this, players get stuck in endless AI loops.
        var $navWrap = $('<div class="ai-nav-wrap" style="text-align:center;margin-top:1.5em;padding:0.5em 0;"></div>');
        var navLabel = cfg.language === 'zh' ? '→ 继续原剧情' : '→ Continue story';
        var $navLink = $('<a class="ai-continue-link" style="font-size:1.1em;font-weight:bold;" href="javascript:void(0)">' + navLabel + '</a>');
        $navLink.on('click', function (e) {
          e.preventDefault();
          _finishAiReplaceAndGo(targetPassage);
        });
        $navWrap.append($navLink);
        $aiWrap.append($navWrap);
        try { $section[0].scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
      }

      _updateReplaceSessionHTML();

      // Auto-generate AI choices for this location content
      _autoChoicesBusy = false;  // release lock before choices generation
      if (!_aiReplaceOriginalEventMode) autoInjectChoices(typeof State !== 'undefined' ? State.passage : '', linkText, targetPassage);

      // Push AI-generated narrative to memory buffer for continuity
      _recordAiEventMemory(rawNarrativeText, cleanText, {
        name: '[AI]' + linkText,
        reason: 'AI地点剧情',
        choiceText: linkText,
        location: targetPassage,
        source: 'locationReplace'
      }, cfg);
      // Cache this narrative for same-location return visits
      if (cfg.cacheEnabled && cfg.cacheEnabled > 0) {
        setCachedNarrative(cacheKey, cleanText);
      }
      restoreErrorReporter();
    } catch (e) {
      restoreErrorReporter();
      _autoChoicesBusy = false;
      console.error('[AIStoryGen] location replace error', e);
      var errMsg = (cfg.language === 'zh' ? 'AI 生成失败: ' : 'AI error: ') + (e && e.message ? e.message : e);
      _recoverFromFailedReplace(cfg, errMsg);
    }
  }
  window.AIStoryGen.handleLocationReplace = handleLocationReplace;

  // ---------- 3. 状态序列化 ----------
  function pick(obj, keys) {
    const o = {};
    if (!obj) return o;
    keys.forEach(function (k) { if (obj[k] !== undefined) o[k] = obj[k]; });
    return o;
  }

  function summarizeWorn(worn) {
    if (!worn) return 'naked';
    const slots = ['upper', 'lower', 'under_lower', 'under_upper', 'feet', 'head', 'neck', 'hands', 'legs', 'face', 'over_upper', 'over_lower'];
    const parts = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const item = worn[slot];
      if (item && item.name && item.name !== 'naked' && item.name !== 'none') {
        parts.push(slot + ':' + item.name);
      }
    }
    return parts.length ? parts.join(', ') : 'naked';
  }

  var _aiChineseNameMap = {
    Robin: '罗宾',
    Whitney: '惠特尼',
    Kylar: '凯拉尔',
    Sydney: '西德尼',
    Avery: '艾弗里',
    Eden: '伊甸',
    Alex: '亚历克斯',
    Bailey: '贝利',
    Harper: '哈珀',
    Leighton: '莱顿',
    Landry: '兰德里',
    Morgan: '摩根',
    Jordan: '约旦',
    Remy: '雷米',
    Charlie: '查理',
    River: '瑞弗',
    Doren: '多伦',
    Gwylan: '格威兰',
    Quinn: '奎因',
    Mason: '梅森',
    Niki: '尼基',
    Sam: '萨姆',
    Briar: '布赖尔',
    BlackWolf: '黑狼',
    Black_Wolf: '黑狼',
    GreatHawk: '大鹰',
    Great_Hawk: '大鹰',
    Wraith: '幽灵'
  };

  function _cloneNameMap(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (key) { out[key] = map[key]; });
    return out;
  }

  function _hasChineseText(text) {
    return /[\u4e00-\u9fff]/.test(String(text || ''));
  }

  function _pickChineseNpcNameFromValue(value) {
    if (!value) return '';
    var candidates = [];
    function addCandidate(v) {
      if (v == null) return;
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) addCandidate(v[i]);
        return;
      }
      if (typeof v === 'object') {
        ['zh', 'cn', 'name', 'title', 'displayname', 'fullDescription', 'description'].forEach(function (k) {
          if (v[k] != null) addCandidate(v[k]);
        });
        return;
      }
      var s = cleanLabel(String(v || '')).trim();
      if (s && _hasChineseText(s)) candidates.push(s);
    }
    addCandidate(value.displayname_lan);
    addCandidate(value.displayname);
    addCandidate(value.title);
    addCandidate(value.fullDescription);
    addCandidate(value.description);
    addCandidate(value.name);
    candidates.sort(function (a, b) { return a.length - b.length; });
    return candidates[0] || '';
  }

  function _getRuntimeChineseNameMap() {
    var map = _cloneNameMap(_aiChineseNameMap);
    try {
      var list = _getAiNpcNameList();
      var root = _getAiNpcRoot();
      var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
      for (var i = 0; i < list.length; i++) {
        var key = String(list[i] || '').trim();
        if (!key) continue;
        var npc = (V.NPCName && V.NPCName[i]) || (root && root[key]) || (V && V[key]) || null;
        var zh = _pickChineseNpcNameFromValue(npc);
        if (zh) {
          map[key] = zh;
          map[key.replace(/\s+/g, '')] = zh;
        }
      }
    } catch (_) {}
    return map;
  }

  function _canonicalizeChineseNpcNameVariants(text, map) {
    text = String(text || '');
    map = map || _getRuntimeChineseNameMap();
    var jordan = map.Jordan || map.JordanTemple || '';
    if (jordan === '约旦') text = text.replace(/乔丹/g, '约旦');
    if (map.Alex === '艾利克斯') text = text.replace(/亚历克斯/g, '艾利克斯');
    if (map.Sydney === '悉尼') text = text.replace(/西德尼/g, '悉尼');
    if (map.Avery === '艾弗利') text = text.replace(/艾弗里/g, '艾弗利');
    if (map.GreatHawk === '巨鹰' || map.Great_Hawk === '巨鹰') text = text.replace(/大鹰/g, '巨鹰');
    return text;
  }

  function _toChineseName(name) {
    name = String(name || '').trim();
    if (!name) return '';
    var map = _getRuntimeChineseNameMap();
    return map[name] || map[name.replace(/\s+/g, '')] || name;
  }

  function _localizeNamesInText(text) {
    text = String(text || '');
    var map = _getRuntimeChineseNameMap();
    Object.keys(map).forEach(function (key) {
      var zh = map[key];
      text = text.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), zh);
    });
    text = _canonicalizeChineseNpcNameVariants(text, map);
    text = _localizeStatTermsInText(text);
    text = _localizeCommonEnglishInChineseText(text);
    return text;
  }

  function _localizeCommonEnglishInChineseText(text) {
    text = String(text || '');
    var phraseMap = [
      ['miko outfit', '\u5deb\u5973\u670d'],
      ['wooden sandals', '\u6728\u5c50'],
      ['paper umbrella', '\u6cb9\u7eb8\u4f1e']
    ];
    phraseMap.forEach(function (pair) {
      text = text.replace(new RegExp('\\b' + pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), pair[1]);
    });
    var map = {
      warmth: '\u6e29\u70ed',
      warm: '\u6e29\u6696',
      cold: '\u51b0\u51b7',
      heat: '\u70ed\u610f',
      arousal: '\u6027\u594b',
      awareness: '\u89c9\u77e5',
      stress: '\u538b\u529b',
      pain: '\u75bc\u75db',
      trauma: '\u521b\u4f24',
      control: '\u81ea\u63a7',
      lust: '\u6b32\u671b',
      fatigue: '\u75b2\u52b3',
      tiredness: '\u75b2\u52b3',
      drugged: '\u836f\u6548',
      drunk: '\u9189\u610f',
      beauty: '\u7f8e\u8c8c',
      charm: '\u9b45\u529b',
      money: '\u91d1\u94b1',
      zori: '\u6728\u5c50',
      miko: '\u5deb\u5973',
      outfit: '\u670d\u88c5',
      jacket: '\u5939\u514b',
      boots: '\u9774\u5b50'
    };
    Object.keys(map).forEach(function (key) {
      text = text.replace(new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), map[key]);
    });
    return text;
  }

  function _localizeStatTermsInText(text) {
    text = String(text || '');
    var map = {
      arousal: '兴奋',
      awareness: '觉知',
      stress: '压力',
      pain: '疼痛',
      trauma: '创伤',
      control: '自控',
      lust: '欲望',
      lewdity: '淫乱度',
      lewdness: '淫乱度',
      fatigue: '疲劳',
      tiredness: '疲劳',
      drugged: '药效',
      drunk: '醉意',
      hallucinogen: '致幻感',
      beauty: '美貌',
      charm: '魅力',
      money: '金钱'
    };
    Object.keys(map).forEach(function (key) {
      text = text.replace(new RegExp('\\b' + key + '\\b', 'gi'), map[key]);
    });
    return text;
  }

  function _aiNum(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  function _aiStatusEntry(value, max, label) {
    value = _aiNum(value, 0);
    max = _aiNum(max, 0);
    return {
      value: value,
      max: max || undefined,
      label: label,
      text: label + (max > 0 ? ' (' + value + '/' + max + ')' : ' (' + value + ')')
    };
  }

  function _aiTierLabel(value, max, labels) {
    value = _aiNum(value, 0);
    max = _aiNum(max, 0);
    if (max <= 0) return labels[0] || '';
    if (value >= max) return labels[6];
    if (value >= max * 4 / 5) return labels[5];
    if (value >= max * 3 / 5) return labels[4];
    if (value >= max * 2 / 5) return labels[3];
    if (value >= max / 5) return labels[2];
    if (value >= 1) return labels[1];
    return labels[0];
  }

  function _aiTraumaLabel(value, max) {
    return _aiTierLabel(value, max || 5000, ['\u5065\u5eb7', '\u4e0d\u5b89', '\u7d27\u5f20', '\u56f0\u6270', '\u4e0d\u7a33\u5b9a', '\u5907\u53d7\u6298\u78e8', '\u9ebb\u6728']);
  }

  function _aiStressLabel(value, max) {
    return _aiTierLabel(value, max || 10000, ['\u5e73\u9759', '\u5b89\u7a33', '\u51b7\u9759', '\u7d27\u7ef7', '\u5403\u529b', '\u75db\u82e6', '\u538b\u5012\u6027\u5d29\u6e83']);
  }

  function _aiArousalLabel(value, max) {
    return _aiTierLabel(value, max || 10000, ['\u51b7\u6de1', '\u88ab\u523a\u6fc0', '\u6027\u594b', '\u6b32\u671b\u4e0a\u5347', '\u96be\u4ee5\u5e73\u9759', '\u70ed\u610f\u7ffb\u6d8c', '\u56e0\u6027\u594b\u53d1\u6296']);
  }

  function _aiControlLabel(value, max, possessed) {
    if (possessed) {
      return _aiTierLabel(value, max || 1000, ['\u65e0\u529b', '\u88ab\u64cd\u7eb5', '\u9ebb\u6728', '\u7a7a\u6d1e', '\u6323\u624e', '\u63a5\u8fd1\u638c\u63a7', '\u638c\u63a7']);
    }
    return _aiTierLabel(value, max || 1000, ['\u5931\u63a7', '\u60ca\u6050', '\u6050\u60e7', '\u7126\u8651', '\u62c5\u5fe7', '\u4e0d\u5b89', '\u81ea\u4fe1']);
  }

  function _aiFatigueLabel(value, max) {
    return _aiTierLabel(value, max || 2000, ['\u7cbe\u529b\u5145\u6c9b', '\u6e05\u9192', '\u8b66\u89c9', '\u7565\u611f\u75b2\u60eb', '\u75b2\u60eb', '\u6781\u5ea6\u75b2\u52b3', '\u7b4b\u75b2\u529b\u5c3d']);
  }

  function _aiHungerLabel(value) {
    value = _aiNum(value, 0);
    if (value >= 2000) return '\u6328\u997f';
    if (value >= 1600) return '\u9965\u80a0\u8f98\u8f98';
    if (value >= 1200) return '\u5f88\u997f';
    if (value >= 800) return '\u9965\u997f';
    if (value >= 400) return '\u5fae\u997f';
    if (value >= 1) return '\u6ee1\u8db3';
    return '\u9971\u8179';
  }

  function _aiPainLabel(value) {
    value = _aiNum(value, 0);
    if (value >= 100) return '\u5d29\u6e83\u5927\u54ed';
    if (value >= 80) return '\u54ed\u6ce3\u55da\u54bd';
    if (value >= 60) return '\u54ed\u6ce3';
    if (value >= 40) return '\u6cea\u6c34\u6d41\u4e0b';
    if (value >= 20) return '\u773c\u7736\u542b\u6cea';
    if (value >= 1) return '\u96be\u53d7';
    return '\u65e0\u788d';
  }

  function _aiGenericLevel(value, max) {
    return _aiTierLabel(value, max || 1000, ['\u65e0', '\u5f88\u4f4e', '\u8f83\u4f4e', '\u4e2d\u7b49', '\u8f83\u9ad8', '\u5f88\u9ad8', '\u6781\u9ad8']);
  }

  function _aiRelationLevel(value) {
    value = _aiNum(value, 0);
    if (value >= 60) return '\u975e\u5e38\u9ad8';
    if (value >= 30) return '\u8f83\u9ad8';
    if (value >= 0) return '\u4e2d\u6027';
    if (value >= -30) return '\u8f83\u4f4e';
    return '\u5f88\u4f4e';
  }

  function _aiSkillGrade(value) {
    value = _aiNum(value, 0);
    if (value >= 1000) return 'S';
    if (value >= 800) return 'A';
    if (value >= 600) return 'B';
    if (value >= 400) return 'C';
    if (value >= 200) return 'D';
    if (value >= 1) return 'F';
    return '\u65e0';
  }

  function _aiDetailedSkillGrade(value) {
    value = _aiNum(value, 0);
    if (value >= 1000) return 'S';
    if (value >= 900) return 'A+';
    if (value >= 800) return 'A';
    if (value >= 700) return 'B+';
    if (value >= 600) return 'B';
    if (value >= 500) return 'C+';
    if (value >= 400) return 'C';
    if (value >= 300) return 'D+';
    if (value >= 200) return 'D';
    if (value >= 100) return 'F+';
    if (value >= 1) return 'F';
    return '\u65e0';
  }

  function _aiSchoolGrade(value) {
    value = _aiNum(value, -1);
    if (value >= 4) return 'A*';
    if (value >= 3) return 'A';
    if (value >= 2) return 'B';
    if (value >= 1) return 'C';
    if (value >= 0) return 'D';
    return 'F';
  }

  function _aiGetSetupRoot() {
    try { if (typeof setup !== 'undefined' && setup) return setup; } catch (_) {}
    try { if (window.SugarCube && window.SugarCube.setup) return window.SugarCube.setup; } catch (_) {}
    try { if (window.setup) return window.setup; } catch (_) {}
    return null;
  }

  function _aiGetTimeRoot() {
    try { if (typeof Time !== 'undefined' && Time) return Time; } catch (_) {}
    try { if (window.Time) return window.Time; } catch (_) {}
    return null;
  }

  function _aiGetWeatherName(V) {
    return safeRead(function () {
      if (typeof Weather !== 'undefined' && Weather && Weather.name) return Weather.name;
      if (window.Weather && window.Weather.name) return window.Weather.name;
      return V && V.weatherObj && V.weatherObj.name;
    }, 'unknown');
  }

  function _aiBuildWorldState(V) {
    var T = _aiGetTimeRoot();
    return {
      time: {
        hour: safeRead(function () { return T && T.hour; }, V.hour),
        minute: safeRead(function () { return T && T.minute; }, V.minute),
        weekDay: safeRead(function () { return T && (T.weekDayName || T.weekDay); }, V.weekday),
        monthDay: safeRead(function () { return T && T.monthDay; }, V.day),
        month: safeRead(function () { return T && T.monthName; }, ''),
        year: safeRead(function () { return T && T.year; }, ''),
        dayState: safeRead(function () { return T && T.dayState; }, ''),
        season: safeRead(function () { return T && T.season; }, ''),
        gameDays: safeRead(function () { return T && T.days; }, V.days)
      },
      school: {
        term: !!safeRead(function () { return T && T.schoolTerm; }, false),
        schoolDay: !!safeRead(function () { return T && T.schoolDay; }, false),
        schoolTime: !!safeRead(function () { return T && T.schoolTime; }, false)
      },
      moonPhase: safeRead(function () { return T && T.currentMoonPhase && T.currentMoonPhase.description; }, ''),
      weather: _aiGetWeatherName(V),
      location: {
        area: safeRead(function () { return V.area; }, 'unknown'),
        location: safeRead(function () { return V.location; }, 'unknown'),
        outside: !!safeRead(function () { return V.outside; }, false),
        passage: _currentPassageName()
      }
    };
  }

  function _aiBuildStatusDetail(V) {
    var possessed = !!safeRead(function () { return V.possessed; }, false);
    var arousalMax = _aiNum(V.arousalmax, 10000);
    var stressMax = _aiNum(V.stressmax, 10000);
    var traumaMax = _aiNum(V.traumamax, 5000);
    var controlMax = _aiNum(V.controlmax, 1000);
    var tiredMax = _aiNum((V.C && V.C.tiredness && V.C.tiredness.max), 2000);
    return {
      arousal: _aiStatusEntry(V.arousal, arousalMax, _aiArousalLabel(V.arousal, arousalMax)),
      stress: _aiStatusEntry(V.stress, stressMax, _aiStressLabel(V.stress, stressMax)),
      trauma: _aiStatusEntry(V.trauma, traumaMax, _aiTraumaLabel(V.trauma, traumaMax)),
      control: _aiStatusEntry(V.control, controlMax, _aiControlLabel(V.control, controlMax, possessed)),
      pain: _aiStatusEntry(V.pain, 100, _aiPainLabel(V.pain)),
      tiredness: _aiStatusEntry(V.tiredness, tiredMax, _aiFatigueLabel(V.tiredness, tiredMax)),
      hunger: _aiStatusEntry(V.hunger, 2000, _aiHungerLabel(V.hunger)),
      awareness: _aiStatusEntry(V.awareness, V.awarenessmax || 1000, _aiGenericLevel(V.awareness, V.awarenessmax || 1000)),
      lewdness: _aiStatusEntry(V.lewdity, 100, _aiGenericLevel(V.lewdity, 100)),
      effects: {
        drunk: _aiNum(V.drunk, 0),
        drugged: _aiNum(V.drugged, 0),
        hallucinogen: _aiNum(V.hallucinogen, 0),
        dissociation: _aiNum(V.dissociation, 0),
        trance: _aiNum(V.trance, 0),
        possessed: possessed,
        nightmares: _aiNum(V.nightmares, 0),
        anxiety: _aiNum(V.anxiety, 0),
        flashbacks: _aiNum(V.flashbacks, 0),
        panicAttacks: _aiNum(V.panicattacks, 0),
        hallucinations: _aiNum(V.hallucinations, 0)
      }
    };
  }

  function _aiSkillValue(value, detailed) {
    value = _aiNum(value, 0);
    return { value: value, grade: detailed ? _aiDetailedSkillGrade(value) : _aiSkillGrade(value) };
  }

  function _aiBuildSkillSummary(V) {
    return {
      general: {
        skulduggery: _aiSkillValue(V.skulduggery, true),
        dancing: _aiSkillValue(V.danceskill, true),
        swimming: _aiSkillValue(V.swimmingskill, true),
        athletics: _aiSkillValue(V.athletics, true),
        tending: _aiSkillValue(V.tending, true),
        housekeeping: _aiSkillValue(V.housekeeping, true)
      },
      addon: {
        seduction: _aiSkillValue(V.seductionskill, false),
        oral: _aiSkillValue(V.oralskill, false),
        vaginal: _aiSkillValue(V.vaginalskill, false),
        anal: _aiSkillValue(V.analskill, false),
        hand: _aiSkillValue(V.handskill, false),
        feet: _aiSkillValue(V.feetskill, false),
        penile: _aiSkillValue(V.penileskill, false),
        chest: _aiSkillValue(V.chestskill, false),
        thigh: _aiSkillValue(V.thighskill, false),
        bottom: _aiSkillValue(V.bottomskill, false)
      },
      school: {
        science: { score: _aiNum(V.science, 0), grade: _aiSchoolGrade(V.sciencetrait) },
        maths: { score: _aiNum(V.maths, 0), grade: _aiSchoolGrade(V.mathstrait) },
        english: { score: _aiNum(V.english, 0), grade: _aiSchoolGrade(V.englishtrait) },
        history: { score: _aiNum(V.history, 0), grade: _aiSchoolGrade(V.historytrait) },
        detention: _aiNum(V.detention, 0)
      }
    };
  }

  function _aiBuildNpcExtra(V, name) {
    var extra = {};
    switch (name) {
      case 'Robin':
        extra.timer = safeRead(function () { return V.robin && V.robin.timer; }, null);
        extra.hurtReason = safeRead(function () { return V.robin && V.robin.hurtReason; }, null);
        extra.moneyModifier = safeRead(function () { return V.robin && V.robin.moneyModifier; }, null);
        break;
      case 'Whitney':
        extra.gang = safeRead(function () { return V.whitney && V.whitney.gang; }, null);
        break;
      case 'Sydney': {
        var st = _aiGetSetupRoot();
        var idx = st && st.NPCNameList ? st.NPCNameList.indexOf('Sydney') : -1;
        extra.purity = idx >= 0 ? safeRead(function () { return V.NPCName && V.NPCName[idx] && V.NPCName[idx].purity; }, null) : null;
        extra.corruption = idx >= 0 ? safeRead(function () { return V.NPCName && V.NPCName[idx] && V.NPCName[idx].corruption; }, null) : null;
        break;
      }
      case 'Kylar':
        extra.raped = safeRead(function () { return V.kylar && V.kylar.raped; }, null);
        extra.riddle = safeRead(function () { return V.kylar && V.kylar.riddle; }, null);
        extra.fameStage = safeRead(function () { return V.kylar && V.kylar.fameStage; }, null);
        break;
      case 'Eden':
        extra.freedom = safeRead(function () { return V.edenfreedom; }, null);
        extra.days = safeRead(function () { return V.edendays; }, null);
        break;
      case 'Avery':
        extra.mansion = safeRead(function () { return V.avery_mansion != null; }, false);
        extra.mansionSchedule = safeRead(function () { return V.avery_mansion && V.avery_mansion.schedule; }, null);
        break;
      case 'Alex':
        extra.farmStage = safeRead(function () { return V.farm_stage; }, null);
        break;
      case 'Gwylan':
        extra.progress = safeRead(function () { return V.gwylan && V.gwylan.progress; }, null);
        break;
    }
    Object.keys(extra).forEach(function (key) {
      if (extra[key] == null || extra[key] === '') delete extra[key];
    });
    return extra;
  }

  function _aiRelationObject(value) {
    value = _aiNum(value, 0);
    return { value: value, level: _aiRelationLevel(value) };
  }

  function _aiBuildActiveQuests(V) {
    var T = _aiGetTimeRoot();
    var urgent = [];
    var active = [];
    function push(list, name, description, deadline) {
      list.push({ name: name, description: description, deadline: deadline || null });
    }
    var rentMoney = _aiNum(V.rentmoney, 0);
    if (rentMoney > 0) {
      var rentTime = _aiNum(V.renttime, 7);
      push(rentTime <= 1 ? urgent : active, 'Bailey rent', 'Rent due: ' + rentMoney + ', days left: ' + rentTime, rentTime <= 0 ? 'overdue' : (rentTime <= 1 ? 'today/tomorrow' : rentTime + ' days'));
    }
    if (_aiNum(V.community_service, 0) >= 1) push(urgent, 'Community service', 'Report to the police station on Barb Street.', 'today');
    var weekDay = _aiNum(safeRead(function () { return T && T.weekDay; }, 0), 0);
    if ((safeRead(function () { return V.harper_appointments && V.harper_appointments.enabled; }, false) || _aiNum(V.schoolPsych, 0) === 1) && weekDay === 6 && !safeRead(function () { return V.daily && V.daily.harperVisit; }, 0)) {
      push(urgent, 'Harper appointment', 'Doctor Harper appointment at the hospital.', 'today');
    }
    if (_aiNum(V.edenfreedom, 0) > 0) push(active, 'Eden return', 'Return to Eden cabin, days left: ' + _aiNum(V.edendays, 0), _aiNum(V.edendays, 0) <= 1 ? 'urgent' : _aiNum(V.edendays, 0) + ' days');
    var showType = safeRead(function () { return V.brothelshowdata && V.brothelshowdata.type; }, 'none');
    if (showType !== 'none' && safeRead(function () { return V.brothelshowdata && V.brothelshowdata.intro; }, false) && weekDay === 6) {
      push(urgent, 'Brothel show', 'Scheduled brothel show: ' + showType, 'today');
    }
    if (_aiNum(V.averydate, 0) === 1 && weekDay === 7) push(urgent, 'Avery date', 'Date with Avery tonight.', 'today 20:00');
    if (safeRead(function () { return T && T.schoolDay; }, false)) {
      var attended = safeRead(function () { return Object.keys((V.daily && V.daily.school && V.daily.school.attended) || {}); }, []);
      if (attended.length < 5) push(_aiNum(safeRead(function () { return T && T.hour; }, 0), 0) >= 13 ? urgent : active, 'School', (5 - attended.length) + ' lesson(s) remaining today.', 'before 15:00');
    }
    var templeRank = safeRead(function () { return V.temple_rank; }, '');
    if (templeRank && templeRank !== 'prospective') push(active, 'Temple duties', 'Temple rank: ' + templeRank + '. Check temple tasks.', null);
    if (_aiNum(V.farm_stage, 0) >= 1 && _aiNum(V.farm_attack_timer, 0) > 0) {
      push(active, 'Farm defense', 'Farm attack in ' + _aiNum(V.farm_attack_timer, 0) + ' day(s).', _aiNum(V.farm_attack_timer, 0) + ' days');
    }
    return { urgent: urgent, active: active };
  }

  function _aiBuildCurrentSceneSummary() {
    var out = {
      passageName: _currentPassageName(),
      tags: [],
      availableChoices: [],
      isInCombat: false,
      isSafePassage: false
    };
    try {
      var V = getSafeV() || {};
      out.isInCombat = _aiNum(V.combat, 0) === 1;
      var st = _aiGetSetupRoot();
      var major = st && Array.isArray(st.majorAreas) ? st.majorAreas : [];
      out.isSafePassage = major.indexOf(out.passageName) !== -1;
      if (window.SugarCube && window.SugarCube.Story && out.passageName) {
        var p = window.SugarCube.Story.get(out.passageName);
        out.tags = p && p.tags ? p.tags.slice(0, 12) : [];
      }
      var links = [];
      var passageEl = document.querySelector('#passages .passage');
      if (passageEl) {
        var nodes = passageEl.querySelectorAll('a[data-passage], .link-internal[data-passage]');
        for (var i = 0; i < nodes.length && links.length < 12; i++) {
          var txt = cleanLabel(nodes[i].textContent || '');
          var target = nodes[i].getAttribute('data-passage') || '';
          if (txt && target && !_isGameMenuPassage(target) && !/AIStoryGen_/.test(target)) {
            links.push({ text: txt, passage: target });
          }
        }
      }
      out.availableChoices = links;
    } catch (_) {}
    return out;
  }

  function buildState(cfg) {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    var tier = cfg.tier || 2;

    var state = {
      world: _aiBuildWorldState(V),
      player: {
        gender: V.player ? (V.player.gender_appearance || V.player.gender) : V.gender,
        body: V.player ? V.player.bodysize : undefined,
        pronoun: V.pronoun,
      },
      stats: {
        arousal: V.arousal,
        awareness: V.awareness,
        lewdness: V.lewdity,
        stress: V.stress,
        pain: V.pain,
        trauma: V.trauma,
      },
      statusDetail: _aiBuildStatusDetail(V),
      worn_summary: summarizeWorn(V.worn),
      money: V.money,
    };

    if (tier >= 2) {
      // -- Named NPC overview (persistent relationships, all met NPCs) --
      var _setup = (typeof setup !== 'undefined') ? window.setup : (window.SugarCube && window.SugarCube.setup) || null;
      var _C = (typeof C !== 'undefined' && C) ? C : (window.C || null);
      var npcNameList = (_setup && _setup.NPCNameList) ? _setup.NPCNameList : [];
      var loveInterests = (_setup && _setup.loveInterestNpc) ? _setup.loveInterestNpc : [];
      var npcs = [];
      var npcDetails = [];
      for (var ni = 0; ni < npcNameList.length; ni++) {
        var name = npcNameList[ni];
        var npc = (_C && _C.npc && _C.npc[name]) || (V.NPCName && V.NPCName[ni]) || V[name];
        if (!npc || !npc.init) continue;
        var zhName = _toChineseName(name);
        var entry = {
          name: zhName,
          key: name,
          title: _localizeNamesInText(npc.title || zhName),
          love: npc.love || 0,
          lust: npc.lust || 0,
          dom: npc.dom || 0,
          relationship: {
            love: _aiRelationObject(npc.love),
            lust: _aiRelationObject(npc.lust),
            dom: _aiRelationObject(npc.dom),
            rage: _aiRelationObject(npc.rage),
            trust: _aiRelationObject(npc.trust)
          },
        };
        if (npc.trust != null) entry.trust = npc.trust;
        if (npc.rage != null) entry.rage = npc.rage;
        if (npc.state) entry.state = npc.state;
        if (loveInterests.indexOf(name) !== -1) entry.isLoveInterest = true;
        var extra = _aiBuildNpcExtra(V, name);
        if (Object.keys(extra).length) entry.extra = extra;
        npcs.push(entry);
        npcDetails.push({
          name: zhName,
          key: name,
          title: entry.title,
          gender: npc.gender || '',
          state: npc.state || '',
          isLoveInterest: !!entry.isLoveInterest,
          relationship: entry.relationship,
          extra: entry.extra || {}
        });
      }
      if (npcs.length) state.npcs = npcs;
      if (npcDetails.length) state.npcDetails = npcDetails;
      // -- Active NPCs at current location --
      var activeNpcs = [];
      var nearbyNpcDetails = [];
      var npcList = V.NPCList || [];
      for (var ai = 0; ai < Math.min(npcList.length, 6); ai++) {
        var an = npcList[ai];
        if (!an || an.active !== 'active') continue;
        var activeName = _localizeNamesInText(an.fullDescription || an.description || ('NPC#' + ai));
        activeNpcs.push(activeName);
        nearbyNpcDetails.push({
          slot: ai,
          name: activeName,
          type: an.type || 'human',
          role: an.role || '',
          gender: an.gender || '',
          stance: an.stance || '',
          trust: _aiRelationObject(an.trust),
          lust: _aiRelationObject(an.lust),
          love: _aiRelationObject(an.love),
          dom: _aiRelationObject(an.dom)
        });
      }
      if (activeNpcs.length) state.nearbyNpcs = activeNpcs;
      if (nearbyNpcDetails.length) state.nearbyNpcDetails = nearbyNpcDetails;
      if (V.pregnancy && (V.pregnancy.type || (V.pregnancy.fetus && V.pregnancy.fetus.length))) {
        state.pregnancy = pick(V.pregnancy, ['type', 'duration', 'fetus']);
      }
      if (V.transformations) {
        var tf = {};
        Object.keys(V.transformations).forEach(function (k) {
          var v = V.transformations[k];
          if (v && (v.level || v.value)) tf[k] = v.level || v.value;
        });
        if (Object.keys(tf).length) state.transformations = tf;
      }
      // -- Skills (all general/addon/school/thresholds/sensitivity) --
      state.skills = {
        general: {
          skulduggery: V.skulduggery || 0,
          dancing: V.danceskill || 0,
          swimming: V.swimmingskill || 0,
          athletics: V.athletics || 0,
          tending: V.tending || 0,
          housekeeping: V.housekeeping || 0,
        },
        addon: {
          seduction: V.seductionskill || 0,
          oral: V.oralskill || 0,
          vaginal: V.vaginalskill || 0,
          anal: V.analskill || 0,
          hand: V.handskill || 0,
          feet: V.feetskill || 0,
          penile: V.penileskill || 0,
          chest: V.chestskill || 0,
          thigh: V.thighskill || 0,
          bottom: V.bottomskill || 0,
        },
        school: {
          science: { score: V.science || 0, grade: V.sciencetrait || 0 },
          maths:   { score: V.maths || 0,   grade: V.mathstrait || 0 },
          english: { score: V.english || 0, grade: V.englishtrait || 0 },
          history: { score: V.history || 0, grade: V.historytrait || 0 },
          detention: V.detention || 0,
        },
        thresholds: {
          exhibitionism: V.exhibitionism || 0,
          promiscuity: V.promiscuity || 0,
          deviancy: V.deviancy || 0,
        },
        sensitivity: {
          mouth: V.mouthsensitivity || 1,
          breast: V.breastsensitivity || 1,
          bottom: V.bottomsensitivity || 1,
          genital: V.genitalsensitivity || 1,
        },
      };
      state.skillSummary = _aiBuildSkillSummary(V);
      // -- Fame (12 categories) --
      if (V.fame) {
        var fameObj = {};
        var fameKeys = ['addon','prostitution','rape','bestiality','exhibitionism','pregnancy','impreg','scrap','good','business','social','model'];
        for (var fi = 0; fi < fameKeys.length; fi++) {
          if (V.fame[fameKeys[fi]]) fameObj[fameKeys[fi]] = V.fame[fameKeys[fi]];
        }
        if (Object.keys(fameObj).length) state.fame = fameObj;
      }
      // -- Quest reminders --
      var quests = {};
      if (V.rentmoney > 0) quests.rent = { amount: V.rentmoney, daysLeft: V.renttime };
      if (V.community_service >= 1) quests.communityService = true;
      if (V.edenfreedom > 0) quests.edenFreedom = { progress: V.edenfreedom, daysLeft: V.edendays };
      if (Object.keys(quests).length) state.quests = quests;
      state.activeQuests = _aiBuildActiveQuests(V);
      state.sceneContext = _aiBuildCurrentSceneSummary();
    }

    if (tier >= 3) {
      state.worn_full = V.worn;
      // -- Crime record --
      if (V.crime) {
        var crimeTypes = ['assault','coercion','destruction','exposure','obstruction','prostitution','resisting','thievery','petty','trespassing'];
        var crimeObj = {};
        var totalCrime = 0;
        for (var ci = 0; ci < crimeTypes.length; ci++) {
          var ct = crimeTypes[ci];
          if (V.crime[ct]) {
            crimeObj[ct] = V.crime[ct].current || 0;
            totalCrime += V.crime[ct].current || 0;
          }
        }
        if (totalCrime > 0) state.crime = { total: totalCrime, types: crimeObj };
      }
      // -- School reputation --
      if (V.delinquency || V.cool) {
        state.schoolRep = { delinquency: V.delinquency || 0, coolness: V.cool || 0 };
      }
      // -- Orphanage status --
      if (V.orphan_hope || V.orphan_reb) {
        state.orphanage = { hope: V.orphan_hope || 0, rebellion: V.orphan_reb || 0 };
      }
      // -- World corruption --
      if (V.world_corruption_soft || V.world_corruption_hard) {
        state.worldCorruption = { soft: V.world_corruption_soft || 0, hard: V.world_corruption_hard || 0 };
      }
      // -- Inventory summary (lightweight) --
      var inv = {};
      if (V.spraymax > 0) inv.pepperSpray = { charges: V.spray || 0, max: V.spraymax };
      if (V.sewingKit >= 1) inv.sewingKit = true;
      if (V.condoms != null) inv.condoms = V.condoms;
      if (V.vaginalchastity >= 1) inv.chastityVaginal = true;
      if (V.analchastity >= 1) inv.chastityAnal = true;
      if (V.penilechastity >= 1) inv.chastityPenile = true;
      if (V.police_access_card >= 1) inv.policeCard = true;
      var toyCount = 0;
      if (V.player && V.player.inventory && V.player.inventory['s' + 'ex' + 'toys']) {
        for (var tn in V.player.inventory['s' + 'ex' + 'toys']) {
          if (Array.isArray(V.player.inventory['s' + 'ex' + 'toys'][tn])) toyCount += V.player.inventory['s' + 'ex' + 'toys'][tn].length;
        }
      }
      if (toyCount > 0) inv.specialToys = toyCount;
      if (Array.isArray(V.aiStoryGenItems) && V.aiStoryGenItems.length) {
        inv.aiItems = V.aiStoryGenItems.slice(-20).map(function (item) {
          return {
            name: item.name,
            qty: item.qty || 1,
            tag: item.tag || 'AI道具'
          };
        });
      }
      if (Object.keys(inv).length) state.inventory = inv;
    }

    return state;
  }

  function buildScene() {
    var V = (typeof State !== 'undefined' && State.variables) ? State.variables : {};
    var T = (typeof Time !== 'undefined' && Time) ? Time : null;
    var scene = {
      location: V.location,
      area: V.area || 'unknown',
      day: V.day,
      weekday: V.weekday,
      hour: V.hour,
      minute: V.minute,
      nearby: (function(){
        var nList = V.NPCList || [];
        var names = [];
        for (var ni = 0; ni < Math.min(nList.length, 4); ni++) {
          var n = nList[ni];
          if (n && n.active === 'active') {
            names.push(n.fullDescription || n.description || ('NPC#' + ni));
          }
        }
        return names.length ? names.join(', ') : 'alone';
      })(),
    };
    // School schedule
    if (T) {
      if (T.schoolTerm) scene.schoolActive = true;
      if (T.schoolDay) scene.schoolDay = true;
      if (T.currentMoonPhase && T.currentMoonPhase.description) scene.moonPhase = T.currentMoonPhase.description;
    }
    // Danger/safety categorization
    var hour = V.hour != null ? Number(V.hour) : 12;
    var loc = (V.location || '').toLowerCase();
    var dangerLevel = 'neutral';
    if (loc.indexOf('alley') !== -1 || loc.indexOf('industrial') !== -1 || loc.indexOf('moor') !== -1 ||
        loc.indexOf('brothel') !== -1 || loc.indexOf('compound') !== -1 || loc.indexOf('docks') !== -1) {
      dangerLevel = 'dangerous';
    } else if (loc.indexOf('forest') !== -1 || loc.indexOf('farm') !== -1 ||
               loc.indexOf('beach') !== -1 || loc.indexOf('sea') !== -1) {
      dangerLevel = 'wilderness';
    } else if (hour < 6 || hour >= 21) {
      dangerLevel = 'night';
    } else if (loc.indexOf('school') !== -1 || loc.indexOf('orphanage') !== -1 ||
               loc.indexOf('library') !== -1 || loc.indexOf('temple') !== -1) {
      dangerLevel = 'safe';
    }
    scene.dangerLevel = dangerLevel;
    return scene;
  }
  window.AIStoryGen.buildScene = buildScene;

  function getGameLinks() {
    var links = [];
    var $passage = $('#passages .passage');
    if (!$passage.length) return links;
    $passage.find('a[data-passage]').each(function () {
      if ($(this).closest('.ai-narrative-section').length) return;
      var text = $(this).clone().children().remove().end().text().trim();
      if (!text || text.length < 2) return;
      var target = $(this).attr('data-passage');
      if (!target) return;
      if (_isGameMenuPassage(target)) return;
      links.push(text);
    });
    return links.slice(0, 10);
  }

  function _storyPromptCleanText(value, maxLen) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var n = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
        if (n >= 0xDC00 && n <= 0xDFFF) {
          out += text.charAt(i) + text.charAt(i + 1);
          i++;
        }
      } else if (c < 0xDC00 || c > 0xDFFF) {
        out += text.charAt(i);
      }
    }
    if (maxLen && out.length > maxLen) out = out.slice(0, maxLen).trim();
    return out;
  }

  function _loadPixelCfgForStoryPrompt() {
    try {
      var raw = localStorage.getItem('aiPixelGen_cfg');
      if (!raw) return {};
      var cfg = JSON.parse(raw);
      return cfg && typeof cfg === 'object' ? cfg : {};
    } catch (e) {
      return {};
    }
  }

  function _parseCustomNpcAppearanceNotes(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = _storyPromptCleanText(line, 900);
      if (!line) return;
      var m = line.match(/^([^:：=]{1,80})\s*[:：=]\s*(.+)$/);
      if (!m) return;
      var name = _storyPromptCleanText(m[1], 60);
      var desc = _storyPromptCleanText(m[2], 220);
      if (name && desc) rows.push({ name: name, desc: desc });
    });
    return rows;
  }

  function buildCharacterAppearanceSettingsBlock() {
    var pixelCfg = _loadPixelCfgForStoryPrompt();
    var entries = [];
    var seen = {};
    var npcAppearances = pixelCfg && pixelCfg.npcAppearances && typeof pixelCfg.npcAppearances === 'object'
      ? pixelCfg.npcAppearances
      : {};

    Object.keys(npcAppearances).sort().forEach(function (name) {
      var cleanName = _storyPromptCleanText(name, 60);
      var desc = _storyPromptCleanText(npcAppearances[name], 220);
      if (!cleanName || !desc || seen[cleanName]) return;
      seen[cleanName] = 1;
      entries.push(cleanName + ': ' + desc);
    });

    _parseCustomNpcAppearanceNotes(pixelCfg.customNpcAppearances).forEach(function (row) {
      if (!row.name || !row.desc || seen[row.name]) return;
      seen[row.name] = 1;
      entries.push(row.name + ': ' + row.desc);
    });

    if (!entries.length) return '';
    var intro = '\u4ee5\u4e0b\u662f\u73a9\u5bb6\u5728 NPC\u5f62\u8c61\u8bbe\u7f6e \u4e2d\u5199\u5165\u7684\u89d2\u8272\u5916\u89c2/\u7279\u70b9\u8bbe\u5b9a\u3002\u82e5\u5267\u60c5\u51fa\u73b0\u540c\u540d\u89d2\u8272\uff0c\u5e94\u4f18\u5148\u4fdd\u6301\u8fd9\u4e9b\u8bbe\u5b9a\uff1b\u4e0d\u8981\u56e0\u4e3a\u8fd9\u91cc\u5217\u51fa\u67d0\u89d2\u8272\u5c31\u628aTA\u5f3a\u884c\u52a0\u5165\u5f53\u524d\u573a\u666f\u3002';
    return '<character_appearance_settings role="player_custom_supplement_not_current_presence">\n' + intro + '\n' + entries.slice(0, 18).join('\n') + '\n</character_appearance_settings>';
  }

  function buildRecentBlock() {
    var blocks = [];
    var cfg = loadCfg();
    var profile = String(cfg.playerStoryProfile || '').trim();
    if (profile) {
      blocks.push('<player_story_profile role="player_custom_supplement_not_native_state">\n' + profile + '\n</player_story_profile>');
    }
    var appearanceBlock = buildCharacterAppearanceSettingsBlock();
    if (appearanceBlock) {
      blocks.push(appearanceBlock);
    }
    // Recent story memory (last N events)
    if (recentBuf.length) {
      var lines = recentBuf.map(function (r, i) {
        return '[' + (i + 1) + '] (passage: ' + r.name + ') ' + r.text;
      }).join('\n');
      blocks.push('<recent_story role="continuity_events_not_current_presence">\n' + lines + '\n</recent_story>');
    }
    // Long-term memory (player-bookmarked events)
    if (longTermMem.length) {
      var ltm = longTermMem.map(function (r, i) {
        r = _normalizeImportantMemoryEntry(r);
        var label = r.name.indexOf('[LTSummary]') === 0 ? 'summary' : r.name;
        var tag = r.tag ? '; tag: ' + r.tag : '';
        var lock = r.locked ? '; locked' : '';
        return '[' + (i + 1) + '] (' + label + tag + lock + ') ' + r.text;
      }).join('\n');
      blocks.push('<long_term_memory role="persistent_facts_not_current_presence">\n重点记忆区：记录专门的剧情顺序、关键剧情、压缩后的剧情摘要和玩家手动重点。\n' + ltm + '\n</long_term_memory>');
    }
    return blocks.length ? blocks.join('\n\n') + '\n\n' : '';
  }

  function _extractCurrentAiStoryText() {
    var $root = $();
    if (_aiReplaceActive) {
      $root = $('#passages .passage .ai-replaced-content');
    } else if (_aiNarrativeWrap) {
      $root = $(_aiNarrativeWrap);
    }
    if (!$root.length) return '';
    var $clone = $root.clone();
    $clone.find('script, style, button, input, select, .ai-narrative-toolbar, .ai-gen-loading, .ai-choices, .ai-memory-inline, .ai-back-to-game, .ai-nav-wrap').remove();
    return ($clone.text() || '').replace(/\s+/g, ' ').trim();
  }

  function buildCurrentAiStoryBlock() {
    var cfg = loadCfg();
    var text = _extractCurrentAiStoryText();
    if (!text) return '';
    var limit = Math.max(200, cfg.recentLimit || 600);
    if (text.length > limit) text = text.slice(0, limit) + '...';
    return '<current_ai_story>\n' + text + '\n</current_ai_story>\n\n';
  }

  // ---------- 4. Prompt 构造 ----------
  function buildNativeContextAuthorityBlock() {
    return [
      '<context_authority>',
      'Authoritative game sources: <state>, <scene>, <current_map>, and <known_places> are read from the native game state.',
      'Do not overwrite or contradict native game facts: player body, clothing, stats, money, location, native inventory, quests, relationship values, active NPCs, or reachable map links.',
      'Use statusDetail labels, skillSummary grades, npcDetails relationship levels, activeQuests, and sceneContext as compact interpreted native facts; they are derived from the same game state and should guide narration without being listed mechanically.',
      'Player-authored supplements (<player_story_profile> and <character_appearance_settings>) may guide tone, recurring preferences, or appearance details only when they do not conflict with native game state.',
      'Memory blocks (<recent_story>, <current_ai_story>, and <long_term_memory>) provide continuity. They are not proof that a character, creature, object, or place is currently present.',
      'Treat only <scene>, nearbyNpcs in <state>, the current AI story, and the selected player action as evidence for what is currently on screen.',
      'Use [AI_EVENT] as the structured story summary channel. Do not store UI text, sidebar text, menu labels, buttons, or raw passage descriptions as story facts.',
      '</context_authority>'
    ].join('\n') + '\n\n';
  }

  var STORY_STYLE_PRESETS = {
    none: '',
    custom: '',
    minimal: '极简文风：模仿海明威的写作手法，仅使用名词和动词，不使用比喻与抒情手法。',
    epic: '史诗文风：以极尽史诗的笔触书写故事的壮丽与辉煌。故事表面上应该是充满张力的，每个个体的抗争与矛盾都应该以最细致饱满的手法去描写，可参考托尔斯泰《战争与文明》，乔伊斯《尤利西斯》。',
    cult: 'cult文风：以最微小单元的腐化着眼描写，重点凸显社会的恶面，刻画一片恶之花盛放的土地。主角往往带有癫狂感和堕落感，可参考cult电影《女人的烦恼》、《菠萝酯》、《粉红色的火烈鸟》、《发条橙》。',
  };

  function _buildStoryStyleDirective(cfg) {
    cfg = cfg || loadCfg();
    var presetKey = String(cfg.storyStylePreset || 'none');
    var preset = STORY_STYLE_PRESETS[presetKey] || '';
    var custom = presetKey === 'custom'
      ? String(cfg.storyStylePrompt || '').replace(/\s+/g, ' ').trim()
      : '';
    var styleText = (custom || preset).slice(0, 1200);
    if (!styleText) return '';
    return [
      '<style_directive>',
      '文风设定：' + styleText,
      '该设定只影响叙事语言、节奏和氛围，不得覆盖 <state>、<scene>、当前地点、NPC在场状态、物品、数值变化、[STATS]、[ITEMS]、[AI_META]、[AI_EVENT] 等游戏事实和输出格式。',
      '如果文风设定与游戏事实或格式规则冲突，以游戏事实和格式规则为准。',
      '</style_directive>',
      '',
    ].join('\n');
  }

  function _applyStoryStyleDirectiveToPrompt(instruction, cfg) {
    var prompt = String(instruction || '');
    if (prompt.indexOf('<style_directive>') !== -1) return prompt;
    var block = _buildStoryStyleDirective(cfg);
    if (!block) return prompt;
    var idx = prompt.indexOf('<instruction>');
    if (idx >= 0) return prompt.slice(0, idx) + block + prompt.slice(idx);
    return block + prompt;
  }

  var STYLE_EN = [
    'You are an in-game narrator for the Twine adult text-adventure',
    '"Degrees of Lewdity".',
    'Your job is to "fill in" and "enrich" the game — add scene details,',
    'random encounters, atmospheric touches. You are NOT an independent writer;',
    'you are an extension of the game. Write in the SAME style as the base game:',
    '- Second person, present tense ("You feel...", "You see...").',
    '- British English spelling.',
    '- Concise, sensory-driven prose. 1-3 short paragraphs, like a random encounter.',
    '- Do NOT speak to the player out-of-character. No meta commentary.',
    '- Do NOT invent NPCs not present in <state>. Use given names exactly.',
    '- Match the player\'s gender / body / clothing as given in <state>.',
    '- Respect the player\'s current arousal/awareness/stress level.',
    '- Read <recent_story> as the immediate prior narration. Maintain',
    '  continuity but do NOT repeat. Move forward naturally.',
    '- Read <long_term_memory> for the character\'s long-term history and',
    '  recurring themes. Respect character development across sessions.',
    '- Read <player_story_profile> as player-authored story preferences, tone, recurring traits, and desired plot direction. Weave it in subtly when relevant.',
    '- Read <character_appearance_settings> as player-authored appearance and trait notes. If a named character appears, preserve those details. Do not introduce characters solely because they are listed there.',
    '- You MUST be aware of the player\'s current location (<scene>).',
    '  Narratives should be grounded in that location, and may introduce small random events.',
    '- When the narrated action significantly impacts the player\'s physical or',
    '  mental state, append a stats line: [STATS: arousal+5, stress-10, pain+3].',
    '  Money is not inferred from keywords. If the player gains or loses money, the prose must clearly state the exact amount and reason, and AI_EVENT moneyChange must contain that same signed pence amount. Do not guess challenge rewards or costs.',
    '  If the player gains a concrete non-money item, append [ITEMS: item name x1; item name x2].',
    '  If writing Chinese narration, ITEMS names must also be Chinese short names. Do not output English item names.',
    '  ITEMS must contain only short concrete item names, never feelings, moods, scene states, scenery, doors, rooms, or full sentences. Examples: "狗粮 x1; 清水 x1"; not "feeling of freedom" or "the door is open".',
    '  Use only allowed non-money stat keys from the AI runtime stat schema: ' + _formatAiRuntimeNonMoneyStatAllowlist() + '. money uses pence; moneyChange+100 = £1.',
    '',
    'Output in-game narration text only, plus required system markers: [STATS], [ITEMS], [AI_META], and [AI_EVENT] when requested.',
    'No preface, no markdown headers, no "Sure, here is...". Do not output any JSON outside allowed metadata blocks.',
  ].join('\n');

  var STYLE_ZH = [
    '- \u628a <character_appearance_settings> \u89c6\u4e3a\u73a9\u5bb6\u5199\u5165\u7684\u89d2\u8272\u5916\u89c2/\u7279\u70b9\u8bbe\u5b9a\uff1b\u540c\u540d\u89d2\u8272\u51fa\u73b0\u65f6\u5fc5\u987b\u4fdd\u6301\u4e00\u81f4\uff0c\u4f46\u4e0d\u8981\u56e0\u6b64\u65b0\u589e\u4e0d\u5728\u573a\u89d2\u8272\u3002',
    '你是 Twine 文字 AVG《Degrees of Lewdity》的内置叙事者。',
    '你的任务是"补全"和"丰富"游戏剧情：补充场景描写、生成随机遭遇、增添氛围细节。',
    '你不是独立编剧，而是游戏的延伸。保持原作风格：',
    '- 第二人称、现在时（"你感到……"、"你看到……"）。',
    '- 简洁、注重感官描写。输出 1-3 个短段，像随机遭遇一样自然。',
    '- 不要打破第四面墙、不要元注释、不要解释。',
    '- 不得编造 <state> 中未出现的 NPC，使用给定名字。',
    '- 所有人名必须使用中文名；不要输出 Robin、Whitney、Sydney、Kylar 等英文内部名。',
    '- 中文正文里不要直接写 arousal/stress/pain/trauma/control/lust 等英文内部变量名；如需描述状态，请写“兴奋/压力/疼痛/创伤/自控/欲望”等自然中文。',
    '- 严格匹配 <state> 中玩家的性别 / 体型 / 着装。',
    '- 尊重玩家当前的兴奋 / 觉醒 / 压力数值。',
    '- 把 <recent_story> 视为紧邻当前的剧情，保持连贯但不要重复。',
    '- 把 <long_term_memory> 中记录的人物过往关键记忆融入叙事背景，',
    '  尊重角色成长线和跨会话的角色发展。',
    '- 你必须了解玩家当前所在的地点 (<scene>)，',
    '  叙事和选项必须基于该地点展开，可以引出随机小事件。',
    '- 当剧情显著影响玩家身心状态时，在末尾附加一行：',
    '  [STATS: arousal+5, stress-10, pain+3]。仅使用非金钱 AI 运行时属性白名单：' + _formatAiRuntimeNonMoneyStatAllowlist() + '。酌情输出。',
    '- 金钱变化不能靠“找到/发现/获得/进入挑战/奖励”等关键词推断。只有正文明确写出具体金额和原因时，才在 AI_EVENT 的 moneyChange 中写同一 signed pence，例如 +250 或 -8000；金额不明确或只是猜测奖励/花费时必须留空。',
    '',
    '只输出游戏内叙事正文，以及系统要求的 [STATS]、[ITEMS]、[AI_META]、[AI_EVENT] 标记块。不要前言、不要 Markdown 标题、不要"好的，以下是……"。',
  ].join('\n');

  function buildSystem(cfg) {
    var style = cfg.language === 'zh' ? STYLE_ZH : STYLE_EN;
    var extra = (cfg.systemPromptExtra || '').trim();
    var parts = [];
    if (extra) parts.push(extra);
    if (cfg.jailbreak && cfg.jailbreak.trim()) parts.push(cfg.jailbreak.trim());
    parts.push(style);
    parts.push([
      'Context priority rules:',
      '1. Native game state in <state>, <scene>, <current_map>, and <known_places> is authoritative.',
      '2. Player profile, appearance notes, recent story, and long-term memory are supplements only; they must not override native game state.',
      '3. Memory is continuity, not current presence. Do not treat old names, places, or objects as currently present unless the current scene/action confirms them.',
      '4. Use AI_EVENT summaries for durable story facts; never convert UI text, menu text, sidebars, or raw passage descriptions into memory facts.'
    ].join('\n'));
    if (cfg.language === 'zh') {
      parts.push('When the user prompt requests [AI_META]{...}[/AI_META] or [AI_EVENT]...[/AI_EVENT], append those metadata blocks exactly. They are allowed metadata, not forbidden JSON. Do not output any other JSON.');
    }
    return parts.join('\n\n').trim();
  }

  function buildUser(cfg, instruction) {
    var state = buildState(cfg);
    var scene = buildScene();
    return [
      '<state>',
      JSON.stringify(state, null, 2),
      '</state>',
      '',
      buildRecentBlock(),
      buildCurrentAiStoryBlock(),
      buildNativeContextAuthorityBlock(),
      '<scene>',
      'location: ' + (scene.location || 'unknown'),
      'time: day ' + (scene.day || '?') + ', ' + (scene.weekday || '?') + ', ' + (scene.hour != null ? scene.hour : '?') + ':' + (scene.minute != null ? String(scene.minute).padStart(2, '0') : '00'),
      'nearby: ' + (scene.nearby || 'alone'),
      '</scene>',
      '',
      '<instruction>',
      instruction || (cfg.language === 'zh' ? '继续描写当前场景。' : 'Continue describing the current scene.'),
      '</instruction>',
    ].join('\n');
  }

  // ---------- 5. DeepSeek 调用 ----------

  function _contentToText(content) {
    return ApiClientModule.contentToText(content);
  }

  function _extractAIResponseText(j) {
    return ApiClientModule.extractResponseText(j);
  }

  function _shouldDisableDeepSeekThinking(endpoint, model, opts) {
    return ApiClientModule.shouldDisableThinking(endpoint, model, opts);
  }

  function _emptyAIResponseMessage(j, lang) {
    return ApiClientModule.emptyResponseMessage(j, lang);
  }

  /**
   * Low-level AI fetch: shared by callAI, generateChoices, and combat narrator.
   * @param {Array} messages - [{role, content}]
   * @param {Object} opts - { temperature, max_tokens, signal }
   * @returns {Promise<string>} response text content
   */
  async function _fetchAI(messages, opts) {
    var cfg = loadCfg();
    opts = opts || {};
    var selected = ApiClientModule.buildChatBody(cfg, Object.assign({}, opts, { messages: messages }), DEFAULT_CFG);
    var endpoint = selected.endpoint;
    var localEndpoint = ApiClientModule.isLocalEndpoint(endpoint);
    if (!cfg.apiKey && !localEndpoint) {
      throw new AIError(AIErrorType.NOT_CONFIGURED,
        cfg.language === 'zh'
          ? '未设置 API 密钥。请先在 AI 设置中配置。'
          : 'API Key not set. Configure in AI Settings tab first.');
    }
    var body = selected.body;
    var headers = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    function makeFetchOpts(requestBody) {
      var fo = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      };
      if (opts && opts.signal) fo.signal = opts.signal;
      return fo;
    }
    async function postOnce(requestBody) {
      var resp = await fetch(endpoint, makeFetchOpts(requestBody));
      if (!resp.ok) {
        var t = await resp.text().catch(function () { return ''; });
        throw classifyError(new Error('HTTP ' + resp.status + ' ' + t.slice(0, 200)), cfg.language);
      }
      var j = await resp.json();
      var out = _extractAIResponseText(j);
      if (!out) {
        throw new AIError(AIErrorType.UNKNOWN, _emptyAIResponseMessage(j, cfg.language), ApiClientModule.emptyResponseDetail(j, 200));
      }
      return out.trim();
    }
    try {
      try {
        return await postOnce(body);
      } catch (emptyErr) {
        if (!(emptyErr instanceof AIError) || emptyErr.type !== AIErrorType.UNKNOWN || opts.noEmptyRetry || (opts.signal && opts.signal.aborted)) {
          throw emptyErr;
        }
        var retryBody = Object.assign({}, body);
        retryBody.max_tokens = Math.max(Number(body.max_tokens || 0) * 2, Number(body.max_tokens || 0) + 300, 700);
        retryBody.temperature = Math.max(0.2, Math.min(Number(body.temperature || 0.7), 0.8));
        console.warn('[AIStoryGen] empty AI response, retrying once with max_tokens=' + retryBody.max_tokens);
        return await postOnce(retryBody);
      }
    } catch (e) {
      throw classifyError(e, cfg.language);
    }
  }

  function _looksLikeAbortSignal(value) {
    return !!(value && (typeof value.aborted === 'boolean' || typeof value.addEventListener === 'function'));
  }

  async function callAI(instruction, signalOrOpts, extraOpts) {
    var cfg = loadCfg();
    var opts = {};
    var signal = null;
    if (_looksLikeAbortSignal(signalOrOpts)) {
      signal = signalOrOpts;
      opts = Object.assign({}, extraOpts || {});
    } else {
      opts = Object.assign({}, signalOrOpts || {}, extraOpts || {});
      signal = opts.signal || null;
    }
    if (opts.storyStyle) {
      instruction = _applyStoryStyleDirectiveToPrompt(instruction, cfg);
    }
    var messages = [
      { role: 'system', content: buildSystem(cfg) },
      { role: 'user', content: buildUser(cfg, instruction) },
    ];
    var fetchOpts = Object.assign({ temperature: cfg.temperature, max_tokens: cfg.max_tokens, signal: signal }, opts);
    delete fetchOpts.storyStyle;
    return _fetchAI(messages, fetchOpts);
  }
  window.AIStoryGen.callAI = callAI;

  // ---------- 6. 配置表单构建（共享函数） ----------
  var CONFIG_FIELDS = [
    { section: '模块' },
    { k: 'aiPixelEnabled', label: '启用 AI 绘图', type: 'bool', help: '开启后显示绘图配置页、剧情旁生图入口和战斗姿势图入口。关闭后隐藏所有 AI 绘图相关窗口和按钮，但保留已有绘图设置与缓存，之后可随时重新开启。' },

    { section: '记忆' },
    { k: 'recentMax', label: '短期记忆条数', type: 'range', min: 0, max: 20, step: 1, help: 'AI 记住最近多少条剧情片段。0 表示关闭短期记忆。短期记忆跟随当前游戏存档，不会跨存档共享。' },
    { k: 'recentLimit', label: '单条记忆字数上限', type: 'range', min: 100, max: 2000, step: 50, help: '每条短期记忆最多保留多少字。较低可减少消耗，较高可保留更多上下文。' },
    { k: 'summarizeTrigger', label: '记忆压缩触发条数', type: 'range', min: 0, max: 30, step: 1, help: '短期记忆达到多少条时尝试压缩旧内容。0 表示关闭自动压缩。长期记忆仍可手动精炼。' },
    { section: '????' },
    { k: 'postProcessPattern', label: '输出过滤正则', type: 'text', tab: 'prompt', help: '用正则处理 AI 输出中的固定废话或格式问题。高级选项，写错正则会被忽略。示例：/好的[\\s\\S]*?：/g' },
    { k: 'postProcessReplacement', label: '正则替换文本', type: 'text', tab: 'prompt', help: '与“输出过滤正则”配合使用。留空表示删除匹配内容；填写文字则把匹配内容替换为该文字。' },
  ];

  function getConfigSchema() {
    return CONFIG_FIELDS.slice();
  }

  function _defaultConfigValue(field, cfg) {
    if (!field || field.section) return '';
    if (cfg && cfg[field.k] != null) return cfg[field.k];
    if (DEFAULT_CFG && DEFAULT_CFG[field.k] != null) return DEFAULT_CFG[field.k];
    return '';
  }

  function _coerceConfigFieldValue(field, input) {
    if (!field || field.section) return undefined;
    if (field.type === 'bool') {
      if (input && input.prop) return input.prop('checked') ? 1 : 0;
      return Number(input || 0) ? 1 : 0;
    }
    var value = input && input.val ? input.val() : input;
    if (field.type === 'select') {
      var numeric = Number(value);
      return Number.isNaN(numeric) ? value : numeric;
    }
    if (field.type === 'number' || field.type === 'range') return Number(value);
    return value == null ? '' : value;
  }

  function _configFieldTab(field) {
    if (!field || field.section) return '';
    return field.tab || 'story';
  }

  function _configFieldsForTab(tab) {
    tab = tab || 'story';
    var out = [];
    var pendingSection = null;
    CONFIG_FIELDS.forEach(function (field) {
      if (field.section) {
        pendingSection = field.section;
        return;
      }
      if (_configFieldTab(field) !== tab) return;
      if (_isHiddenAdultConfigField(field)) return;
      if (pendingSection) {
        out.push({ section: pendingSection });
        pendingSection = null;
      }
      out.push(field);
    });
    return out;
  }
  window.AIStoryGen.getConfigSchema = getConfigSchema;

  /**
   * Build the AI config form into $container (a jQuery object).
   * Used by both the standalone <<aiconfig>> macro and the Settings tab.
   * @param {$} $container  jQuery element to append form into
   * @param {boolean} isSettingsTab  whether we're rendering inside the Settings tab
   */
  function buildConfigForm($container, isSettingsTab, tabName) {
    var cfg = loadCfg();
    var visibleFields = _configFieldsForTab(tabName || 'story');
    var wrapperClass = isSettingsTab ? 'ai-cfg ai-cfg-settings' : 'ai-cfg';
    var $root = $('<div></div>').addClass(wrapperClass);

    if (!_isApiConfigured(cfg)) {
      $root.append(_makeApiWarnBlock(cfg, { compact: true }));
    }

    var $form = $('<div class="ai-cfg-form"></div>');
    var inputs = {};

    visibleFields.forEach(function (f) {
      if (f.section) {
        $form.append($('<div class="ai-cfg-section"></div>').text(f.section));
        return;
      }
      var $row = $('<div class="ai-cfg-row"></div>');
      var $label = $('<label></label>').text(f.label);
      if (f.help) {
        var $help = $('<span class="ai-cfg-help" tabindex="0">(?)</span>').attr('title', f.help);
        $label.append(' ').append($help);
      }
      $row.append($label);
      var $inp;
      if (f.type === 'textarea') {
        $inp = $('<textarea></textarea>').attr('rows', f.rows || 4).val(_defaultConfigValue(f, cfg));
      } else if (f.type === 'select') {
        $inp = $('<select></select>');
        (f.options || []).forEach(function (opt) {
          $inp.append($('<option></option>').attr('value', opt.value).text(opt.label));
        });
        $inp.val(String(_defaultConfigValue(f, cfg)));
      } else if (f.type === 'bool') {
        var checked = Number(_defaultConfigValue(f, cfg) || 0) ? true : false;
        var $wrap = $('<label class="ai-cfg-check"></label>');
        $inp = $('<input type="checkbox">').prop('checked', checked);
        $wrap.append($inp).append($('<span></span>').text(checked ? '开启' : '关闭'));
        $inp.on('change', function () {
          $wrap.find('span').text($(this).prop('checked') ? '开启' : '关闭');
        });
        $row.append($wrap);
        inputs[f.k] = $inp;
        $form.append($row);
        return;
      } else if (f.type === 'range') {
        var val = _defaultConfigValue(f, cfg);
        $inp = $('<input type="range">')
          .attr('min', f.min)
          .attr('max', f.max)
          .attr('step', f.step || 1)
          .val(val);
        var $rangeWrap = $('<div class="ai-cfg-range"></div>');
        var $value = $('<span class="ai-cfg-range-value"></span>').text(val);
        $inp.on('input change', function () {
          $value.text($(this).val());
        });
        $rangeWrap.append($inp).append($value);
        $row.append($rangeWrap);
        inputs[f.k] = $inp;
        $form.append($row);
        return;
      } else {
        $inp = $('<input>').attr('type', f.type).val(_defaultConfigValue(f, cfg));
        if (f.step) $inp.attr('step', f.step);
      }
      $row.append($inp);
      inputs[f.k] = $inp;
      $form.append($row);
    });

    function syncStoryStylePromptUi() {
      if (!inputs.storyStylePreset || !inputs.storyStylePrompt) return;
      var mode = String(inputs.storyStylePreset.val() || 'none');
      var $prompt = inputs.storyStylePrompt;
      if (mode === 'custom') {
        $prompt.prop('readonly', false).prop('disabled', false).css('opacity', '1');
        return;
      }
      var preview = STORY_STYLE_PRESETS[mode] || '';
      $prompt.val(preview);
      $prompt.prop('readonly', true).prop('disabled', false).css('opacity', preview ? '0.85' : '0.55');
    }
    if (inputs.storyStylePreset && inputs.storyStylePrompt) {
      inputs.storyStylePreset.on('change', syncStoryStylePromptUi);
      syncStoryStylePromptUi();
    }

    var $btnSave = $('<button class="ai-cfg-btn">保存</button>');
    var $btnTest = $('<button class="ai-cfg-btn">测试连接</button>');
    var $btnReset = $('<button class="ai-cfg-btn">恢复默认</button>');
    var $msg = $('<div class="ai-cfg-msg"></div>');

    function collectFormCfg() {
      var next = Object.assign({}, loadCfg());
      visibleFields.forEach(function (f) {
        if (f.section) return;
        next[f.k] = _coerceConfigFieldValue(f, inputs[f.k]);
      });
      if (next.storyStylePreset !== 'custom') {
        next.storyStylePrompt = '';
      }
      return next;
    }

    $btnSave.on('click', function () {
      var next = collectFormCfg();
      saveCfg(next);
      _applyUILayoutMode('config saved');
      $(document).trigger('AIStoryGen:configSaved', [next]);
      $msg.removeClass('err').addClass('ok').text('已保存。');
      _refreshApiWarnBar();
      if (_isApiConfigured(next)) {
        $('#passages > .ai-user-msg, #passages > .ai-api-warn-bar').remove();
      }
    });

    $btnTest.on('click', function () {
      $msg.removeClass('err ok').text('正在诊断网络…');
      var cfg = collectFormCfg();
      checkNetwork(cfg.endpoint, cfg.apiKey, function (result) {
        if (result.status === 'ok') {
          $msg.removeClass('err ok').text('网络正常，正在测试 API 调用…');
          var originalCfg = loadCfg();
          saveCfg(cfg);
          callAI('Reply with the single word: OK').then(function (txt) {
            saveCfg(originalCfg);
            $msg.removeClass('err').addClass('ok').text('全部正常 → ' + txt.slice(0, 60));
          }).catch(function (e) {
            saveCfg(originalCfg);
            var aiErr = classifyError(e, cfg.language);
            $msg.removeClass('ok').addClass('err').text('网络可达但 API 调用失败: ' + aiErr.message);
          });
        } else {
          $msg.removeClass('ok').addClass('err').text('网络诊断: ' + result.message);
        }
      });
    });

    $btnReset.on('click', function () {
      if (!confirm('确定重置所有“织境空间”设置为默认值？')) return;
      saveCfg(Object.assign({}, DEFAULT_CFG));
      $(document).trigger('AIStoryGen:configSaved', [loadCfg()]);
      $msg.removeClass('err').addClass('ok').text('已重置。刷新页面查看默认设置。');
    });

    $root.append($form)
      .append($btnSave).append(' ')
      .append($btnTest).append(' ')
      .append($btnReset).append($msg);
    if ((tabName || 'story') === 'story') {
      var $version = $('<div class="ai-cfg-version"></div>').text('织境空间 v' + (window.AIStoryGen.VERSION || 'unknown'));
      $root.append($version);
    }

    // ── AI Memory viewer (always visible) ──


    $container.empty().append($root);
  }

  function buildPromptConfigForm($container, isSettingsTab) {
    return buildConfigForm($container, isSettingsTab, 'prompt');
  }

  function _isAIPixelEnabledCfg(cfg) {
    return Number((cfg || loadCfg()).aiPixelEnabled == null ? 1 : (cfg || loadCfg()).aiPixelEnabled) !== 0;
  }

  const ConfigUI = ConfigUIModule.create({
    $: window.jQuery || window.$,
    loadCfg: loadCfg,
    isPixelEnabled: _isAIPixelEnabledCfg,
    renderStoryConfig: buildConfigForm,
    renderPromptConfig: buildPromptConfigForm,
    getPixelGen: function () { return window.AIPixelGen || null; }
  });
  window.AIStoryGen.ConfigUI = ConfigUI;

  function buildUnifiedConfigForm($container, isSettingsTab, defaultTab) {
    return ConfigUI.renderUnifiedConfigForm($container, isSettingsTab, defaultTab);
  }

  /** Render short-term and long-term memory entries into $container. */
  function renderMemoryEntries($container, $msg) {
    return MemoryUI.renderMemoryEntries($container, $msg);
  }

  /** Send all recentBuf entries to AI for summarization, replace buffer with result */
  async function compressMemory($container, $msg) {
    return MemoryUI.compressMemory($container, $msg);
  }

  window.AIStoryGen.buildStoryConfigForm = buildConfigForm;
  window.AIStoryGen.buildPromptConfigForm = buildPromptConfigForm;
  window.AIStoryGen.buildConfigForm = buildUnifiedConfigForm;

  // ---------- 7. Settings 页标签注入 ----------
  var aiTabActive = false;

  function injectAISettingsTab(active) {
    var $container = $('#settingsOptions .containerStart');
    if (!$container.length) return;
    if ($('#aiSettingsTab').length) return; // already there

    var $tab = $('<div id="aiSettingsTab"></div>')
      .addClass(active ? 'gold buttonStartSelected' : 'buttonStart')
      .append($('<button>AI 设置</button>'));

    $tab.on('click', function () {
      aiTabActive = true;
      _hideAiPanelsForSettings();

      // De-highlight all sibling tabs
      $('#settingsOptions .containerStart > div').removeClass('gold buttonStartSelected').addClass('buttonStart');
      $tab.addClass('gold buttonStartSelected').removeClass('buttonStart');

      // Build the settings form into #settingsDiv, wrapped in DoL settings container style
      var $wrap = $('<div class="solidBorderContainer settings-container"><div class="settingsGrid"></div></div>');
      $('#settingsDiv').empty().append($wrap);
      buildUnifiedConfigForm($wrap.find('.settingsGrid'), true);
    });

    $container.append($tab);
  }

  function setupSettingsObservers() {
    // SugarCube replaces #settingsOptions entirely when switching native tabs.
    // Observing it directly loses the MutationObserver.  Instead we observe
    // #passages (which is stable across Settings page renders) with subtree:true,
    // and re-inject the AI Settings tab whenever #settingsOptions appears or changes.
    var passagesEl = document.getElementById('passages');
    if (!passagesEl) return;

    // Clean up any previous instance (passagedisplay may fire more than once)
    if (window._aiSettingsPassageObserver) {
      window._aiSettingsPassageObserver.disconnect();
    }

    window._aiSettingsPassageObserver = new MutationObserver(function () {
      var optsEl = document.getElementById('settingsOptions');
      if (!optsEl) return; // not the Settings page

      if (!$('#aiSettingsTab').length) {
        injectAISettingsTab(aiTabActive);
      }

      if (aiTabActive && !$('#settingsDiv .ai-unified-settings').length) {
        aiTabActive = false;
      }

      if (aiTabActive && $('#settingsDiv .ai-unified-settings').length) {
        $('#aiSettingsTab').removeClass('buttonStart').addClass('gold buttonStartSelected');
      }
    });
    window._aiSettingsPassageObserver.observe(passagesEl, { childList: true, subtree: true });
  }

  // Hook into Settings passage (use :passagedisplay — fires AFTER DOM is ready)
  $(document).on(':passagedisplay', function (ev) {
    var title = (ev && ev.passage && ev.passage.title) || (typeof State !== 'undefined' && State.passage) || '';
    if (title !== 'Settings') {
      _restoreAiPanelsAfterSettings();
      return;
    }

    aiTabActive = false;
    // Small delay to let SugarCube fully settle after complex widgets
    setTimeout(function () {
      setupSettingsObservers();
      if (!$('#aiSettingsTab').length) {
        injectAISettingsTab(false);
      }
    }, 150);
  });

  // --- 7b. Options Overlay 标签注入（侧边栏 Options 按钮打开的浮层） ---
  var optionsTabActive = false;

  function injectOptionsTab() {
    var $tabBar = $('#overlayTabs');
    if (!$tabBar.length) return;
    if ($('#aiOptionsTab').length) return;

    var $btn = $('<button>AI 设置</button>').attr('id', 'aiOptionsTab');

    $btn.on('click', function () {
      optionsTabActive = true;
      _hideAiPanelsForSettings();

      // Manually manage highlight — the game's Tab class only knows
      // about buttons that existed at construction time.
      $('#overlayTabs button').removeClass('tab-selected');
      $btn.addClass('tab-selected');

      // Build AI settings content into the overlay content area
      var $wrap = $('<div class="settingsGrid"></div>');
      $('#customOverlayContent').empty().append($wrap);
      buildUnifiedConfigForm($wrap, true);
    });

    // Insert before the close button (desktop: .customOverlayClose, mobile: button with "Close")
    var $closeBtn = $('#overlayTabs .customOverlayClose');
    if ($closeBtn.length) {
      $btn.insertBefore($closeBtn);
    } else {
      $tabBar.append($btn);
    }
  }

  function scheduleOptionsTabInjection(delay) {
    setTimeout(function () {
      var overlay = document.getElementById('customOverlay');
      if (!document.getElementById('overlayTabs')) return;
      if (overlay && overlay.classList && overlay.classList.contains('hidden')) return;
      if (overlay && overlay.getAttribute('data-overlay') &&
          overlay.getAttribute('data-overlay') !== 'options') return;
      injectOptionsTab();
    }, delay || 0);
  }

  function setupOptionsOverlayObserver() {
    var overlay = document.getElementById('customOverlay');
    if (!overlay) return;
    if (window._aiOptionsAttrObserver) window._aiOptionsAttrObserver.disconnect();
    if (window._aiOptionsClassObserver) window._aiOptionsClassObserver.disconnect();
    if (window._aiOptionsContentObserver) window._aiOptionsContentObserver.disconnect();

    // Watch data-overlay attribute — changes when a different overlay type opens
    var attrObserver = window._aiOptionsAttrObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes' && m.attributeName === 'data-overlay') {
          if (overlay.getAttribute('data-overlay') === 'options') {
            optionsTabActive = false;
            // Delay: SugarCube widgets need time to render tabs
            scheduleOptionsTabInjection(250);
          }
        }
      }
    });
    attrObserver.observe(overlay, { attributes: true, attributeFilter: ['data-overlay'] });

    // Watch class changes — overlay becomes visible when "hidden" class is removed
    var classObserver = window._aiOptionsClassObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
          if (overlay.classList.contains('hidden')) {
            optionsTabActive = false;
            _restoreAiPanelsAfterSettings();
          }
          if (!overlay.classList.contains('hidden') &&
              overlay.getAttribute('data-overlay') === 'options') {
            scheduleOptionsTabInjection(300);
          }
        }
      }
    });
    classObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    // Watch #customOverlayContent — when native tabs replace its content,
    // deactivate our tab highlight if our form is no longer there.
    var contentEl = document.getElementById('customOverlayContent');
    if (contentEl) {
      var contentObserver = window._aiOptionsContentObserver = new MutationObserver(function () {
        scheduleOptionsTabInjection(50);
        if (optionsTabActive && !$('#customOverlayContent .ai-unified-settings').length) {
          optionsTabActive = false;
          $('#aiOptionsTab').removeClass('tab-selected');
        }
      });
      contentObserver.observe(contentEl, { childList: true });
    }
  }

  // Kick off overlay observer after the DOM settles
  setTimeout(function () {
    _applyUILayoutMode('startup');
    try { $(window).off('resize.aiUILayoutMode orientationchange.aiUILayoutMode'); } catch (_) {}
    setupOptionsOverlayObserver();
    scheduleAiInventoryTabInjection(800);
    // Retry in case the overlay element isn't in the DOM yet
    setTimeout(function () {
      if (!document.getElementById('customOverlay')) return;
      if (!window._aiOptionsObserverReady) {
        window._aiOptionsObserverReady = true;
        setupOptionsOverlayObserver();
        scheduleAiInventoryTabInjection(50);
      }
    }, 2000);
  }, 500);

  setTimeout(function () {
    _installAIChoiceOrderObserver();
    if (window._aiOptionsGlobalObserver) window._aiOptionsGlobalObserver.disconnect();
    window._aiOptionsGlobalObserver = new MutationObserver(function (mutations) {
      var pixelOnly = true;
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (!(target && target.closest && target.closest('.apg-ai-assist, .apg-pixel-placeholder, .apg-pixel-result, .apg-pixel-controls, .apg-pixel-spinner'))) {
          pixelOnly = false;
          break;
        }
      }
      if (pixelOnly) return;
      _cleanupInlineAiInventorySections();
      if (document.getElementById('customOverlay')) setupOptionsOverlayObserver();
      scheduleOptionsTabInjection(50);
      scheduleAiInventoryTabInjection(80);
      _scheduleAIChoicePixelReposition(80);
      scheduleEnsureAutoChoices('global observer', 1200);
    });
    if (document.body) {
      window._aiOptionsGlobalObserver.observe(document.body, { childList: true, subtree: true });
    }
  }, 500);

  setTimeout(function () {
    scheduleEnsureAutoChoices('startup', 800);
  }, 1200);

  // ---------- 7c. AI 选项生成 ----------

  async function generateChoices(cfg, hint, signal, targetLabel, targetPassage) {
    var state = buildState(cfg);
    var recentBlock = buildRecentBlock() + buildCurrentAiStoryBlock() + buildNativeContextAuthorityBlock();
    var scene = buildScene();
    var sceneBlock = [
      'location: ' + (scene.location || 'unknown'),
      'atmosphere: ' + (scene.dangerLevel || 'neutral'),
      'time: day ' + (scene.day || '?') + ', ' + (scene.weekday || '?'),
      'clock: ' + (scene.hour != null ? scene.hour : '?') + ':' + (scene.minute != null ? String(scene.minute).padStart(2, '0') : '00'),
      'nearby: ' + (scene.nearby || 'alone'),
    ].join('\n');
    var dangerHint = scene.dangerLevel === 'dangerous'
      ? (cfg.language === 'zh' ? '• 场景氛围：危险区→警觉/逃跑/避险的选项' : '• Atmosphere: dangerous→alert/flee/avoid-threat options')
      : scene.dangerLevel === 'wilderness'
      ? (cfg.language === 'zh' ? '• 场景氛围：野外→探索/生存/暴露的选项' : '• Atmosphere: wilderness→explore/survive/exposure options')
      : scene.dangerLevel === 'night'
      ? (cfg.language === 'zh' ? '• 场景氛围：深夜→隐秘/阴影/不安的选项' : '• Atmosphere: night→stealthy/shadowy/uneasy options')
      : scene.dangerLevel === 'safe'
      ? (cfg.language === 'zh' ? '• 场景氛围：安全区→闲逛/社交/放松的选项' : '• Atmosphere: safe→stroll/social/relax options')
      : '';
    var gameLinks = getGameLinks();
    var gameLinksBlock = gameLinks.length
      ? '<game_links>\n当前可前往的地点：' + gameLinks.join('、') + '\n</game_links>\n'
      : '';

    // Build progression hint when in AI replace mode (player clicked [AI] on a location link)
    var progressionHint = '';
    if (targetPassage && targetLabel) {
      progressionHint = cfg.language === 'zh'
        ? '★ 重要：玩家正在前往「' + targetLabel + '」的途中。请确保至少第 1 个选项直接导向该目的地（如"继续前往' + targetLabel + '"），其余选项为途中的随机遭遇。'
        : '★ IMPORTANT: The player is on the way to "' + targetLabel + '". Ensure at least option #1 directly leads there ("Continue to ' + targetLabel + '"), other options are encounters along the way.';
    }
    var storyFollowHint = '';
    if (Number(cfg.aiChoiceMode || 0) === 1) {
      storyFollowHint = cfg.language === 'zh'
        ? '★ 选项生成模式：剧情后续。必须优先读取 <current_ai_story> 的最后状态来生成选项；如果正文已经离开旧地点或到达新地点，选项必须承接新地点和新状态，不要回到旧目的地。'
        : '★ Choice mode: story-follow. Prioritize the final state in <current_ai_story>; if the story has left the old place or arrived somewhere new, choices must continue from the new place/state.';
    }

    var promptLines;
    if (cfg.language === 'zh') {
      promptLines = [
        '<state>',
        JSON.stringify(state, null, 2),
        '</state>',
        '',
        '<scene>',
        sceneBlock,
        '</scene>',
        '',
        recentBlock,
        buildKnownNpcNamesBlock(),
        gameLinksBlock,
        '<instruction>',
        '基于 <state> 中的玩家真实数据和 <scene> 中的当前场景，生成 5 个"随机小事件"或"下一步行动"选项。',
        '—— 选项必须反应玩家当前状态（不是列举状态，而是基于状态推导可能的行动）——',
        '• 身体：高疼痛→寻求缓解/忍痛逞强；高压力→想放松/发脾气；醉酒→大胆妄为/昏倒',
        '• 服装：破损→想修补/躲藏；暴露→找遮蔽/享受注视；校服→避开训导主任',
        '• 技能：高潜行→小偷小摸/跟踪；高游泳→去海滩/跳水；高学业→去图书馆/辅导同学',
        '• 声望：名气大→被认出风险/社交机会；犯罪多→避开警察/黑道接触',
        '• 任务：房租到期→搞钱焦虑的选项；社区服务→警察局附近心虚',
        '• 变身：猫耳→隐藏/引来好奇；天使/恶魔→教堂特殊互动',
        '• NPC关系：爱意高的NPC→探望/亲近/求助选项；支配高的→服从/对抗选项；lust高的→试探/靠近选项',
        '• 金钱：如果选项提到具体金额，必须使用 <state> 里的真实金额；不要把 \u00a35 写成 500 英镑，也不要臆造口袋里的钱数。',
        dangerHint ? dangerHint : '',
        '这些选项是游戏原版内容的补充——偶遇、小插曲、意外发现、日常互动。',
        '每个选项一句简短中文，第二人称现在时，符合本游戏文风。',
        '选项应多样化，必须基于当前地点，可引用 <game_links> 中可前往的地点。',
        storyFollowHint ? storyFollowHint : '',
        progressionHint ? progressionHint : '',
        hint ? '侧重点：' + hint : '',
        '只返回 JSON 数组：["选项1 (0:05)", "选项2 (0:10)", ...]。每个选项末尾必须标注时间消耗(H:MM)，与原版游戏一致。不要额外说明。',
        '禁止输出正文、标题、编号列表、[STATS]、[AI_META]、[AI_EVENT]、HTML 或任何非 JSON 数组内容。',
      ];
    } else {
      promptLines = [
        '<state>',
        JSON.stringify(state, null, 2),
        '</state>',
        '',
        '<scene>',
        sceneBlock,
        '</scene>',
        '',
        recentBlock,
        buildKnownNpcNamesBlock(),
        gameLinksBlock,
        '<instruction>',
        'Based on real player data in <state> and the current <scene>, generate 5 "random encounter" or "small event" options.',
        '—— Options MUST react to the player\'s current state (not list it, but derive plausible actions from it) ——',
        '• Body: high pain→seek relief/act tough; high stress→unwind/lash out; drunk→bold acts/pass out',
        '• Clothing: torn→find repair/hide; exposed→seek cover/enjoy stares; uniform→avoid hall monitor',
        '• Skills: high skulduggery→pickpocket/tail suspect; swimming→beach/dive escape; academics→library/tutor',
        '• Fame: notorious→recognition risk/social hook; criminal→dodge cops/underworld contact',
        '• Quests: rent due→money-making anxiety; community service→nervous near police station',
        '• TF: cat ears→hide them/draw curiosity; angel/demon→church-specific interactions',
        '• NPC relationships: high love→visit/intimacy/ask-help; high dom→obey/challenge; high lust→seduce/flirt options',
        '• Money: if an option mentions a specific amount, use the exact money amount from <state>; never turn \u00a35 into \u00a3500 or invent pocket cash.',
        dangerHint ? dangerHint : '',
        'These ENRICH the game experience — chance encounters, minor incidents, everyday interactions.',
        'Each option ONE short sentence, second person present tense. Varied styles, grounded in location.',
        'May reference destinations from <game_links>. Do not repeat the recent story text.',
        storyFollowHint ? storyFollowHint : '',
        progressionHint ? progressionHint : '',
        hint ? 'Focus on: ' + hint : '',
        'Return ONLY a JSON array: ["choice1 (0:05)", "choice2 (0:10)", ...]. Each choice MUST end with time annotation (H:MM) like the original game. No extra text.',
        'Never output prose, headings, numbered lists, [STATS], [AI_META], [AI_EVENT], HTML, or anything outside the JSON array.',
      ];
    }
    var prompt = promptLines.filter(function (l) { return l !== ''; }).join('\n');

    var messages = [
      { role: 'system', content: buildSystem(cfg) },
      { role: 'user', content: prompt },
    ];
    var content;
    var choiceTimeoutMs = 45000;
    var choiceTimeoutId = null;
    try {
      var request = _fetchAI(messages, { temperature: 0.95, max_tokens: 350, signal: signal });
      var timeout = new Promise(function (_, reject) {
        choiceTimeoutId = setTimeout(function () {
          var timeoutErr = new Error(cfg.language === 'zh' ? '连接超时 (45秒)' : 'Request timed out (45s)');
          timeoutErr.name = 'AbortError';
          reject(timeoutErr);
        }, choiceTimeoutMs);
      });
      content = await Promise.race([request, timeout]);
    } catch (e) {
      throw classifyError(e, cfg.language);
    } finally {
      if (choiceTimeoutId) clearTimeout(choiceTimeoutId);
    }

    var parsedChoices = parseChoiceArray(content);
    if (parsedChoices) return parsedChoices;

    var fallbackChoices = StoryRuntimeModule.extractFallbackChoices(content, { maxChoices: 5 });
    if (fallbackChoices) return fallbackChoices;

    throw new Error(cfg.language === 'zh' ? 'AI 返回的选项无法解析' : 'Could not parse choices from AI response');
  }

  function normalizeChoiceArray(value) {
    var cfg = loadCfg();
    return StoryRuntimeModule.normalizeChoiceArray(value, {
      maxChoices: 5,
      localizeChoice: cfg.language === 'zh' ? _localizeNamesInText : null
    });
  }

  function parseChoiceArray(content) {
    return StoryRuntimeModule.parseChoiceArray(content, {
      normalizeChoiceArray: normalizeChoiceArray
    });
  }

  function _getCurrentAiNarrativeTextForLocation() {
    try {
      var $scope = $('#passages .ai-narrative-section, #passages .ai-replaced-content .ai-narrative-section').last();
      if (!$scope.length) $scope = $('#passages .ai-narrative-wrap, #passages .ai-replaced-content').last();
      if (!$scope.length) return '';
      var $clone = $scope.clone();
      $clone.find('script, style, button, input, select, textarea, .ai-narrative-toolbar, .ai-pickup-line, .ai-stats-line').remove();
      return String($clone.text() || '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      return '';
    }
  }

  function _refreshLocationFromCurrentAiNarrative() {
    var text = _getCurrentAiNarrativeTextForLocation();
    if (!text) return false;
    if (_lastAiEventSuppressesLocationFallback()) return false;
    if (_inferPriorityLocationFromText(text)) return true;
    return inferLocationFromText(_lastChoiceText || '', text);
  }

  function renderChoices($container, choices, cfg) {
    _clearAIUserMessage();
    _removeMalformedAIEventDom();
    _refreshLocationFromCurrentAiNarrative();
    // Save for potential re-render on cancel
    _lastChoicesData = { choices: choices, cfg: cfg };

    var $list = $('<div class="ai-choices-list"></div>');
    var $customInput = null;

    function showLoadingAndCall(promptText, opts) {
      opts = opts || {};
      var actionSnapshot = _captureAIRuntimeSnapshot();
      var actionRoundHistory = _cloneForAiSnapshot(_aiRoundHistory || []);
      var actionForwardStack = _cloneForAiSnapshot(_aiForwardStack || []);
      var actionCommitted = false;
      function rollbackChoiceAction(reason) {
        if (actionCommitted || !actionSnapshot) return;
        try { _restoreAIRuntimeSnapshot(actionSnapshot, { syncMemory: true }); } catch (_) {}
        _restoreAiRoundStackSnapshot(actionRoundHistory, actionForwardStack);
        actionSnapshot = null;
        actionRoundHistory = null;
        actionForwardStack = null;
        try { console.log('[AIStoryGen] choice action rolled back: ' + (reason || 'unknown')); } catch (_) {}
      }
      function commitChoiceAction() {
        actionCommitted = true;
        actionSnapshot = null;
        actionRoundHistory = null;
        actionForwardStack = null;
      }
      _autoChoicesBusy = true;  // prevent :passagedisplay from nuking this panel
      var controller = new AbortController();
      _currentAbortController = controller;
      $list.find('button, input, textarea').prop('disabled', true);
      var extraStoryHint = (!opts.fromCustom && $customInput && $customInput.length)
        ? String($customInput.val() || '').replace(/\s+/g, ' ').trim()
        : '';
      if (extraStoryHint) {
        promptText += cfg.language === 'zh'
          ? '\n\u73a9\u5bb6\u8865\u5145\u4e0b\u4e00\u6bb5\u5267\u60c5\u8981\u6c42\uff1a' + extraStoryHint
          : '\nPlayer extra instruction for the next story: ' + extraStoryHint;
      }

      var $loadingRow = $('<div class="ai-choices-loading-row"></div>');
      var loadingTxt = cfg.language === 'zh' ? 'AI 剧情生成中…' : 'AI generating…';
      var $out = $('<span class="ai-gen ai-gen-loading"></span>').text(loadingTxt);
      var cancelTxt = cfg.language === 'zh' ? '× 取消' : '× Cancel';
      var $cancelBtn = $('<button class="ai-cancel-btn"></button>').text(cancelTxt);
      var regenTxt = cfg.language === 'zh' ? '重新生成' : 'Regen';
      var $regenBtn = $('<button class="ai-regen-btn"></button>').text(regenTxt);
      var returnTxt = cfg.language === 'zh' ? '返回' : 'Return';
      var $returnBtn = $('<button class="ai-return-btn"></button>').text(returnTxt);

      function safeAbort() {
        if (_currentAbortController) { _currentAbortController.abort(); _currentAbortController = null; }
      }

      function restoreChoices() {
        safeAbort();
        rollbackChoiceAction('cancel');
        if (_lastChoicesData) {
          $container.empty().removeClass('ai-choices-result');
          renderChoices($container, _lastChoicesData.choices, _lastChoicesData.cfg);
          _scheduleAIPixelAssistRefresh('choices restored', 300);
        }
      }

      function regenerateChoices() {
        safeAbort();
        rollbackChoiceAction('regenerate choices');
        var retryController = new AbortController();
        _currentAbortController = retryController;
        $container.empty();
        var ldrTxt = cfg.language === 'zh' ? 'AI 正在生成选项…' : 'AI generating choices…';
        var $ldr = $('<div class="ai-choices-loading ai-gen-loading"></div>').text(ldrTxt);
        $container.append($ldr);
        generateChoices(cfg, '', retryController.signal).then(function (newChoices) {
          if (_currentAbortController === retryController) _currentAbortController = null;
          $ldr.remove();
          renderChoices($container, newChoices, cfg);
          _scheduleAIPixelAssistRefresh('choices regenerated', 300);
        }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (_currentAbortController === retryController) _currentAbortController = null;
          $ldr.removeClass('ai-gen-loading').addClass('ai-choices-error');
          $ldr.text((cfg.language === 'zh' ? '选项生成失败: ' : 'Choice error: ') + (e && e.message ? e.message : e));
          _appendChoiceRetryButton($container, cfg, regenerateChoices);
        });
      }

      $cancelBtn.on('click', restoreChoices);
      $regenBtn.on('click', regenerateChoices);
      $returnBtn.on('click', function () {
        safeAbort();
        rollbackChoiceAction('return button');
        _releaseAutoChoicesBusy('return button');
        if (_tryAiBackward()) {
          return;
        }
        if (typeof Engine !== 'undefined' && Engine.play) {
          Engine.play('Start');
        }
      });

      $loadingRow.append($out).append($cancelBtn).append($regenBtn).append($returnBtn);
      $container.empty().addClass('ai-choices-result').append($loadingRow);

      _pushCurrentToAiRoundHistory();
      _aiForwardStack.length = 0;
      try {
        var actionTimeCost = Number(opts.timeCost || 0);
        if (actionTimeCost > 0) advanceGameTime(actionTimeCost);
      } catch (_) {}

      // Build full context prompt — not just bare choice text
      var choiceState = buildState(cfg);
      var choiceScene = buildScene();
      var aiItemsToUse = _takePendingAiItemUses();
      var aiItemUseBlock = _buildAiItemUseBlock(aiItemsToUse, cfg, promptText);
      var fullPrompt = cfg.language === 'zh'
        ? [
            '<state>', JSON.stringify(choiceState, null, 2), '</state>',
            '',
            buildRecentBlock(),
            buildCurrentAiStoryBlock(),
            aiItemUseBlock,
            buildNativeContextAuthorityBlock(),
            '<scene>',
            'location: ' + (choiceScene.location || 'unknown'),
            'atmosphere: ' + (choiceScene.dangerLevel || 'neutral'),
            '</scene>',
            '',
            '<instruction>',
            '玩家做出了选择：「' + promptText + '」',
            '基于玩家当前状态、近期剧情和场景氛围，生成这个选择带来的即时结果叙事（1-2个短段）。',
            '第二人称现在时，符合游戏风格。叙事应自然衔接 <recent_story> 中的上下文。',
            '中文正文里不要直接写 arousal/stress/pain/trauma/control/lust 等英文内部变量名；如需描述状态，请写“兴奋/压力/疼痛/创伤/自控/欲望”等自然中文。',
            '如果这个行动会导致状态变化，请添加 [STATS: ...] 标记。',
            '如果玩家获得明确的非金钱物品，请添加 [ITEMS: 道具名 x1; 道具名 x2] 标记。该标记会进入日志库存的 AI道具 区。',
            'ITEMS 里只能写简短物品名，不要把门开着/房间状态/环境描述/完整句子写成道具。',
            '如果玩家获得或失去金钱，正文必须明确写出具体金额和原因，并在 AI_EVENT 的 moneyChange 写同一 signed pence，例如 +250 或 -8000。不要用 [STATS: money+...] 表示金钱；金额不明确、只是进入挑战或猜测奖励/花费时不要写金钱变化。',
            'Use only allowed non-money stat keys from the AI runtime stat schema: ' + _formatAiRuntimeNonMoneyStatAllowlist() + '.',
            'If the player gains a concrete non-money item, append [ITEMS: item name x1; item name x2].',
            'If writing Chinese narration, ITEMS names must also be Chinese short names. Do not output English item names.',
            'ITEMS must be short concrete inventory names only. Do not output feelings, moods, doors, open/closed states, rooms, scenery, or full sentence descriptions as items.',
            buildKnownPlacesBlock(),
            buildLocationResponseFormatBlock('current'),
            '★★★ 位置标记规则：如果主角在行动中进入了上面任意已知地点，必须在叙事末尾输出 [LOC: passage] 标记！（如 [LOC: Temple] 或 [LOC: 神殿]）',
            buildAIEventResponseFormatBlock(),
            '</instruction>',
          ].join('\n')
        : [
            '<state>', JSON.stringify(choiceState, null, 2), '</state>',
            '',
            buildRecentBlock(),
            buildCurrentAiStoryBlock(),
            aiItemUseBlock,
            buildNativeContextAuthorityBlock(),
            '<scene>',
            'location: ' + (choiceScene.location || 'unknown'),
            'atmosphere: ' + (choiceScene.dangerLevel || 'neutral'),
            '</scene>',
            '',
            '<instruction>',
            'The player chose: "' + promptText + '"',
            'Based on current state, recent story, and atmosphere, generate the immediate outcome narrative (1-2 paragraphs).',
            'Second person present tense, game style. Naturally connect with <recent_story> context.',
            'If this action would change stats, append [STATS: ...] markers.',
            'If the player gains or loses money, the prose must clearly state the exact amount and reason, and AI_EVENT moneyChange must contain the same signed pence amount such as +250 or -8000. Do not use [STATS: money+...] for money; if the amount is unclear, or you are only guessing a challenge reward/cost, do not write a money change.',
            'Use only allowed non-money stat keys from the AI runtime stat schema: ' + _formatAiRuntimeNonMoneyStatAllowlist() + '.',
            'If the player gains a concrete non-money item, append [ITEMS: item name x1; item name x2].',
            'If writing Chinese narration, ITEMS names must also be Chinese short names. Do not output English item names or abstract feelings as items.',
            buildKnownPlacesBlock(),
            buildLocationResponseFormatBlock('current'),
            '★★★ LOCATION MARKER RULE: If the character enters any known place above during this action, you MUST append [LOC: passage] at the end! (e.g. [LOC: Temple] or [LOC: Cafe Pancakes])',
            buildAIEventResponseFormatBlock(),
            '</instruction>',
          ].join('\n');

      _lastNarrativePrompt = fullPrompt;

      callAI(fullPrompt, controller.signal, { storyStyle: true }).then(function (text) {
        _currentAbortController = null;
        $container.remove(); // clean up old container before advanceWithNarrative regenerates
        _lastChoiceText = promptText;
        try {
          advanceWithNarrative(text);
          commitChoiceAction();
        } catch (e) {
          console.error('[AIStoryGen] advanceWithNarrative crashed:', e);
          rollbackChoiceAction('advanceWithNarrative crashed');
          _autoChoicesBusy = false;
          // Try to recover: re-inject choices on the current passage
          autoInjectChoices(typeof State !== 'undefined' ? State.passage : '');
        }
      }).catch(function (err) {
        if (err && err.name === 'AbortError') {
          rollbackChoiceAction('abort');
          _autoChoicesBusy = false;
          return;
        }
        _currentAbortController = null;
        rollbackChoiceAction('AI request failed');
        _autoChoicesBusy = false;
        $out.removeClass('ai-gen-loading').addClass('ai-gen-error');
        $out.text((cfg.language === 'zh' ? '[生成失败] ' : '[Error] ') + (err && err.message ? err.message : err));
        // Re-enable recovery buttons
        $loadingRow.find('button').prop('disabled', false);
        _appendChoiceRetryButton($container, cfg, regenerateChoices);
      });
    }

    // Bottom action buttons: refresh choices + arrive at current location
    // (built first, appended last — so it always sits at the very bottom)
    if (_aiReplaceActive) _refreshOriginalEventModeFromLink();
    var $bottomActions = $('<div class="ai-back-to-game"></div>');

    // "刷新选项" — re-generate AI choices without producing new narrative
    (function () {
      var refreshTxt = cfg.language === 'zh' ? '🔄 刷新选项' : '🔄 Refresh';
      var $refreshBtn = $('<a class="ai-back-link" href="javascript:void(0)"></a>').text(refreshTxt);
      $refreshBtn.on('click', function () {
        $container.empty();
        var ldrTxt = cfg.language === 'zh' ? 'AI 正在刷新选项…' : 'AI refreshing choices…';
        var $ldr = $('<div class="ai-choices-loading ai-gen-loading"></div>').text(ldrTxt);
        $container.append($ldr);
        generateChoices(cfg, '', new AbortController().signal).then(function (newChoices) {
          $ldr.remove();
          renderChoices($container, newChoices, cfg);
          _scheduleAIPixelAssistRefresh('choices refreshed', 300);
        }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          $ldr.removeClass('ai-gen-loading').addClass('ai-choices-error');
          $ldr.text((cfg.language === 'zh' ? '刷新失败: ' : 'Refresh error: ') + (e && e.message ? e.message : e));
          _appendChoiceRetryButton($container, cfg, function () { $refreshBtn.trigger('click'); });
        });
      });
      // Hidden from the bottom toolbar; recovery refresh remains available on failure panels.
    })();

    (function () {
      var useTxt = cfg.language === 'zh' ? '\u4f7f\u7528\u9053\u5177' : 'Use items';
      var $useBtn = $('<a class="ai-back-link" href="javascript:void(0)"></a>').text(useTxt);
      _updateAiItemUseButtonLabel($useBtn, cfg);
      $useBtn.on('click', function () {
        _openAiItemUseDialog($useBtn, cfg);
      });
      $bottomActions.append($useBtn);
    })();



    // "到达XX" — show current location; in replace mode, exits to original passage
    (function () {
      var rawPassage = _aiReplaceActive
        ? ((_aiLocationArrived && _aiCurrentLocationPassage && !_aiReplaceOriginalEventMode)
          ? _aiCurrentLocationPassage
          : (_aiReplaceTargetPassage || _aiCurrentLocationPassage || (typeof State !== 'undefined' && State.passage ? State.passage : '')))
        : ((_aiLocationArrived && _aiCurrentLocationPassage)
          ? _aiCurrentLocationPassage
          : (_aiReplaceTargetPassage || (typeof State !== 'undefined' && State.passage ? State.passage : '')));
      var rawLabel = cleanLabel(_aiReplaceActive
        ? (((_aiLocationArrived && _aiCurrentLocationLabel && !_aiReplaceOriginalEventMode) ? _aiCurrentLocationLabel : '') || _aiReplaceTargetLabel || _aiCurrentLocationLabel)
        : (_aiCurrentLocationLabel || _aiReplaceTargetLabel))
        || rawPassage;
      var destLabel = rawLabel;
      if (cfg.language === 'zh') {
        var knownLoc = _findCommonLocation(rawLabel) || _findCommonLocation(rawPassage) || _findGraphLocation(rawLabel) || _findGraphLocation(rawPassage);
        if (knownLoc) destLabel = _resolveLocationDisplay(knownLoc.passage || knownLoc.raw || rawPassage || rawLabel, knownLoc.label || rawLabel);
        else destLabel = _resolveLocationDisplay(rawPassage, rawLabel);
      }
      var arriveTxt;
      if (_aiReplaceOriginalEventMode) {
        arriveTxt = cfg.language === 'zh' ? '✅ 继续原剧情' : '✅ Continue story';
      } else if (_aiLocationArrived) {
        arriveTxt = (cfg.language === 'zh' ? '📍 到达 ' : '📍 Arrive at ') + destLabel;
      } else {
        arriveTxt = cfg.language === 'zh' ? '📍 返回原版章节' : '📍 Return to original passage';
      }
      var $arriveBtn = $('<a class="ai-back-link" href="javascript:void(0)"></a>').text(arriveTxt);
      $arriveBtn.on('click', function () {
        if (_aiReplaceActive) {
          try { console.log('[AIStoryGen] arrive button target=' + rawPassage + ', arrived=' + _aiLocationArrived + ', current=' + _aiCurrentLocationPassage + ', eventMode=' + _aiReplaceOriginalEventMode); } catch (_) {}
          if (!_aiReplaceOriginalEventMode && !(_aiLocationArrived && _aiCurrentLocationPassage)) {
            restoreOriginalPassage();
            return;
          }
          _finishAiReplaceAndGo(rawPassage, {
            skipOriginal: !!(_aiLocationArrived && _aiCurrentLocationPassage && !_aiReplaceOriginalEventMode)
          });
          return;
        }
        if (_aiLocationArrived && _aiCurrentLocationPassage) {
          if (_finishNormalAiAndGo(_aiCurrentLocationPassage)) return;
        }
        // Normal mode: restore original passage content
        var $passage = $('#passages .passage');
        if ($passage.length) {
          $passage.find('.ai-narrative-wrap').remove();
          _aiNarrativeWrap = null;
          var $origWrap = $passage.find('.ai-original-wrap');
          if ($origWrap.length) {
            // Use replaceWith(contents()) to preserve text nodes
            $origWrap.replaceWith($origWrap.contents());
          }
        }
        _clearAiLocationState('bottom return original page');
        $('#passages .ai-choices, #passages .ai-choices-end').remove();
        _clearAiRoundHistory();
        _suppressAutoChoices('bottom return original page', 5000);
        setTimeout(function () { injectAILinkClones(); }, 50);
      });
      $bottomActions.append($arriveBtn);

      var $manualPanel = $('<div class="ai-manual-arrive-panel" style="display:none;margin-top:0.45em;padding:0.45em;border:1px solid #334;background:#171722;border-radius:3px;"></div>');
      var $manualBtn = $('<a class="ai-back-link ai-manual-arrive-toggle" href="javascript:void(0)"></a>')
        .text(cfg.language === 'zh' ? '\u624b\u52a8\u9009\u62e9\u5230\u8fbe\u5730\u70b9' : 'Choose destination manually');
      var manualOpen = false;
      function renderManualArrivePanel() {
        var options = _collectManualArriveCandidates(rawPassage);
        $manualPanel.empty();
        var $title = $('<div style="margin-bottom:0.35em;color:#bbb;font-size:0.92em;"></div>')
          .text(cfg.language === 'zh' ? '\u9009\u62e9\u5b9e\u9645\u5230\u8fbe\u7684\u539f\u7248\u5730\u70b9\uff1a' : 'Choose the actual native destination:');
        $manualPanel.append($title);
        if (!options.length) {
          $manualPanel.append($('<div class="ai-cfg-msg"></div>').text(cfg.language === 'zh' ? '\u6682\u65f6\u627e\u4e0d\u5230\u53ef\u5230\u8fbe\u7684\u4e34\u8fd1\u5730\u70b9\u3002' : 'No nearby destinations found.'));
          return;
        }
        var $grid = $('<div style="display:flex;flex-wrap:wrap;gap:0.35em;"></div>');
        options.forEach(function (opt) {
          var title = opt.raw === rawPassage
            ? (cfg.language === 'zh' ? '\u5f53\u524d\u6309\u94ae\u76ee\u6807' : 'Current button target')
            : opt.raw;
          var $opt = $('<button type="button" class="ai-manual-arrive-option" style="font:inherit;padding:0.25em 0.55em;border:1px solid #556;background:#202030;color:#f0d060;cursor:pointer;border-radius:2px;"></button>')
            .text(opt.label || opt.raw)
            .attr('title', title);
          $opt.on('click', function () {
            _forceManualArriveTo(opt.raw);
          });
          $grid.append($opt);
        });
        $manualPanel.append($grid);
      }
      $manualBtn.on('click', function () {
        manualOpen = !manualOpen;
        if (manualOpen) {
          renderManualArrivePanel();
          $manualPanel.show();
        } else {
          $manualPanel.hide();
        }
      });
      $bottomActions.append($manualBtn).append($manualPanel);
    })();

    choices.forEach(function (choice, i) {
      // Q2: Detect fixed skip-to-destination choice
      var isSkip = false;
      var displayText = choice;
      var skipTarget = '';
      if (typeof choice === 'string' && choice.indexOf('__SKIP__') === 0) {
        isSkip = true;
        var parts = choice.split('__TARGET__');
        displayText = parts[0].replace('__SKIP__', '');
        skipTarget = parts[1] || '';
      }
      var $btn = $('<button class="ai-choice-btn"></button>')
        .text('(' + (i + 1) + ') ' + displayText)
        .attr('data-choice-text', choice);
      if (isSkip) {
        $btn.addClass('ai-choice-skip').css({ background: 'rgba(255,180,80,0.12)', borderColor: 'rgba(255,180,80,0.35)', color: '#f9c070' });
        $btn.attr('data-skip-target', skipTarget);
      }
      $list.append($btn);
    });

    // Use event delegation — survives DOM replacement
    $list.on('click', '.ai-choice-btn', function (ev) {
      console.log('[AIStoryGen] button delegated-click:', ($(this).attr('data-choice-text') || '').slice(0, 40));
      var choiceText = $(this).attr('data-choice-text');
      var skipTarget = $(this).attr('data-skip-target');
      if (choiceText && !$(this).prop('disabled')) {
        // Q2: Skip choice — continue through the original clicked link when possible.
        if (skipTarget) {
          _finishAiReplaceAndGo(skipTarget);
          return;
        }
        var timeCost = 0;
        try {
          timeCost = parseTimeFromChoice(choiceText);
          if (!timeCost || timeCost <= 0) timeCost = inferDefaultTimeCost(choiceText);
        } catch (_) {}
        showLoadingAndCall(choiceText, { timeCost: timeCost });
      }
    });

    // Custom input row
    var $customRow = $('<div class="ai-choices-custom"></div>');
    var placeholderTxt = cfg.language === 'zh' ? '\u81ea\u5df1\u5199\u53d1\u5c55\u65b9\u5411\uff0c\u70b9\u9009\u9879\u6216\u56de\u8f66\u63d0\u4ea4...' : 'Write your own direction; click a choice or press Enter...';
    $customInput = $('<input type="text" class="ai-choices-input">').attr('placeholder', placeholderTxt);
    $customInput.attr('placeholder', cfg.language === 'zh' ? '\u81ea\u5df1\u5199\u53d1\u5c55\u65b9\u5411\uff0c\u70b9\u9009\u9879\u6216\u56de\u8f66\u63d0\u4ea4...' : 'Write your own direction; click a choice or press Enter...');
    var $customBtn = $('<button class="ai-choice-btn ai-choice-custom-btn">→</button>');

    $customBtn.text(cfg.language === 'zh' ? '\u53d1\u9001' : 'Send');

    function submitCustom() {
      var text = $customInput.val().trim();
      if (!text) return;
      var timeCost = 0;
      try {
        timeCost = inferDefaultTimeCost(text);
      } catch (_) {}
      showLoadingAndCall(text, { fromCustom: true, timeCost: timeCost });
    }

    $customBtn.on('click', submitCustom);
    $customInput.on('keydown', function (e) { if (e.key === 'Enter') submitCustom(); });
    $customRow.append($customInput).append($customBtn);
    $list.append($customRow);

    // Return button always at the very bottom
    $list.append($bottomActions);

    $container.append($list);
  }

  window.AIStoryGen.generateChoices = generateChoices;
  window.AIStoryGen.renderChoices = renderChoices;

  // ---------- 8. 等待 SugarCube 就绪后注册宏 ----------
  function registerMacros() {
    if (typeof Macro === 'undefined' || !Macro.add) {
      setTimeout(registerMacros, 50);
      return;
    }

    // <<aigen "instruction">>
    Macro.add('aigen', {
      tags: null,
      handler: function () {
        var instruction = (this.args[0] != null ? String(this.args[0]) : '').trim();
        var cfg = loadCfg();
        var placeholderTxt = cfg.language === 'zh' ? '生成中…' : 'Generating…';
        var $out = $('<span class="ai-gen ai-gen-loading"></span>').text(placeholderTxt);
        $(this.output).append($out);

        callAI(instruction, { storyStyle: true }).then(function (text) {
          $out.removeClass('ai-gen-loading').addClass('ai-gen-done').empty();
          try {
            new Wikifier($out[0], text);
          } catch (e) {
            $out.text(text);
          }
        }).catch(function (err) {
          $out.removeClass('ai-gen-loading').addClass('ai-gen-error');
          $out.text('[' + (cfg.language === 'zh' ? 'AI 调用失败' : 'AI error') + '] ' + (err && err.message ? err.message : err));
          console.error('[AIStoryGen]', err);
        });
      },
    });

    // <<aichoices "optional hint">>
    // Generates 5 branching choices + a custom input option.
    Macro.add('aichoices', {
      tags: null,
      handler: function () {
        var hint = (this.args[0] != null ? String(this.args[0]) : '').trim();
        var cfg = loadCfg();
        var $container = $('<div class="ai-choices"></div>');
        var loadingTxt = cfg.language === 'zh' ? 'AI 正在生成选项…' : 'AI generating choices…';
        var $loading = $('<div class="ai-choices-loading ai-gen-loading"></div>').text(loadingTxt);
        $container.append($loading);
        $(this.output).append($container);

        generateChoices(cfg, hint).then(function (choices) {
          $loading.remove();
          renderChoices($container, choices, cfg);
          _scheduleAIPixelAssistRefresh('macro choices rendered', 300);
        }).catch(function (err) {
          $loading.removeClass('ai-gen-loading').addClass('ai-choices-error');
          $loading.text((cfg.language === 'zh' ? '选项生成失败: ' : 'Choice error: ') + (err && err.message ? err.message : err));
          _appendChoiceRetryButton($container, cfg, function () {
            $container.empty().append($loading.removeClass('ai-choices-error').addClass('ai-gen-loading').text(loadingTxt));
            generateChoices(cfg, hint).then(function (choices) {
              $loading.remove();
              renderChoices($container, choices, cfg);
              _scheduleAIPixelAssistRefresh('macro choices retry rendered', 300);
            }).catch(function (e) {
              $loading.removeClass('ai-gen-loading').addClass('ai-choices-error');
              $loading.text((cfg.language === 'zh' ? '选项生成失败: ' : 'Choice error: ') + (e && e.message ? e.message : e));
            });
          });
          console.error('[AIStoryGen] choices error', err);
        });
      },
    });

    // <<aiconfig>>
    // Renders the config form standalone (used in AIStoryGen_Config passage)
    Macro.add('aiconfig', {
      tags: null,
      handler: function () {
        buildUnifiedConfigForm($(this.output), false);
      },
    });

    // <<aimemory>> standalone AI memory viewer
    Macro.add('aimemory', {
      tags: null,
      handler: function () {
        // Memory editing is intentionally only exposed through the Journal overlay
        // AI记忆 tab, so ordinary passages never render an inline memory window.
      },
    });



    console.log('[AIStoryGen] macros registered v' + (window.AIStoryGen && window.AIStoryGen.VERSION || 'unknown') + ': <<aigen>>, <<aichoices>>, <<aiconfig>>, <<aimemory>>');
    console.log('[AIStoryGen] Settings page hook installed for "AI Settings" tab');
  }

  registerMacros();

  // ============================================================
  // ========== COMBAT NARRATOR SYSTEM (port from DOLI) =========
  // ============================================================

  // -- 8a. fmtNum helper --
  function fmtNum(n) {
    if (n === Math.floor(n)) return String(n);
    return parseFloat(n.toFixed(2)).toString();
  }

  // -- 8b. Status Bar Semantics --
  function formatStatusLevel(label, value, max, includeMax) {
    if (includeMax && typeof max === 'number' && max > 0) {
      return label + ' (' + fmtNum(value) + '/' + fmtNum(max) + ')';
    }
    return label + ' (' + fmtNum(value) + ')';
  }
  function traumaLevel(value, max, includeMax) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value >= max) label = 'numb';
    else if (value >= max * 4 / 5) label = 'tormented';
    else if (value >= max * 3 / 5) label = 'disturbed';
    else if (value >= max * 2 / 5) label = 'troubled';
    else if (value >= max / 5) label = 'nervous';
    else if (value >= 1) label = 'uneasy';
    else label = 'healthy';
    return formatStatusLevel(label, value, max, includeMax);
  }
  function stressLevel(value, max, includeMax) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value >= max) label = 'overwhelmed';
    else if (value >= max * 4 / 5) label = 'distressed';
    else if (value >= max * 3 / 5) label = 'strained';
    else if (value >= max * 2 / 5) label = 'tense';
    else if (value >= max / 5) label = 'calm';
    else if (value >= 1) label = 'placid';
    else label = 'serene';
    return formatStatusLevel(label, value, max, includeMax);
  }
  function arousalLevel(value, max, includeMax) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value >= max) label = 'shaking with arousal';
    else if (value >= max * 4 / 5) label = 'heat rising';
    else if (value >= max * 3 / 5) label = 'horny';
    else if (value >= max * 2 / 5) label = 'lustful';
    else if (value >= max / 5) label = 'aroused';
    else if (value >= 1) label = 'stimulated';
    else label = 'cold';
    return formatStatusLevel(label, value, max, includeMax);
  }
  function controlLevel(value, max, possessed, includeMax) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (possessed) {
      if (value >= max) label = 'in control';
      else if (value >= max * 4 / 5) label = 'nearly in control';
      else if (value >= max * 3 / 5) label = 'struggling';
      else if (value >= max * 2 / 5) label = 'hollow';
      else if (value >= max / 5) label = 'numb';
      else if (value >= 1) label = 'puppeteered';
      else label = 'helpless';
    } else {
      if (value >= max) label = 'confident';
      else if (value >= max * 4 / 5) label = 'insecure';
      else if (value >= max * 3 / 5) label = 'worried';
      else if (value >= max * 2 / 5) label = 'anxious';
      else if (value >= max / 5) label = 'scared';
      else if (value >= 1) label = 'frightened';
      else label = 'terrified';
    }
    return formatStatusLevel(label, value, max, includeMax);
  }
  function painLevel(value) {
    var label;
    if (value >= 100) label = 'sobbing uncontrollably';
    else if (value >= 80) label = 'crying and whimpering';
    else if (value >= 60) label = 'crying';
    else if (value >= 40) label = 'tears running';
    else if (value >= 20) label = 'tears welling';
    else if (value >= 1) label = 'upset';
    else label = 'okay';
    return label + ' (' + fmtNum(value) + ')';
  }

  // -- 8c. Clothing Semantics --
  function integrityLabel(integrity, max) {
    if (integrity == null || max == null || max <= 0) return 'unknown';
    var ratio = integrity / max;
    if (ratio <= 0.2) return 'tattered';
    if (ratio <= 0.5) return 'torn';
    if (ratio <= 0.9) return 'frayed';
    return 'full';
  }
  function exposureLabel(value) {
    if (value >= 2) return 'fully exposed';
    if (value >= 1) return 'partially exposed';
    return 'covered';
  }

  // -- 8d. Enemy / NPC Combat Semantics --
  function enemyHealthLevel(value, max) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value <= 0) label = 'recoiling in pain';
    else if (value < max / 5) label = "can't take much more";
    else if (value < max * 2 / 5) label = 'hurt';
    else if (value < max * 3 / 5) label = 'pained';
    else if (value < max * 4 / 5) label = 'stung';
    else if (value < max) label = 'uncomfortable';
    else label = 'eager';
    return label + ' (' + fmtNum(value) + '/' + fmtNum(max) + ')';
  }
  function enemyArousalLevel(value, max) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value >= max) label = 'orgasm imminent';
    else if (value >= max * 4 / 5) label = 'approaching orgasm';
    else if (value >= max * 3 / 5) label = 'lustful';
    else if (value >= max * 2 / 5) label = 'horny';
    else if (value >= max / 5) label = 'aroused';
    else if (value > 0) label = 'stimulated';
    else label = 'unaroused';
    return label + ' (' + fmtNum(value) + '/' + fmtNum(max) + ')';
  }
  function enemyAngerLevel(value, max) {
    if (max <= 0) return 'unknown (' + value + ')';
    var label;
    if (value >= max) label = 'incredibly pissed off';
    else if (value >= max * 4 / 5) label = 'furious';
    else if (value >= max * 3 / 5) label = 'angry';
    else if (value >= max * 2 / 5) label = 'frustrated';
    else if (value >= max / 5) label = 'irritated';
    else if (value > 0) label = 'tense';
    else label = 'calm';
    return label + ' (' + fmtNum(value) + '/' + fmtNum(max) + ')';
  }
  function enemyTrustLevel(value) {
    var label;
    if (value > 100) label = 'confident';
    else if (value > 60) label = 'relaxed';
    else if (value > 20) label = 'alert';
    else if (value > -20) label = 'cautious';
    else if (value > -60) label = 'wary';
    else if (value > -100) label = 'guarded';
    else label = 'full of suspicion';
    return label + ' (' + fmtNum(value) + ')';
  }
  function npcPenisSizeDesc(size) {
    var labels = ['none', 'tiny', 'average', 'large', 'massive', 'enormous'];
    var label = labels[Math.max(0, Math.min(size, labels.length - 1))] || 'unknown';
    return label + ' (' + fmtNum(size) + ')';
  }
  
  // -- 8e. Relationship Semantics --
  function relationLevel(value) {
    var label;
    if (value >= 60) label = 'very high';
    else if (value >= 30) label = 'high';
    else if (value >= 0) label = 'moderate';
    else if (value >= -30) label = 'low';
    else label = 'very low';
    return label + ' (' + fmtNum(value) + ')';
  }
  function submissiveLevel(value) {
    var label;
    if (value >= 1800) label = 'completely submissive';
    else if (value >= 1400) label = 'very submissive';
    else if (value >= 1100) label = 'submissive';
    else if (value >= 900) label = 'balanced';
    else if (value >= 600) label = 'defiant';
    else if (value >= 200) label = 'very defiant';
    else label = 'completely defiant';
    return label + ' (' + fmtNum(value) + ')';
  }
  
  // -- 8f. Action Code → Label Translation --
  var ACTION_LABELS = {
    leftchest:'stroke chest',rightchest:'stroke chest',lefthit:'punch',righthit:'punch',
    leftgrab:'grab penis',rightgrab:'grab penis',leftstroke:'stroke penis',rightstroke:'stroke penis',
    leftplay:'play with pussy',rightplay:'play with pussy',leftclit:'rub clit',rightclit:'rub clit',
    leftwork:'work shaft',rightwork:'work shaft',leftcoverface:'cover face',rightcoverface:'cover face',
    leftcoveranus:'cover anus',rightcoveranus:'cover anus',leftcovervagina:'cover pussy',rightcovervagina:'cover pussy',
    leftcoverpenis:'cover penis',rightcoverpenis:'cover penis',leftescape:'escape (hand)',rightescape:'escape (hand)',
    lefthold:'hold on',righthold:'hold on',leftstruggle:'struggle',rightstruggle:'struggle',
    leftrub:'rub',rightrub:'rub',leftfree:'free hand',rightfree:'free hand',
    leftstop:'stop',rightstop:'stop',leftprotect:'protect',rightprotect:'protect',
    kissskin:'kiss skin',kisslips:'kiss lips',headbutt:'headbutt',handbite:'bite hand',
    stifle:'stifle moans',letout:'let out moans',scream:'scream',
    ask:'ask',mock:'mock',disparage:'disparage',apologise:'apologise',plead:'plead',demand:'demand',taunt:'taunt',
    moan:'moan',growl:'growl',mouth:'move mouth to penis',othervagina:'move mouth to pussy',
    swallow:'take into mouth',bite:'bite',lick:'lick',suck:'suck',ejacspit:'spit out',ejacswallow:'swallow',
    kick:'kick',grab:'grab with feet',grabrub:'rub with feet',feetrub:'rub with feet',feetgrab:'grab with feet',
    vaginatopenis:'straddle penis',vaginatovagina:'press pussy against pussy',
    vaginapenisfuck:'envelop penis (vagina)',vaginapullaway:'pull away (vagina)',
    anustopenis:'straddle penis (anus)',anuspenisfuck:'envelop penis (anus)',anuspullaway:'pull away (anus)',
    penistovagina:'press against pussy',penistoanus:'press against anus',penistopenis:'frot',
    penisvaginafuck:'penetrate pussy',penisanusfuck:'penetrate anus',penisrub:'rub (penis)',
    penispullaway:'pull away (penis)',peniskiss:'kiss (penis)',penistease:'tease tip',
    chestrub:'rub chest',breastsuck:'suck breast',breastlick:'lick breast',breastbite:'bite breast',
    rest:'rest',cooperate:'cooperate',take:'take it',escape:'pull away',rub:'rub',tease:'tease',
    clench:'clench',stop:'stop',run:'run',swim:'swim',walk:'walk',stand:'stand up',turn:'turn around',
    hide:'hide',evade:'evade',guard:'guard',strut:'strut',confront:'confront',forgive:'forgive',
    pullOut:'pull out',forceImpregnation:'force impregnation',ambush:'ambush',
    dildoDrop:'drop addon toy',strokerDrop:'drop stroker',pickupSexToy:'pick up addon toy',
    legLock:'leg lock',legRelease:'release legs',hobble:'hobble',
    vaginarub:'rub (vagina)',anusrub:'rub (anus)',over_upper:'displace over-upper',
    upper:'displace upper',under_upper:'displace under-upper',over_lower:'displace over-lower',
    lower:'displace lower',under_lower:'displace under-lower',
  };
  var COMBAT_VAR_LABELS = {
    leftaction:'left hand',rightaction:'right hand',mouthaction:'mouth',feetaction:'feet',
    penisaction:'penis',vaginaaction:'vagina',anusaction:'anus',chestaction:'chest',thighaction:'thighs',
    askAction:'ask',mockaction:'mock',
    mouthtarget:'mouth target',lefttarget:'left hand target',righttarget:'right hand target',feettarget:'feet target',
    lefthand:'left hand',righthand:'right hand',mouth:'mouth',penis:'penis',vagina:'vagina',chest:'chest',
  };
  var BODY_ACTION_KEYS = ['leftaction','rightaction','mouthaction','feetaction','penisaction','vaginaaction','anusaction','chestaction','thighaction'];
  var SUB_ACTION_KEYS = ['askAction','mockaction'];
  var ALL_ACTION_KEYS = BODY_ACTION_KEYS.concat(SUB_ACTION_KEYS);
  var TARGET_KEYS = ['mouthtarget','lefttarget','righttarget','feettarget'];
  function combatVarLabel(key) { return COMBAT_VAR_LABELS[key] || key; }
  function actionLabel(code) {
    if (typeof code === 'number') return code === 0 ? 'rest' : String(code);
    if (!code || code === 'rest' || code === '0') return 'rest';
    var label = ACTION_LABELS[code];
    if (label) return label;
    if (code.indexOf('_') !== -1) return code.split('_').join(' ');
    var s = code.replace(/^(?:left|right)/,'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().trim();
    return s || code;
  }
  
  // -- 8g. Constants --
  var CLOTHING_SLOTS = ['over_upper','over_lower','upper','lower','under_upper','under_lower','over_head','head','face','neck','hands','handheld','legs','feet','genitals'];
  var BODY_USE_KEYS2 = ['mouthuse','penisuse','vaginause','anususe','chestuse','thighuse','feetuse'];
  var BODY_STATE_KEYS2 = ['mouthstate','penisstate','vaginastate','anusstate','cheststate','feetstate'];
  var VIRGINITY_KEYS = ['vaginal','penile','anal','oral','kiss','handholding','temple'];
  var INTENT_INACTIVE = { '0':true,'':true,'none':true,'rest':true };
  function isEngaged(v) { return v !== 0 && v !== '' && v !== 'rest' && v != null; }
  
  // -- 9. State Snapshot Collector --
  function getV() {
    try { if (typeof V !== 'undefined' && V) return V; } catch(e) {}
    try { if (typeof State !== 'undefined' && State && State.variables) return State.variables; } catch(e2) {}
    try { if (window.SugarCube && window.SugarCube.State && window.SugarCube.State.variables) return window.SugarCube.State.variables; } catch(e3) {}
    return null;
  }
  function getTime() { try { return (typeof Time !== 'undefined' && Time) ? Time : null; } catch(e) { return null; } }
  function getC() { try { return (typeof C !== 'undefined' && C) ? C : null; } catch(e) { return null; } }
  function getWeather() { try { return (typeof Weather !== 'undefined' && Weather) ? Weather : null; } catch(e) { return null; } }
  
  function collectWorld(V) {
    var T = getTime(); var W = getWeather();
    return {
      area: safeRead(function(){return V.area;},'unknown'),
      location: safeRead(function(){return V.location;},'unknown'),
      passage: safeRead(function(){return (window.SugarCube && window.SugarCube.State) ? window.SugarCube.State.passage : 'unknown';},'unknown'),
      dayState: safeRead(function(){return T&&T.dayState;},'unknown'),
      hour: safeRead(function(){return T&&T.hour;},0),
      minute: safeRead(function(){return T&&T.minute;},0),
      weekDay: safeRead(function(){return T&&(T.weekDayName||T.weekDay);},'unknown'),
      weather: safeRead(function(){return (W&&W.name)||(V.weatherObj&&V.weatherObj.name);},'unknown'),
      season: safeRead(function(){return T&&T.season;},'unknown'),
      moonPhase: safeRead(function(){return T&&T.currentMoonPhase&&T.currentMoonPhase.description;},'unknown'),
      school: {
        term: !!safeRead(function(){return T&&T.schoolTerm;},false),
        schoolDay: !!safeRead(function(){return T&&T.schoolDay;},false),
        schoolTime: !!safeRead(function(){return T&&T.schoolTime;},false)
      },
      outside: safeRead(function(){return V.outside;},false)
    };
  }
  
  function collectPlayer(V) {
    var bodyUse = {}; var bodyState = {}; var virginity = {};
    for (var i=0;i<BODY_USE_KEYS2.length;i++){
      bodyUse[BODY_USE_KEYS2[i]]=safeRead(function(key){return function(){return V[key];};}(BODY_USE_KEYS2[i]),0);
    }
    bodyUse.leftarm=safeRead(function(){return V.leftarm;},0);
    bodyUse.rightarm=safeRead(function(){return V.rightarm;},0);
    bodyUse.leftleg=safeRead(function(){return V.leftleg;},0);
    bodyUse.rightleg=safeRead(function(){return V.rightleg;},0);
    for (var j=0;j<BODY_STATE_KEYS2.length;j++){
      bodyState[BODY_STATE_KEYS2[j]]=safeRead(function(key){return function(){return V[key];};}(BODY_STATE_KEYS2[j]),0);
    }
    for (var k=0;k<VIRGINITY_KEYS.length;k++){
      virginity[VIRGINITY_KEYS[k]]=safeRead(function(key){return function(){return V.player&&V.player.virginity&&V.player.virginity[key];};}(VIRGINITY_KEYS[k]),false)===true;
    }
    return {
      gender: safeRead(function(){return V.player&&V.player.gender;},'unknown'),
      arousal: safeRead(function(){return V.arousal;},0),
      arousalMax: safeRead(function(){return V.arousalmax;},10000),
      pain: safeRead(function(){return V.pain;},0),
      willpowerpain: safeRead(function(){return V.willpowerpain;},null),
      stress: safeRead(function(){return V.stress;},0),
      stressMax: safeRead(function(){return V.stressmax;},10000),
      trauma: safeRead(function(){return V.trauma;},0),
      traumaMax: safeRead(function(){return V.traumamax;},5000),
      control: safeRead(function(){return V.control;},1000),
      controlMax: safeRead(function(){return V.controlmax;},1000),
      tiredness: safeRead(function(){return V.tiredness;},0),
      hunger: safeRead(function(){return V.hunger;},0),
      awareness: safeRead(function(){return V.awareness;},0),
      submissive: safeRead(function(){return V.submissive;},1000),
      orgasmCount: safeRead(function(){return V.orgasmcount;},0),
      statusDetail: _aiBuildStatusDetail(V),
      bodyUse: bodyUse, bodyState: bodyState, virginity: virginity,
      effects: {
        dissociation: safeRead(function(){return V.dissociation;},0),
        trance: safeRead(function(){return V.trance;},0),
        possessed: safeRead(function(){return V.possessed;},false),
        drunk: safeRead(function(){return V.drunk;},0),
        drugged: safeRead(function(){return V.drugged;},0),
        orgasmCooldown: safeRead(function(){return V.orgasmdown;},0),
        panicViolence: safeRead(function(){return V.panicviolence;},0),
        panicParalysis: safeRead(function(){return V.panicparalysis;},0)
      }
    };
  }
  
  function collectCombat(V, turnIndex) {
    return {
      turnIndex: turnIndex,
      position: safeRead(function(){return V.position;},'unknown'),
      consensual: safeRead(function(){return V.consensual;},0)===1,
      enemyType: safeRead(function(){return V.enemytype;},'unknown'),
      enemyCount: safeRead(function(){return V.enemyno;},0),
      enemyHealth: safeRead(function(){return V.enemyhealth;},0),
      enemyHealthMax: safeRead(function(){return V.enemyhealthmax;},0),
      enemyArousal: safeRead(function(){return V.enemyarousal;},0),
      enemyArousalMax: safeRead(function(){return V.enemyarousalmax;},0),
      enemyAnger: safeRead(function(){return V.enemyanger;},0),
      enemyAngerMax: safeRead(function(){return V.enemyangermax;},0),
      enemyTrust: safeRead(function(){return V.enemytrust;},0)
    };
  }
  
  function computeDisplayName(V, npc, slot) {
    var npcRow = safeRead(function(){return V.npcrow;},[]);
    var npcNum = safeRead(function(){return V.npcnum;},[]);
    var namedIdx = npcRow.indexOf(slot);
    if (namedIdx >= 0) {
      var nameKnown = safeRead(function(){return npc.name_known;},0)===1;
      if (nameKnown) {
        var nameNumIdx = npcNum[namedIdx];
        var npcNameObj = safeRead(function(){return V.NPCName&&V.NPCName[nameNumIdx];},null);
        if (npcNameObj&&npcNameObj.title) return String(npcNameObj.title);
        return safeRead(function(){return npc.fullDescription;},'')||'unknown';
      }
      var desc = safeRead(function(){return npc.description;},'');
      if (desc) return String(desc);
    }
    if (safeRead(function(){return npc.name_known;},0)===1) {
      var name = safeRead(function(){return npc.name;},'');
      if (name) return String(name);
    }
    var type = safeRead(function(){return npc.type;},'human');
    if (type!=='human') return String(type);
    var fullDesc = safeRead(function(){return npc.fullDescription;},'');
    if (fullDesc) return String(fullDesc);
    return safeRead(function(){return npc.description;},'unknown')||'unknown';
  }
  
  function collectNamedNpcContext(V, slot) {
    var npcRow = safeRead(function(){return V.npcrow;},[]);
    var npcNames = safeRead(function(){return V.npc;},[]);
    var namedIdx = npcRow.indexOf(slot);
    if (namedIdx<0) return null;
    var npcName = npcNames[namedIdx];
    if (!npcName) return null;
    var C = getC();
    var namedNpc = safeRead(function(){return C&&C.npc&&C.npc[npcName];},null);
    if (!namedNpc) return null;
    var setup = (window.SugarCube&&window.SugarCube.setup)||(window.setup)||null;
    var loveInterests = safeRead(function(){return setup&&setup.loveInterestNpc;},[]);
    var loveAlias = 'unknown';
    if (setup&&setup.loveAlias&&setup.loveAlias[npcName]) {
      try { var raw=setup.loveAlias[npcName]; loveAlias=typeof raw==='function'?String(raw()):String(raw||'unknown'); } catch(e){}
    }
    return {
      npcName:npcName,
      love: safeRead(function(){return namedNpc.love;},0),
      lust: safeRead(function(){return namedNpc.lust;},0),
      dom: safeRead(function(){return namedNpc.dom;},0),
      rage: safeRead(function(){return namedNpc.rage;},0),
      trust: safeRead(function(){return namedNpc.trust;},0),
      relationship: {
        love: _aiRelationObject(safeRead(function(){return namedNpc.love;},0)),
        lust: _aiRelationObject(safeRead(function(){return namedNpc.lust;},0)),
        dom: _aiRelationObject(safeRead(function(){return namedNpc.dom;},0)),
        rage: _aiRelationObject(safeRead(function(){return namedNpc.rage;},0)),
        trust: _aiRelationObject(safeRead(function(){return namedNpc.trust;},0))
      },
      extra: _aiBuildNpcExtra(V, npcName),
      isLoveInterest: loveInterests.indexOf(npcName)!==-1,
      loveAlias: loveAlias
    };
  }
  
  function collectNpcs(V, anchor) {
    var npcList = safeRead(function(){return V.NPCList;},[]);
    var result = [];
    for (var slot=0; slot<Math.min(npcList.length,6); slot++) {
      var npc = npcList[slot];
      if (!npc) continue;
      if (safeRead(function(){return npc.active;},null)!=='active') continue;
      var displayName = computeDisplayName(V, npc, slot);
      if (anchor.initialNames[slot]===undefined) anchor.initialNames[slot]=displayName;
      var prevName = anchor.prevNames[slot]!==undefined ? anchor.prevNames[slot] : displayName;
      var aliasHint = null;
      if (displayName!==prevName) {
        var switchKey = slot+':'+prevName+'->'+displayName;
        if (!anchor.hintedSwitches[switchKey]) {
          aliasHint = prevName+' -> '+displayName;
          anchor.hintedSwitches[switchKey]=true;
        }
      }
      anchor.prevNames[slot]=displayName;
      var namedCtx = collectNamedNpcContext(V, slot);
      var npcVirginity = {};
      for (var vk=0;vk<VIRGINITY_KEYS.length;vk++){
        npcVirginity[VIRGINITY_KEYS[vk]]=safeRead(function(key){return function(){return npc.virginity&&npc.virginity[key];};}(VIRGINITY_KEYS[vk]),false)===true;
      }
      result.push({
        npcSlot:slot, displayNameCurrent:displayName, displayNameInitial:anchor.initialNames[slot]||displayName,
        displayNamePrev:prevName, aliasHint:aliasHint,
        rawIdentity:{
          fullDescription:safeRead(function(){return npc.fullDescription;},''),
          description:safeRead(function(){return npc.description;},''),
          role:safeRead(function(){return npc.role;},'normal'),
          nameKnown:safeRead(function(){return npc.name_known;},0)===1,
          pronoun:safeRead(function(){return npc.pronoun;},'n'),
          gender:safeRead(function(){return npc.gender;},'unknown'),
          type:safeRead(function(){return npc.type;},'human')
        },
        body:{ lefthand:safeRead(function(){return npc.lefthand;},0),righthand:safeRead(function(){return npc.righthand;},0),mouth:safeRead(function(){return npc.mouth;},0),penis:safeRead(function(){return npc.penis;},0),vagina:safeRead(function(){return npc.vagina;},0),chest:safeRead(function(){return npc.chest;},0) },
        health:safeRead(function(){return npc.health;},0),healthMax:safeRead(function(){return npc.healthmax;},0),
        arousal:safeRead(function(){return V['enemyarousal'+(slot+1)];},0),
        trust:safeRead(function(){return V['enemytrust'+(slot+1)]!=null?V['enemytrust'+(slot+1)]:npc.trust;},0),
        stance:safeRead(function(){return npc.stance;},''),
        insecurity:safeRead(function(){return npc.insecurity;},''),
        penisSize:safeRead(function(){return npc.penissize;},0),
        active:true, virginity:npcVirginity, namedNpcContext:namedCtx
      });
    }
    return result;
  }
  
  function collectClothing(V) {
    var result = [];
    var clothingDataFn = (window.clothingData)||null;
    for (var i=0;i<CLOTHING_SLOTS.length;i++) {
      var slot = CLOTHING_SLOTS[i];
      var item = safeRead(function(s){return function(){return V.worn&&V.worn[s];};}(slot),null);
      if (!item||!item.name||item.name==='naked') continue;
      var integrityMax = clothingDataFn ? safeRead(function(s,it){return function(){return clothingDataFn(s,it,'integrity_max');};}(slot,item),100) : safeRead(function(){return item.integrity_max;},100);
      result.push({
        slot:slot, name:safeRead(function(){return item.name;},''),
        integrity:safeRead(function(){return item.integrity;},0),
        integrityMax:integrityMax||100,
        state:safeRead(function(){return item.state;},0),
        exposed:safeRead(function(){return item.exposed;},0),
        vaginaExposed:safeRead(function(){return item.vagina_exposed;},0),
        anusExposed:safeRead(function(){return item.anus_exposed;},0)
      });
    }
    return result;
  }
  
  function collectStateSnapshot(anchorState, turnIndex) {
    var V = getV();
    if (!V) return null;
    if (safeRead(function(){return V.combat;},0)!==1) return null;
    var world = collectWorld(V);
    var player = collectPlayer(V);
    var combat = collectCombat(V, turnIndex);
    var npcs = collectNpcs(V, anchorState);
    var clothing = collectClothing(V);
    return { world:world, player:player, npcs:npcs, combat:combat, clothing:clothing };
  }
  
  // -- 10. Intent Capture --
  function captureIntent() {
    var V = getV();
    if (!V) return null;
    return {
      leftaction: safeRead(function(){return V.leftaction;},0),
      rightaction: safeRead(function(){return V.rightaction;},0),
      mouthaction: safeRead(function(){return V.mouthaction;},0),
      feetaction: safeRead(function(){return V.feetaction;},0),
      penisaction: safeRead(function(){return V.penisaction;},0),
      vaginaaction: safeRead(function(){return V.vaginaaction;},0),
      anusaction: safeRead(function(){return V.anusaction;},0),
      chestaction: safeRead(function(){return V.chestaction;},0),
      thighaction: safeRead(function(){return V.thighaction;},0),
      askAction: safeRead(function(){return V.askAction;},0),
      mockaction: safeRead(function(){return V.mockaction;},0),
      mouthtarget: safeRead(function(){return V.mouthtarget;},0),
      lefttarget: safeRead(function(){return V.lefttarget;},0),
      righttarget: safeRead(function(){return V.righttarget;},0),
      feettarget: safeRead(function(){return V.feettarget;},0)
    };
  }
  
  function hasActiveIntent(intent) {
    for (var i=0;i<BODY_ACTION_KEYS.length;i++){
      if (intent[BODY_ACTION_KEYS[i]]!==0) return true;
    }
    return false;
  }
  
  // -- 11. Delta Computer --
  function diffRecord(prev, curr) {
    var changes = [];
    var allKeys = {};
    for (var k in prev) { allKeys[k]=true; }
    for (var k in curr) { allKeys[k]=true; }
    for (var k in allKeys) {
      if (prev[k] !== curr[k]) changes.push({ field:k, from:prev[k], to:curr[k] });
    }
    return changes;
  }
  function diffVirginityLoss(prev, curr) {
    var lost = [];
    for (var k in prev) { if (prev[k]===true && curr[k]!==true) lost.push(k); }
    return lost;
  }
  function diffNpcVirginityLoss(prevNpcs, currNpcs) {
    var result = [];
    var currMap = {};
    for (var i=0;i<currNpcs.length;i++) currMap[currNpcs[i].npcSlot]=currNpcs[i];
    for (var i=0;i<prevNpcs.length;i++) {
      var prev = prevNpcs[i];
      var curr = currMap[prev.npcSlot];
      if (!curr) continue;
      for (var k in prev.virginity) {
        if (prev.virginity[k]===true && curr.virginity[k]!==true) result.push({ npcSlot:prev.npcSlot, type:k });
      }
    }
    return result;
  }
  function diffClothing(prevItems, currItems) {
    var changes = [];
    var prevMap = {}, currMap = {};
    for (var i=0;i<prevItems.length;i++) prevMap[prevItems[i].slot]=prevItems[i];
    for (var i=0;i<currItems.length;i++) currMap[currItems[i].slot]=currItems[i];
    var allSlots = {};
    for (var k in prevMap) allSlots[k]=true;
    for (var k in currMap) allSlots[k]=true;
    for (var slot in allSlots) {
      var p = prevMap[slot], c = currMap[slot];
      if (!p && c) changes.push({ slot:slot, field:'name', from:'naked', to:c.name });
      else if (p && !c) changes.push({ slot:slot, field:'name', from:p.name, to:'naked' });
      else if (p && c) {
        var fields = ['name','integrity','state','exposed','vaginaExposed','anusExposed'];
        for (var fi=0;fi<fields.length;fi++) {
          var f = fields[fi];
          if (p[f] !== c[f]) changes.push({ slot:slot, field:f, from:p[f], to:c[f] });
        }
      }
    }
    return changes;
  }
  function diffNpcBodies(prevNpcs, currNpcs) {
    var result = [];
    var currMap = {};
    for (var i=0;i<currNpcs.length;i++) currMap[currNpcs[i].npcSlot]=currNpcs[i];
    for (var i=0;i<prevNpcs.length;i++) {
      var prev = prevNpcs[i], curr = currMap[prev.npcSlot];
      if (!curr) continue;
      for (var f in prev.body) {
        if (prev.body[f] !== curr.body[f]) result.push({ npcSlot:prev.npcSlot, field:f, from:prev.body[f], to:curr.body[f] });
      }
    }
    return result;
  }
  function diffNpcNames(prevNpcs, currNpcs) {
    var result = [];
    var currMap = {};
    for (var i=0;i<currNpcs.length;i++) currMap[currNpcs[i].npcSlot]=currNpcs[i];
    for (var i=0;i<prevNpcs.length;i++) {
      var prev = prevNpcs[i], curr = currMap[prev.npcSlot];
      if (!curr) continue;
      if (prev.displayNameCurrent !== curr.displayNameCurrent) result.push({ npcSlot:prev.npcSlot, from:prev.displayNameCurrent, to:curr.displayNameCurrent });
    }
    return result;
  }
  function diffScalar(prev, curr) { return prev !== curr ? { from:prev, to:curr } : null; }
  function computeOrgasmSignals(prev, curr) {
    var orgasmCountDelta = curr.player.orgasmCount - prev.player.orgasmCount;
    if (orgasmCountDelta > 0) return { playerOrgasmTriggered:true, orgasmCountDelta:orgasmCountDelta };
    var cooldownEdge = prev.player.effects.orgasmCooldown<=0 && curr.player.effects.orgasmCooldown>=1;
    var arousalDrop = prev.player.arousal - curr.player.arousal;
    if (cooldownEdge && arousalDrop>=2000) return { playerOrgasmTriggered:true, orgasmCountDelta:1 };
    return { playerOrgasmTriggered:false, orgasmCountDelta:0 };
  }
  function computeDelta(prev, curr) {
    var orgasmSignals = computeOrgasmSignals(prev, curr);
    return {
      arousalDelta: curr.player.arousal - prev.player.arousal,
      painDelta: curr.player.pain - prev.player.pain,
      stressDelta: curr.player.stress - prev.player.stress,
      traumaDelta: curr.player.trauma - prev.player.trauma,
      controlDelta: curr.player.control - prev.player.control,
      enemyHealthDelta: curr.combat.enemyHealth - prev.combat.enemyHealth,
      enemyArousalDelta: curr.combat.enemyArousal - prev.combat.enemyArousal,
      enemyAngerDelta: curr.combat.enemyAnger - prev.combat.enemyAnger,
      enemyTrustDelta: curr.combat.enemyTrust - prev.combat.enemyTrust,
      bodyUseChanges: diffRecord(prev.player.bodyUse, curr.player.bodyUse),
      bodyStateChanges: diffRecord(prev.player.bodyState, curr.player.bodyState),
      playerVirginityLost: diffVirginityLoss(prev.player.virginity, curr.player.virginity),
      npcVirginityLost: diffNpcVirginityLoss(prev.npcs, curr.npcs),
      clothingChanges: diffClothing(prev.clothing, curr.clothing),
      npcBodyChanges: diffNpcBodies(prev.npcs, curr.npcs),
      positionChange: diffScalar(prev.combat.position, curr.combat.position),
      consensualChange: diffScalar(prev.combat.consensual, curr.combat.consensual),
      nameChanges: diffNpcNames(prev.npcs, curr.npcs),
      playerOrgasmTriggered: orgasmSignals.playerOrgasmTriggered,
      orgasmCountDelta: orgasmSignals.orgasmCountDelta
    };
  }
  
  // -- 12. Event Normalizer (10 dimensions) --
  var PRIORITY = { MILESTONE:1, ORGASM:2, CONTROL:3, CONSENT:4, CONTACT:5, PENETRATION:6, CLOTHING:7, BOUNDARY_REQUEST:8, HUMILIATION:9, NAME_ALIAS_SWITCH:10 };
  function normalizeEvents(ctx) {
    var events = [];
    extractMilestoneEvents(ctx, events);
    extractOrgasmEvents(ctx, events);
    extractControlEvents(ctx, events);
    extractConsentEvents(ctx, events);
    extractContactEvents(ctx, events);
    extractPenetrationEvents(ctx, events);
    extractClothingEvents(ctx, events);
    extractBoundaryRequestEvents(ctx, events);
    extractHumiliationEvents(ctx, events);
    extractNameAliasEvents(ctx, events);
    events.sort(function(a,b){return a.priority-b.priority;});
    return events;
  }
  function extractMilestoneEvents(ctx, out) {
    var delta = ctx.delta;
    for (var i=0;i<delta.playerVirginityLost.length;i++){
      var type=delta.playerVirginityLost[i];
      var eventType = type==='temple'?'milestone.temple_vow_break':'milestone.virginity_loss';
      out.push({ eventType:eventType, actorSlot:null, targetSlot:-1, intent:{}, delta:{ virginityType:type,from:true,to:false }, outcome:'observed', evidence:['player.virginity.'+type], provenance:'virginity_diff', priority:PRIORITY.MILESTONE });
    }
    for (var i=0;i<delta.npcVirginityLost.length;i++){
      var nv=delta.npcVirginityLost[i];
      out.push({ eventType:'milestone.npc_virginity_loss', actorSlot:-1, targetSlot:nv.npcSlot, intent:{}, delta:{ virginityType:nv.type,npcSlot:nv.npcSlot,from:true,to:false }, outcome:'observed', evidence:['npc['+nv.npcSlot+'].virginity.'+nv.type], provenance:'virginity_diff', priority:PRIORITY.MILESTONE });
    }
  }
  function extractOrgasmEvents(ctx, out) {
    if (!ctx.delta.playerOrgasmTriggered) return;
    out.push({ eventType:'orgasm.player', actorSlot:-1, targetSlot:null, intent:{}, delta:{ orgasmCountDelta:ctx.delta.orgasmCountDelta, orgasmCount:ctx.currState.player.orgasmCount, orgasmCooldown:ctx.currState.player.effects.orgasmCooldown, arousalDelta:ctx.delta.arousalDelta }, outcome:'observed', evidence:['player.orgasmCount','player.effects.orgasmCooldown','arousalDelta'], provenance:'orgasm_diff', priority:PRIORITY.ORGASM });
  }
  function extractControlEvents(ctx, out) {
    if (Math.abs(ctx.delta.controlDelta)>=20) {
      var direction = ctx.delta.controlDelta>0?'gain':'loss';
      out.push({ eventType:'control.'+direction, actorSlot:-1, targetSlot:null, intent:{}, delta:{ controlDelta:ctx.delta.controlDelta }, outcome:'observed', evidence:['player.control'], provenance:'control_diff', priority:PRIORITY.CONTROL });
    }
  }
  function extractConsentEvents(ctx, out) {
    if (ctx.delta.consensualChange) {
      var direction = ctx.delta.consensualChange.to?'to_consensual':'to_nonconsensual';
      out.push({ eventType:'consent.'+direction, actorSlot:null, targetSlot:null, intent:{}, delta:{from:ctx.delta.consensualChange.from,to:ctx.delta.consensualChange.to}, outcome:'observed', evidence:['combat.consensual'], provenance:'consensual_diff', priority:PRIORITY.CONSENT });
    }
  }
  function extractContactEvents(ctx, out) {
    var delta = ctx.delta;
    for (var i=0;i<delta.bodyUseChanges.length;i++){
      var change=delta.bodyUseChanges[i];
      var wasEngaged=isEngaged(change.from), nowEngaged=isEngaged(change.to);
      if (!wasEngaged&&nowEngaged) out.push({ eventType:'contact.engage', actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to }, outcome:'observed', evidence:['player.bodyUse.'+change.field], provenance:'bodyuse_diff', priority:PRIORITY.CONTACT });
      else if (wasEngaged&&!nowEngaged) out.push({ eventType:'contact.disengage', actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to }, outcome:'observed', evidence:['player.bodyUse.'+change.field], provenance:'bodyuse_diff', priority:PRIORITY.CONTACT });
      else if (wasEngaged&&nowEngaged&&change.from!==change.to) out.push({ eventType:'contact.switch', actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to }, outcome:'observed', evidence:['player.bodyUse.'+change.field], provenance:'bodyuse_diff', priority:PRIORITY.CONTACT });
    }
    for (var i=0;i<delta.npcBodyChanges.length;i++){
      var nc=delta.npcBodyChanges[i];
      var we=isEngaged(nc.from), ne=isEngaged(nc.to);
      if (!we&&ne) out.push({ eventType:'contact.npc_engage', actorSlot:nc.npcSlot, targetSlot:-1, intent:{}, delta:{ bodyPart:nc.field,from:nc.from,to:nc.to }, outcome:'observed', evidence:['npc['+nc.npcSlot+'].body.'+nc.field], provenance:'npcbody_diff', priority:PRIORITY.CONTACT });
      else if (we&&!ne) out.push({ eventType:'contact.npc_disengage', actorSlot:nc.npcSlot, targetSlot:-1, intent:{}, delta:{ bodyPart:nc.field,from:nc.from,to:nc.to }, outcome:'observed', evidence:['npc['+nc.npcSlot+'].body.'+nc.field], provenance:'npcbody_diff', priority:PRIORITY.CONTACT });
    }
  }
  function classifyPenetrationPhase(raw) {
    if (raw===0||raw==null) return 'none';
    var value=String(raw).trim().toLowerCase();
    if (!value||value==='0'||value==='none'||value==='rest') return 'none';
    if (value.indexOf('kiss')!==-1) return 'none';
    if (value.indexOf('entrance')!==-1) return 'entrance';
    if (value.indexOf('imminent')!==-1) return 'imminent';
    if (value.indexOf('penetrated')!==-1||value.indexOf('penetrating')!==-1) return 'penetrated';
    if (value.indexOf('rub')!==-1||value.indexOf('thigh')!==-1||value.indexOf('cheek')!==-1||value.indexOf('feet')!==-1) return 'none';
    if (value.indexOf('other')===0||value.indexOf('tentacle')!==-1||value==='penis'||value==='vagina'||value==='anus'||value==='mouth') return 'penetrated';
    return 'none';
  }
  var PEN_PHASE_RANK = { none:0, entrance:1, imminent:2, penetrated:3 };
  function extractPenetrationEvents(ctx, out) {
    var delta=ctx.delta;
    for (var i=0;i<delta.bodyStateChanges.length;i++){
      var change=delta.bodyStateChanges[i];
      var prevPhase=classifyPenetrationPhase(change.from), currPhase=classifyPenetrationPhase(change.to);
      if (prevPhase==='none'&&currPhase!=='none') out.push({ eventType:'penetration.start', actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to,fromPhase:prevPhase,toPhase:currPhase }, outcome:'observed', evidence:['player.bodyState.'+change.field], provenance:'bodystate_diff', priority:PRIORITY.PENETRATION });
      else if (prevPhase!=='none'&&currPhase==='none') out.push({ eventType:'penetration.end', actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to,fromPhase:prevPhase,toPhase:currPhase }, outcome:'observed', evidence:['player.bodyState.'+change.field], provenance:'bodystate_diff', priority:PRIORITY.PENETRATION });
      else if (prevPhase!=='none'&&currPhase!=='none'&&change.from!==change.to) {
        var eventType = (PEN_PHASE_RANK[currPhase]||0)>(PEN_PHASE_RANK[prevPhase]||0)?'penetration.intensify':'penetration.switch';
        out.push({ eventType:eventType, actorSlot:null, targetSlot:-1, intent:{}, delta:{ bodyPart:change.field,from:change.from,to:change.to,fromPhase:prevPhase,toPhase:currPhase }, outcome:'observed', evidence:['player.bodyState.'+change.field], provenance:'bodystate_diff', priority:PRIORITY.PENETRATION });
      }
    }
  }
  function extractClothingEvents(ctx, out) {
    var delta=ctx.delta;
    for (var i=0;i<delta.clothingChanges.length;i++){
      var change=delta.clothingChanges[i];
      var subType;
      if (change.field==='name') subType = change.to==='naked'?'remove':change.from==='naked'?'equip':'swap';
      else if (change.field==='exposed'||change.field==='vaginaExposed'||change.field==='anusExposed') subType='expose';
      else if (change.field==='integrity') subType = (change.to<change.from)?'damage':'repair';
      else if (change.field==='state') subType='displace';
      else subType='change';
      out.push({ eventType:'clothing.'+subType, actorSlot:null, targetSlot:-1, intent:{}, delta:{ slot:change.slot,field:change.field,from:change.from,to:change.to }, outcome:'observed', evidence:['worn.'+change.slot+'.'+change.field], provenance:'clothing_diff', priority:PRIORITY.CLOTHING });
    }
  }
  function extractBoundaryRequestEvents(ctx, out) {
    if (ctx.intent.mouthaction!=='ask') return;
    var askAction=ctx.intent.askAction;
    if (typeof askAction!=='string'||!askAction||askAction==='rest') return;
    var requestType;
    if (askAction==='condoms'||askAction==='noCondoms'||askAction==='askPullOut') requestType='safety';
    else if (askAction==='finish') requestType='stop';
    else if (askAction.indexOf('no')===0) requestType='refuse';
    else if (askAction.indexOf('ask')===0) requestType='request_more';
    else requestType='other';
    var mouthtargetSlot = typeof ctx.intent.mouthtarget==='number'?ctx.intent.mouthtarget:null;
    out.push({ eventType:'boundary_request.'+requestType, actorSlot:-1, targetSlot:mouthtargetSlot, intent:{ mouthaction:ctx.intent.mouthaction, askAction:askAction, mouthtarget:ctx.intent.mouthtarget }, delta:{}, outcome:'observed', evidence:['mouthaction','askAction'], provenance:'intent_askaction', priority:PRIORITY.BOUNDARY_REQUEST });
  }
  function extractHumiliationEvents(ctx, out) {
    var mouthaction=ctx.intent.mouthaction;
    if (mouthaction!=='mock'&&mouthaction!=='disparage') return;
    var mockaction=ctx.intent.mockaction;
    var mouthtarget=ctx.intent.mouthtarget;
    var mouthtargetSlot = typeof mouthtarget==='number'?mouthtarget:null;
    var targetNpc;
    if (mouthtargetSlot!==null) {
      for (var i=0;i<ctx.currState.npcs.length;i++){ if(ctx.currState.npcs[i].npcSlot===mouthtargetSlot){ targetNpc=ctx.currState.npcs[i]; break; } }
    }
    var insecurity = (targetNpc&&targetNpc.insecurity)||'';
    var isHit = mockaction!==0 && String(mockaction)===insecurity;
    out.push({ eventType:'humiliation.'+String(mouthaction), actorSlot:-1, targetSlot:mouthtargetSlot, intent:{ mouthaction:mouthaction, mockaction:mockaction, mouthtarget:mouthtarget }, delta:{ controlDelta:ctx.delta.controlDelta, insecurityMatch:isHit }, outcome:isHit?'hit':'miss', evidence:['mouthaction','mockaction','npc.insecurity','control_delta'], provenance:'intent_mock', priority:PRIORITY.HUMILIATION });
  }
  function extractNameAliasEvents(ctx, out) {
    for (var i=0;i<ctx.delta.nameChanges.length;i++){
      var nc=ctx.delta.nameChanges[i];
      out.push({ eventType:'name_alias_switch', actorSlot:null, targetSlot:nc.npcSlot, intent:{}, delta:{ from:nc.from, to:nc.to }, outcome:'observed', evidence:['npc['+nc.npcSlot+'].displayNameCurrent'], provenance:'name_diff', priority:PRIORITY.NAME_ALIAS_SWITCH });
    }
  }
  
  // -- 13. Prompt Renderer --
  function deltaStr(d) { if (d==null||d===0) return ''; return ' | Delta: '+(d>0?'+':'')+d; }
  function serializeClothingForPrompt(clothing) {
    var items = [];
    for (var i=0;i<clothing.length;i++) { if (clothing[i].name&&clothing[i].name!=='naked') items.push(clothing[i]); }
    if (!items.length) return '';
    var lines = [];
    for (var i=0;i<items.length;i++){
      var c=items[i];
      var parts=[c.slot+': '+c.name];
      if (c.integrity<c.integrityMax) parts.push(integrityLabel(c.integrity,c.integrityMax)+' '+c.integrity+'/'+c.integrityMax);
      if (c.exposed>0) parts.push(exposureLabel(c.exposed));
      if (c.vaginaExposed) parts.push('vagina exposed');
      if (c.anusExposed) parts.push('anus exposed');
      lines.push('  '+parts.join(', '));
    }
    return lines.join('\n');
  }
  var MACROS = {
    WorldInfo: function(ctx){ var w=ctx.state.world; return ['Location: '+w.location,'Area: '+(w.area||'unknown'),'Scene: '+w.passage,'Environment: '+(w.outside?'outside':'inside'),'Time: '+w.dayState+', '+(w.weekDay||'')+', '+w.hour+':'+String(w.minute||0).padStart(2,'0'),'Weather: '+w.weather,'Season: '+w.season,'Moon: '+(w.moonPhase||'unknown'),'School: '+(w.school&&w.school.schoolDay?'school day':'not school day')].join('\n'); },
    PlayerInfo: function(ctx){
      var p=ctx.state.player;
      var sd=p.statusDetail||{};
      function sdt(key, fallback){ return sd[key]&&sd[key].text ? sd[key].text : fallback; }
      var lines=[ 'Gender: '+p.gender, '\u6027\u594b: '+sdt('arousal', arousalLevel(p.arousal,p.arousalMax,true)), '\u75bc\u75db: '+sdt('pain', painLevel(p.pain)), '\u538b\u529b: '+sdt('stress', stressLevel(p.stress,p.stressMax,true)), '\u521b\u4f24: '+sdt('trauma', traumaLevel(p.trauma,p.traumaMax,true)), '\u81ea\u63a7: '+sdt('control', controlLevel(p.control,p.controlMax,p.effects.possessed,true)), '\u75b2\u52b3: '+sdt('tiredness', p.tiredness), '\u9965\u997f: '+sdt('hunger', p.hunger), 'Submissive: '+submissiveLevel(p.submissive), 'Orgasm count (this fight): '+p.orgasmCount ];
      var uses=[];
      for (var k in p.bodyUse){ if(p.bodyUse[k]!==0&&p.bodyUse[k]!=='') uses.push(k+'='+p.bodyUse[k]); }
      if(uses.length) lines.push('Body use: '+uses.join(', '));
      var states=[];
      for (var k in p.bodyState){ if(p.bodyState[k]!==0&&p.bodyState[k]!=='') states.push(k+'='+p.bodyState[k]); }
      if(states.length) lines.push('Body state: '+states.join(', '));
      var e=p.effects, effs=[];
      if(e.dissociation>0) effs.push('dissociation='+e.dissociation);
      if(e.trance>0) effs.push('trance='+e.trance);
      if(e.possessed) effs.push('possessed');
      if(e.drunk>0) effs.push('drunk='+e.drunk);
      if(e.drugged>0) effs.push('drugged='+e.drugged);
      if(e.orgasmCooldown>0) effs.push('orgasmCooldown='+e.orgasmCooldown);
      if(e.panicViolence>0) effs.push('panicViolence='+e.panicViolence);
      if(e.panicParalysis>0) effs.push('panicParalysis='+e.panicParalysis);
      if(effs.length) lines.push('Effects: '+effs.join(', '));
      var cl = serializeClothingForPrompt(ctx.state.clothing);
      if(cl) lines.push('Clothing:\n'+cl);
      return lines.join('\n');
    },
    NpcInfo: function(ctx){
      var npcs=ctx.state.npcs, lines=[];
      for (var i=0;i<npcs.length;i++){
        var n=npcs[i];
        var nl=['[NPC slot='+n.npcSlot+'] '+n.displayNameCurrent,'  Type: '+n.rawIdentity.type+', Gender: '+n.rawIdentity.gender,'  Role: '+n.rawIdentity.role,'  Health: '+enemyHealthLevel(n.health,n.healthMax)+', Arousal: '+n.arousal+', Trust: '+enemyTrustLevel(n.trust),'  Stance: '+n.stance];
        if(n.penisSize>0) nl.push('  Penis: '+npcPenisSizeDesc(n.penisSize));
        if(n.insecurity) nl.push('  Insecurity: '+n.insecurity);
        if(n.aliasHint) nl.push('  Name change: '+n.aliasHint);
        if(n.namedNpcContext){ var r=n.namedNpcContext; var rp=[]; if(r.isLoveInterest) rp.push('Love Interest ('+r.loveAlias+')'); if(r.relationship){ rp.push('\u597d\u611f: '+r.relationship.love.level+'('+r.relationship.love.value+')','\u6b32\u671b: '+r.relationship.lust.level+'('+r.relationship.lust.value+')','\u652f\u914d: '+r.relationship.dom.level+'('+r.relationship.dom.value+')','\u6124\u6012: '+r.relationship.rage.level+'('+r.relationship.rage.value+')','\u4fe1\u4efb: '+r.relationship.trust.level+'('+r.relationship.trust.value+')'); } else { rp.push('Love: '+relationLevel(r.love),'Lust: '+relationLevel(r.lust),'Dom: '+relationLevel(r.dom),'Rage: '+relationLevel(r.rage)); } nl.push('  Relationship: '+rp.join(', ')); }
        var targeting=[];
        for(var k in n.body){ var v=n.body[k]; if(v!==0&&v!==''&&v!=='rest'&&v!=null) targeting.push(combatVarLabel(k)+'='+actionLabel(v)); }
        if(targeting.length) nl.push('  Body targeting: '+targeting.join(', '));
        lines.push(nl.join('\n'));
      }
      return lines.length?lines.join('\n---\n'):'(none active)';
    },
    CombatState: function(ctx){
      var c=ctx.state.combat, d=ctx.delta, other=c.consensual?'Partner':'Enemy';
      return ['Turn: '+c.turnIndex,'Position: '+c.position,'Consensual: '+(c.consensual?'yes':'no'),other+': type='+c.enemyType+', count='+c.enemyCount,other+' HP: '+enemyHealthLevel(c.enemyHealth,c.enemyHealthMax)+deltaStr(d&&d.enemyHealthDelta),other+' arousal: '+enemyArousalLevel(c.enemyArousal,c.enemyArousalMax)+deltaStr(d&&d.enemyArousalDelta),other+' anger: '+enemyAngerLevel(c.enemyAnger,c.enemyAngerMax)+deltaStr(d&&d.enemyAngerDelta),other+' trust: '+enemyTrustLevel(c.enemyTrust)+deltaStr(d&&d.enemyTrustDelta)].join('\n');
    },
    TurnActionSummary: function(ctx){
      var i=ctx.intent, actions=[], targets=[];
      for (var ki=0;ki<ALL_ACTION_KEYS.length;ki++){
        var key=ALL_ACTION_KEYS[ki];
        var val=i[key];
        var inactive = SUB_ACTION_KEYS.indexOf(key)!==-1 ? (val===0||val===''||val==='none'||val==='rest') : (val===0||val===''||val==='none');
        if(!inactive){
          if(key==='askAction'&&i.mouthaction!=='ask') continue;
          if(key==='mockaction'&&i.mouthaction!=='mock'&&i.mouthaction!=='disparage') continue;
          actions.push(combatVarLabel(key)+': '+actionLabel(val));
        }
      }
      for (var kj=0;kj<TARGET_KEYS.length;kj++){ var tk=TARGET_KEYS[kj]; if(i[tk]!==0) targets.push(combatVarLabel(tk)+'='+i[tk]); }
      if(!actions.length) return '(no player action this turn)';
      var result='Actions: '+actions.join(', ');
      if(targets.length) result+='\nTargets: '+targets.join(', ');
      return result;
    },
    SpecialEvents: function(ctx){
      if(!ctx.events.length) return '(no mechanism events this turn)';
      var lines=[];
      for(var i=0;i<ctx.events.length;i++){
        var e=ctx.events[i];
        var parts=['['+e.eventType+']','outcome='+e.outcome];
        if(e.actorSlot!==null) parts.push('actor='+(e.actorSlot===-1?'player':'npc:'+e.actorSlot));
        if(e.targetSlot!==null) parts.push('target='+(e.targetSlot===-1?'player':'npc:'+e.targetSlot));
        var de=[];
        for(var k in e.delta){ if(e.delta[k]!==0&&e.delta[k]!==''&&e.delta[k]!=null) de.push(k+':'+e.delta[k]); }
        if(de.length) parts.push('delta={'+de.join(', ')+'}');
        lines.push(parts.join(' '));
      }
      return lines.join('\n');
    },
    OriginalText: function(ctx){ return ctx.includeOriginalText ? (ctx.originalText||'') : ''; },
    PreviousNarration: function(ctx){
      if(!ctx.previousOutputs.length) return '(first turn - no previous AI narration)';
      var lines=[];
      for(var i=0;i<ctx.previousOutputs.length;i++){ lines.push('[Turn '+ctx.previousOutputs[i].turnIndex+']\n'+ctx.previousOutputs[i].text); }
      return lines.join('\n\n');
    },
    PlayerCustomIntent: function(ctx){
      var text = ctx.intent && ctx.intent.customPlayerNarrative ? String(ctx.intent.customPlayerNarrative).trim() : '';
      return text || '(none)';
    },
    CombatBeginning: function(ctx){
      var pc=ctx.preCombatContext;
      if(!pc) return '(no pre-combat context available)';
      var lines=[];
      if(pc.passageName) lines.push('Scene: '+pc.passageName);
      if(pc.renderedText) lines.push('Narrative:\n'+pc.renderedText);
      return lines.join('\n')||'(no pre-combat context available)';
    },
    TurnIndex: function(ctx){ return String(ctx.turnIndex); }
  };
  function renderPrompt(template, ctx) {
    return template.replace(/\{\{(\w+)\}\}/g, function(match, name){
      var fn = MACROS[name];
      return fn ? fn(ctx) : match;
    });
  }
  
  // -- 14. Default Prompt Template --
  // ---------- 19. CDP / debug dump ----------  // ---------- 19. CDP / debug dump ----------
  function _getAiControllerDebugState() {
    function _schema(obj) {
      return obj && obj.schemaVersion ? obj.schemaVersion : null;
    }
    return {
      core: _schema(Core),
      apiClientModule: _schema(ApiClientModule),
      storyRuntimeModule: _schema(StoryRuntimeModule),
      stateStoreModule: _schema(StateStoreModule),
      stateStore: _schema(window.AIStoryGen.stateStore),
      linkClassifierModule: _schema(LinkClassifierModule),
      pageClassifierModule: _schema(PageClassifierModule),
      eventParserModule: _schema(EventParserModule),
      eventSchemaModule: _schema(EventSchemaModule),
      itemSchemaModule: _schema(ItemSchemaModule),
      eventValidatorModule: _schema(EventValidatorModule),
      eventValidator: _schema(AIEventValidator),
      memoryUIModule: _schema(MemoryUIModule),
      memoryUI: _schema(MemoryUI),
      configUIModule: _schema(ConfigUIModule),
      configUI: _schema(ConfigUI),
      locationModule: _schema(LocationControllerModule),
      locationTools: _schema(window.AIStoryGen.locationTools),
      location: _schema(LocationController),
      panelModule: _schema(PanelManagerModule),
      panel: _schema(PanelManager),
      transactionModule: _schema(TransactionModule),
      transaction: _schema(AITransaction),
      nativeEventGuardModule: _schema(NativeEventGuardModule),
      nativeEventGuard: _schema(NativeEventGuard),
    };
  }

  function _getAiStorageDebugState() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (/^(aiStoryGen|AIStoryGen|__AIStoryGen)/.test(key || '')) {
          keys.push({
            key: key,
            len: String(localStorage.getItem(key) || '').length,
          });
        }
      }
    } catch (_) {}
    return {
      localStorageKeys: keys,
      recentBufLen: recentBuf.length,
      longTermMemLen: longTermMem.length,
      aiItemsLen: (_getAiItemStore() || []).length,
      pendingAiItemUsesLen: (_pendingAiItemUses || []).length,
      lastAiItemsUsedForTurn: _cloneForAiSnapshot(_lastAiItemsUsedForTurn || []),
      eventLogLen: (typeof _aiEventLog !== 'undefined' && _aiEventLog && _aiEventLog.length) || 0,
      stateStoreSchema: (window.AIStoryGen.stateStore && window.AIStoryGen.stateStore.schemaVersion) || null,
    };
  }

  function _getAiPanelDebugState() {
    var pixelSelector = '#passages .apg-ai-assist, #passages [data-ai-pixel-panel="1"], #passages .aipixel-panel, #passages #aipixel-panel';
    var panelManagerStatus = null;
    try {
      panelManagerStatus = PanelManager && typeof PanelManager.getStatus === 'function' ? PanelManager.getStatus() : null;
    } catch (_) {}
    return {
      storyChoices: $('#passages .ai-choices').length,
      storyChoiceButtons: $('#passages [data-ai-story-choice-button="1"]').length,
      storyUseItemPanels: $('#passages .ai-use-item-panel').length,
      extensionMenus: $('#passages .ai-addon-target-menu, #passages .ai-addon-target-panel').length,
      pixelPanels: $(pixelSelector).length,
      pixelAssistPanels: $('#passages .apg-ai-assist').length,
      extensionIntentInputs: $('#passages [data-ai-combat-intent-input="1"]').length,
      extensionEndControls: $('#passages .ai-end-combat-wrap, #passages [data-ai-end-combat="1"]').length,
      legacyPixelOrderObserver: !!window._apgAssistOrderObserver,
      legacyPoseOrderObserver: !!window._apgPoseAssistOrderObserver,
      panelManager: panelManagerStatus,
    };
  }

  function _readAiModLoaderCacheInfo() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) {
        resolve({ available: false, reason: 'indexedDB unavailable' });
        return;
      }
      var req;
      try {
        req = indexedDB.open('ModLoader_IndexDBLoader');
      } catch (e) {
        resolve({ available: false, reason: String(e && e.message || e) });
        return;
      }
      req.onerror = function () {
        resolve({ available: false, reason: String(req.error || 'open failed') });
      };
      req.onsuccess = function () {
        var db = req.result;
        var out = { available: true, hasAIStoryGenZip: false, zipBytes: 0, list: [] };
        try {
          if (!db.objectStoreNames || !db.objectStoreNames.contains('ModLoader_IndexDBLoader')) {
            db.close();
            resolve({ available: true, reason: 'store missing' });
            return;
          }
          var tx = db.transaction('ModLoader_IndexDBLoader', 'readonly');
          var st = tx.objectStore('ModLoader_IndexDBLoader');
          var zipReq = st.get('modDataIndexDBZip:AIStoryGen');
          var listReq = st.get('modDataIndexDBZipList');
          zipReq.onsuccess = function () {
            var value = zipReq.result;
            out.hasAIStoryGenZip = !!value;
            out.zipBytes = value && typeof value.length === 'number' ? value.length : 0;
          };
          listReq.onsuccess = function () {
            try {
              out.list = JSON.parse(listReq.result || '[]');
            } catch (_) {
              out.list = [];
            }
          };
          tx.oncomplete = function () {
            db.close();
            resolve(out);
          };
          tx.onerror = function () {
            db.close();
            resolve({ available: true, reason: String(tx.error || 'read failed') });
          };
        } catch (e2) {
          try { db.close(); } catch (_) {}
          resolve({ available: true, reason: String(e2 && e2.message || e2) });
        }
      };
    });
  }

  window.AIStoryGen.dumpDebugState = function () {
    var $passage = $('#passages .passage');
    return {
      version: window.AIStoryGen.VERSION || 'unknown',
      layout: _applyUILayoutMode('debug dump'),
      passage: (typeof State !== 'undefined' && State.passage) || null,
      controllerSchemas: _getAiControllerDebugState(),
      replace: {
        active: _aiReplaceActive,
        originPassage: _aiReplaceOriginPassage,
        targetLabel: _aiReplaceTargetLabel,
        targetPassage: _aiReplaceTargetPassage,
        roundCount: _aiReplaceRoundCount,
        locationArrived: _aiLocationArrived,
        currentLocationLabel: _aiCurrentLocationLabel,
        currentLocationPassage: _aiCurrentLocationPassage,
        lastLocationDecision: _cloneForAiSnapshot(_aiLastLocationDecision || null),
        availableDestinations: (_aiAvailableDestinations || []).slice(0, 20).map(function (d) {
          return { raw: d.raw, label: d.label, source: d.source || '' };
        }),
        sessionHTMLLen: (_aiReplaceSessionHTML || '').length,
        autoChoicesBusy: _autoChoicesBusy,
        roundHistoryLen: _aiRoundHistory.length,
        forwardStackLen: _aiForwardStack.length,
      },
      dom: {
        passageTextLen: ($passage.text() || '').trim().length,
        hasRegenBtn: $passage.find('.ai-regen-narrative-link').length > 0,
        hasBookmarkBtn: $passage.find('.ai-bookmark-link').length > 0,
        hasOriginalWrap: $passage.find('.ai-original-wrap').length > 0,
        originalWrapHidden: $passage.find('.ai-original-wrap').filter(function () {
          return this.style.display === 'none' || $(this).css('display') === 'none';
        }).length > 0,
        hasReplacedContent: $passage.find('.ai-replaced-content').length > 0,
        hasNarrativeWrap: $passage.find('.ai-narrative-wrap').length > 0,
        hasLoading: $passage.find('.ai-gen-loading').length > 0,
        aiInjectedLinks: $passage.find('.ai-injected-link').length,
        aiChoices: $('#passages .ai-choices').length,
        aiInjectedRows: $passage.find('.ai-injected-row').length,
      },
      panels: _getAiPanelDebugState(),
      storage: _getAiStorageDebugState(),
      nativeEventGuard: NativeEventGuard && typeof NativeEventGuard.getStatus === 'function' ? NativeEventGuard.getStatus() : null,
      cfg: (function () {
        var c = loadCfg();
        return {
          aiReplaceLinks: c.aiReplaceLinks,
          autoChoices: c.autoChoices,
          language: c.language,
          hasApiKey: _isApiConfigured(c),
          endpoint: c.endpoint || '',
        };
      })(),
    };
  };

  window.AIStoryGen.dumpDebugStateAsync = function () {
    var base = window.AIStoryGen.dumpDebugState();
    return _readAiModLoaderCacheInfo().then(function (cacheInfo) {
      base.modLoaderCache = cacheInfo;
      return base;
    });
  };

  window.AIStoryGen.tryAiBackward = _tryAiBackward;
  window.AIStoryGen.tryAiForward = _tryAiForward;
  window.AIStoryGen.debugPendingItemUses = function () {
    return _cloneForAiSnapshot(_pendingAiItemUses || []);
  };
  window.AIStoryGen.debugLastItemUses = function () {
    return _cloneForAiSnapshot(_lastAiItemsUsedForTurn || []);
  };

})();

