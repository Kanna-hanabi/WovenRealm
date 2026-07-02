/* ============================================================
 * AIPixelGen - Woven Realm image companion module
 * Macros: <<aipixelconfig>>  <<aipixelworkshop>>
 * Passages: AIPixelGen_Config, AIPixelGen_Workshop
 * Config key: localStorage["aiPixelGen_cfg"]
 * IDB:        AIPixelGen / history
 * ============================================================ */
(function () {
  'use strict';

  var APG_MODULE_SOURCE = (window.AIStoryGen && window.AIStoryGen.VERSION) ? 'AIStoryGen module' : 'standalone';
  if (window.AIPixelGen && window.AIPixelGen.__loaded) {
    try { console.log('[AIPixelGen] duplicate load skipped by ' + APG_MODULE_SOURCE); } catch (_) {}
    return;
  }
  window.AIPixelGen = window.AIPixelGen || {};
  window.AIPixelGen.__loaded = true;
  window.AIPixelGen.__source = APG_MODULE_SOURCE;
  window.AIPixelGen.__mergedModule = APG_MODULE_SOURCE === 'AIStoryGen module';

  // ---------- 1. 配置 ----------
  var CFG_KEY = 'aiPixelGen_cfg';
  var IDB_NAME = 'AIPixelGen';
  var IDB_STORE_CFG = 'settings';
  var IDB_STORE_HIST = 'history';
  var IDB_STORE_IMG_CACHE = 'imgCache';
  var _idbDB = null;
  var DEFAULT_WORLD_STYLE_PROMPT = 'near-modern British setting, contemporary English interiors and architecture, grounded small-town British environment style';

  var DEFAULT_CFG = {
    // 文本 LLM
    llmEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    llmKey: '',
    llmModel: 'deepseek-chat',
    // 图像 API
    imgEndpoint: 'https://api.siliconflow.cn/v1/images/generations',
    imgKey: '',
    imgModel: 'Tongyi-MAI/Z-Image-Turbo',
    imgApiType: 'siliconflow',
    promptProtocol: 'auto',
    imgSize: '1024x1024',
    imgSteps: 8,
    comfySampler: 'euler',
    comfyScheduler: 'normal',
    comfyCfgScale: 7,
    comfySeed: -1,
    specialSceneEnabled: 0,
    specialImgEndpoint: '',
    specialImgModel: '',
    specialImgSize: '1024x1024',
    specialImgSteps: 20,
    specialComfySampler: 'euler',
    specialComfyScheduler: 'normal',
    specialComfyCfgScale: 7,
    specialComfySeed: -1,
    specialPoseControlEnabled: 0,
    specialPoseControlNetModel: 'xinsir-controlnet-openpose-sdxl-1.0.safetensors',
    specialPoseControlStrength: 1.0,
    specialPoseControlEnd: 0.85,
    // 风格 / 后处理
    styleSuffix: 'DoL game style, 32-bit retro pixel art, side-view RPG sprite, transparent background, soft pastel colors, limited palette, hand-drawn 1px outline, clear silhouette, no text, no watermark',
    personalPrompt: 'polished visual novel game CG, clean linework, refined lighting, ' + DEFAULT_WORLD_STYLE_PROMPT,
    negativePrompt: 'text, watermark, logo, UI, menu, caption, extra fingers, malformed hands, bad anatomy, words, letters, signature, stamp, subtitle, floating text, distorted text, random characters, text overlay, trademark, copyright mark, graffiti, labels, numbers',
    compositionPreset: '',
    defaultStyleKey: 'dol_pixel',
    sceneStyleKey: 'dol_scene',
    poseStyleKey: 'dol_pixel',
    sceneStyleKeyMigrated: 1,
    sceneStyleMigrationVersion: 2,
    sceneStyleManualOverride: '',
    lockedAppearance: '',
    customStyles: [],
    npcAppearances: {},
    customNpcAppearances: '',
    paletteMode: 'dol',   // 'dol' | 'free'
    outputSize: 0,        // 0 = 不缩放; 32/64/128 ...
    // AIStoryGen 辅助
    aiStoryAssist: 1,          // 0=关 1=在 AIStoryGen 剧情旁显示绘图入口
    aiStorySceneButton: 1,     // 普通 AI 剧情场景图入口
    aiStorySceneBackend: 'network',
    aiStoryMinText: 80,        // 至少多少字的 AI 剧情才显示场景图按钮
  };

  function normalizeSpecialSceneDefaults(cfg) {
    cfg = cfg || {};
    if (!cfg.specialImgEndpoint
      || /^http:\/\/127\.0\.0\.1:8188\/?$/i.test(String(cfg.specialImgEndpoint).trim())
      || /^http:\/\/127\.0\.0\.1:45596\/?$/i.test(String(cfg.specialImgEndpoint).trim())
      || /^http:\/\/192\.168\.50\.141:45595\/?$/i.test(String(cfg.specialImgEndpoint).trim())) {
      cfg.specialImgEndpoint = DEFAULT_CFG.specialImgEndpoint;
    }
    if (!String(cfg.specialImgModel || '').trim()) cfg.specialImgModel = DEFAULT_CFG.specialImgModel;
    if (!String(cfg.specialImgSize || '').trim()) cfg.specialImgSize = DEFAULT_CFG.specialImgSize;
    if (!String(cfg.specialImgSteps || '').trim()) cfg.specialImgSteps = DEFAULT_CFG.specialImgSteps;
    if (!String(cfg.specialComfySampler || '').trim()) cfg.specialComfySampler = DEFAULT_CFG.specialComfySampler;
    if (!String(cfg.specialComfyScheduler || '').trim()) cfg.specialComfyScheduler = DEFAULT_CFG.specialComfyScheduler;
    if (cfg.specialComfyCfgScale === '' || cfg.specialComfyCfgScale == null) cfg.specialComfyCfgScale = DEFAULT_CFG.specialComfyCfgScale;
    if (cfg.specialComfySeed === '' || cfg.specialComfySeed == null) cfg.specialComfySeed = DEFAULT_CFG.specialComfySeed;
    if (cfg.specialPoseControlEnabled === '' || cfg.specialPoseControlEnabled == null) cfg.specialPoseControlEnabled = DEFAULT_CFG.specialPoseControlEnabled;
    if (!String(cfg.specialPoseControlNetModel || '').trim()) cfg.specialPoseControlNetModel = DEFAULT_CFG.specialPoseControlNetModel;
    if (cfg.specialPoseControlStrength === '' || cfg.specialPoseControlStrength == null) cfg.specialPoseControlStrength = DEFAULT_CFG.specialPoseControlStrength;
    if (cfg.specialPoseControlEnd === '' || cfg.specialPoseControlEnd == null) cfg.specialPoseControlEnd = DEFAULT_CFG.specialPoseControlEnd;
    if (Number(cfg.sceneStyleKeyMigrated || 0) !== 1) {
      if (!String(cfg.sceneStyleKey || '').trim() || String(cfg.sceneStyleKey || '') === 'dol_pixel') cfg.sceneStyleKey = 'dol_scene';
      cfg.sceneStyleKeyMigrated = 1;
    }
    if (Number(cfg.sceneStyleMigrationVersion || 0) < 2) {
      if (!String(cfg.sceneStyleKey || '').trim() || String(cfg.sceneStyleKey || '') === 'dol_pixel') cfg.sceneStyleKey = 'dol_scene';
      cfg.sceneStyleMigrationVersion = 2;
    }
    if (String(cfg.sceneStyleKey || '') === 'dol_pixel' && String(cfg.sceneStyleManualOverride || '') !== 'dol_pixel') {
      cfg.sceneStyleKey = 'dol_scene';
    }
    if (!cfg.npcAppearances || typeof cfg.npcAppearances !== 'object') cfg.npcAppearances = {};
    if (cfg.customNpcAppearances == null) cfg.customNpcAppearances = '';
    cfg.customStyles = normalizeCustomStyles(cfg.customStyles);
    if (!/^(network|local)$/i.test(String(cfg.aiStorySceneBackend || ''))) cfg.aiStorySceneBackend = DEFAULT_CFG.aiStorySceneBackend;
    return cfg;
  }

  function normalizeWorldStylePrompt(cfg) {
    cfg = cfg || {};
    var current = String(cfg.personalPrompt || '').trim();
    if (!current) {
      cfg.personalPrompt = DEFAULT_CFG.personalPrompt;
      return cfg;
    }
    if (!/near-modern British setting|contemporary English interiors|British environment style/i.test(current)) {
      cfg.personalPrompt = current.replace(/\s+$/g, '') + ', ' + DEFAULT_WORLD_STYLE_PROMPT;
    }
    return cfg;
  }

  function compactSettingText(s, maxLen) {
    s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return maxLen && s.length > maxLen ? s.slice(0, maxLen) : s;
  }

  function normalizeCustomStyles(styles) {
    var list = Array.isArray(styles) ? styles : [];
    var out = [];
    list.forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      var label = compactSettingText(s.label || s.name || '', 60);
      var prompt = compactSettingText(s.prompt || s.natural || '', 700);
      var tags = compactSettingText(s.tags || '', 700);
      if (label && (prompt || tags)) out.push({ label: label, prompt: prompt, tags: tags });
    });
    return out.slice(0, 30);
  }

  // ---------- 2. IndexedDB ----------
  function initIDB() {
    if (_idbDB) return Promise.resolve(_idbDB);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 2);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_CFG)) db.createObjectStore(IDB_STORE_CFG);
        if (!db.objectStoreNames.contains(IDB_STORE_HIST)) {
          db.createObjectStore(IDB_STORE_HIST, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(IDB_STORE_IMG_CACHE)) {
          db.createObjectStore(IDB_STORE_IMG_CACHE);
        }
      };
      req.onsuccess = function () { _idbDB = req.result; resolve(_idbDB); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(store, key) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var r = tx.objectStore(store).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbPut(store, value, key) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        if (key !== undefined) tx.objectStore(store).put(value, key);
        else tx.objectStore(store).put(value);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbAll(store) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var r = tx.objectStore(store).getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbDel(store, key) {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // 简单字符串 hash（djb2，32-bit，不需要密码强度）
  function strHash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h).toString(36);
  }

  // 插图缓存读写
  function getImgCache(key) {
    return idbGet(IDB_STORE_IMG_CACHE, key).then(function (r) {
      return r || null;
    });
  }
  function putImgCache(key, entry) {
    return idbPut(IDB_STORE_IMG_CACHE, entry, key);
  }
  function clearImgCache() {
    return initIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE_IMG_CACHE, 'readwrite');
        tx.objectStore(IDB_STORE_IMG_CACHE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      var cfg = Object.assign({}, DEFAULT_CFG, raw ? JSON.parse(raw) : {});
      normalizeSpecialSceneDefaults(cfg);
      return normalizeWorldStylePrompt(cfg);
    } catch (e) { return Object.assign({}, DEFAULT_CFG); }
  }
  function saveCfg(c) {
    normalizeSpecialSceneDefaults(c);
    normalizeWorldStylePrompt(c);
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { }
    try { idbPut(IDB_STORE_CFG, c, CFG_KEY).catch(function () { }); } catch (e) { }
  }
  function isAIPixelEnabled() {
    try {
      if (window.AIStoryGen && typeof window.AIStoryGen.loadCfg === 'function') {
        var storyCfg = window.AIStoryGen.loadCfg();
        return Number(storyCfg.aiPixelEnabled == null ? 1 : storyCfg.aiPixelEnabled) !== 0;
      }
    } catch (e) {}
    return true;
  }
  // Restore from IDB on startup
  try {
    idbGet(IDB_STORE_CFG, CFG_KEY).then(function (s) {
      if (s && typeof s === 'object' && s.imgEndpoint !== undefined) {
        var merged = Object.assign({}, DEFAULT_CFG, s);
        normalizeSpecialSceneDefaults(merged);
        normalizeWorldStylePrompt(merged);
        try { localStorage.setItem(CFG_KEY, JSON.stringify(merged)); } catch (e) { }
      }
    }).catch(function () { });
  } catch (e) { }

  // ---------- 3. 类别预设 ----------
  var CATEGORIES = {
    icon: {
      label: '图标 (icon)',
      hint: '游戏内 UI / 物品 / 状态图标，建议小尺寸、轮廓清晰、深色描边',
      stylePrompt: 'small game UI icon, centered subject, thick 1-2px dark outline, flat shading, ~64x64',
      defaultSize: 64,
      targetDir: 'img/misc/icon/',
    },
    prop: {
      label: '道具 (prop)',
      hint: '场景里的独立物件（武器、家具、容器等）',
      stylePrompt: 'isolated item sprite, side or 3/4 view, soft shading, no shadow on ground',
      defaultSize: 128,
      targetDir: 'img/misc/prop/',
    },
    location: {
      label: '地点缩略图 (location)',
      hint: '城市区域 / 室内场景的小幅展示图',
      stylePrompt: 'small landscape illustration, painted pixel style, atmospheric lighting',
      defaultSize: 256,
      targetDir: 'img/misc/locations/',
    },
    ambient: {
      label: '环境装饰 (ambient)',
      hint: '天空 / 雾气 / 雨雪 / 粒子等氛围图',
      stylePrompt: 'ambient overlay, soft gradient, semi-transparent feel, no hard subject',
      defaultSize: 256,
      targetDir: 'img/misc/ambient/',
    },
    concept: {
      label: '概念图 (concept)',
      hint: '不做后处理，自由风格的参考稿/草图',
      stylePrompt: 'concept art reference',
      defaultSize: 0,
      targetDir: '(自定义)',
    },
  };

  // ---------- 4. 文本 LLM 调用（DeepSeek） ----------
function resolveLLMCfg(cfg) {
    var out = Object.assign({}, cfg || {});
    var storyCfg = null;
    try {
      if (window.AIStoryGen && typeof window.AIStoryGen.loadCfg === 'function') {
        storyCfg = window.AIStoryGen.loadCfg();
      }
    } catch (e) { storyCfg = null; }
    if (!storyCfg) {
      try {
        var raw = localStorage.getItem('aiStoryGen_cfg');
        if (raw) storyCfg = JSON.parse(raw);
      } catch (e2) { storyCfg = null; }
    }
    if (storyCfg && !out.llmKey && storyCfg.apiKey) out.llmKey = storyCfg.apiKey;
    if (storyCfg && (!out.llmEndpoint || out.llmEndpoint === DEFAULT_CFG.llmEndpoint) && storyCfg.endpoint) out.llmEndpoint = storyCfg.endpoint;
    if (storyCfg && (!out.llmModel || out.llmModel === DEFAULT_CFG.llmModel) && storyCfg.model) out.llmModel = storyCfg.model;
    if (storyCfg && out.llmTemperature === undefined && storyCfg.temperature !== undefined) out.llmTemperature = storyCfg.temperature;
    if (storyCfg && out.llmMaxTokens === undefined && storyCfg.max_tokens !== undefined) out.llmMaxTokens = storyCfg.max_tokens;
    return out;
  }

  function callLLM(systemPrompt, userPrompt, cfg) {
    cfg = resolveLLMCfg(cfg || loadCfg());
    systemPrompt = sanitizeTextForJSON(systemPrompt);
    userPrompt = sanitizeTextForJSON(userPrompt);
    var localEndpoint = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(String(cfg.llmEndpoint || ''));
    if (!cfg.llmKey && !localEndpoint) return Promise.reject(new Error('LLM key not configured; set it in AI绘图 or AIStoryGen settings'));
    return fetch(cfg.llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cfg.llmKey ? 'Bearer ' + cfg.llmKey : '',
      },
      body: JSON.stringify({
        model: cfg.llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: cfg.llmTemperature !== undefined ? Number(cfg.llmTemperature) : 0.7,
        max_tokens: Number(cfg.llmMaxTokens || 400),
      }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('LLM HTTP ' + r.status + ': ' + t.slice(0, 200)); });
      return r.json();
    }).then(function (j) {
      var msg = j && j.choices && j.choices[0] && j.choices[0].message;
      var text = msg && msg.content ? msg.content : '';
      return String(text).trim();
    });
  }

  function expandPrompt(catKey, userText, cfg) {
    var cat = CATEGORIES[catKey] || CATEGORIES.icon;
    var sys = 'You are a senior pixel-art prompt engineer for the indie game Degrees of Lewdity (DoL). '
      + 'DoL uses small flat hand-drawn pixel sprites with limited palette, soft pastel tones, and clean outlines. '
      + 'Convert the user\'s short Chinese description into a single-line English Stable-Diffusion / Flux prompt. '
      + 'Rules: '
      + '(1) Output ONE line only, no quotes, no markdown, no explanation. '
      + '(2) Front-load the most important subject. '
      + '(3) Append concrete style descriptors. '
      + '(4) Never include words like "anime girl", "real photo", "3d render", "blurry", "text", "logo". '
      + '(5) Keep under 60 words.';
    var usr = '类别: ' + cat.label + '\n'
      + '类别风格补充: ' + cat.stylePrompt + '\n'
      + '用户描述（中文）: ' + userText + '\n'
      + '请输出英文 prompt（仅一行）：';
    return callLLM(sys, usr, cfg);
  }

  // ---------- 5a. <<aipixel>> 宏：插图按需生成 ----------
  var _pixelGenCounter = 0;
  var _activePixelGens = {};
  var _assistInjectTimer = null;
  var PROMPT_EDIT_TEXT_LIMIT = 12000;
  var PROMPT_TRANSLATE_TOKEN_MIN = 4096;

  var STYLE_PRESETS = {
    dol_pixel: {
      label: 'DoL像素风',
      prompt: 'DoL game style, retro pixel art, small sprite-like illustration, limited palette, clean 1px outline, soft pastel colors, readable silhouettes, no text, no watermark',
    },
    vn_illustration: {
      label: '视觉小说插画',
      prompt: 'visual novel scene illustration, clean line art, expressive lighting, soft cel shading, polished character composition, atmospheric background, no text, no watermark',
    },
    painterly: {
      label: '氛围厚涂',
      prompt: 'painterly atmospheric illustration, cinematic lighting, rich shadows, textured brushwork, dramatic mood, detailed environment, no text, no watermark',
    },
    anime_cg: {
      label: '精致CG',
      prompt: 'high quality anime game CG, refined linework, detailed lighting, polished composition, expressive pose, clean background detail, no text, no watermark',
    },
    cinematic: {
      label: '电影感',
      prompt: 'cinematic illustration, grounded lighting, strong composition, moody color grading, depth of field feel, realistic environment detail, no text, no watermark',
    },
    dol_scene: {
      label: 'DoL场景图',
      prompt: 'Degrees of Lewdity inspired scene illustration, small game scene, clear character and environment, muted clear colors, simple painterly pixel feel, clean unmarked image',
    },
    character_sheet: {
      label: '角色设定图',
      prompt: 'character design reference, full-body view, clear outfit details, readable silhouette, simple background, accurate clothing and accessories, no text, no watermark',
    },
    soft_watercolor: {
      label: '柔和水彩',
      prompt: 'soft watercolor illustration, gentle light, delicate colors, airy atmosphere, subtle paper texture, elegant composition, no text, no watermark',
    },
    bright_anime: {
      label: '明亮动画',
      prompt: 'bright anime illustration, clean colors, soft lighting, crisp outfit details, expressive but not exaggerated, polished game art, no text, no watermark',
    },
    gothic_mood: {
      label: '暗调哥特',
      prompt: 'dark gothic illustration, dramatic shadows, ornate environment, moody lighting, elegant silhouette, detailed fabric, no text, no watermark',
    },
    storybook: {
      label: '童话绘本',
      prompt: 'storybook illustration, whimsical atmosphere, soft shapes, warm lighting, detailed environment, gentle colors, no text, no watermark',
    },
  };

  var STYLE_PRESET_TAGS = {
    dol_pixel: 'pixel art, retro game style, small sprite, limited palette, clean outline, soft pastel colors, readable silhouette, no text, no watermark',
    vn_illustration: 'visual novel CG, clean lineart, soft cel shading, expressive lighting, atmospheric background, polished composition, no text, no watermark',
    painterly: 'painterly, atmospheric lighting, rich shadows, textured brushwork, dramatic mood, detailed environment, no text, no watermark',
    anime_cg: 'anime game CG, high quality, refined lineart, detailed lighting, polished composition, expressive pose, no text, no watermark',
    cinematic: 'cinematic lighting, strong composition, moody color grading, depth of field, realistic environment detail, no text, no watermark',
    dol_scene: 'Degrees of Lewdity inspired scene, small game scene, clear character, clear environment, muted clear colors, clean unmarked image',
    character_sheet: 'character design sheet, full body, clear outfit details, readable silhouette, simple background, accurate accessories, no text, no watermark',
    soft_watercolor: 'watercolor, soft colors, gentle lighting, airy atmosphere, paper texture, elegant composition, no text, no watermark',
    bright_anime: 'bright anime style, vivid colors, clean shading, crisp outfit details, polished game art, no text, no watermark',
    gothic_mood: 'gothic atmosphere, dramatic shadows, ornate environment, moody lighting, elegant silhouette, detailed fabric, no text, no watermark',
    storybook: 'storybook illustration, whimsical atmosphere, soft shapes, warm lighting, detailed environment, gentle colors, no text, no watermark',
  };

  function resolvePromptProtocol(cfg) {
    cfg = cfg || loadCfg();
    var p = String(cfg.promptProtocol || 'auto').toLowerCase();
    if (p === 'natural' || p === 'tags') return p;
    var api = String(cfg.imgApiType || 'siliconflow').toLowerCase();
    if (/sd|stable|webui|novel|nai|comfy/.test(api)) return 'tags';
    return 'natural';
  }

  function stylePresetPrompt(styleKey, cfg) {
    cfg = cfg || loadCfg();
    if (cfg && String(cfg._apgMode || '') === 'scene' && String(styleKey || '') === 'dol_pixel') styleKey = 'dol_scene';
    var extraStyle = cleanText(cfg.styleSuffix || '', 700);
    var defaultStyle = cleanText(DEFAULT_CFG.styleSuffix || '', 700);
    if (extraStyle === defaultStyle) extraStyle = '';
    if (cfg && String(cfg._apgMode || '') === 'scene' && /\b(?:sprite|transparent background|icon|isolated item)\b/i.test(extraStyle)) extraStyle = '';
    if (extraStyle && resolvePromptProtocol(cfg) === 'tags') extraStyle = toTagPrompt(extraStyle);
    function withExtraStyle(base) {
      base = cleanText(base || '', 1200);
      if (cfg && String(cfg._apgMode || '') === 'scene') {
        base = sanitizeScenePositivePrompt(base);
        extraStyle = sanitizeScenePositivePrompt(extraStyle);
      }
      if (!extraStyle) return base;
      if (base.indexOf(extraStyle) !== -1) return base;
      return cleanText([base, extraStyle].filter(Boolean).join(', '), 1400);
    }
    var custom = getCustomStyleByKey(styleKey, cfg);
    if (custom) {
      if (resolvePromptProtocol(cfg) === 'tags') return withExtraStyle(custom.tags || toTagPrompt(custom.prompt));
      return withExtraStyle(custom.prompt || custom.tags);
    }
    if (resolvePromptProtocol(cfg) === 'tags') {
      return withExtraStyle(STYLE_PRESET_TAGS[styleKey] || STYLE_PRESET_TAGS.dol_pixel);
    }
    return withExtraStyle((STYLE_PRESETS[styleKey] && STYLE_PRESETS[styleKey].prompt) || STYLE_PRESETS.dol_pixel.prompt);
  }

  function defaultStyleKeyForMode(cfg) {
    cfg = cfg || loadCfg();
    if (cfg && String(cfg._apgMode || '') === 'pose') return String(cfg.poseStyleKey || cfg.defaultStyleKey || 'dol_pixel');
    if (cfg && String(cfg._apgMode || '') === 'scene') return String(cfg.sceneStyleKey || 'dol_scene');
    return String(cfg.defaultStyleKey || 'dol_pixel');
  }

  function saveStyleKeyForMode(styleKey, cfg) {
    styleKey = String(styleKey || '').trim() || 'dol_pixel';
    var next = Object.assign({}, loadCfg());
    var mode = cfg && String(cfg._apgMode || '');
    if (mode === 'pose') next.poseStyleKey = styleKey;
    else if (mode === 'scene') {
      next.sceneStyleKey = styleKey;
      next.sceneStyleKeyMigrated = 1;
      next.sceneStyleManualOverride = styleKey;
    } else {
      next.defaultStyleKey = styleKey;
    }
    saveCfg(next);
    if (cfg) {
      cfg.defaultStyleKey = next.defaultStyleKey;
      cfg.poseStyleKey = next.poseStyleKey;
      cfg.sceneStyleKey = next.sceneStyleKey;
      cfg.sceneStyleKeyMigrated = next.sceneStyleKeyMigrated;
      cfg.sceneStyleManualOverride = next.sceneStyleManualOverride;
    }
  }

  function getCustomStyleByKey(styleKey, cfg) {
    styleKey = String(styleKey || '');
    var m = styleKey.match(/^custom:(\d+)$/);
    if (!m) return null;
    var list = normalizeCustomStyles((cfg || loadCfg()).customStyles);
    return list[Number(m[1])] || null;
  }

  function getStyleOptions(cfg) {
    cfg = cfg || loadCfg();
    var out = [];
    Object.keys(STYLE_PRESETS).forEach(function (k) {
      out.push({ key: k, label: STYLE_PRESETS[k].label });
    });
    normalizeCustomStyles(cfg.customStyles).forEach(function (s, i) {
      out.push({ key: 'custom:' + i, label: '自定义：' + s.label });
    });
    return out;
  }

  function toTagPrompt(text) {
    return cleanText(String(text || '')
      .replace(/\b(MANDATORY character design|must include exact character details|composition)\s*:/gi, '')
      .replace(/\b(Scene illustration prompt|Scene|Visual details|Time and lighting|Mood|Visible characters)\s*:/gi, '')
      .replace(/[。；;.!?！？]/g, ',')
      .replace(/[\r\n]+/g, ', ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/,\s*,+/g, ', ')
      .replace(/^\s*,\s*|\s*,\s*$/g, ''), 2200);
  }

  function adaptPromptForProtocol(prompt, cfg) {
    if (resolvePromptProtocol(cfg) === 'tags') return toTagPrompt(prompt);
    return cleanText(prompt, 2200);
  }

  function promptControlSignature(cfg) {
    cfg = cfg || loadCfg();
    return [
      'scenePromptRules-v19-scene-fact-bundle',
      cfg.imgApiType || '',
      cfg.promptProtocol || '',
      cfg.sceneStyleKey || '',
      cfg.defaultStyleKey || '',
      cfg.aiStorySceneBackend || '',
      cfg.specialSceneEnabled || '',
      cfg.specialImgEndpoint || '',
      cfg.specialImgModel || '',
      cfg.specialImgSize || '',
      cfg.specialImgSteps || '',
      cfg.specialComfySampler || '',
      cfg.specialComfyScheduler || '',
      cfg.specialComfyCfgScale || '',
      cfg.specialComfySeed || '',
      cfg.specialPoseControlEnabled || '',
      cfg.specialPoseControlNetModel || '',
      cfg.specialPoseControlStrength || '',
      cfg.specialPoseControlEnd || '',
      cfg.styleSuffix || '',
      cfg.lockedAppearance || '',
      cfg.personalPrompt || '',
      cfg.negativePrompt || '',
      cfg.compositionPreset || '',
      JSON.stringify(normalizeCustomStyles(cfg.customStyles)),
      JSON.stringify(cfg.npcAppearances || {}),
      cfg.customNpcAppearances || ''
    ].join('|');
  }

  function sanitizeScenePositivePrompt(s) {
    var original = String(s || '');
    var runtimePassage = currentPassageName();
    var runtimeIndoor = /^(Bathroom|Bedroom|Kitchen|Wardrobe|Bedroom Mirror)\b/i.test(String(runtimePassage || ''));
    var storyRoom = currentStoryRoomLocationPrompt();
    var storyRoomIndoor = !!storyRoom;
    var conflictIndoorArea = (runtimeIndoor || /(passage\s*:\s*(?:Bathroom|Bedroom|Kitchen|Wardrobe|Bedroom Mirror)\b|location\s*:\s*home\b)/i.test(original))
      && /area\s*:\s*(?:forest|woods|moor|beach|sea|town|underground)\b/i.test(original);
    var conflictIndoorOutdoor = runtimeIndoor && /\b(?:outside a cabin|forest|woods|trees|grass|cabin path)\b/i.test(original);
    var conflictStoryRoomOutdoor = storyRoomIndoor && /\b(?:outside a cabin|forest|woods|trees|grass|cabin path)\b/i.test(original);
    s = original;
    if (conflictIndoorArea || conflictIndoorOutdoor || conflictStoryRoomOutdoor) {
      var indoorLabel = storyRoom || (/^Bathroom\b/i.test(String(runtimePassage || '')) || /passage\s*:\s*Bathroom\b/i.test(original) ? 'indoor bathroom interior'
        : /^Kitchen\b/i.test(String(runtimePassage || '')) || /passage\s*:\s*Kitchen\b/i.test(original) ? 'indoor kitchen interior'
          : 'indoor home room');
      s = s
        .replace(/environment\s*:\s*outside a cabin(?:[^,.;]*)(?:,\s*(?:trees|forest|woods|grass|cabin path)[^,.;]*)*/gi, 'environment: ' + indoorLabel)
        .replace(/environment\s*:\s*(?:forest|woods|trees|grass|cabin path)(?:[^,.;]*)*/gi, 'environment: ' + indoorLabel)
        .replace(/outside a cabin(?:[^,.;]*)(?:,\s*(?:trees|forest|woods|grass|cabin path)[^,.;]*)*/gi, indoorLabel)
        .replace(/environment\s*:\s*outside a cabin[^,，。]*(?:[,，]\s*(?:trees|forest|woods|grass|cabin path)[^,，。]*)*/gi, 'environment: ' + indoorLabel)
        .replace(/outside a cabin[^,，。]*(?:[,，]\s*(?:trees|forest|woods|grass|cabin path)[^,，。]*)*/gi, indoorLabel)
        .replace(/\b(?:forest|woods|trees|grass|cabin path)\b/gi, 'interior details');
      if (/bathroom/i.test(indoorLabel)) {
        s = s.replace(/action\s*:\s*one hand rests[^,.;]*/gi, 'action: washing in the bathroom');
      }
    }
    s = s
      .replace(/scene metadata[:：][\s\S]*?(?=(?:player personal prompt preference|lighting\s*:|camera\s*:|style rules\s*:|$))/gi, ' ')
      .replace(/\bNO\s+TEXT\b/gi, 'clean unmarked image')
      .replace(/\bfollow the story text for time and lighting\b/gi, 'use visible time and lighting from the current scene')
      .replace(/\bstory text\b/gi, 'current scene')
      .replace(/\bclothing text\b/gi, 'clothing details')
      .replace(/\bplayer sidebar appearance and clothing text\b/gi, 'player visible appearance and clothing details')
      .replace(/\bplayer personal prompt preference\b/gi, 'player visual style preference')
      .replace(/\btextures?\b/gi, 'patterns')
      .replace(/\btextured\b/gi, 'painterly')
      .replace(/\bno\s+(?:readable\s+)?(?:text|letters|numbers|symbols|captions?|subtitles?|signage|watermarks?|logos?)\b/gi, 'clean unmarked image')
      .replace(/\b(?:readable\s+words?|written\s+text|wall\s+writing|floating\s+text|distorted\s+text|text\s+overlay|prompt\s+markup)\b/gi, 'plain blank surfaces')
      .replace(/\b(?:letters|numbers|captions?|subtitles?|signage|watermarks?|logos?|labels?)\b/gi, 'plain blank markings')
      .replace(/\b(?:posters?|screens?|signs?)\b/gi, 'blank unmarked display surface')
      .replace(/\bUI\b/g, 'in-world scene')
      .replace(/\binterface-like surfaces?\b/gi, 'flat surfaces')
      .replace(/\bgame interface elements?\b/gi, 'non-scene elements')
      .replace(/\bdebug overlays?\b/gi, 'non-scene artifacts')
      .replace(/\btext\b/gi, 'visual details')
      .replace(/一张无文字装饰海报正贴在墙上/g, '一张空白装饰画正贴在墙上')
      .replace(/无文字装饰海报/g, '空白装饰画')
      .replace(/没有可读数字/g, '表面空白')
      .replace(/可读文字|文字|数字|字幕|水印|标识|标签|海报/g, function (m) {
        if (m === '海报') return '装饰画';
        return '空白纹理';
      });
    return cleanText(s.replace(/\s*,\s*(?:,\s*)+/g, ', '), 0);
  }

  var NPC_APPEARANCE_PRESETS = [
    ['罗宾', ['Robin']], ['惠特尼', ['Whitney']], ['伊甸', ['Eden']], ['凯拉尔', ['Kylar']],
    ['悉尼', ['Sydney']], ['艾弗里', ['Avery']], ['巨鹰', ['Great Hawk', 'hawk']],
    ['黑狼', ['Black Wolf', 'wolf']], ['艾利克斯', ['Alex']], ['贝利', ['Bailey']],
    ['布莱尔', ['Briar', 'Blaire']], ['查里', ['Charlie']], ['达里尔', ['Daryl']],
    ['多伦', ['Doren', 'Dolan']], ['格威岚', ['Gwylan']], ['哈珀', ['Harper']],
    ['约旦', ['Jordan']], ['兰德里', ['Landry']], ['米奇', ['Mickey']],
    ['礼顿', ['Leighton']], ['梅森', ['Mason']], ['摩根', ['Morgan']],
    ['瑞沃', ['River']], ['萨姆', ['Sam']], ['西里斯', ['Sirris']],
    ['温特', ['Winter']], ['尼奇', ['Niki', 'Nikki']], ['奎恩', ['Quinn']],
    ['雷米', ['Remy']], ['伦恩', ['Wren']], ['泽菲尔', ['Zephyr']]
  ];

  function reEscape(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function sourceMentionsName(source, name, aliases) {
    source = String(source || '');
    if (!source) return false;
    if (name && /[\u3400-\u9fff]/.test(String(name)) && source.indexOf(name) !== -1) return true;
    if (name && !/[\u3400-\u9fff]/.test(String(name))) {
      var nameRe = new RegExp('(^|[^A-Za-z_])' + reEscape(name) + '([^A-Za-z_]|$)', 'i');
      if (nameRe.test(source)) return true;
    }
    aliases = aliases || [];
    return aliases.some(function (a) {
      if (!a) return false;
      var re = new RegExp('(^|[^A-Za-z_])' + reEscape(a) + '([^A-Za-z_]|$)', 'i');
      return re.test(source);
    });
  }

  function parseCustomNpcAppearances(text) {
    var list = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = cleanText(line, 900);
      if (!line) return;
      var m = line.match(/^([^:：=｜|]+)\s*[:：=｜|]\s*(.+)$/);
      if (!m) return;
      list.push({ name: cleanText(m[1], 80), desc: cleanText(m[2], 700), aliases: [] });
    });
    return list;
  }

  function collectMatchedNpcAppearancePrompt(sourceText, cfg) {
    cfg = cfg || loadCfg();
    var source = cleanText([
      sourceText,
      getVisiblePassageText(),
      currentPassageName(),
      collectOtherCharacterSummary(),
      collectPoseSummary()
    ].filter(Boolean).join('\n'), 6000);
    var entries = [];
    var seen = {};
    (NPC_APPEARANCE_PRESETS || []).forEach(function (r) {
      var name = r[0];
      var desc = cleanText((cfg.npcAppearances && cfg.npcAppearances[name]) || '', 700);
      if (!desc || !sourceMentionsName(source, name, r[1])) return;
      seen[name] = 1;
      entries.push(name + ': ' + desc);
    });
    parseCustomNpcAppearances(cfg.customNpcAppearances).forEach(function (r) {
      if (!r.name || !r.desc || seen[r.name]) return;
      if (!sourceMentionsName(source, r.name, r.aliases)) return;
      entries.push(r.name + ': ' + r.desc);
    });
    return entries.length ? 'NPC appearance references, highest priority for matching named characters: ' + entries.join('; ') : '';
  }

  function enforceLockedAppearance(promptText, cfg) {
    var locked = cfg && cfg.lockedAppearance ? cleanText(cfg.lockedAppearance, 700) : '';
    promptText = cleanText(promptText, 1200);
    if (!locked) return promptText;
    if (promptText.indexOf(locked) !== -1) return promptText;
    return cleanText('MANDATORY character design, highest priority: ' + locked + ', ' + promptText, 1800);
  }

  function shouldForceLockedAppearance(cfg) {
    cfg = cfg || {};
    return !!cfg.lockedAppearance && String(cfg._apgMode || '') !== 'scene';
  }

  function applyLockedAppearanceForMode(promptText, cfg) {
    promptText = cleanText(promptText, 1200);
    return shouldForceLockedAppearance(cfg) ? enforceLockedAppearance(promptText, cfg) : promptText;
  }

  function removeLockedAppearanceConflicts(promptText, cfg) {
    var locked = String((cfg && cfg.lockedAppearance) || '').toLowerCase();
    promptText = cleanText(promptText, 1600);
    if (!locked) return promptText;
    if (/miko|shrine maiden/.test(locked) && /red\s+and\s+white|red-white/.test(locked)) {
      promptText = promptText
        .replace(/\bblack\s+(?:japanese\s+)?(?:miko|shrine maiden)\s+(?:outfit|robe|dress|skirt)\b/gi, 'red and white miko outfit')
        .replace(/\bblack\s+(?:robe|dress|skirt)\b/gi, 'red and white miko outfit')
        .replace(/\bas\s+black\s+(?:japanese\s+)?(?:miko|shrine maiden)\s+(?:outfit|robe|dress|skirt)\b/gi, '');
    }
    return cleanText(promptText, 1600);
  }

  function normalizePosePromptConflicts(promptText, cfg) {
    promptText = cleanText(promptText, 1600);
    if (!cfg || cfg._apgMode !== 'pose') return promptText;
    return cleanText(promptText
      .replace(/\b(?:addon\s+)?close[-\s]?up\s+(?:camera\s+angle|composition|shot|view)\b/gi, 'medium-wide full-body two-character camera angle')
      .replace(/\bclose[-\s]?up\s+camera\b/gi, 'medium-wide full-body camera')
      .replace(/\bsolo\s+(?:portrait|pinup|character)\b/gi, 'two-character interaction scene'), 1600);
  }

  function buildStrictPoseLayoutPrompt(promptText, cfg) {
    if (!cfg || cfg._apgMode !== 'pose') return '';
    var V = getV();
    var src = cleanText([
      getVisiblePassageText(),
      promptText,
      collectPoseSummary()
    ].filter(Boolean).join(' '), 5000);
    var partner = inferPosePartnerLabel(src);
    var lines = [
      'STRICT POSE LAYOUT, highest priority: two visible characters interacting in one frame, not a seated solo portrait'
    ];
    if (/跪坐|跪在|kneeling|on knees/i.test(src)) {
      lines.push('player character is kneeling or sitting on knees in the scene');
    } else if (/仰躺|躺在|lying on (?:the )?back|on back/i.test(src)) {
      lines.push('player character is lying on back');
    } else if (/missionary/i.test(String(V.position || ''))) {
      lines.push('player character is lower in the frame while ' + partner + ' leans over them');
    }
    if (/谷仓|干草|hay|barn|farm room/i.test(src)) {
      lines.push('setting shows a farm barn or hay area around the characters');
    }
    if (/Alex|艾利克斯|农场姑娘|enemytype:\s*alex/i.test(src)) {
      lines.push('Alex is the second character, placed close to the player and visibly interacting');
    }
    if (/左手被握|左手.*(?:握|相扣)|lefthandholdkeep|holding.*left hand|left hand.*holding/i.test(src)) {
      lines.push(partner + " is holding the player's left hand");
    }
    if (/右手.*(?:菊穴|后庭|体内)|rightmasturbateanus|right hand.*(?:hip|back side|body)/i.test(src)) {
      lines.push("player's right hand is near their own hip and lower body");
    }
    if (/(?:脚|脚趾|foot|toe).*(?:小穴|花径|vulva|pelvis)|(?:小穴|花径|vulva|pelvis).*(?:脚|脚趾|foot|toe)/i.test(src)) {
      lines.push("player's foot is extended toward " + partner + "'s lower body");
    }
    if (/(?:撩|掀|lift|lifting).*(?:巫女服|裙|skirt|robe)|(?:巫女服|裙|skirt|robe).*(?:撩|掀|lift|lifting)/i.test(src)) {
      lines.push(partner + " is lifting or holding part of the player's robe or skirt");
    }
    lines.push('medium-wide full-body composition, show both characters from head to legs, keep hands and feet visible, prioritize body arrangement over portrait beauty');
    return cleanText(lines.join(', '), 1200);
  }

  function inferPosePartnerLabel(text) {
    var src = cleanText([text, getVisiblePassageText(), collectPoseSummary()].filter(Boolean).join(' '), 4000);
    if (/Alex|enemytype:\s*alex/i.test(src)) return 'Alex';
    if (/dog|hound|canine|\u72d7|\u6bcd\u72d7/i.test(src)) return 'the dog';
    if (/beast|animal|creature|\u517d/i.test(src)) return 'the beast partner';
    return 'the other visible character';
  }

  function extractCurrentSourcePromptLine(sourceText, label) {
    sourceText = String(sourceText || '');
    label = String(label || '');
    if (!sourceText || !label) return '';
    var re = new RegExp('(?:^|\\n)\\s*' + reEscape(label) + '\\s*:\\s*([^\\n]+)', 'i');
    var m = sourceText.match(re);
    return m && m[1] ? cleanGeneratedImagePrompt(m[1], 520) : '';
  }

  function rebuildValidatedScenePrompt(promptText, cfg) {
    cfg = cfg || loadCfg();
    var currentSourcePrompt = '';
    try {
      if (window.AIPixelGen && typeof window.AIPixelGen.buildAIStoryPrompt === 'function') {
        currentSourcePrompt = window.AIPixelGen.buildAIStoryPrompt('scene');
      }
    } catch (_) {}
    var plan = {
      scene: extractScenePromptField(promptText, 'environment'),
      characters: [
        extractScenePromptField(promptText, ['other visible subject', 'other visible subjects']),
        extractScenePromptField(promptText, ['visible subjects', 'visible subject'])
      ].filter(Boolean).join('; ').replace(/\bonly the player character\b|\bthe player character\b|\bplayer character\b/gi, ' '),
      action: extractScenePromptField(promptText, 'action'),
      props: extractScenePromptField(promptText, ['key props', 'props']),
      lighting: extractScenePromptField(promptText, 'lighting'),
      camera: extractScenePromptField(promptText, 'camera')
    };
    var facts = buildSceneVisualFacts(plan, extractPrimaryStoryText(currentSourcePrompt) || extractPrimaryStoryText(promptText), currentSourcePrompt || promptText, cfg);
    var promptParts = [
      'single objective scene image, one continuous camera view',
      facts.characterCount,
      visualLayer('player appearance', scenePromptField(extractScenePromptField(promptText, 'player appearance'), facts.playerVisual, 560)),
      facts.characters ? visualLayer('other visible subject', facts.characters) : '',
      visualLayer('environment', facts.location),
      visualLayer('action', facts.action),
      facts.props ? visualLayer('key props', facts.props) : '',
      visualLayer('lighting', facts.lighting),
      visualLayer('camera', facts.camera),
      'game scene illustration, clean linework, refined lighting'
    ];
    var out = validateSceneImagePrompt(promptParts.filter(Boolean).join(', '), facts.story, cfg);
    if (facts.action && !/\baction\s*:/i.test(out)) {
      out = out.replace(/,\s*lighting\s*:/i, ', action: ' + cleanGeneratedImagePrompt(facts.action, 460) + ', lighting:');
    }
    return out;
  }
  function composeFinalImagePrompt(promptText, styleSuffix, cfg) {
    cfg = cfg || loadCfg();
    promptText = cleanGeneratedImagePrompt(promptText, 1700);
    promptText = normalizePosePromptConflicts(promptText, cfg);
    promptText = removeLockedAppearanceConflicts(promptText, cfg);
    promptText = applyLockedAppearanceForMode(promptText, cfg);
    var parts = [];
    if (cfg && cfg._apgMode === 'scene') {
      var rebuiltScenePrompt = rebuildValidatedScenePrompt(promptText, cfg);
      var requiredCharacters = requiredNamedCharacterComposition(rebuiltScenePrompt, promptText);
      if (requiredCharacters) parts.push(requiredCharacters);
      parts.push(rebuiltScenePrompt);
      if (cfg.personalPrompt) parts.push('player image rules: ' + sanitizeScenePositivePrompt(cleanText(cfg.personalPrompt, 500)));
      if (cfg.compositionPreset) parts.push('composition: ' + cfg.compositionPreset);
      if (styleSuffix) parts.push('style rules: ' + sanitizeScenePositivePrompt(styleSuffix));
      var sceneJoined = sanitizeScenePositivePrompt(cleanText(parts.filter(Boolean).join(', '), 3000));
      return adaptPromptForProtocol(trimImagePromptCleanly(sceneJoined, 2200), cfg);
    }
    if (cfg && cfg._apgMode === 'pose') {
      var partner = inferPosePartnerLabel(promptText);
      parts.push('TWO-ACTOR INTERACTION SCENE, player character and ' + partner + ' must both be visible in the same frame, preserve the described interaction, do not draw a solo character portrait');
      parts.push(buildStrictPoseLayoutPrompt(promptText, cfg));
    }
    if (shouldForceLockedAppearance(cfg)) parts.push('must follow this character design exactly: ' + cleanText(cfg.lockedAppearance, 700));
    var npcPrompt = collectMatchedNpcAppearancePrompt(cfg && cfg._apgMode === 'scene' ? (getAIStoryText() || '') : promptText, cfg);
    if (npcPrompt && !(cfg && cfg._apgMode === 'scene' && hasCJKText(npcPrompt))) parts.push(npcPrompt);
    parts.push(cfg && cfg._apgMode === 'scene' ? removeCJKPromptFragments(promptText, 1600) : cleanText(promptText, 1600));
    if (styleSuffix) parts.push(styleSuffix);
    if (cfg && cfg.compositionPreset) parts.push('composition: ' + cfg.compositionPreset);
    else if (cfg && cfg._apgMode === 'pose') parts.push('composition: wider frame, two full bodies visible, interaction-focused scene');
    if (cfg && cfg.personalPrompt) parts.push(cleanText(cfg.personalPrompt, 500));
    var joined = parts.filter(Boolean).join(', ');
    if (cfg && cfg._apgMode === 'scene') joined = removeCJKPromptFragments(joined, 2200);
    if (cfg && cfg._apgMode === 'scene') joined = trimImagePromptCleanly(joined, 1100);
    return adaptPromptForProtocol(joined, cfg);
  }

  function hasCJKText(s) {
    return /[\u3400-\u9fff]/.test(String(s || ''));
  }

  function normalizePersonalPromptField(kind, text, cfg) {
    text = cleanText(text, 900);
    if (!text || !hasCJKText(text)) return Promise.resolve(text);
    var sys = 'You convert a player image-generation preference from Chinese into concise English prompt terms. '
      + 'Preserve every concrete visual detail. Do not add new character traits. '
      + 'Output only English comma-separated prompt terms, no quotes, no explanation.';
    var task = '';
    if (kind === 'lockedAppearance') {
      task = 'Translate and standardize this mandatory character appearance lock. Preserve outfit type, colors, wings, hair color, hair tips, hair length, accessories, and body-visible details exactly.';
    } else if (kind === 'negativePrompt') {
      task = 'Translate and standardize this negative prompt. Output things to avoid only, as comma-separated English negative prompt terms.';
    } else if (kind === 'npcAppearance') {
      task = 'Translate and standardize this NPC character appearance description. Preserve gender presentation, age impression, body type, hair, face, outfit, colors, accessories, species traits, and distinctive visual identity exactly. Output concise English image-generation prompt terms.';
    } else {
      task = 'Translate and standardize this personal style/content preference for image generation.';
    }
    return callLLM(sys, task + '\nChinese input:\n' + text, cfg).then(function (out) {
      out = cleanText(out, 900);
      return out || text;
    });
  }

  function translateImagePromptToChinese(promptText, cfg) {
    promptText = cleanText(promptText || '', PROMPT_EDIT_TEXT_LIMIT);
    if (!promptText) return Promise.reject(new Error('empty prompt'));
    var llmCfg = Object.assign({}, cfg || {}, { llmMaxTokens: Math.max(PROMPT_TRANSLATE_TOKEN_MIN, Number((cfg && cfg.llmMaxTokens) || 0)) });
    var sys = 'You translate image-generation prompts into concise Chinese for player editing. '
      + 'Preserve every visual fact, subject count, composition rule, negative/no-text rule, style, lighting, camera, outfit, prop, and location. '
      + 'Do not add new content. Do not stop mid-sentence. Output only Chinese text, no markdown, no quotes, no explanation.';
    var usr = 'Translate this English image prompt into editable Chinese:\n' + promptText;
    return callLLM(sys, usr, llmCfg).then(function (out) {
      return cleanText(out, PROMPT_EDIT_TEXT_LIMIT);
    });
  }

  function translateImagePromptToEnglish(promptText, cfg) {
    promptText = cleanText(promptText || '', PROMPT_EDIT_TEXT_LIMIT);
    if (!promptText) return Promise.reject(new Error('empty prompt'));
    var llmCfg = Object.assign({}, cfg || {}, { llmMaxTokens: Math.max(PROMPT_TRANSLATE_TOKEN_MIN, Number((cfg && cfg.llmMaxTokens) || 0)) });
    var sys = 'You translate a player-edited Chinese image-generation prompt back into concise English prompt terms. '
      + 'Preserve all player edits exactly as visual instructions. Keep explicit constraints such as no text, single subject, no extra people, camera, lighting, style, outfit, props, and location. '
      + 'Output only one English prompt, comma-separated natural prompt terms, no Chinese, no markdown, no quotes, no explanation.';
    var usr = 'Translate this edited Chinese image prompt into an English image-generation prompt:\n' + promptText;
    return callLLM(sys, usr, llmCfg).then(function (out) {
      var first = cleanGeneratedImagePrompt(out, PROMPT_EDIT_TEXT_LIMIT);
      if (first && !hasCJKText(first)) return first;
      var retrySys = sys + ' Your previous output was invalid or empty. You must output usable English image prompt terms only.';
      var retryUsr = 'Rewrite this Chinese image prompt as a usable English image-generation prompt. Output English only:\n' + promptText;
      return callLLM(retrySys, retryUsr, llmCfg).then(function (retryOut) {
        var second = cleanGeneratedImagePrompt(retryOut, PROMPT_EDIT_TEXT_LIMIT);
        if (second) return second;
        var raw = cleanText(retryOut || out || '', PROMPT_EDIT_TEXT_LIMIT);
        if (raw) return raw;
        throw new Error('no translated prompt');
      });
    });
  }

  function normalizePersonalSettingsForSave(next, cfg) {
    var jobs = [
      ['lockedAppearance', '角色外观锁定'],
      ['personalPrompt', '个人追加提示词'],
      ['negativePrompt', '负面提示词']
    ];
    var changed = [];
    var p = Promise.resolve();
    jobs.forEach(function (r) {
      p = p.then(function () {
        var before = String(next[r[0]] || '');
        return normalizePersonalPromptField(r[0], before, cfg).then(function (after) {
          if (after !== before) changed.push(r[1]);
          next[r[0]] = after;
        });
      });
    });
    return p.then(function () { return changed; });
  }

  function makePixelCacheKey(baseKey, promptText, styleKey) {
    return baseKey + '|' + styleKey + '|' + strHash(String(promptText || '').slice(0, 2000) + '|' + promptControlSignature(loadCfg()));
  }

  function specialSceneCfg(cfg) {
    cfg = Object.assign({}, cfg || loadCfg());
    return Object.assign({}, cfg, {
      imgApiType: 'comfyui',
      promptProtocol: 'tags',
      imgEndpoint: cfg.specialImgEndpoint || DEFAULT_CFG.specialImgEndpoint,
      imgKey: cfg.imgKey || '',
      imgModel: cfg.specialImgModel || '',
      imgSize: cfg.specialImgSize || cfg.imgSize || '1024x1024',
      imgSteps: Number(cfg.specialImgSteps || cfg.imgSteps || 20),
      comfySampler: cfg.specialComfySampler || cfg.comfySampler || 'euler',
      comfyScheduler: cfg.specialComfyScheduler || cfg.comfyScheduler || 'normal',
      comfyCfgScale: Number(cfg.specialComfyCfgScale || cfg.comfyCfgScale || 7),
      comfySeed: Number(cfg.specialComfySeed != null ? cfg.specialComfySeed : -1),
      specialPoseControlEnabled: Number(cfg.specialPoseControlEnabled || 0),
      specialPoseControlNetModel: cfg.specialPoseControlNetModel || '',
      specialPoseControlStrength: Number(cfg.specialPoseControlStrength || 1),
      specialPoseControlEnd: Number(cfg.specialPoseControlEnd || 0.85)
    });
  }

  function sceneRenderCfg(cfg) {
    cfg = cfg || loadCfg();
    return String(cfg.aiStorySceneBackend || 'network').toLowerCase() === 'local'
      ? specialSceneCfg(cfg)
      : cfg;
  }

  function readPixelControlState(instanceId, promptCN) {
    var $el = $('#' + instanceId);
    var styleKey = String($el.find('.apg-style-select').val() || 'dol_pixel');
    var edited = String($el.find('.apg-prompt-edit').val() || '').trim();
    return {
      styleKey: styleKey,
      promptText: edited || promptCN,
    };
  }

  function renderPixelSpinner(instanceId, startTime, phaseText) {
    var el = document.getElementById(instanceId);
    if (!el) return;
    var $sp = $('<div class="apg-pixel-spinner"><span></span><div class="apg-pixel-phase"></div></div>');
    $sp.attr('data-phase', phaseText || '生成中');
    $(el).empty().append($sp);
    function tick() {
      if (!document.getElementById(instanceId)) return;
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      $sp.find('span').text('⏳ ' + ($sp.attr('data-phase') || '生成中') + '… ' + elapsed + 's');
    }
    tick();
    var timer = setInterval(tick, 1000);
    if (_activePixelGens[instanceId]) _activePixelGens[instanceId].timer = timer;
  }

  function updatePixelSpinner(instanceId, phaseText) {
    var el = document.getElementById(instanceId);
    if (!el) return;
    var $sp = $(el).find('.apg-pixel-spinner');
    if (!$sp.length) return;
    $sp.attr('data-phase', phaseText || '生成中');
    $sp.find('.apg-pixel-phase').text(phaseText || '');
  }

  function openPixelImageModal(dataURL) {
    $('.apg-image-modal').remove();
    var $modal = $('<div class="apg-image-modal" role="dialog" aria-modal="true"></div>');
    var $inner = $('<div class="apg-image-modal-inner"></div>');
    var $close = $('<button type="button" class="apg-image-modal-close" title="关闭">×</button>');
    var $img = $('<img>').attr('src', dataURL).attr('alt', 'AI 插图原图');
    $inner.append($close).append($img);
    $modal.append($inner);
    $('body').append($modal);
    function close() { $modal.remove(); $(document).off('keydown.apgImageModal'); }
    $close.on('click', close);
    $modal.on('click', function (e) { if (e.target === $modal[0]) close(); });
    $(document).on('keydown.apgImageModal', function (e) { if (e.key === 'Escape') close(); });
  }

  function renderPixelImage(instanceId, dataURL, meta) {
    var el = document.getElementById(instanceId);
    if (!el) return;
    el.innerHTML = '';
    var $wrap = $('<div class="apg-pixel-result"></div>');
    if (meta && meta.cacheKeyBase) $wrap.attr('data-apg-key', meta.cacheKeyBase);
    if (meta && meta.promptModel) $wrap.attr('data-apg-model-prompt', meta.promptModel);
    var $open = $('<button type="button" class="apg-pixel-open" title="点击放大查看"></button>');
    $open.append($('<img>').attr('src', dataURL).attr('alt', 'AI 插图'));
    $open.on('click', function () { openPixelImageModal(dataURL); });
    $wrap.append($open);
    $wrap.append($('<div class="apg-pixel-open-hint">点击图片在游戏内放大查看</div>'));
    var $redo = $('<button class="apg-pixel-redo">重新生成</button>');
    $wrap.append($redo);
    $(el).append($wrap);
    if (meta && meta.cacheKeyBase && meta.promptCN && meta.cfg) {
      var $ctrl = $('<button class="apg-pixel-redo apg-pixel-controls-back">调整风格/提示词</button>');
      $ctrl.on('click', function () { renderPixelButton(instanceId, meta.cacheKeyBase, meta.promptCN, meta.cfg, meta.label); });
      $wrap.append($ctrl);
    }
    return $redo;
  }

  function renderPixelError(instanceId, cacheKey, promptCN, cfg, errMsg) {
    var el = document.getElementById(instanceId);
    if (!el) return;
    el.innerHTML = '';
    $(el).append($('<div class="apg-pixel-error"></div>').text('❌ ' + errMsg));
    var $retry = $('<button class="apg-pixel-retry">🔄 重试</button>');
    $retry.on('click', function () { renderPixelButton(instanceId, cacheKey, promptCN, cfg); });
    $(el).append($retry);
  }

function renderPixelButton(instanceId, cacheKeyBase, promptCN, cfg, label) {
    cfg = Object.assign({}, loadCfg(), cfg || {});
    var el = document.getElementById(instanceId);
    if (!el) return;
    el.innerHTML = '';
    var $controls = $('<div class="apg-pixel-controls"></div>');
    var $top = $('<div class="apg-pixel-control-row"></div>');
    var $style = $('<select class="apg-style-select" title="生图风格"></select>');
    getStyleOptions(cfg).forEach(function (s) {
      $style.append($('<option></option>').attr('value', s.key).text(s.label));
    });
    $style.val(defaultStyleKeyForMode(cfg));
    var $promptBtn = $('<button type="button" class="apg-pixel-btn apg-prompt-gen-btn">生成提示词</button>');
    var $adjustBtn = $('<button type="button" class="apg-pixel-btn apg-prompt-adjust-btn">调整提示词</button>');
    var $confirmPromptBtn = $('<button type="button" class="apg-pixel-btn apg-prompt-confirm-btn" style="display:none;">确定并生成图片</button>');
    var $imgBtn = $('<button type="button" class="apg-pixel-btn">生成图片</button>');
    var $oneClickBtn = $('<button type="button" class="apg-pixel-btn apg-oneclick-btn">一键生成图片</button>');
    var $status = $('<div class="apg-prompt-status"></div>');
    var initialPrompt = cfg && cfg._apgMode === 'scene'
      ? ''
      : ((/Scene illustration prompt|Story visual description|Exclude:|prompt markup/i.test(String(promptCN || '')) || String(promptCN || '').length > 600) ? '' : String(promptCN || ''));
    var $prompt = $('<textarea class="apg-prompt-edit" rows="5" placeholder="先点击“生成提示词”，确认或修改后再点击“生成图片”。"></textarea>')
      .val(initialPrompt);
    var promptEditMode = 'en';

    function setPromptVisible(visible) {
      $prompt.toggle(visible !== false);
    }
    function setBusy(busy, text) {
      $promptBtn.prop('disabled', busy);
      $adjustBtn.prop('disabled', busy);
      $confirmPromptBtn.prop('disabled', busy);
      $imgBtn.prop('disabled', busy);
      $oneClickBtn.prop('disabled', busy);
      if (text !== undefined) $status.text(text || '');
    }
    function currentState() {
      var styleKey = String($style.val() || defaultStyleKeyForMode(cfg));
      var promptText = String($prompt.val() || '').trim();
      return { styleKey: styleKey, promptText: promptText };
    }
    function currentPromptSource() {
      if (cfg && cfg._apgMode === 'scene' && window.AIPixelGen && typeof window.AIPixelGen.buildAIStoryPrompt === 'function') {
        var latest = window.AIPixelGen.buildAIStoryPrompt('scene');
        if (latest) return latest;
      }
      return promptCN;
    }
    function currentCacheKeyBase(sourceText) {
      if (cfg && cfg._apgMode === 'scene') {
        sourceText = sourceText || currentPromptSource();
        return strHash('assist|scene|' + currentPassageName() + '|' + cfg.imgModel + '|' + cfg.imgEndpoint + '|' + String(sourceText || '').slice(0, 1600));
      }
      return cacheKeyBase;
    }
    function clearConflictingScenePromptBox() {
      if (!(cfg && cfg._apgMode === 'scene')) return false;
      var val = String($prompt.val() || '').trim();
      if (!val || !isGeneratedImagePromptText(val)) return false;
      if (!scenePromptConflictsWithCurrentSource(val, currentPromptSource())) return false;
      $prompt.val('');
      promptEditMode = 'en';
      $status.text('已清除上一场景的旧生图提示词，请重新生成。');
      return true;
    }

    $prompt.on('input', function () {
      if (promptEditMode === 'zh') $status.text(String($prompt.val() || '').trim() ? '正在编辑中文提示词，确认后会自动翻译回英文并生成图片。' : '提示词为空。');
      else $status.text(String($prompt.val() || '').trim() ? '提示词可用，确认后点击“生成图片”。' : '提示词为空。');
    });
    $style.on('change', function () {
      var st = currentState();
      saveStyleKeyForMode(st.styleKey, cfg);
      if (!st.promptText) return;
      if (clearConflictingScenePromptBox()) return;
      var sourceText = currentPromptSource();
      var baseKey = currentCacheKeyBase(sourceText);
      var nextKey = makePixelCacheKey(baseKey, st.promptText, st.styleKey);
      getImgCache(nextKey).then(function (cached) {
        if (cached && cached.dataURL) renderPixelImage(instanceId, cached.dataURL, { cacheKeyBase: baseKey, promptCN: sourceText, cfg: cfg, label: label });
      }).catch(function () {});
    });
    function generatePromptIntoBox() {
      var sourceText = currentPromptSource();
      setPromptVisible(true);
      setBusy(true, '正在分析剧情并生成生图提示词...');
      return expandScenePrompt(sourceText, cfg)
        .then(function (eng) {
          var finalPrompt = applyLockedAppearanceForMode(cleanGeneratedImagePrompt(eng, 2200), cfg);
          if (cfg && cfg._apgMode === 'scene') finalPrompt = rebuildValidatedScenePrompt(finalPrompt, cfg);
          if (!finalPrompt) throw new Error('empty prompt');
          promptEditMode = 'en';
          $prompt.val(finalPrompt);
          $confirmPromptBtn.hide();
          $imgBtn.show();
          $status.text('提示词已生成，请确认或修改后点击“生成图片”。');
          return finalPrompt;
        })
        .catch(function (err) {
          console.warn('[AIPixelGen] prompt generation failed', err);
          if (!String($prompt.val() || '').trim()) $prompt.val('');
          var msg = (err && err.message) ? err.message : String(err || 'unknown error');
          if (msg.length > 120) msg = msg.slice(0, 120) + '...';
          $status.text('提示词生成失败：' + msg);
          throw err;
        })
        .then(function (finalPrompt) { setBusy(false); return finalPrompt; }, function (err) { setBusy(false); throw err; });
    }
    function generateImageFromPrompt(promptText) {
      var sourceText = currentPromptSource();
      var styleKey = String($style.val() || defaultStyleKeyForMode(cfg));
      saveStyleKeyForMode(styleKey, cfg);
      var finalPrompt = applyLockedAppearanceForMode(cleanGeneratedImagePrompt(promptText, 2200), cfg);
      if (cfg && cfg._apgMode === 'scene') finalPrompt = rebuildValidatedScenePrompt(finalPrompt, cfg);
      if (!finalPrompt) {
        setPromptVisible(true);
        $status.text('请先生成或填写生图提示词。');
        return;
      }
      var baseKey = currentCacheKeyBase(sourceText);
      var nextKey = makePixelCacheKey(baseKey, finalPrompt, styleKey);
      startPixelGen(instanceId, nextKey, finalPrompt, cfg, { styleKey: styleKey, cacheKeyBase: baseKey, originalPromptCN: sourceText, label: label });
    }

    $promptBtn.on('click', function () {
      generatePromptIntoBox().catch(function () {});
    });
    $adjustBtn.on('click', function () {
      function translateCurrentPrompt(engPrompt) {
        setPromptVisible(true);
        setBusy(true, '正在将英文提示词翻译成中文，可稍后手动调整...');
        return translateImagePromptToChinese(engPrompt, cfg)
          .then(function (zh) {
            if (!hasCJKText(zh || '')) throw new Error('translation did not return Chinese text');
            promptEditMode = 'zh';
            $prompt.val(zh || engPrompt);
            $imgBtn.hide();
            $confirmPromptBtn.show();
            $status.text('请修改中文提示词，完成后点击“确定并生成图片”。');
          })
          .catch(function (err) {
            var msg = (err && err.message) ? err.message : String(err || 'unknown error');
            if (msg.length > 120) msg = msg.slice(0, 120) + '...';
            $status.text('提示词翻译失败：' + msg);
            throw err;
          })
          .then(function () { setBusy(false); }, function (err) { setBusy(false); throw err; });
      }
      if (promptEditMode === 'zh' && hasCJKText(String($prompt.val() || ''))) {
        $status.text('当前已经是中文编辑模式，修改完成后点击“确定并生成图片”。');
        return;
      }
      var st = currentState();
      if (promptEditMode === 'zh') promptEditMode = 'en';
      if (st.promptText && promptEditMode === 'en') {
        translateCurrentPrompt(st.promptText).catch(function () {});
        return;
      }
      generatePromptIntoBox().then(translateCurrentPrompt).catch(function () {});
    });
    $confirmPromptBtn.on('click', function () {
      var zhPrompt = String($prompt.val() || '').trim();
      if (!zhPrompt) {
        $status.text('请先填写中文提示词。');
        return;
      }
      setBusy(true, '正在将中文提示词翻译回英文并生成图片...');
      translateImagePromptToEnglish(zhPrompt, cfg)
        .then(function (eng) {
          if (!eng) throw new Error('no translated prompt');
          promptEditMode = 'en';
          $prompt.val(eng);
          $confirmPromptBtn.hide();
          $imgBtn.show();
          $status.text('提示词已确认，正在生成图片...');
          generateImageFromPrompt(eng);
        })
        .catch(function (err) {
          var msg = (err && err.message) ? err.message : String(err || 'unknown error');
          if (/empty prompt|no translated prompt/i.test(msg)) msg = 'API 没有返回可用的英文提示词，请稍后重试，或先缩短中文提示词后再确认。';
          if (msg.length > 120) msg = msg.slice(0, 120) + '...';
          $status.text('提示词确认失败：' + msg);
        })
        .then(function () { setBusy(false); });
    });
    $imgBtn.on('click', function () {
      var st = currentState();
      if (promptEditMode === 'zh') {
        $confirmPromptBtn.trigger('click');
        return;
      }
      if (cfg && cfg._apgMode === 'scene' && (!st.promptText || isGeneratedImagePromptText(st.promptText))) {
        generatePromptIntoBox()
          .then(function (finalPrompt) {
            $status.text('提示词已按当前剧情生成，正在生成图片...');
            generateImageFromPrompt(finalPrompt);
          })
          .catch(function () {});
        return;
      }
      generateImageFromPrompt(st.promptText);
    });
    $oneClickBtn.on('click', function () {
      generatePromptIntoBox()
        .then(function (finalPrompt) {
          $status.text('提示词已生成，正在生成图片...');
          generateImageFromPrompt(finalPrompt);
        })
        .catch(function () {});
    });
    $top.append($style).append($promptBtn).append($adjustBtn).append($confirmPromptBtn).append($imgBtn).append($oneClickBtn);
    $controls.append($top).append($status).append($prompt);
    $(el).append($controls);
  }

  function startPixelGen(instanceId, cacheKey, promptText, cfg, opts) {
    opts = opts || {};
    var latestCfg = loadCfg();
    cfg = Object.assign({}, latestCfg, cfg || {});
    if (!cfg._apgMode && isPoseContext()) cfg._apgMode = 'pose';
    ['lockedAppearance', 'personalPrompt', 'negativePrompt', 'compositionPreset', 'paletteMode', 'outputSize', 'customStyles'].forEach(function (k) {
      cfg[k] = latestCfg[k];
    });
    if (cfg._apgMode === 'pose') {
      cfg = Object.assign(cfg, specialSceneCfg(latestCfg), { _apgMode: 'pose' });
    } else if (cfg._apgMode === 'scene' && String(latestCfg.aiStorySceneBackend || 'network').toLowerCase() === 'local') {
      cfg = Object.assign(cfg, specialSceneCfg(latestCfg), { _apgMode: 'scene' });
    }
    var el = document.getElementById(instanceId);
    if (!el) return;
    if (_activePixelGens[instanceId]) {
      if (_activePixelGens[instanceId].controller) _activePixelGens[instanceId].controller.abort();
      if (_activePixelGens[instanceId].timer) clearInterval(_activePixelGens[instanceId].timer);
    }
    var ac = new AbortController();
    _activePixelGens[instanceId] = { controller: ac, cacheKey: cacheKey };
    var startTime = Date.now();
    var styleKey = opts.styleKey || 'dol_pixel';
    var styleSuffix = stylePresetPrompt(styleKey, cfg);
    var finalPrompt = cleanGeneratedImagePrompt(promptText, 2200);
    var modelPrompt = composeFinalImagePrompt(finalPrompt, styleSuffix, cfg);
    renderPixelSpinner(instanceId, startTime, '正在调用生图模型');
    callImgAPI(modelPrompt, cfg)
      .then(function (rawURL) {
        if (ac.signal.aborted) throw { name: 'AbortError' };
        updatePixelSpinner(instanceId, '图片生成完成，正在处理预览');
        return postProcess(rawURL, cfg, 'concept');
      })
      .then(function (processedURL) {
        if (ac.signal.aborted) throw { name: 'AbortError' };
        if (_activePixelGens[instanceId] && _activePixelGens[instanceId].timer) clearInterval(_activePixelGens[instanceId].timer);
        delete _activePixelGens[instanceId];
        var meta = { cacheKeyBase: opts.cacheKeyBase, promptCN: opts.originalPromptCN || finalPrompt, promptModel: modelPrompt, cfg: cfg, label: opts.label };
        var $redo = renderPixelImage(instanceId, processedURL, meta);
        if ($redo) $redo.on('click', function () { startPixelGen(instanceId, cacheKey, finalPrompt, cfg, opts); });
        putImgCache(cacheKey, { dataURL: processedURL, promptCN: finalPrompt, promptEN: finalPrompt, styleKey: styleKey, stylePrompt: styleSuffix, model: cfg.imgModel, time: Date.now() }).catch(function () {});
      })
      .catch(function (err) {
        if (_activePixelGens[instanceId] && _activePixelGens[instanceId].timer) clearInterval(_activePixelGens[instanceId].timer);
        delete _activePixelGens[instanceId];
        if (err && err.name === 'AbortError') {
          var el2 = document.getElementById(instanceId);
          if (el2 && el2.innerHTML.indexOf('apg-pixel-spinner') !== -1) el2.innerHTML = '<div class="apg-pixel-error" style="color:#888;">已取消</div>';
          return;
        }
        var msg = (err && err.message) ? err.message : String(err);
        if (msg.length > 80) msg = msg.slice(0, 80) + '...';
        renderPixelError(instanceId, opts.cacheKeyBase || cacheKey, finalPrompt, cfg, msg);
      });
  }

  $(document).on(':passageend', function () {
    Object.keys(_activePixelGens).forEach(function (id) {
      var rec = _activePixelGens[id];
      if (rec && rec.controller) rec.controller.abort();
      if (rec && rec.timer) clearInterval(rec.timer);
    });
    _activePixelGens = {};
  });

// ---------- 5b. AIStoryGen 辅助：从 AI 剧情和当前状态提取画面 ----------
  function sourceMentionsVisibleNpc(src, englishName, chineseName) {
    src = String(src || '');
    if (!src) return false;
    if (englishName) {
      var enRe = new RegExp('(^|[^A-Za-z_])' + reEscape(englishName) + '([^A-Za-z_]|$)', 'i');
      if (enRe.test(src)) return true;
    }
    if (chineseName) {
      var idx = src.indexOf(chineseName);
      while (idx >= 0) {
        var after = src.slice(idx + chineseName.length, idx + chineseName.length + 8);
        if (!/^(?:\u5e84\u56ed|\u5b85\u90b8|\u5b85|\u5bb6|\u623f\u95f4|\u623f|\u5b9e\u9a8c\u5ba4|\u82b1\u56ed|\u5ead\u9662|\u5854|\u5c0f\u5c4b|\u519c\u573a|\u795e\u6bbf|\u5bfa\u5e99)/.test(after)) {
          return true;
        }
        idx = src.indexOf(chineseName, idx + chineseName.length);
      }
    }
    return false;
  }

  function collectStoryCharacterVisualHints(storyText, contextText) {
    var src = cleanText(storyText || '', 3000);
    var hints = [];
    function add(label) {
      if (!label || hints.indexOf(label) >= 0) return;
      hints.push(label);
    }
    if (sourceMentionsVisibleNpc(src, 'Alex', '\u4e9a\u5386\u514b\u65af') || sourceMentionsVisibleNpc(src, 'Alex', '\u827e\u5229\u514b\u65af')) add('Alex visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Robin', '\u7f57\u5bbe')) add('Robin visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Eden', '\u4f0a\u7538')) {
      if (/(\u540e\u80cc|\u80cc).{0,36}(\u80f8\u819b|\u6000\u91cc|\u80f8\u53e3)|(\u80f8\u819b|\u6000\u91cc|\u80f8\u53e3).{0,36}(\u540e\u80cc|\u80cc)|\bback\b.{0,48}\b(chest|arms|embrace)\b/i.test(src)) {
        add('Eden, named visible character, directly behind the player');
      } else {
        add('Eden visible in the scene');
      }
    }
    if (sourceMentionsVisibleNpc(src, 'Bailey', '\u8d1d\u5229')) add('Bailey visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Whitney', '\u60e0\u7279\u5c3c')) add('Whitney visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Avery', '\u827e\u5f17\u91cc')) add('Avery visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Kylar', '\u51ef\u62c9\u5c14')) add('Kylar visible in the scene');
    if (sourceMentionsVisibleNpc(src, 'Jordan', '\u7ea6\u65e6')) add('Jordan visible in the scene');
    if (/spouse|\u914d\u5076/i.test(src)) add('the player spouse visible in the scene');
    if (/harpy|\u54c8\u6bd4/i.test(src)) add('a visible harpy singing or perched nearby');
    if (isCurrentVisibleEagleMention(src)) add('a visible hawk or eagle presence');
    if (/tentacle|\u89e6\u624b/i.test(src)) add('visible tentacles if they are present in the story');
    if (/dog|hound|canine|\u72d7|\u730e\u72ac|\u72ac/i.test(src)) add('a visible dog or canine if present in the story');
    if (/wolf|\u72fc/i.test(src)) add('a visible wolf if present in the story');
    if (/horse|\u9a6c/i.test(src)) add('a visible horse if present in the story');
    return hints.join('; ');
  }

  function storyNamedCharacterLabels(characters) {
    var src = cleanGeneratedImagePrompt(characters, 420);
    var labels = [];
    function add(label, re) {
      if (re.test(src) && labels.indexOf(label) < 0) labels.push(label);
    }
    add('Alex', /Alex|\u4e9a\u5386\u514b\u65af|\u827e\u5229\u514b\u65af/i);
    add('Robin', /Robin|\u7f57\u5bbe/i);
    add('Eden', /Eden|\u4f0a\u7538/i);
    add('Bailey', /Bailey|\u8d1d\u5229/i);
    add('Whitney', /Whitney|\u60e0\u7279\u5c3c/i);
    add('Avery', /Avery|\u827e\u5f17\u91cc/i);
    add('Kylar', /Kylar|\u51ef\u62c9\u5c14/i);
    add('Jordan', /Jordan|\u7ea6\u65e6/i);
    return labels;
  }

  function npcSceneVisualDetail(label, storyText) {
    var story = cleanStoryForImagePrompt(storyText || '', 1000);
    if (label === 'Alex') {
      if (/(bed|bedroom|covers|pillow|\u5e8a|\u5367\u5ba4|\u88ab\u7a9d|\u6795|\u8eba|\u7761|\u73af\u4f4f|\u6402\u4f4f)/i.test(story)) {
        return 'Alex, second visible human figure, lying close beside the player on the same bed, partly under the same covers, arm around the player waist, readable as a separate person';
      }
      return 'Alex, second visible human figure, farm owner in practical farm clothes, close to the player and clearly present in the scene';
    }
    if (label === 'Robin') return 'Robin, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Eden') return 'Eden, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Bailey') return 'Bailey, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Whitney') return 'Whitney, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Avery') return 'Avery, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Kylar') return 'Kylar, second visible human figure, close to the player and clearly present in the scene';
    if (label === 'Jordan') return 'Jordan, second visible human figure, close to the player and clearly present in the scene';
    return label ? label + ', visible character clearly present in the scene' : '';
  }

  function expandVisibleCharacterPrompt(characters, storyText) {
    characters = cleanGeneratedImagePrompt(characters || '', 420);
    var names = storyNamedCharacterLabels(characters);
    if (!names.length) return characters;
    return cleanGeneratedImagePrompt(names.map(function (name) {
      return npcSceneVisualDetail(name, storyText);
    }).filter(Boolean).join('; '), 520);
  }

  function sceneCharacterCountPrompt(characters) {
    var names = storyNamedCharacterLabels(characters);
    characters = cleanGeneratedImagePrompt(characters || '', 420);
    if (!characters) {
      return 'visible subject: only the player character';
    }
    if (names.length === 1) {
      return 'visible subjects: exactly two complete visible human figures in one continuous frame: the player character and ' + names[0] + '; ' + names[0] + ' must be visible, not omitted, not cropped out, not hidden under bedding, not replaced by an empty pillow';
    }
    if (names.length > 1) {
      return 'visible subjects: the player character plus exactly these visible named characters in one continuous frame: ' + names.join(', ') + '; none of the named characters may be omitted, hidden, cropped out, or replaced by empty space';
    }
    return 'visible subjects: player character plus ' + characters;
  }

  function requiredNamedCharacterComposition(promptText, storyText) {
    var names = storyNamedCharacterLabels(promptText);
    if (!names.length) return '';
    var story = cleanStoryForImagePrompt(storyText || promptText || '', 1000);
    var bedScene = /(bed|bedroom|covers|pillow|\u5e8a|\u5367\u5ba4|\u88ab\u7a9d|\u6795|\u8eba|\u7761)/i.test(story + ' ' + promptText);
    if (names.length === 1 && names[0] === 'Alex' && bedScene) {
      return 'mandatory two-character composition: show the player and Alex as two separate visible people on the same bed, close together under the covers; Alex is visibly beside the player with an arm around the player waist; do not make this a solo image';
    }
    if (names.length === 1) {
      return 'mandatory two-character composition: show the player and ' + names[0] + ' as two separate visible people in the same frame; do not make this a solo image';
    }
    return 'mandatory multi-character composition: show the player and all named visible characters in the same frame: ' + names.join(', ') + '; do not omit any named character';
  }


  function useEnglishVisualField(value, fallback, maxLen) {
    value = cleanGeneratedImagePrompt(value || '', maxLen || 360);
    fallback = cleanGeneratedImagePrompt(fallback || '', maxLen || 360);
    if (hasCJKText(fallback) || isGeneratedImagePromptText(fallback)) fallback = '';
    if (!value) return fallback;
    if (hasCJKText(value)) return fallback;
    if (isGeneratedImagePromptText(value)) return fallback;
    if (hasPromptContextLeak(value)) return fallback;
    return value;
  }

  function hasPromptContextLeak(value) {
    return /(CURRENT\s+GAME\s+STATE|CURRENT\s+STORY|CURRENT\s+VISUAL\s+ACTION|PLAYER\s+(?:POSITIVE|NEGATIVE|APPEARANCE|COMPOSITION|CURRENT)|SUPPORTING\s+CONTEXT|INSTRUCTION\s*:|SOURCE\s+STORY|passage\s*:|location\s*:|nearby\s*:|atmosphere\s*:|time\s*:|area\s*:)/i.test(String(value || ''));
  }

  function extractScenePromptField(prompt, labels) {
    prompt = String(prompt || '');
    labels = Array.isArray(labels) ? labels : [labels];
    var labelPattern = labels.map(reEscape).join('|');
    var nextPattern = 'visible subject(?:s)?|player appearance|other visible subject|environment|action|key props|lighting|camera|style rules|player image rules|composition|negative';
    var re = new RegExp('(?:^|,\\s*)(' + labelPattern + ')\\s*:\\s*([\\s\\S]*?)(?=,\\s*(?:' + nextPattern + ')\\s*:|$)', 'i');
    var m = prompt.match(re);
    return m && m[2] ? cleanGeneratedImagePrompt(m[2], 700) : '';
  }

  function scenePromptField(value, fallback, maxLen) {
    value = cleanGeneratedImagePrompt(value || '', maxLen || 360);
    fallback = cleanGeneratedImagePrompt(fallback || '', maxLen || 360);
    if (!value || hasCJKText(value) || isGeneratedImagePromptText(value) || hasPromptContextLeak(value)) return fallback;
    return value;
  }

  function visualLayer(label, value) {
    value = cleanGeneratedImagePrompt(value || '', 700);
    return value ? label + ': ' + value : '';
  }

  function isConcreteLocalSceneAction(action) {
    return /blackberr|berries|berry|bramble|hedge|shears|thorn|pale eyes|laboratory|chemical|glassware|bathroom|shower|wash|bedroom|wardrobe|hearth|embers|study|library|bookshelf|bookcase|desk papers|old book|moonlight|burned mark/i.test(String(action || ''));
  }

  function extractKeyPropsFromStory(story) {
    var src = cleanStoryForImagePrompt(story || '', 1200);
    var props = [];
    function add(text) {
      if (text && props.indexOf(text) < 0) props.push(text);
    }
    if (/old book|book|bookshelf|bookcase|paper|letter|burn mark|\u65e7\u4e66|\u4e66\u67b6|\u4e66\u67dc|\u4fe1\u7eb8|\u7eb8|\u7126\u75d5|\u70e7\u707c/i.test(src)) add('old book, blank desk papers, burned paper mark');
    if (/blackberr|berries|berry|bramble|\u9ed1\u8393|\u6811\u8393|\u6d46\u679c|\u8346\u68d8/i.test(src)) add('thorny brambles and gathered dark berries');
    if (/hedge|shears|scissors|\u6811\u7bf1|\u526a\u5200|\u5927\u526a\u5200/i.test(src)) add('large shears and overgrown thorny hedge');
    if (/hearth|fire pit|embers|twigs|moss|\u706b\u5751|\u7089\u5e8a|\u4f59\u70ec|\u70ad\u7c92|\u82d4\u85d3|\u7ec6\u679d/i.test(src)) add('hearth, ash, glowing embers, dry moss and twigs');
    if (/bathroom|bath|shower|wash|\u6d74\u5ba4|\u6d17\u6fa1|\u6dcb\u6d74|\u6e05\u6d17/i.test(src)) add('water, bathroom fixtures, wet surfaces');
    return cleanGeneratedImagePrompt(props.join(', '), 260);
  }

  function buildSceneVisualFacts(plan, sourceStory, contextText, cfg) {
    cfg = cfg || loadCfg();
    plan = plan || {};
    var scene = collectSceneData();
    var story = cleanStoryForImagePrompt(
      sourceStory
        || extractPrimaryStoryText(contextText)
        || getAINarrativeTextForImage()
        || getAIStoryText()
        || getVisiblePassageText(),
      1000
    );
    var planCharacters = useEnglishVisualField(plan.characters, '', 320);
    var fallbackCharacters = collectStoryCharacterVisualHints(story, contextText || '');
    var characters = filterVisibleCharactersForStory(planCharacters || fallbackCharacters, story);
    characters = expandVisibleCharacterPrompt(characters, story);
    var sourceAction = visualActionPrompt(story);
    var planAction = useEnglishVisualField(plan.action, '', 460);
    if (scenePromptConflictsWithCurrentSource(planAction, story)) planAction = '';
    var action = (sourceAction && (isConcreteLocalSceneAction(sourceAction) || !planAction)) ? sourceAction : planAction;
    if (!action) action = sourceAction;
    if (!/[A-Za-z0-9\u3400-\u9fff]/.test(action) || /^[\s?锛?,;:!锛?]+$/.test(action)) action = '';
    if (hasCJKText(action)) action = visualActionPrompt(story);
    return {
      story: story,
      scene: scene,
      characters: characters,
      characterCount: sceneCharacterCountPrompt(characters),
      playerVisual: cleanGeneratedImagePrompt(collectPlayerSceneVisualPrompt(cfg), 560),
      location: cleanGeneratedImagePrompt(sceneLocationPrompt(scene, story) || useEnglishVisualField(plan.scene, '', 260), 260),
      action: cleanGeneratedImagePrompt(action, 460),
      props: useEnglishVisualField(plan.props, extractKeyPropsFromStory(story), 260),
      lighting: useEnglishVisualField(plan.lighting, inferVisualTimeHint(story, scene), 180),
      camera: useEnglishVisualField(plan.camera, 'medium story CG shot, environment and immediate action readable, no crowd composition', 180)
    };
  }

  function scenePromptConflictsWithCurrentSource(promptText, sourceText) {
    promptText = cleanGeneratedImagePrompt(promptText || '', 900).toLowerCase();
    sourceText = cleanStoryForImagePrompt(sourceText || getAIStoryText() || getVisiblePassageText(), 1400);
    var room = inferRoomLocationFromStory(sourceText).toLowerCase();
    var passage = String(currentPassageName() || '').toLowerCase();
    var promptLab = /laboratory|chemical|chemistry|glassware|workbench|manor lab/.test(promptText);
    var promptBath = /bathroom|bath|shower|wash/.test(promptText);
    var promptBedroom = /bedroom|bed|wardrobe/.test(promptText);
    if ((room.indexOf('bedroom') >= 0 || /kylar room|bedroom/.test(passage)) && (promptLab || promptBath)) return true;
    if ((room.indexOf('bathroom') >= 0 || /bathroom/.test(passage)) && (promptLab || promptBedroom)) return true;
    if ((/manor lab/.test(passage) || /laboratory|chemical|\u5b9e\u9a8c\u5ba4|\u5316\u5b66/.test(sourceText)) && (promptBath || promptBedroom)) return true;
    return false;
  }

  function removeCJKPromptFragments(prompt, maxLen) {
    var kept = [];
    cleanText(prompt || '', 0).split(/\s*,\s*|\s*;\s*/).forEach(function (part) {
      part = cleanText(part, 420);
      if (!part || hasCJKText(part)) return;
      kept.push(part);
    });
    return trimImagePromptCleanly(kept.join(', '), maxLen || 2200);
  }

  function filterVisibleCharactersForStory(characters, storyText) {
    characters = cleanGeneratedImagePrompt(characters, 360);
    var story = cleanText(storyText || '', 3000);
    if (!characters) return '';
    var out = [];
    characters.split(/\s*;\s*|\s*,\s*/).forEach(function (part) {
      part = cleanText(part, 180);
      if (!part) return;
      var lower = part.toLowerCase();
      var matchedKnown = false;
      var keep = false;
      (NPC_APPEARANCE_PRESETS || []).forEach(function (r) {
        if (keep) return;
        var name = r[0];
        var aliases = r[1] || [];
        var mentionsPart = false;
        if (name && /[\u3400-\u9fff]/.test(String(name)) && part.indexOf(name) !== -1) mentionsPart = true;
        aliases.forEach(function (a) {
        if (mentionsPart || !a) return;
          var re = new RegExp('(^|[^A-Za-z_])' + reEscape(a) + '([^A-Za-z_]|$)', 'i');
          if (re.test(part)) mentionsPart = true;
        });
        if (!mentionsPart) return;
        matchedKnown = true;
        if (sourceMentionsName(story, name, aliases)) keep = true;
      });
      if (/hawk|eagle|\u9e70|\u96c4\u9e70|\u5de8\u9e70|\u5927\u9e70/i.test(part)) {
        matchedKnown = true;
        if (isCurrentVisibleEagleMention(story)) keep = true;
      }
      if (/(tentacle|\u89e6\u624b)/i.test(part)) {
        matchedKnown = true;
        if (/(tentacle|\u89e6\u624b)/i.test(story)) keep = true;
      }
      if (/\b(dog|hound|canine|wolf|horse)\b|\u72d7|\u730e\u72ac|\u72ac|\u72fc|\u9a6c/i.test(part)) {
        matchedKnown = true;
        if (/\b(dog|hound|canine|wolf|horse)\b|\u72d7|\u730e\u72ac|\u72ac|\u72fc|\u9a6c/i.test(story)) keep = true;
      }
      if (!matchedKnown && !/visible in the scene|visible story|character|npc|entity|presence/i.test(lower)) keep = true;
      if (keep && out.indexOf(part) < 0) out.push(part);
    });
    return cleanGeneratedImagePrompt(out.join('; '), 320);
  }

  function isCurrentVisibleEagleMention(text) {
    var src = cleanText(text, 3000);
    if (!/(hawk|eagle|\u9e70|\u96c4\u9e70|\u5de8\u9e70|\u5927\u9e70)/i.test(src)) return false;
    var historyOnly = /(last night|previously|earlier|\u6628\u591c|\u66fe\u7ecf|\u5148\u524d|\u4e4b\u524d).{0,60}(hawk|eagle|\u9e70|\u96c4\u9e70|\u5de8\u9e70|\u5927\u9e70)|(hawk|eagle|\u9e70|\u96c4\u9e70|\u5de8\u9e70|\u5927\u9e70).{0,60}(last night|previously|earlier|\u6628\u591c|\u66fe\u7ecf|\u5148\u524d|\u4e4b\u524d|\u5e26\u56de|\u7559\u4e0b|\u75d5\u8ff9)/i.test(src);
    var visibleNow = /(perched|singing|circling|flying|visible|nearby|edge|roost|\u9ad8\u6b4c|\u76d8\u65cb|\u98de|\u8eab\u5f71|\u6816\u6728|\u5854\u7684\u8fb9\u7f18|\u5854\u8fb9|\u9644\u8fd1|\u773c\u524d|\u770b\u89c1)/i.test(src);
    return visibleNow && !historyOnly;
  }

  function inferRoomLocationFromStory(story) {
    var src = cleanStoryForImagePrompt(story || '', 1400);
    if (!src) return '';
    if (/bathroom|bath|shower|wash|\u6d74\u5ba4|\u6d17\u6fa1|\u6dcb\u6d74|\u6e05\u6d17|\u51b2\u6d17|\u6c90\u6d74/i.test(src)) {
      return 'indoor bathroom, home';
    }
    if (/bedroom|bed|wardrobe|\u5367\u5ba4|\u5e8a|\u8863\u6a71|\u8863\u67dc/i.test(src)) {
      return 'indoor bedroom, home';
    }
    if (/kitchen|\u53a8\u623f|\u7089\u7076|\u9505|\u505a\u996d|\u70f9\u996a/i.test(src)) {
      return 'indoor kitchen, home';
    }
    return '';
  }

  function currentStoryRoomLocationPrompt() {
    return inferRoomLocationFromStory(getAINarrativeTextForImage() || getAIStoryText() || getVisiblePassageText());
  }

  function sceneLocationPrompt(scene, story) {
    var passage = currentPassageName();
    var safeArea = scene && shouldUseSceneAreaForPrompt(passage, scene.location, scene.area) ? scene.area : '';
    var loc = cleanText([passage, scene && scene.location, safeArea].filter(Boolean).join(', '), 180);
    var storyRoom = inferRoomLocationFromStory(story);
    if (storyRoom) return storyRoom;
    if (/^Bathroom\b/i.test(passage)) return 'indoor bathroom, home';
    if (/^Bedroom\b/i.test(passage)) return 'indoor bedroom, home';
    if (/^Kitchen\b/i.test(passage)) return 'indoor kitchen, home';
    if (/^Wardrobe\b|Bedroom Mirror/i.test(passage)) return 'indoor bedroom dressing area, home';
    return loc || 'current story location';
  }

  function chineseStoryActionPrompt(src) {
    src = cleanStoryForImagePrompt(src || '', 1200);
    var known = [];
    function add(text) {
      if (text && known.indexOf(text) < 0) known.push(text);
    }
    if (/暗红|原石|红色.{0,8}石|石面|卡榫/.test(src)) add('holding a dark red rough stone in both hands');
    if (/石柱|柱身|侧廊石柱|凹槽|凹陷|刻痕|环形曲线|风化/.test(src)) add('examining a weathered temple stone pillar with carved grooves and a shallow circular socket');
    if (/约旦|Jordan/.test(src)) add('Jordan stands nearby and points toward the carved stone socket');
    if (/烛光|蜡烛|昏暗/.test(src)) add('dim candlelight casts shadows across the temple corridor');
    if (/笔记本|描摹|记录/.test(src)) add('taking notes or sketching the carved pattern in a notebook');
    if (/贴合|嵌入|放入|托近|试探/.test(src)) add('carefully testing whether the stone fits into the circular recess');
    if (/神殿|圣殿|Temple Jordan/.test(src) && !known.length) add('standing inside the temple and examining the nearby architecture');
    return cleanGeneratedImagePrompt(known.join(', '), 520);
  }

  function visualActionPrompt(story) {
    var src = cleanStoryForImagePrompt(story, 900);
    var labSignal = /laboratory|chemical|chemistry|Manor Lab|\u5b9e\u9a8c\u5ba4|\u5316\u5b66/i.test(src)
      || ((/\blab\b|\u8f9b\u8fa3|\u523a\u9f3b|pungent/i.test(src))
        && /glassware|beaker|test tube|reagent|workbench|shelf|bottle|\u73bb\u7483|\u70e7\u676f|\u8bd5\u7ba1|\u8bd5\u5242|\u5de5\u4f5c\u53f0|\u74f6/i.test(src));
    if (labSignal) {
      return 'the player stands inside a manor laboratory, observing chemical equipment and shelves of lab materials, pungent chemical atmosphere visible through glassware, bottles, and workbenches';
    }
    if (/study|library|bookshelf|bookcase|desk|letter|paper|old book|corridor|hallway|moonlight|burn mark|\u4e66\u623f|\u4e66\u67dc|\u4e66\u67b6|\u4e66\u684c|\u4fe1\u7eb8|\u7eb8\u58a8|\u65e7\u4e66|\u8d70\u5eca|\u95e8\u7f1d|\u6708\u5149|\u70e7\u707c|\u7126\u75d5|\u7070\u70ec/i.test(src)) {
      return 'the player explores a dim manor study or hallway, bookshelves, desk papers, an old book, moonlight, old wood interior, and a burned mark on paper as the key detail';
    }
    if (/hedge|hedges|trim|trimming|prune|pruning|shears|scissors|\u4fee\u526a|\u526a\u5200|\u5927\u526a\u5200|\u6811\u7bf1|\u6811\u679d|\u5e26\u523a|\u82cd\u767d.{0,8}\u773c|\u773c\u775b/i.test(src)) {
      return 'the player trims an overgrown thorny garden hedge with large shears, twisted thorn branches surrounding the garden, pale eyes faintly visible through the branches, tense manor garden atmosphere';
    }
    if (/blackberr|berries|berry|fruit|bramble|\u9ed1\u8393|\u6811\u8393|\u6d46\u679c|\u6c34\u679c|\u91c7\u6458|\u91c7\u96c6|\u6458|\u62ff\u8d77|\u8346\u68d8/i.test(src)) {
      return 'the player stands on tiptoe beside thorny brambles, reaching upward to pick ripe blackberries, holding freshly gathered dark berries, the berry bushes and harvest action clearly visible';
    }
    if (/bathroom|bath|shower|wash|\u6d74\u5ba4|\u6d17\u6fa1|\u6dcb\u6d74|\u6e05\u6d17|\u51b2\u6d17|\u6c90\u6d74/i.test(src)) {
      return 'the player washes in the bathroom, water and bathroom fixtures visible, calm indoor bathing scene';
    }
    if (/(躺下|躺在|躺回|偎在|被窝|床垫|枕|闭上眼|睡|入睡|困意|怀里|身边|环住|搂住|额头.{0,12}后颈|呼吸.{0,16}颈侧|lying|lies down|lying on|in bed|under the covers|beside|embrace|arm around|falling asleep)/i.test(src)
      && /(床|卧室|被窝|床垫|枕|bed|bedroom|covers)/i.test(src)) {
      if (/Alex|艾利克斯|亚历克斯/i.test(src)) {
        return 'the player lies on a bed beside Alex, both figures close under the covers, Alex resting an arm around the player waist, quiet addon bedroom scene, relaxed sleeping posture';
      }
      return 'the player lies down on the bed under the covers, relaxed resting posture, bedroom furniture visible around the bed';
    }
    if (/(坐起|坐在|坐到|床边|椅子|凳|sit|sitting|seated)/i.test(src)
      && /(床|卧室|椅|bed|bedroom|chair)/i.test(src)) {
      return 'the player sits on the bed or nearby seat, body posture clearly seated, bedroom furniture visible';
    }
    if (/(跪|跪坐|膝|kneel|kneeling|on knees)/i.test(src)) {
      return 'the player kneels in the current scene, knees on the floor or bed, posture clearly kneeling, story-relevant props nearby';
    }
    if (/bedroom|bed|wardrobe|\u5367\u5ba4|\u5e8a|\u8863\u6a71|\u8863\u67dc/i.test(src)) {
      return 'the player stands or moves inside the bedroom, room furniture visible';
    }
    if (!src) return '';
    if (/浴室|洗澡|淋浴|清洗|冲洗|沐浴|bathroom|bath|shower|wash/i.test(src)) {
      return 'the player washes in the bathroom, water and bathroom fixtures visible, calm indoor bathing scene';
    }
    if (/(躺下|躺在|躺回|偎在|被窝|床垫|枕|闭上眼|睡|入睡|困意|怀里|身边|环住|搂住|lying|lies down|lying on|in bed|under the covers|beside|embrace|arm around|falling asleep)/i.test(src)
      && /(床|卧室|被窝|床垫|枕|bed|bedroom|covers)/i.test(src)) {
      if (/Alex|艾利克斯|亚历克斯/i.test(src)) {
        return 'the player lies on a bed beside Alex, both figures close under the covers, Alex resting an arm around the player waist, quiet addon bedroom scene, relaxed sleeping posture';
      }
      return 'the player lies down on the bed under the covers, relaxed resting posture, bedroom furniture visible around the bed';
    }
    if (/(坐起|坐在|坐到|床边|椅子|凳|sit|sitting|seated)/i.test(src)
      && /(床|卧室|椅|bed|bedroom|chair)/i.test(src)) {
      return 'the player sits on the bed or nearby seat, body posture clearly seated, bedroom furniture visible';
    }
    if (/(跪|跪坐|膝|kneel|kneeling|on knees)/i.test(src)) {
      return 'the player kneels in the current scene, knees on the floor or bed, posture clearly kneeling, story-relevant props nearby';
    }
    if (/卧室|床|衣橱|bedroom|bed|wardrobe/i.test(src)) {
      return 'the player stands or moves inside the bedroom, room furniture visible';
    }
    if (/火坑|炉床|炭|余烬|灰烬|苔藓|细枝|fire pit|hearth|embers|ash|twigs|moss/i.test(src)) {
      return 'kneeling beside a hearth, hands near ash and glowing embers, adding dry moss and twigs, smoke rising, warm firelight on ash-streaked cheeks and red robe ribbons';
    }
    var sentences = src.replace(/([。！？.!?])\s*/g, '$1\n').split('\n').map(function (s) {
      return cleanText(s, 180);
    }).filter(function (s) {
      if (!s) return false;
      if (/(昨夜|曾经|回忆|想起|记得|previously|last night|remember)/i.test(s)) return false;
      if (isGeneratedImagePromptText(s)) return false;
      return true;
    });
    var fallback = cleanText(sentences.slice(0, 3).join(' '), 420);
    if (hasCJKText(fallback)) {
      var chineseAction = chineseStoryActionPrompt(src);
      if (chineseAction) return chineseAction;
      return collectStoryCharacterVisualHints(src, '')
        ? 'visible subjects perform the current story action, story-relevant gesture and body placement, no written text'
        : 'the single visible player character performs the current story action alone, interacting only with the environment and props, no other people, no written text';
    }
    return fallback;
  }

  function parseScenePromptPlan(raw) {
    raw = cleanText(raw, 3000);
    if (!raw) return null;
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    var obj = null;
    var jsonText = raw;
    var m = raw.match(/\{[\s\S]*\}/);
    if (m) jsonText = m[0];
    try { obj = JSON.parse(jsonText); } catch (e) { obj = null; }
    if (!obj) {
      obj = {};
      raw.split(/\n+/).forEach(function (line) {
        var mm = line.match(/^\s*(SCENE|CHARACTERS|PLAYER_APPEARANCE|ACTION|PROPS|LIGHTING|CAMERA|NEGATIVE)\s*:\s*(.+)$/i);
        if (mm) obj[mm[1].toLowerCase()] = mm[2];
      });
    }
    if (!obj || typeof obj !== 'object') return null;
    function get(keys) {
      for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (Array.isArray(v)) v = v.join(', ');
        v = cleanGeneratedImagePrompt(v || '', 360);
        if (v) return v;
      }
      return '';
    }
    var plan = {
      scene: get(['scene', 'SCENE']),
      characters: get(['characters', 'visible_characters', 'CHARACTERS']),
      player: get(['player_appearance', 'player', 'PLAYER_APPEARANCE']),
      action: get(['action', 'actions', 'visual_action', 'ACTION']),
      props: get(['props', 'key_props', 'PROPS']),
      lighting: get(['lighting', 'LIGHTING']),
      camera: get(['camera', 'composition', 'CAMERA']),
      negative: get(['negative', 'forbidden', 'NEGATIVE'])
    };
    return Object.keys(plan).some(function (k) { return !!plan[k]; }) ? plan : null;
  }

  function buildStructuredScenePrompt(plan, sourceStory, contextText, cfg) {
    cfg = cfg || loadCfg();
    var facts = buildSceneVisualFacts(plan, sourceStory, contextText, cfg);
    var parts = [
      'single objective scene image, one continuous camera view',
      facts.characterCount,
      visualLayer('player appearance', facts.playerVisual),
      facts.characters ? visualLayer('other visible subject', facts.characters) : '',
      visualLayer('environment', facts.location),
      visualLayer('action', facts.action),
      facts.props ? visualLayer('key props', facts.props) : '',
      visualLayer('lighting', facts.lighting),
      visualLayer('camera', facts.camera),
      'game scene illustration, clean linework, refined lighting'
    ];
    return validateSceneImagePrompt(parts.filter(Boolean).join(', '), facts.story, cfg);
  }
  function validateSceneImagePrompt(prompt, story, cfg) {
    prompt = cleanGeneratedImagePrompt(prompt, 2200);
    if (cfg && String(cfg._apgMode || '') === 'scene') prompt = sanitizeScenePositivePrompt(prompt);
    prompt = prompt.replace(/story visual details:\s*story scene illustration[\s\S]*?(?=,\s*polished visual novel game CG|$)/gi, ' ');
    prompt = prompt.replace(/visible story creature or animal/gi, ' ');
    prompt = prompt.replace(/do not add cats, kittens, dogs, wolves, horses, pets, or extra animals unless[^,.;]*/gi, 'only show explicitly listed living subjects');
    prompt = prompt.replace(/do not add cats, kittens, pets, or extra animals unless[^,.;]*/gi, 'only show explicitly listed living subjects');
    prompt = prompt.replace(/\b(?:cats|kittens)\b/gi, 'unlisted pets');
    if (!isCurrentVisibleEagleMention(story)) {
      prompt = prompt.replace(/(?:;\s*)?a visible hawk or eagle presence,?\s*/gi, '');
    }
    var lower = prompt.toLowerCase();
    var required = [];
    if (lower.indexOf('single objective scene image') < 0) required.push('single objective scene image, one continuous camera view');
    if (lower.indexOf('player') < 0) required.push('player character visible');
    if (required.length) prompt = required.join(', ') + ', ' + prompt;
    var first = lower.indexOf('story scene illustration');
    if (first >= 0 && lower.indexOf('story scene illustration', first + 1) >= 0) {
      prompt = prompt.replace(/,\s*story scene illustration with visible characters/gi, '');
    }
    prompt = removeCJKPromptFragments(prompt, 2200);
    if (cfg && String(cfg._apgMode || '') === 'scene') prompt = sanitizeScenePositivePrompt(prompt);
    return trimImagePromptCleanly(prompt, 2200);
  }

  function buildLocalScenePrompt(sourceStory, contextText, cfg) {
    return buildStructuredScenePrompt(null, sourceStory, contextText, cfg);
  }

  function expandScenePrompt(userText, cfg) {
    var inputLooksGenerated = isGeneratedImagePromptText(userText);
    var sourceStory = extractPrimaryStoryText(inputLooksGenerated ? (getAIStoryText() || getVisiblePassageText()) : (userText || getAIStoryText() || getVisiblePassageText()));
    if (inputLooksGenerated) userText = '';
    userText = buildImagePromptContext(userText, sourceStory);
    var isSceneMode = cfg && String(cfg._apgMode || '') === 'scene';
    var sys = 'You write prompts for an image generation model. '
      + 'Your task is faithful visual extraction, not free rewriting. '
      + 'Use exactly these sources, in priority order: CURRENT GAME STATE for location, CURRENT STORY for visible action and objects, PLAYER SETTINGS for appearance/style. '
      + 'Never infer location from old prompts, memory, sidebars, labels, or unrelated nouns. '
      + 'The SOURCE STORY is authoritative for the current visible action, time of day, lighting, atmosphere, visible characters, key objects, and immediate visible action. '
      + 'Do not move the scene to a different place. Do not invent a different event. Do not replace the story mood with an unrelated composition. '
      + (isSceneMode
        ? 'Extract a structured visual plan for an environment-first story scene. Include the player character as a visible figure and include only visible named characters, companions, and specifically named creatures/entities currently present in the SOURCE STORY. Mentions in memory, backstory, prior events, causes, UI panels, sidebars, configuration, logs, or game state are NOT visible. If the source story does not clearly place another living subject in the current scene, leave characters empty except for the player. Do not add unlisted animals, pets, or creatures. Never make an empty landscape, solo background, solo portrait, or character reference sheet. '
        : 'Build one complete image prompt by integrating the source story with character data. ')
      + (isSceneMode
        ? 'Output ONLY valid JSON with these string fields: scene, characters, player_appearance, action, props, lighting, camera, negative. No markdown, no explanation. '
        : 'Output one concise English comma-separated prompt, 45 to 90 words. ')
      + 'Include only drawable visual facts: current game location, time of day, light source, mood, camera/composition, player appearance, clothing, visible condition/state, other visible characters, and key props. '
      + 'Do not copy full sentences or narrative actions from the source. Do not include dialogue, UI text, buttons, metadata, passage names, debug labels, game commands, letters, numbers, signs, captions, labels, or watermarks. Any visible books, papers, walls, signs, screens, or labels must be blank with no readable marks. '
      + (isSceneMode
        ? 'If player clothing or locked appearance data is available, use it only as a brief description of a visible figure in the scene; do not let it override the setting or composition. '
        : 'When player clothing data is available, it is mandatory: accurately include the main visible outfit, colors, accessories, and notable garment state. If a section named "player locked appearance" exists, it is mandatory and has highest priority: translate it if needed and include EVERY visual detail exactly, including outfit type, outfit colors, wings, hair color, hair tips, and hair length. ')
      + (isSceneMode ? '' : 'If any clothing or appearance data conflicts with player locked appearance, ignore the conflicting data and use player locked appearance. ')
      + 'If sidebar natural-language clothing text and raw clothing variables conflict, prefer the natural-language clothing text. '
      + 'Merge clothing and character data naturally into the image prompt instead of listing raw variable names. '
      + 'If current game location conflicts with story words or supporting context, trust CURRENT GAME STATE for location and use CURRENT STORY only for visible action. '
      + 'Do not infer or mention age. Keep romantic or consent-unclear content non-explicit. '
      + 'Output ONLY the final prompt. No quotes, no bullets, no explanation, no Chinese.';
    var usr = 'SOURCE STORY TO PRESERVE:\n' + (sourceStory || '(missing; use supporting context only)') + '\n\n'
      + 'SUPPORTING CONTEXT:\n' + userText + '\n\n'
      + 'Create a drawable image prompt that matches the CURRENT GAME STATE location and CURRENT STORY action. Do not copy the wording; preserve the meaning and visible scene.'
      + (isSceneMode ? '\nIMPORTANT: Return JSON only. Keep action to 1-2 short visual phrases. Do not copy story prose. Historical mentions are not visible characters. Explicitly exclude all text, letters, numbers, UI, signs, captions, labels, and watermarks. Any paper, book, sign, screen, or wall surface must be blank.' : '');
    return callLLM(sys, usr, cfg).then(function (out) {
      out = cleanText(out, 1800);
      if (isSceneMode) {
        var plan = parseScenePromptPlan(out);
        return buildStructuredScenePrompt(plan, sourceStory, userText, cfg);
      }
      return cleanGeneratedImagePrompt(out, 1200) || buildLocalScenePrompt(sourceStory, userText, cfg);
    }, function (err) {
      try { console.warn('[AIPixelGen] scene prompt LLM failed, using local fallback', err); } catch (_) {}
      return buildLocalScenePrompt(sourceStory, userText, cfg);
    });
  }

  function safeRead(fn, fallback) {
    try {
      var v = fn();
      return v === undefined || v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function currentPassageName() {
    return safeRead(function () { return State.passage; }, '');
  }

  function getV() {
    return safeRead(function () { return State.variables; }, {}) || {};
  }

  function cleanText(s, maxLen) {
    s = sanitizeTextForJSON(String(s || '')).replace(/\s+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = safeSliceText(s, maxLen).trim();
    return sanitizeTextForJSON(s);
  }

  function sanitizeTextForJSON(s) {
    s = String(s || '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (n >= 0xDC00 && n <= 0xDFFF) {
          out += s.charAt(i) + s.charAt(i + 1);
          i++;
        }
      } else if (c < 0xDC00 || c > 0xDFFF) {
        out += s.charAt(i);
      }
    }
    return out;
  }

  function safeSliceText(s, maxLen) {
    s = sanitizeTextForJSON(s);
    if (!maxLen || s.length <= maxLen) return s;
    var cut = Math.max(0, Number(maxLen) || 0);
    if (cut > 0) {
      var prev = s.charCodeAt(cut - 1);
      if (prev >= 0xD800 && prev <= 0xDBFF) cut--;
    }
    return sanitizeTextForJSON(s.slice(0, cut));
  }

  function visualValue(v) {
    if (v === undefined || v === null || v === '' || v === 0) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(visualValue).filter(Boolean).slice(0, 8).join(', ');
    if (typeof v === 'object') {
      return cleanText(v.fullDescription || v.description || v.displayName || v.display || v.name_cap || v.name || v.label || v.title || v.type || v.id || '', 160);
    }
    return '';
  }

  function collectSidebarVisualText() {
    var parts = [];
    try {
      $('#sidebardescription, #storyCaptionContent, #storyCaption').each(function () {
        var $clone = $(this).clone();
        $clone.find('button, input, textarea, select, script, style').remove();
        var t = cleanStoryForImagePrompt($clone.text(), 700);
        if (t) parts.push(t);
      });
    } catch (e) {}
    return cleanText(parts.join('\n'), 1000);
  }

  function collectPlayerVisualSummary() {
    var V = getV();
    var lines = [];
    var appearanceKeys = [
      'haircolour', 'haircolor', 'hairlength', 'hairstyle', 'fringetype',
      'eyecolour', 'eyecolor', 'skincolour', 'skincolor', 'makeup',
      'bodyshape', 'physique', 'breastsize', 'bottomsize'
    ];
    var appearance = [];
    appearanceKeys.forEach(function (k) {
      var val = visualValue(V[k]);
      if (val) appearance.push(k + ': ' + val);
    });
    if (appearance.length) lines.push('player appearance: ' + appearance.join('; '));

    var worn = safeRead(function () { return V.worn; }, null);
    if (worn) {
      var clothes = [];
      ['over_upper', 'over_lower', 'upper', 'lower', 'under_upper', 'under_lower', 'over_head', 'head', 'face', 'neck', 'hands', 'handheld', 'legs', 'feet', 'genitals'].forEach(function (slot) {
        var item = worn[slot];
        if (!item) return;
        var name = visualValue(item);
        var state = item.state != null ? ', state ' + item.state : '';
        var integrity = item.integrity != null ? ', integrity ' + item.integrity : '';
        var exposed = item.exposed ? ', exposed ' + item.exposed : '';
        var genitalExpose = (item.vagina_exposed ? ', vagina exposed' : '') + (item.anus_exposed ? ', anus exposed' : '');
        var colour = item.colour || item.color || item.colour_combat || item.color_combat || '';
        var colourText = colour ? ', color ' + visualValue(colour) : '';
        if (name || state || colourText || integrity || exposed || genitalExpose) clothes.push(slot + ': ' + (name || 'clothing') + colourText + state + integrity + exposed + genitalExpose);
      });
      if (clothes.length) lines.push('player clothing: ' + clothes.join('; '));
    }

    var stateKeys = [
      'position', 'pain', 'arousal', 'stress', 'trauma', 'fatigue', 'tiredness',
      'wetness', 'semen', 'covered', 'combat', 'enemytype'
    ];
    var state = [];
    stateKeys.forEach(function (k) {
      var val = visualValue(V[k]);
      if (val) state.push(k + ': ' + val);
    });
    if (state.length) lines.push('visible state: ' + state.join('; '));
    return lines.join('\n');
  }

  function sidebarVisualSentenceToPrompt(text) {
    text = String(text || '');
    if (!text || !hasCJKText(text)) return cleanText(text, 220);
    var tags = [];
    function add(tag) {
      if (tag && tags.indexOf(tag) < 0) tags.push(tag);
    }
    var firstCjk = text.search(/[\u3400-\u9fff]/);
    if (firstCjk > 0) {
      var prefix = cleanText(text.slice(0, firstCjk).replace(/[，。！？]/g, ', '), 220);
      if (/[A-Za-z]/.test(prefix)) add(prefix);
    }
    if (/巫女服|巫女装|神社巫女/.test(text)) add('red and white shrine maiden outfit');
    if (/白色[^。！？.!?]{0,12}紧身衣|白色[^。！？.!?]{0,12}连体衣/.test(text)) add('white bodysuit');
    else if (/紧身衣|连体衣/.test(text)) add('bodysuit');
    if (/油纸伞/.test(text)) add('holding an oil-paper umbrella');
    else if (/伞/.test(text)) add('holding an umbrella');
    if (/白(?:色)?翅膀|白(?:色)?羽翼/.test(text)) add('white wings on back');
    else if (/翅膀|羽翼/.test(text)) add('wings on back');
    if (/白(?:色)?头发|白发/.test(text)) add('white hair');
    if (/紫(?:色)?发(?:梢|尾)|发(?:梢|尾)[^。！？.!?]{0,8}紫/.test(text)) add('purple hair tips');
    if (/及地|拖地/.test(text)) add('floor-length hair');
    if (/沾着灰|灰烬/.test(text)) add('ash-streaked');
    return tags.join(', ');
  }

  function normalizePlayerSceneVisualText(text) {
    text = cleanText(text, 700);
    if (!text) return '';
    var chunks = [];
    text.split(/\n+|(?<=。)|(?<=！)|(?<=？)/).forEach(function (part) {
      part = cleanText(part, 240);
      if (!part) return;
      var converted = sidebarVisualSentenceToPrompt(part);
      if (converted) chunks.push(converted);
    });
    var joined = chunks.join(', ');
    joined = joined.replace(/\b(player visual appearance|player appearance|player clothing)\s*:\s*/gi, '');
    return cleanGeneratedImagePrompt(joined, 450);
  }

  function sceneVisibleClothingSlots(worn) {
    var slots = ['over_upper', 'over_lower', 'upper', 'lower', 'head', 'neck', 'hands', 'handheld', 'feet'];
    worn = worn || {};
    if (!worn.upper && worn.under_upper) slots.splice(4, 0, 'under_upper');
    if (!worn.lower && worn.under_lower) slots.splice(4, 0, 'under_lower');
    return slots;
  }

  function cleanPlayerSceneVisualLabels(text) {
    text = cleanGeneratedImagePrompt(text || '', 700);
    text = text.replace(/\bplayer appearance\s*:\s*/gi, '');
    text = text.replace(/\bplayer clothing\s*:\s*/gi, 'wearing ');
    text = text.replace(/\b(over_upper|over_lower|upper|lower|head|neck|hands|handheld|feet|under_upper|under_lower)\s*:\s*/gi, '$1 ');
    return cleanGeneratedImagePrompt(text, 620);
  }

  function collectPlayerVariableVisualPrompt() {
    var V = getV();
    var parts = [];
    function itemEnglishValue(item) {
      if (!item || typeof item !== 'object') return visualValue(item);
      return cleanText(item.name || item.name_cap || item.displayName || item.display || item.type || item.id || item.label || item.title || '', 120);
    }
    var appearance = [];
    ['haircolour', 'haircolor', 'hairlength', 'hairstyle', 'eyecolour', 'eyecolor', 'skincolour', 'skincolor'].forEach(function (k) {
      var val = visualValue(V[k]);
      if (!val) return;
      if (/hairlength/i.test(k) && Number(val) >= 900) appearance.push('floor-length hair');
      else appearance.push(k + ' ' + val);
    });
    if (appearance.length) parts.push('player appearance: ' + appearance.slice(0, 8).join(', '));
    var worn = safeRead(function () { return V.worn; }, null);
    if (worn) {
      var clothes = [];
      sceneVisibleClothingSlots(worn).forEach(function (slot) {
        var item = worn[slot];
        if (!item) return;
        var name = itemEnglishValue(item);
        if (!name || /naked|none|nothing/i.test(name)) return;
        var colour = item.colour || item.color || item.colour_combat || item.color_combat || '';
        clothes.push(slot + ': ' + name + (colour ? ', ' + visualValue(colour) : ''));
      });
      if (clothes.length) parts.push('player clothing: ' + clothes.slice(0, 10).join('; '));
    }
    return cleanPlayerSceneVisualLabels(parts.join('\n'));
  }

  function collectPlayerSceneVisualPrompt(cfg) {
    cfg = cfg || loadCfg();
    var parts = [];
    if (cfg.lockedAppearance) parts.push(normalizePlayerSceneVisualText(cfg.lockedAppearance));
    var sidebar = collectSidebarVisualText();
    var clothingMatches = [];
    String(sidebar || '').replace(/你(?:穿着|正拿着)[^。！？.!?]{2,90}[。！？.!?]?/g, function (m) {
      var converted = sidebarVisualSentenceToPrompt(m);
      if (converted) clothingMatches.push(converted);
      return m;
    });
    if (clothingMatches.length) parts.push(clothingMatches.slice(0, 3).join(' '));
    if (!parts.length) {
      var V = getV();
      var appearance = [];
      ['haircolour', 'haircolor', 'hairlength', 'hairstyle', 'eyecolour', 'eyecolor', 'skincolour', 'skincolor'].forEach(function (k) {
        var val = visualValue(V[k]);
        if (val) appearance.push(k + ' ' + val);
      });
      if (appearance.length) parts.push('player appearance: ' + appearance.slice(0, 8).join(', '));
      var worn = safeRead(function () { return V.worn; }, null);
      if (worn) {
        var clothes = [];
        sceneVisibleClothingSlots(worn).forEach(function (slot) {
          var item = worn[slot];
          if (!item) return;
          var name = visualValue(item);
          if (!name || /一丝不挂|naked|none/i.test(name)) return;
          var colour = item.colour || item.color || item.colour_combat || item.color_combat || '';
          clothes.push(slot + ': ' + name + (colour ? ', ' + visualValue(colour) : ''));
        });
        if (clothes.length) parts.push('player clothing: ' + clothes.slice(0, 8).join('; '));
      }
    }
    parts.push(collectPlayerVariableVisualPrompt());
    return cleanPlayerSceneVisualLabels(parts.filter(Boolean).join('\n'));
  }

  function collectOtherCharacterSummary() {
    var V = getV();
    var lines = [];
    ['enemytype', 'enemyname', 'npc', 'npcName', 'person', 'people', 'nearby'].forEach(function (k) {
      var val = visualValue(V[k]);
      if (val) lines.push(k + ': ' + val);
    });
    return lines.length ? 'other visible characters or nearby entities: ' + lines.join('; ') : '';
  }

  function buildImagePromptContext(userText, sourceStory) {
    var cfg = loadCfg();
    var isSceneMode = cfg && String(cfg._apgMode || '') === 'scene';
    var parts = [];
    parts.push('CURRENT GAME STATE:\n' + collectSceneSummary());
    if (isGeneratedImagePromptText(userText)) userText = '';
    var story = cleanStoryForImagePrompt(sourceStory || extractPrimaryStoryText(userText) || getAIStoryText() || getVisiblePassageText(), 1600);
    if (story) parts.push('CURRENT STORY:\n' + story);
    if (isSceneMode) {
      var actionHint = visualActionPrompt(story);
      if (actionHint) parts.push('CURRENT VISUAL ACTION:\n' + actionHint);
    }
    if (cfg.compositionPreset) parts.push('PLAYER COMPOSITION SETTING:\n' + cfg.compositionPreset);
    if (cfg.lockedAppearance) {
      parts.push((isSceneMode
        ? 'PLAYER APPEARANCE SETTING:\n'
        : 'PLAYER LOCKED APPEARANCE:\n') + cleanText(cfg.lockedAppearance, 900));
    }
    if (cfg.personalPrompt) parts.push('PLAYER POSITIVE STYLE SETTING:\n' + cleanText(cfg.personalPrompt, 700));
    if (cfg.negativePrompt) parts.push('PLAYER NEGATIVE SETTING:\n' + cleanText(cfg.negativePrompt, 700));
    var npcPrompt = collectMatchedNpcAppearancePrompt(isSceneMode ? story : (story + '\n' + userText), cfg);
    if (npcPrompt) parts.push(npcPrompt);
    var sidebar = collectSidebarVisualText();
    if (sidebar) parts.push('PLAYER CURRENT APPEARANCE:\n' + sidebar);
    var player = collectPlayerVisualSummary();
    if (player) parts.push(player);
    if (!isSceneMode) {
      var others = collectOtherCharacterSummary();
      if (others) parts.push(others);
      var pose = collectPoseSummary();
      if (pose) parts.push('pose and interaction data:\n' + pose);
    }
    parts.push('INSTRUCTION: make one concise visual prompt from CURRENT STORY, CURRENT GAME STATE, and PLAYER SETTINGS only.');
    return cleanText(parts.join('\n\n'), 3200);
  }

  function extractPrimaryStoryText(s) {
    s = String(s || '');
    if (isGeneratedImagePromptText(s)) {
      return cleanStoryForImagePrompt(getAIStoryText() || getVisiblePassageText(), 1600);
    }
    var m = s.match(/Visual details:\s*([\s\S]*?)\s*Exclude:/i);
    if (m && m[1]) return cleanStoryForImagePrompt(m[1], 1600);
    m = s.match(/story visual context:\s*([\s\S]*?)(?:\n\n|player sidebar|player clothing|pose and interaction|instruction:|$)/i);
    if (m && m[1]) return cleanStoryForImagePrompt(m[1], 1600);
    return cleanStoryForImagePrompt(s, 1600);
  }

  function isGeneratedImagePromptText(s) {
    s = String(s || '');
    var lower = s.toLowerCase();
    var hits = 0;
    [
      'story scene illustration',
      'visible characters',
      'player visual appearance',
      'story visual details:',
      'no text in the image',
      'no letters',
      'wide scene composition',
      'location:',
      'time and lighting:',
      'polished visual novel game cg',
      'single objective scene image',
      'one continuous camera view',
      'visible subject:',
      'visible subjects:',
      'player appearance:',
      'environment:',
      'action:',
      'camera:',
      'game scene illustration'
    ].forEach(function (needle) {
      if (lower.indexOf(needle) >= 0) hits += 1;
    });
    return hits >= 3;
  }

  function trimImagePromptCleanly(s, maxLen) {
    s = cleanText(s, 0);
    if (!maxLen || s.length <= maxLen) return s;
    var cut = safeSliceText(s, maxLen);
    var tailStart = Math.max(0, cut.length - 260);
    var tail = cut.slice(tailStart);
    var rel = Math.max(
      tail.lastIndexOf('。'),
      tail.lastIndexOf('.'),
      tail.lastIndexOf('，'),
      tail.lastIndexOf(','),
      tail.lastIndexOf(';')
    );
    if (rel >= 0 && tailStart + rel > Math.max(80, maxLen - 260)) {
      cut = cut.slice(0, tailStart + rel + 1);
    } else {
      var space = cut.lastIndexOf(' ');
      if (space > Math.max(80, maxLen - 80)) cut = cut.slice(0, space);
    }
    cut = cut.replace(/\[[^\]]*$/, ' ');
    cut = cut.replace(/(?:,\s*|;\s*|:\s*|\band\b|\bthe\b|\bhis\b|\bher\b|\btheir\b|\bwith\b|\bnear\b|\bon\b|\bin\b|\bof\b)$/i, '');
    return cleanText(cut, 0).replace(/[,:;]\s*$/, '');
  }

  function cleanGeneratedImagePrompt(s, maxLen) {
    s = String(s || '');
    s = s.replace(/story visual details:\s*(?=story scene illustration with visible characters)/gi, 'story visual details: ');
    s = s.replace(/story visual details:\s*story scene illustration with visible characters[\s\S]*?(?=,\s*(?:polished visual novel game CG|DoL game style|clean linework)|$)/gi, 'story visual details: ');
    s = s
      .replace(/\[[^\]]*(?:压力|疲劳|爱意|支配|疼痛|创伤|诱惑|自控|性奋|arousal|stress|pain|fatigue|love|dom)[^\]]*\]/gi, ' ')
      .replace(/\[[^\]]{0,32}$/g, ' ')
      .replace(/☆?\s*收藏剧情进长期记忆/g, ' ')
      .replace(/剧情进长期记忆/g, ' ')
      .replace(/🔄\s*刷新剧情|🔁\s*刷新选项|刷新剧情|刷新选项|📍\s*(?:到达|返回游戏)[^\s,，。]*/g, ' ')
      .replace(/使用道具|纠正地点|AI\s*记忆|生成提示词|生成图片|一键生成图片/g, ' ')
      .replace(/\s*\|\s*[+\-](?:\s*[+\-])?\s*[\u3400-\u9fffA-Za-z]{1,18}/g, ' ')
      .replace(/(?:\+|\-)\s*(?:疲劳|爱意|支配|压力|疼痛|创伤|诱惑|自控|arousal|stress|pain|fatigue|love|dom)\b/gi, ' ');
    return trimImagePromptCleanly(s, maxLen || 1200);
  }

  function cleanStoryForImagePrompt(s, maxLen) {
    s = String(s || '');
    s = s.replace(/\r/g, '\n');
    s = s
      .replace(/下面写着一些字[:：]\s*["“][^"”]+["”]/g, '有一块空白装饰区')
      .replace(/一张猫咪的海报正贴在墙上，有一块空白装饰区/g, '一张空白装饰画正贴在墙上')
      .replace(/海报/g, '装饰画')
      .replace(/它显示\s*\d+\s*°C/g, '表面空白')
      .replace(/本游戏完全免费，如果你花钱购买了，找他退款并举报他！/g, ' ')
      .replace(/你已经有段时间没导出存档了[^\n。]*/g, ' ')
      .replace(/\|\s*\|\s*\|/g, ' ')
      .replace(/\|\s*\|/g, ' ');
    s = s.split(/\n+/).filter(function (line) {
      var t = String(line || '').trim();
      if (!t) return false;
      if (/^(?:\(\d+\)|\(Shift\s*\+|→)/i.test(t)) return false;
      if (/^(?:£|\d{1,2}:\d{2}|星期|明天|属性|特质|日志|统计|成就|作弊|选项|存档)\b/.test(t)) return false;
      if (/^(?:DoL像素风|视觉小说插画|氛围厚涂|精致CG|电影感|DoL场景图|角色设定图|柔和水彩|明亮动画|暗调哥特|童话绘本)$/.test(t)) return false;
      if (/^(?:生成提示词|生成图片|一键生成图片|纠正地点|使用道具|AI\s*记忆|刷新选项|刷新剧情|返回游戏)$/.test(t)) return false;
      if (/^\d+(?:\.\d+){2,}/.test(t) || /^\.\d+(?:\.\d+){2,}/.test(t) || /\(ML-v/i.test(t)) return false;
      return true;
    }).join('\n');
    s = s
      .replace(/🔄\s*刷新选项/g, ' ')
      .replace(/🔄\s*刷新剧情/g, ' ')
      .replace(/📍\s*返回游戏/g, ' ')
      .replace(/📋\s*AI\s*记忆/g, ' ')
      .replace(/☆\s*收藏/g, ' ')
      .replace(/刷新选项/g, ' ')
      .replace(/刷新剧情/g, ' ')
      .replace(/返回游戏/g, ' ')
      .replace(/收藏/g, ' ')
      .replace(/AI\s*记忆/g, ' ')
      .replace(/AI\s*正在生成选项[.。…]*/g, ' ')
      .replace(/使用道具/g, ' ')
      .replace(/生成提示词|生成图片|一键生成图片|纠正地点/g, ' ')
      .replace(/☆?\s*收藏剧情进长期记忆/g, ' ')
      .replace(/剧情进长期记忆/g, ' ');
    s = s
      .replace(/\[[^\]]*(?:压力|疲劳|爱意|支配|疼痛|创伤|诱惑|自控|性奋|arousal|stress|pain|fatigue|love|dom)[^\]]*\]/gi, ' ')
      .replace(/\[[^\]]{0,32}$/g, ' ')
      .replace(/\b0\s*[\.\s]\s*5\s*[\.\s]\s*8\s*[\.\s]\s*10(?:\s*[\.\s]\s*10)?\b/g, ' ')
      .replace(/\b0\.5\.8\.10(?:\s*\.5\.8\.10)?\b/g, ' ')
      .replace(/(?:^|\s)\.?\s*5\s*[\.\s]\s*8\s*[\.\s]\s*10(?:\s*[\.\s]\s*10)?\b/g, ' ')
      .replace(/\|\s*[+\-](?:\s*[+\-])?\s*[\u3400-\u9fffA-Za-z]{1,18}/g, ' ')
      .replace(/\|\s*[+\-]\s*[^|。！？.!?]{1,24}(?=\||$)/g, ' ')
      .replace(/(?:\+|\-)\s*(?:疲劳|爱意|支配|压力|疼痛|创伤|诱惑|自控|arousal|stress|pain|fatigue|love|dom)\b/gi, ' ');
    s = s
      .replace(/\s*\(\d+\)\s*[^。！？\n]*(?:\[[^\]]+\])?(?:\s*\|[^。！？\n]*)?/g, ' ')
      .replace(/\s*\(Shift\s*\+\s*\d+\)\s*[^。！？\n]*/gi, ' ')
      .replace(/\s*-\(ML-v[^)]*\)/gi, ' ')
      .replace(/\b(?:DoL像素风|视觉小说插画|氛围厚涂|精致CG|电影感|DoL场景图|角色设定图|柔和水彩|明亮动画|暗调哥特|童话绘本)\b/g, ' ');
    [
      /🔄\s*刷新选项/g,
      /🔄\s*刷新剧情/g,
      /📍\s*返回游戏/g,
      /📋\s*AI\s*记忆/g,
      /☆\s*收藏/g,
      /刷新选项/g,
      /刷新剧情/g,
      /返回游戏/g,
      /收藏/g,
      /AI\s*记忆/g,
      /AI\s*正在生成选项[.…]*/g,
      /使用道具/g,
      /\[[^\]]*剧情生成[^\]]*\]/g
    ].forEach(function (re) { s = s.replace(re, ' '); });
    s = s.replace(/[🔄📍📋💞☆★]/g, ' ');
    s = s.replace(/<[^>]+>/g, ' ');
    s = dedupeStoryText(s);
    return cleanText(s, maxLen || 1200);
  }

  function dedupeStoryText(s) {
    s = cleanText(s, 0);
    if (!s) return '';
    var half = Math.floor(s.length / 2);
    var left = cleanText(s.slice(0, half), 0);
    var right = cleanText(s.slice(half), 0);
    if (left && right && (right.indexOf(left.slice(0, Math.min(80, left.length))) === 0 || left === right)) return left;
    var parts = s.replace(/([。！？.!?])\s*/g, '$1\n').split('\n');
    var seen = {};
    var out = [];
    parts.forEach(function (p) {
      p = cleanText(p, 0);
      if (!p) return;
      var key = p.slice(0, 90);
      if (seen[key]) return;
      seen[key] = true;
      out.push(p);
    });
    return out.join(' ');
  }

  function inferVisualTimeHint(storyText, scene) {
    storyText = String(storyText || '');
    if (/夜|晚|黑暗|月光|moon|night|evening/i.test(storyText)) return 'night or evening implied by the story; use the story lighting';
    if (/晨|清晨|黎明|morning|dawn/i.test(storyText)) return 'morning light implied by the story';
    if (/黄昏|傍晚|夕阳|sunset|dusk/i.test(storyText)) return 'dusk or sunset light implied by the story';
    if (scene && scene.hour != null) return 'around ' + scene.hour + ':' + String(scene.minute != null ? scene.minute : 0).padStart(2, '0');
    return 'use visible time and lighting from the current scene';
  }

  function isMenuPassage(name) {
    name = String(name || '');
    if (/^(AIStoryGen|AIPixelGen)_/i.test(name)) return true;
    return /^(Start|Settings|Options|Save|Load|Export|Import|Debug|Credits)$/i.test(name);
  }

  function getAIStoryText() {
    var parts = [];
    var selectors = [
      '#passages .passage .ai-replaced-content',
      '#passages .passage .ai-narrative-wrap',
      '#passages .passage .ai-narrative-section',
      '#passages .ai-choices',
      '#passages .ai-choices-end'
    ];
    selectors.forEach(function (sel) {
      $(sel).each(function () {
        var $clone = $(this).clone();
        if ($(this).is('.ai-choices, .ai-choices-end')) {
          $clone.find('input, textarea, select, script, style, .apg-ai-assist, .apg-pixel-placeholder, .ai-choices-custom, .ai-back-to-game').remove();
        } else {
          $clone.find('button, input, textarea, select, script, style, .apg-ai-assist, .apg-pixel-placeholder').remove();
        }
        var t = cleanText($clone.text(), 900);
        if (t) parts.push(t);
      });
    });
    if (!parts.length && window.AIStoryGen && Array.isArray(window.AIStoryGen.recentBuf)) {
      var recent = window.AIStoryGen.recentBuf.slice(-3).map(function (x) {
        return cleanText((x && (x.text || x.content || x.output || x)) || '', 500);
      }).filter(Boolean);
      parts = parts.concat(recent);
    }
    return cleanText(parts.join('\n'), 1800);
  }

  function getVisiblePassageText() {
    var $p = $('#passages .passage');
    if (!$p.length) return '';
    var $clone = $p.clone();
    $clone.find('a, button, input, textarea, select, script, style, .apg-ai-assist, .apg-pixel-placeholder, .ai-choices, .ai-injected-row, .ai-back-to-game').remove();
    var text = sanitizeTextForJSON(String($clone.text() || ''))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length > 1600) text = safeSliceText(text, 1600).trim();
    return sanitizeTextForJSON(text);
  }

  function collectSceneData() {
    var V = getV();
    var scene = null;
    if (window.AIStoryGen && typeof window.AIStoryGen.buildScene === 'function') {
      scene = safeRead(function () { return window.AIStoryGen.buildScene(); }, null);
    }
    if (!scene) {
      scene = {
        location: V.location,
        area: V.area,
        day: V.day,
        weekday: V.weekday,
        hour: V.hour,
        minute: V.minute
      };
    }
    return Object.assign({}, scene, {
      location: scene.location || V.location || '',
      area: scene.area || V.area || '',
      day: scene.day || V.day || '',
      weekday: scene.weekday || V.weekday || '',
      hour: scene.hour != null ? scene.hour : (V.hour != null ? V.hour : null),
      minute: scene.minute != null ? scene.minute : (V.minute != null ? V.minute : 0)
    });
  }

  function collectSceneSummary() {
    var scene = collectSceneData();
    var passage = currentPassageName();
    var safeArea = shouldUseSceneAreaForPrompt(passage, scene.location, scene.area) ? scene.area : '';
    var lines = [
      'passage: ' + passage,
      'location: ' + (scene.location || 'unknown'),
      'time: day ' + (scene.day || '?') + ', ' + (scene.weekday || '?') + ', ' + (scene.hour != null ? scene.hour : '?') + ':' + String(scene.minute != null ? scene.minute : 0).padStart(2, '0')
    ];
    if (safeArea) lines.splice(2, 0, 'area: ' + safeArea);
    if (scene.nearby) lines.push('nearby: ' + scene.nearby);
    if (scene.dangerLevel) lines.push('atmosphere: ' + scene.dangerLevel);
    if (scene.moonPhase) lines.push('moon: ' + scene.moonPhase);
    return lines.join('\n');
  }

  function collectPoseSummary() {
    var V = getV();
    var keys = [
      'position', 'consensual', 'enemytype', 'enemyno',
      'leftaction', 'rightaction', 'mouthaction', 'feetaction',
      'penisaction', 'vaginaaction', 'anusaction', 'chestaction', 'thighaction',
      'mouthtarget', 'lefttarget', 'righttarget', 'feettarget'
    ];
    var lines = [];
    keys.forEach(function (k) {
      var v = V[k];
      if (v !== undefined && v !== null && v !== '' && v !== 0) lines.push(k + ': ' + v);
    });
    var worn = safeRead(function () { return V.worn; }, null);
    if (worn) {
      var clothes = [];
      ['upper', 'lower', 'under_upper', 'under_lower', 'genitals', 'over_upper', 'over_lower'].forEach(function (slot) {
        var item = worn[slot];
        if (!item) return;
        var name = item.name || item.name_cap || '';
        var state = item.state != null ? ', state=' + item.state : '';
        var exposed = item.exposed ? ', exposed=' + item.exposed : '';
        if (name || state || exposed) clothes.push(slot + ': ' + (name || 'item') + state + exposed);
      });
      if (clothes.length) lines.push('clothing: ' + clothes.join('; '));
    }
    return lines.join('\n');
  }

  function isPoseContext() {
    var V = getV();
    var p = currentPassageName();
    if (Number(V.combat || 0) === 1) return true;
    if (V.position && (V.leftaction || V.rightaction || V.mouthaction || V.vaginaaction || V.anusaction || V.penisaction)) return true;
    return false;
  }

  function getAINarrativeTextForImage() {
    var parts = [];
    $('#passages .passage .ai-replaced-content, #passages .passage .ai-narrative-wrap, #passages .passage .ai-narrative-section').each(function () {
      var $clone = $(this).clone();
      $clone.find('button, input, textarea, select, script, style, .apg-ai-assist, .apg-pixel-placeholder').remove();
      var t = cleanText($clone.text(), 900);
      if (t) parts.push(t);
    });
    return cleanStoryForImagePrompt(parts.join('\n'), 1300);
  }

  function shouldUseSceneAreaForPrompt(passage, location, area) {
    passage = String(passage || '');
    location = String(location || '');
    area = String(area || '');
    if (!area) return false;
    if (/^(Bedroom|Bathroom|Kitchen|Robin|Hall|Orphanage|Temple|Shop|Store|Cafe|Museum|Prison|Hotel|Brothel|Dance|Bar|Pub|Mansion|School|Classroom|Office|Bedroom Mirror|Wardrobe)/i.test(passage)) return false;
    if (/^(home|orphanage|temple|school|prison|shop|store|cafe|bar|pub|mansion)$/i.test(location) && /^(forest|moor|beach|sea|town|underground)$/i.test(area)) return false;
    return true;
  }

  function buildAIStoryPrompt(mode) {
    var narrativeText = getAINarrativeTextForImage();
    var storyText = narrativeText || cleanStoryForImagePrompt(getVisiblePassageText(), 1300);
    if (!storyText) storyText = cleanStoryForImagePrompt(getAIStoryText(), 1300);
    var scene = collectSceneData();
    var cfg = loadCfg();
    var placeParts = [];
    var passageName = currentPassageName();
    if (passageName) placeParts.push(passageName);
    if (scene.location) placeParts.push(scene.location);
    if (shouldUseSceneAreaForPrompt(passageName, scene.location, scene.area)) placeParts.push(scene.area);
    var locationLine = placeParts.length ? placeParts.join(', ') : 'quiet interior room';
    var storyRoomLocation = inferRoomLocationFromStory(storyText);
    if (storyRoomLocation) locationLine = storyRoomLocation;
    var characterHints = collectStoryCharacterVisualHints(storyText, '');
    var playerVisual = collectPlayerSceneVisualPrompt(cfg);
    var visibleLine = '';
    if (characterHints) {
      var visibleNames = storyNamedCharacterLabels(characterHints);
      if (visibleNames.length === 1) visibleLine = 'the player character and ' + visibleNames[0];
      else if (visibleNames.length > 1) visibleLine = 'the player character, ' + visibleNames.join(', ');
      else visibleLine = 'the player character plus ' + characterHints;
    } else {
      visibleLine = /nearby\s*alone|alone/i.test(String(scene.nearby || ''))
        ? 'one character alone in the scene'
        : 'only the player character unless the story explicitly names another visible character';
    }
    var atmosphereLine = scene.dangerLevel && scene.dangerLevel !== 'neutral'
      ? scene.dangerLevel
      : 'quiet, story-driven atmosphere';
    var actionLine = visualActionPrompt(storyText);
    var lines = [
      mode === 'pose'
        ? 'Clean non-explicit pose reference illustration.'
        : 'Environment-first story scene illustration, not a solo character portrait or character design sheet.',
      'Scene: ' + locationLine + '.',
      'Time and lighting: ' + inferVisualTimeHint(storyText, scene) + '.',
      'Mood: ' + atmosphereLine + '.',
      'Visible subjects: ' + visibleLine + '. Do not add crowds, bystanders, or extra people.',
      actionLine ? 'Current visual action: ' + actionLine + '.' : '',
      'Visual details: ' + (storyText || 'a quiet room with visible furniture and story-relevant props') + '.',
      'All flat surfaces and wall decorations must stay plain, blank, unmarked, or abstract pattern only.',
      'Player visual appearance: ' + (playerVisual || 'use the current player avatar and visible clothing from the game sidebar') + '.',
      'Focus only on the in-world room, objects, lighting, and visible character.'
    ].filter(Boolean);
    if (mode === 'pose') {
      lines.push('Pose state: ' + (collectPoseSummary() || 'infer a calm non-explicit standing or room-observing pose from the story text'));
    }
    return cleanText(lines.join('\n'), 2600);
  }

  function renderAssistPlaceholder($host, mode, promptText) {
    if (!isAIPixelEnabled()) return;
    var cfg = loadCfg();
    var renderCfg = mode === 'pose' ? specialSceneCfg(cfg) : sceneRenderCfg(cfg);
    renderCfg._apgMode = mode;
    var cacheKey = strHash('assist|' + mode + '|' + currentPassageName() + '|' + renderCfg.imgModel + '|' + renderCfg.imgEndpoint + '|' + promptText.slice(0, 1600));
    cleanupAssistPlaceholders(mode);
    $('#passages .apg-ai-assist').not('[data-apg-mode="' + mode + '"]').remove();
    removeStaleAssistPlaceholders(mode, cacheKey);
    clearStalePromptBoxesForSource(mode, promptText);
    if (!$host || !$host.length) return;
    var $direct = $host.find('> .apg-ai-assist[data-apg-mode="' + mode + '"]');
    if ($direct.length) {
      if ($direct.last().attr('data-apg-key') === cacheKey) {
        placeAssistAtPageBottom($direct.last());
        return;
      }
      $direct.remove();
    }
    if ($host.find('> .apg-ai-assist').length) return;
    var $existing = $('#passages .apg-ai-assist[data-apg-mode="' + mode + '"]');
    if ($existing.length) {
      if ($existing.last().attr('data-apg-key') === cacheKey) {
        placeAssistAtPageBottom($existing.last());
        return;
      }
      $existing.remove();
    }
    var instanceId = 'aipixel_assist_' + (++_pixelGenCounter);
    var defaultStyleKey = defaultStyleKeyForMode(renderCfg);
    var defaultCacheKey = makePixelCacheKey(cacheKey, promptText, defaultStyleKey);
    var label = mode === 'pose' ? '🖼 生成姿态图（约 15 秒）' : '🖼 生成剧情场景图（约 15 秒）';
    var $placeholder = $('<div></div>').attr('id', instanceId).addClass('apg-pixel-placeholder apg-ai-assist').attr('data-apg-mode', mode).attr('data-apg-key', cacheKey);
    placeAssistAtPageBottom($placeholder);
    requestStoryPanelLayout(0);
    scheduleAssistBelowChoices($placeholder);
    if (mode === 'scene') {
      renderPixelButton(instanceId, cacheKey, promptText, renderCfg, label);
      return;
    }
    getImgCache(defaultCacheKey)
      .then(function (cached) {
        if (cached && cached.dataURL) renderPixelImage(instanceId, cached.dataURL, { cacheKeyBase: cacheKey, promptCN: promptText, cfg: renderCfg, label: label });
        else renderPixelButton(instanceId, cacheKey, promptText, renderCfg, label);
      })
      .catch(function () { renderPixelButton(instanceId, cacheKey, promptText, renderCfg, label); });
  }

  function renderInlinePixelPanel(host, promptText, opts) {
    if (!isAIPixelEnabled()) return false;
    var $host = $(host);
    if (!$host.length) return false;
    opts = opts || {};
    var cfg = loadCfg();
    var mode = String(opts.mode || 'scene');
    var renderCfg = mode === 'pose' ? specialSceneCfg(cfg) : sceneRenderCfg(cfg);
    renderCfg = Object.assign(renderCfg, opts.cfg || {});
    renderCfg._apgMode = mode === 'pose' ? 'pose' : 'scene';
    promptText = cleanText(promptText || '', 2600);
    if (!promptText) return false;
    var keySeed = [
      'inline',
      mode,
      opts.key || currentPassageName(),
      renderCfg.imgModel,
      renderCfg.imgEndpoint,
      promptText.slice(0, 1600)
    ].join('|');
    var cacheKey = strHash(keySeed);
    var instanceId = String(opts.instanceId || ('aipixel_inline_' + (++_pixelGenCounter))).replace(/[^\w-]/g, '_');
    var defaultStyleKey = defaultStyleKeyForMode(renderCfg);
    var defaultCacheKey = makePixelCacheKey(cacheKey, promptText, defaultStyleKey);
    var label = opts.label || (mode === 'pose' ? '生成补充姿势图（约 15 秒）' : '生成补充画面（约 15 秒）');
    $host.empty().addClass('apg-pixel-placeholder apg-ai-inline').attr('id', instanceId).attr('data-apg-mode', mode).attr('data-apg-key', cacheKey);
    getImgCache(defaultCacheKey)
      .then(function (cached) {
        if (cached && cached.dataURL) renderPixelImage(instanceId, cached.dataURL, { cacheKeyBase: cacheKey, promptCN: promptText, cfg: renderCfg, label: label });
        else renderPixelButton(instanceId, cacheKey, promptText, renderCfg, label);
      })
      .catch(function () { renderPixelButton(instanceId, cacheKey, promptText, renderCfg, label); });
    return true;
  }

  function findCombatActionSwitchRow() {
    var $root = $('#passages .passage').last();
    if (!$root.length) $root = $('#passages');
    var switchRe = /(切换到可选行动|切换到顺从行动|切换到反抗行动|Switch to available actions|Switch to submissive actions|Switch to defiant actions|Switch to resistant actions)/i;
    var $links = $root.find('a, button').filter(function () {
      return switchRe.test(String($(this).text() || '').replace(/\s+/g, ' '));
    });
    if (!$links.length) return $();
    var node = $links.first()[0];
    var best = node;
    while (node && node.parentNode && node.parentNode !== $root[0] && node.parentNode.id !== 'passages') {
      var parentText = String($(node.parentNode).text() || '').replace(/\s+/g, ' ');
      if (
        (/切换到可选行动/.test(parentText) && /切换到顺从行动/.test(parentText) && /切换到反抗行动/.test(parentText)) ||
        (/Switch to available actions/i.test(parentText) && (/Switch to submissive actions/i.test(parentText) || /Switch to defiant actions/i.test(parentText)))
      ) {
        best = node.parentNode;
        node = node.parentNode;
        continue;
      }
      break;
    }
    return $(best);
  }

  function placePoseAssist($placeholder, $host) {
    return placeAssistAtPageBottom($placeholder);
  }

  function schedulePoseAssistPosition($placeholder, $host) {
    if (requestStoryPanelLayout(0)) {
      requestStoryPanelLayout(250);
      return;
    }
    function move() { placeAssistAtPageBottom($placeholder); }
    setTimeout(move, 50);
    setTimeout(move, 350);
    setTimeout(move, 1000);
    setTimeout(move, 2500);
    installPoseAssistOrderObserver();
  }

  function placeAssistAtPageBottom($placeholder) {
    var $root = $('#passages');
    if (!$root.length || !$placeholder || !$placeholder.length) return false;
    if (window.AIStoryGen && window.AIStoryGen.panelManager) {
      var attached = $placeholder.parent()[0] === $root[0];
      if (!attached) {
        $root.append($placeholder);
      }
      requestStoryPanelLayout(0);
      return !attached;
    }
    if ($root[0].lastElementChild !== $placeholder[0]) {
      $root.append($placeholder);
      return true;
    }
    return false;
  }

  function scheduleAssistBelowChoices($placeholder) {
    if (requestStoryPanelLayout(0)) {
      requestStoryPanelLayout(250);
      return;
    }
    function move() {
      placeAssistAtPageBottom($placeholder);
    }
    setTimeout(move, 50);
    setTimeout(move, 350);
    setTimeout(move, 1000);
    setTimeout(move, 2500);
    installAssistOrderObserver();
  }

  function requestStoryPanelLayout(delay) {
    if (window.AIStoryGen && window.AIStoryGen.panelManager && typeof window.AIStoryGen.panelManager.scheduleLayout === 'function') {
      try {
        if (typeof window.AIStoryGen.panelManager.clearLegacyPixelObservers === 'function') {
          window.AIStoryGen.panelManager.clearLegacyPixelObservers();
        }
      } catch (_) {}
      window.AIStoryGen.panelManager.scheduleLayout(delay || 0);
      return true;
    }
    if (window.AIStoryGen && typeof window.AIStoryGen.layoutPanels === 'function') {
      window.AIStoryGen.layoutPanels();
      return true;
    }
    return false;
  }

  function isStoryPanelManagerActive() {
    return !!(window.AIStoryGen
      && window.AIStoryGen.panelManager
      && typeof window.AIStoryGen.panelManager.scheduleLayout === 'function');
  }

  function moveAllAssistsBelowChoices() {
    if (window._apgAssistOrderMoving) return;
    cleanupAssistPlaceholders(isPoseContext() ? 'pose' : 'scene');
    if (requestStoryPanelLayout(0)) {
      return;
    }
    window._apgAssistOrderMoving = true;
    $('#passages .apg-ai-assist').each(function () {
      placeAssistAtPageBottom($(this));
    });
    setTimeout(function () { window._apgAssistOrderMoving = false; }, 0);
  }

  function cleanupAssistPlaceholders(mode) {
    if (!mode) mode = isPoseContext() ? 'pose' : 'scene';
    if (mode) $('#passages .apg-ai-assist').not('[data-apg-mode="' + mode + '"]').remove();
    var selector = '#passages .apg-ai-assist';
    if (mode) selector += '[data-apg-mode="' + mode + '"]';
    var groups = {};
    $(selector).each(function () {
      var key = $(this).attr('data-apg-mode') || 'scene';
      if (!groups[key]) groups[key] = [];
      groups[key].push(this);
    });
    Object.keys(groups).forEach(function (key) {
      var nodes = groups[key];
      if (nodes.length <= 1) return;
      var keep = nodes[nodes.length - 1];
      nodes.forEach(function (node) {
        if (node !== keep) $(node).remove();
      });
    });
  }

  function removeStaleAssistPlaceholders(mode, cacheKey) {
    if (!mode || !cacheKey) return;
    $('#passages .apg-ai-assist[data-apg-mode="' + mode + '"]').each(function () {
      if ($(this).attr('data-apg-key') !== cacheKey) $(this).remove();
    });
  }

  function clearStalePromptBoxesForSource(mode, sourceText) {
    if (mode !== 'scene') return;
    $('#passages .apg-ai-assist[data-apg-mode="scene"] .apg-prompt-edit').each(function () {
      var val = String($(this).val() || '').trim();
      if (!val || !isGeneratedImagePromptText(val)) return;
      if (scenePromptConflictsWithCurrentSource(val, sourceText)) $(this).val('');
    });
  }

  function installAssistOrderObserver() {
    if (isStoryPanelManagerActive()) {
      requestStoryPanelLayout(40);
      return;
    }
    if (requestStoryPanelLayout(40)) return;
    if (window._apgAssistOrderObserver) return;
    var root = document.getElementById('passages') || document.body;
    if (!root || typeof MutationObserver === 'undefined') return;
    window._apgAssistOrderObserver = new MutationObserver(function (mutations) {
      if (window._apgAssistOrderMoving) return;
      var onlyPixelMutation = true;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var target = m.target;
        if (target && target.closest && target.closest('.apg-ai-assist, .apg-pixel-placeholder, .apg-pixel-result, .apg-pixel-controls, .apg-pixel-spinner')) continue;
        var added = m.addedNodes || [];
        var removed = m.removedNodes || [];
        for (var a = 0; a < added.length; a++) {
          if (!added[a].classList || !added[a].classList.contains('apg-ai-assist')) onlyPixelMutation = false;
        }
        for (var r = 0; r < removed.length; r++) {
          if (!removed[r].classList || !removed[r].classList.contains('apg-ai-assist')) onlyPixelMutation = false;
        }
        if (!added.length && !removed.length) onlyPixelMutation = false;
      }
      if (onlyPixelMutation) return;
      setTimeout(moveAllAssistsBelowChoices, 40);
    });
    window._apgAssistOrderObserver.observe(root, { childList: true });
    setTimeout(moveAllAssistsBelowChoices, 40);
  }

  function installPoseAssistOrderObserver() {
    if (isStoryPanelManagerActive()) {
      requestStoryPanelLayout(40);
      return;
    }
    if (requestStoryPanelLayout(40)) return;
    if (window._apgPoseAssistOrderObserver) return;
    var root = document.getElementById('passages') || document.body;
    if (!root || typeof MutationObserver === 'undefined') return;
    window._apgPoseAssistOrderObserver = new MutationObserver(function () {
      setTimeout(function () {
        if (requestStoryPanelLayout(0)) {
          return;
        }
        $('#passages .apg-ai-assist[data-apg-mode="pose"]').each(function () {
          placeAssistAtPageBottom($(this));
        });
      }, 40);
    });
    window._apgPoseAssistOrderObserver.observe(root, { childList: true });
  }

  function injectAIStoryAssist() {
    if (!isAIPixelEnabled()) {
      $('#passages .apg-ai-assist').remove();
      return;
    }
    var cfg = loadCfg();
    if (!Number(cfg.aiStoryAssist || 0)) return;
    var passage = currentPassageName();
    if (isMenuPassage(passage)) return;
    var $passage = $('#passages .passage');
    if (!$passage.length) return;
    var pose = isPoseContext();
    if (!Number(cfg.aiStorySceneButton || 0)) return;
    $('#passages .apg-ai-assist').not('[data-apg-mode="scene"]').remove();
    var storyText = getAIStoryText();
    if (storyText.length < Number(cfg.aiStoryMinText || 80)) return;
    var $aiHost = $passage.find('.ai-replaced-content, .ai-narrative-wrap, .ai-narrative-section').last();
    if (!$aiHost.length) $aiHost = $passage;
    renderAssistPlaceholder($aiHost, 'scene', buildAIStoryPrompt('scene'));
  }

  function scheduleAIStoryAssist() {
    clearTimeout(_assistInjectTimer);
    _assistInjectTimer = setTimeout(injectAIStoryAssist, 250);
  }

  function isStoryOrPixelPanelNode(node) {
    if (!node || !node.classList) return false;
    return node.classList.contains('apg-ai-assist')
      || node.classList.contains('ai-choices')
      || node.classList.contains('ai-choices-end')
      || node.classList.contains('ai-back-to-game')
      || node.classList.contains('ai-reload-scene-panel')
      || node.classList.contains('ai-item-use-panel')
      || node.classList.contains('ai-memory-inline')
      || node.classList.contains('ai-gen-loading');
  }

  function isStoryOrPixelPanelMutation(mutation) {
    var added = mutation && mutation.addedNodes || [];
    var removed = mutation && mutation.removedNodes || [];
    if (!added.length && !removed.length) return false;
    for (var a = 0; a < added.length; a++) {
      if (!isStoryOrPixelPanelNode(added[a])) return false;
    }
    for (var r = 0; r < removed.length; r++) {
      if (!isStoryOrPixelPanelNode(removed[r])) return false;
    }
    return true;
  }

  function areOnlyStoryOrPixelPanelMutations(mutations) {
    if (!mutations || !mutations.length) return false;
    for (var i = 0; i < mutations.length; i++) {
      if (!isStoryOrPixelPanelMutation(mutations[i])) return false;
    }
    return true;
  }

  function cleanupKnownMenuErrors() {
    var passage = currentPassageName();
    if (!/^(Settings|AIPixelGen_Config|AIPixelGen_Workshop)$/i.test(passage)) return;
    $('#passages .error-view, #passages .error, #passages .macro-error').each(function () {
      var text = String($(this).text() || '');
      var knownDoLInitNoise = text.indexOf('<<doVersionCheck>>') !== -1 && text.indexOf('<<backComp>>') !== -1;
      var knownToolPageLinkNoise = /The passage AIPixelGen_(Config|Workshop) has no usable links/i.test(text);
      if (knownDoLInitNoise || knownToolPageLinkNoise) $(this).remove();
    });
  }

  // ---------- 5. 图像 API 调用 ----------
  function callImgAPI(prompt, cfg) {
    cfg = Object.assign({}, cfg || {});
    if (cfg._apgMode === 'scene') {
      var promptForNeg = String(prompt || '').toLowerCase();
      var indoorScene = /\b(?:bedroom|bathroom|kitchen|hall|room|interior|indoor|home|orphanage)\b/i.test(String(prompt || ''))
        && !/\b(?:forest cabin|clearing|field|street|beach|moor|park|farm|garden|woods|outdoors?)\b/i.test(String(prompt || ''));
      var hasExplicitOtherSubject = /exactly two visible characters|visible cast limited|character layer,\s*other visible|player character and (?:Alex|Robin|Eden|Bailey|Whitney|Avery|Kylar)|visible (?:dog|wolf|horse|tentacles?|hawk|eagle|harpy)/i.test(String(prompt || ''));
      var mentionsCat = /\b(?:cat|cats|kitten|kittens|feline)\b/.test(promptForNeg) || /猫/.test(String(prompt || ''));
      cfg.negativePrompt = cleanText([
        cfg.negativePrompt || '',
        'text, readable text, letters, numbers, glyphs, captions, subtitles, dialogue bubbles, speech bubbles, UI, interface, menu, labels, signs, signage, posters with writing, book text, paper text, wall text, watermark, logo, signature, version number',
        indoorScene ? 'forest, woods, trees, grass field, outdoor wilderness, sky background, park, campsite, nature landscape' : '',
        'split-screen, split panel, comic panel, manga panel, storyboard, collage, diptych, triptych, grid layout, two panels, multiple panels, multiple frames, multiple camera views, before and after, multiple separate scenes',
        'crowd, extra people, unrelated people, background bystanders, duplicate characters, repeated same person, portrait, character sheet, empty background',
        hasExplicitOtherSubject ? 'missing named character, cropped out named character' : 'second person, extra companion, random NPC, unnamed person',
        'extra unrelated animals, random pets',
        mentionsCat ? '' : 'cats, kittens, random cats'
      ].filter(Boolean).join(', '), 1200);
    }
    if (String((cfg && cfg.imgApiType) || '').toLowerCase() === 'comfyui' && !cfg.imgKey) {
      cfg = Object.assign({}, cfg, { imgKey: '__local_comfyui__' });
    }
    if (!cfg.imgKey) return Promise.reject(new Error('图像 API key 未设置'));
    if (!cfg.imgEndpoint) return Promise.reject(new Error('图像 API endpoint 未设置'));

    // SiliconFlow 生图参数（Z-Image / Qwen-Image 通用）
    var apiType = String(cfg.imgApiType || 'siliconflow').toLowerCase();
    prompt = adaptPromptForProtocol(prompt, cfg);

    if (apiType === 'comfyui') return callComfyUI(prompt, cfg);

    var body = {
      model: cfg.imgModel,
      prompt: prompt,
      image_size: cfg.imgSize || '1024x1024',
      num_inference_steps: cfg.imgSteps || 8,
    };
    if (cfg.negativePrompt) body.negative_prompt = cleanText(cfg.negativePrompt, 800);
    if (apiType === 'openai') {
      body.size = cfg.imgSize || '1024x1024';
      delete body.image_size;
      delete body.num_inference_steps;
      delete body.negative_prompt;
    } else if (/novel|nai/.test(apiType) && cfg.negativePrompt) {
      body.uc = cleanText(cfg.negativePrompt, 800);
    }
    // Kolors 需要额外参数
    if (/Kolors/i.test(cfg.imgModel)) {
      body.batch_size = 1;
      body.guidance_scale = 7.5;
    }

    return fetch(cfg.imgEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.imgKey,
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('IMG HTTP ' + r.status + ': ' + t.slice(0, 300)); });
      return r.json();
    }).then(function (j) {
      // SiliconFlow 生图返回: { images: [{ url: "..." }], timings: {...}, seed: ... }
      // 也兼容 OpenAI 格式: { data: [{ url | b64_json }] }
      var url = null;
      if (j && j.images && j.images[0] && j.images[0].url) {
        url = j.images[0].url;
      } else if (j && j.data && j.data[0]) {
        if (j.data[0].b64_json) return 'data:image/png;base64,' + j.data[0].b64_json;
        url = j.data[0].url || null;
      } else if (j && j.images && j.images[0] && typeof j.images[0] === 'string') {
        url = j.images[0];
      }
      if (!url) throw new Error('图像 API 返回无图片URL: ' + JSON.stringify(j).slice(0, 200));
      // URL 有效期 1 小时，fetch 转 dataURL 存到 IndexedDB 和历史画廊
      return fetchAsDataURL(url);
    });
  }

  // 把远程 URL 转成 dataURL；CORS 失败时直接抛出
  function parseSizePair(sizeText) {
    var m = String(sizeText || '1024x1024').match(/(\d+)\s*[xX*]\s*(\d+)/);
    var w = m ? Number(m[1]) : 1024;
    var h = m ? Number(m[2]) : 1024;
    function snap(v) {
      v = Math.max(256, Math.min(2048, Number(v) || 1024));
      return Math.round(v / 8) * 8;
    }
    return { width: snap(w), height: snap(h) };
  }

  function comfyBaseURL(cfg) {
    return String(cfg.imgEndpoint || 'http://127.0.0.1:8188').replace(/\/+$/, '').replace(/\/prompt$/i, '');
  }

  function comfySeed(cfg) {
    var s = Number(cfg.comfySeed);
    if (!isFinite(s) || s < 0) return Math.floor(Math.random() * 0x7fffffff);
    return Math.floor(s);
  }

  function poseControlActive(cfg) {
    return !!(cfg && cfg._apgMode === 'pose'
      && Number(cfg.specialPoseControlEnabled || 0)
      && String(cfg.specialPoseControlNetModel || '').trim());
  }

  function drawPosePerson(ctx, pts, color) {
    function line(a, b, c) {
      if (!pts[a] || !pts[b]) return;
      ctx.strokeStyle = c || color;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }
    [['head', 'neck'], ['neck', 'lshoulder'], ['neck', 'rshoulder'], ['lshoulder', 'lelbow'], ['lelbow', 'lwrist'], ['rshoulder', 'relbow'], ['relbow', 'rwrist'], ['neck', 'hip'], ['hip', 'lknee'], ['lknee', 'lankle'], ['hip', 'rknee'], ['rknee', 'rankle']].forEach(function (p, i) {
      line(p[0], p[1], ['#ff2b2b', '#ff9f1c', '#ffe66d', '#2ec4b6', '#3a86ff', '#8338ec'][i % 6]);
    });
    Object.keys(pts).forEach(function (k) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pts[k][0], pts[k][1], k === 'head' ? 13 : 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function createPoseGuideBlob(cfg) {
    var size = parseSizePair(cfg.imgSize || '1024x1024');
    var w = Math.max(512, size.width);
    var h = Math.max(512, size.height);
    var story = cleanText(getVisiblePassageText() + ' ' + collectPoseSummary(), 5000);
    var kneeling = /跪坐|跪在|kneeling|on knees/i.test(story);
    var lying = /仰躺|躺在|lying on (?:the )?back|on back/i.test(story);
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    function sx(x) { return Math.round(x * w); }
    function sy(y) { return Math.round(y * h); }
    var player;
    var alex;
    if (lying) {
      player = { head: [sx(0.34), sy(0.54)], neck: [sx(0.43), sy(0.55)], hip: [sx(0.56), sy(0.57)], lshoulder: [sx(0.42), sy(0.49)], rshoulder: [sx(0.43), sy(0.61)], lelbow: [sx(0.34), sy(0.45)], lwrist: [sx(0.28), sy(0.43)], relbow: [sx(0.36), sy(0.66)], rwrist: [sx(0.30), sy(0.70)], lknee: [sx(0.68), sy(0.48)], lankle: [sx(0.77), sy(0.42)], rknee: [sx(0.68), sy(0.66)], rankle: [sx(0.78), sy(0.72)] };
      alex = { head: [sx(0.58), sy(0.28)], neck: [sx(0.58), sy(0.37)], hip: [sx(0.60), sy(0.52)], lshoulder: [sx(0.52), sy(0.38)], rshoulder: [sx(0.64), sy(0.38)], lelbow: [sx(0.47), sy(0.47)], lwrist: [sx(0.42), sy(0.54)], relbow: [sx(0.68), sy(0.47)], rwrist: [sx(0.62), sy(0.57)], lknee: [sx(0.52), sy(0.68)], lankle: [sx(0.45), sy(0.80)], rknee: [sx(0.69), sy(0.67)], rankle: [sx(0.75), sy(0.79)] };
    } else if (kneeling) {
      player = { head: [sx(0.44), sy(0.31)], neck: [sx(0.45), sy(0.41)], hip: [sx(0.47), sy(0.58)], lshoulder: [sx(0.38), sy(0.42)], rshoulder: [sx(0.52), sy(0.42)], lelbow: [sx(0.33), sy(0.51)], lwrist: [sx(0.28), sy(0.58)], relbow: [sx(0.55), sy(0.51)], rwrist: [sx(0.53), sy(0.62)], lknee: [sx(0.39), sy(0.74)], lankle: [sx(0.30), sy(0.83)], rknee: [sx(0.56), sy(0.74)], rankle: [sx(0.66), sy(0.83)] };
      alex = { head: [sx(0.67), sy(0.34)], neck: [sx(0.66), sy(0.44)], hip: [sx(0.66), sy(0.62)], lshoulder: [sx(0.59), sy(0.45)], rshoulder: [sx(0.73), sy(0.45)], lelbow: [sx(0.53), sy(0.53)], lwrist: [sx(0.47), sy(0.58)], relbow: [sx(0.74), sy(0.55)], rwrist: [sx(0.66), sy(0.62)], lknee: [sx(0.59), sy(0.76)], lankle: [sx(0.51), sy(0.87)], rknee: [sx(0.75), sy(0.76)], rankle: [sx(0.82), sy(0.86)] };
    } else {
      player = { head: [sx(0.40), sy(0.38)], neck: [sx(0.44), sy(0.47)], hip: [sx(0.50), sy(0.63)], lshoulder: [sx(0.38), sy(0.48)], rshoulder: [sx(0.50), sy(0.46)], lelbow: [sx(0.32), sy(0.56)], lwrist: [sx(0.28), sy(0.66)], relbow: [sx(0.55), sy(0.53)], rwrist: [sx(0.58), sy(0.64)], lknee: [sx(0.44), sy(0.78)], lankle: [sx(0.36), sy(0.88)], rknee: [sx(0.62), sy(0.76)], rankle: [sx(0.72), sy(0.84)] };
      alex = { head: [sx(0.63), sy(0.27)], neck: [sx(0.62), sy(0.37)], hip: [sx(0.61), sy(0.55)], lshoulder: [sx(0.55), sy(0.38)], rshoulder: [sx(0.69), sy(0.38)], lelbow: [sx(0.50), sy(0.48)], lwrist: [sx(0.46), sy(0.58)], relbow: [sx(0.72), sy(0.48)], rwrist: [sx(0.66), sy(0.60)], lknee: [sx(0.55), sy(0.70)], lankle: [sx(0.49), sy(0.84)], rknee: [sx(0.70), sy(0.70)], rankle: [sx(0.76), sy(0.84)] };
    }
    drawPosePerson(ctx, player, '#ffffff');
    drawPosePerson(ctx, alex, '#00d4ff');
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('failed to create pose guide image'));
      }, 'image/png');
    });
  }

  function uploadComfyImage(base, blob, filename) {
    var fd = new FormData();
    fd.append('image', blob, filename);
    fd.append('type', 'input');
    fd.append('overwrite', 'true');
    return fetch(base + '/upload/image', { method: 'POST', body: fd })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('ComfyUI /upload/image HTTP ' + r.status + ': ' + t.slice(0, 300)); });
        return r.json();
      })
      .then(function (j) {
        var name = j && (j.name || j.filename);
        if (!name) throw new Error('ComfyUI upload did not return a filename');
        return j.subfolder ? String(j.subfolder).replace(/\/+$/, '') + '/' + name : name;
      });
  }

  function prepareComfyWorkflow(prompt, cfg, base) {
    if (!poseControlActive(cfg)) return Promise.resolve(buildComfyWorkflow(prompt, cfg, ''));
    return createPoseGuideBlob(cfg)
      .then(function (blob) { return uploadComfyImage(base, blob, 'aipixelgen_pose_' + Date.now() + '.png'); })
      .then(function (poseImageName) { return buildComfyWorkflow(prompt, cfg, poseImageName); });
  }

  function buildComfyWorkflow(prompt, cfg, poseImageName) {
    var size = parseSizePair(cfg.imgSize);
    var negative = cleanText(cfg.negativePrompt || '', 1200);
    if (cfg && cfg._apgMode === 'pose') {
      negative = cleanText([negative, 'solo, single character, one person, missing second character, cropped out second character, portrait, bust shot, seated portrait, seated alone, kneeling alone, solo pinup pose, unrelated pose, wrong pose, looking at viewer only'].filter(Boolean).join(', '), 1400);
    }
    var usePoseControl = poseControlActive(cfg) && poseImageName;
    var workflow = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: comfySeed(cfg),
          steps: Math.max(1, Number(cfg.imgSteps || 20)),
          cfg: Math.max(1, Number(cfg.comfyCfgScale || 7)),
          sampler_name: cfg.comfySampler || 'euler',
          scheduler: cfg.comfyScheduler || 'normal',
          denoise: 1,
          model: ['4', 0],
          positive: usePoseControl ? ['12', 0] : ['6', 0],
          negative: usePoseControl ? ['12', 1] : ['7', 0],
          latent_image: ['5', 0]
        }
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: cfg.imgModel || 'model.safetensors' }
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: { width: size.width, height: size.height, batch_size: 1 }
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: cleanText(prompt, 2400), clip: ['4', 1] }
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: { text: negative, clip: ['4', 1] }
      },
      '8': {
        class_type: 'VAEDecode',
        inputs: { samples: ['3', 0], vae: ['4', 2] }
      },
      '9': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'AIPixelGen', images: ['8', 0] }
      }
    };
    if (usePoseControl) {
      workflow['10'] = {
        class_type: 'LoadImage',
        inputs: { image: poseImageName }
      };
      workflow['11'] = {
        class_type: 'ControlNetLoader',
        inputs: { control_net_name: String(cfg.specialPoseControlNetModel || '').trim() }
      };
      workflow['12'] = {
        class_type: 'ControlNetApplyAdvanced',
        inputs: {
          positive: ['6', 0],
          negative: ['7', 0],
          control_net: ['11', 0],
          image: ['10', 0],
          strength: Math.max(0, Number(cfg.specialPoseControlStrength || 1)),
          start_percent: 0,
          end_percent: Math.min(1, Math.max(0.05, Number(cfg.specialPoseControlEnd || 0.85)))
        }
      };
    }
    return workflow;
  }

  function callComfyUI(prompt, cfg) {
    var base = comfyBaseURL(cfg);
    if (!String(cfg.imgModel || '').trim()) {
      return Promise.reject(new Error('ComfyUI checkpoint 未设置：请填写本地 Checkpoint 文件名'));
    }
    var clientId = 'aipixelgen-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
    return prepareComfyWorkflow(prompt, cfg, base).then(function (workflow) {
      var body = { client_id: clientId, prompt: workflow };
      return fetch(base + '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('ComfyUI /prompt HTTP ' + r.status + ': ' + t.slice(0, 400)); });
      return r.json();
    }).then(function (j) {
      if (!j || !j.prompt_id) throw new Error('ComfyUI did not return prompt_id: ' + JSON.stringify(j).slice(0, 200));
      return waitComfyHistory(base, j.prompt_id, Date.now() + 180000);
    }).then(function (hist) {
      var img = findComfyOutputImage(hist);
      if (!img) throw new Error('ComfyUI history has no output image');
      var q = '?filename=' + encodeURIComponent(img.filename)
        + '&subfolder=' + encodeURIComponent(img.subfolder || '')
        + '&type=' + encodeURIComponent(img.type || 'output');
      return fetchAsDataURL(base + '/view' + q);
    });
  }

  function waitComfyHistory(base, promptId, deadline) {
    return fetch(base + '/history/' + encodeURIComponent(promptId))
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('ComfyUI /history HTTP ' + r.status + ': ' + t.slice(0, 300)); });
        return r.json();
      })
      .then(function (j) {
        if (j && j[promptId]) return j[promptId];
        if (Date.now() > deadline) throw new Error('ComfyUI generation timed out');
        return new Promise(function (resolve) { setTimeout(resolve, 1200); })
          .then(function () { return waitComfyHistory(base, promptId, deadline); });
      });
  }

  function findComfyOutputImage(hist) {
    var outputs = hist && hist.outputs ? hist.outputs : {};
    var keys = Object.keys(outputs);
    for (var i = 0; i < keys.length; i++) {
      var out = outputs[keys[i]];
      if (out && out.images && out.images[0]) return out.images[0];
    }
    return null;
  }

  function fetchAsDataURL(url) {
    return fetch(url, { mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('下载图片 HTTP ' + r.status);
      return r.blob();
    }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error); };
        fr.readAsDataURL(blob);
      });
    });
  }

  // ---------- 6. Canvas 后处理 ----------
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败')); };
      img.src = src;
    });
  }

  // 对四角颜色做相同性判断 -> 视为背景；把所有近似该背景色的像素抠成透明
  function alphaFromBg(imgData, tolerance) {
    var d = imgData.data, w = imgData.width, h = imgData.height;
    function px(x, y) { var i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }
    var corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    // 取四角颜色的中位数作为背景色
    var bg = [0, 0, 0];
    for (var c = 0; c < 3; c++) {
      var arr = corners.map(function (v) { return v[c]; }).sort(function (a, b) { return a - b; });
      bg[c] = (arr[1] + arr[2]) / 2;
    }
    // 如果四角颜色差异太大（说明非纯色背景），跳过
    var maxDelta = 0;
    for (var i = 0; i < corners.length; i++) {
      for (var j = i + 1; j < corners.length; j++) {
        var dd = Math.abs(corners[i][0] - corners[j][0]) + Math.abs(corners[i][1] - corners[j][1]) + Math.abs(corners[i][2] - corners[j][2]);
        if (dd > maxDelta) maxDelta = dd;
      }
    }
    if (maxDelta > 80) return imgData; // 背景不纯，放弃抠图
    var tol = tolerance || 28;
    for (var p = 0; p < d.length; p += 4) {
      var dr = Math.abs(d[p] - bg[0]);
      var dg = Math.abs(d[p + 1] - bg[1]);
      var db = Math.abs(d[p + 2] - bg[2]);
      if (dr < tol && dg < tol && db < tol) d[p + 3] = 0;
      else if (dr + dg + db < tol * 2) {
        // 边缘半透明渐隐
        d[p + 3] = Math.min(255, Math.max(0, (dr + dg + db - tol) / tol * 255));
      }
    }
    return imgData;
  }

  // DoL 风格调色板（手挑代表色，覆盖肤色/布料/金属/木头/天空/草地）
  var DOL_PALETTE = [
    // 深色描边 + 暗部
    [0, 0, 0], [32, 28, 26], [56, 44, 38], [82, 62, 50],
    // 木 / 棕
    [110, 80, 56], [148, 110, 78], [184, 142, 100], [210, 178, 138],
    // 肤色阶
    [240, 210, 180], [232, 192, 158], [212, 168, 132], [180, 134, 102],
    // 红
    [180, 60, 60], [220, 100, 90], [240, 150, 138],
    // 蓝
    [70, 90, 130], [110, 140, 180], [160, 190, 220],
    // 绿
    [90, 130, 80], [130, 170, 110], [180, 210, 150],
    // 紫 / 粉
    [140, 100, 150], [190, 140, 190], [230, 190, 220],
    // 黄 / 金
    [220, 180, 80], [240, 215, 130], [250, 240, 200],
    // 灰 / 白
    [80, 80, 80], [140, 140, 140], [200, 200, 200], [240, 240, 240],
  ];

  function quantizeToPalette(imgData) {
    var d = imgData.data;
    for (var p = 0; p < d.length; p += 4) {
      if (d[p + 3] < 8) continue; // 已透明
      var r = d[p], g = d[p + 1], b = d[p + 2];
      var bestI = 0, bestD = 1e9;
      for (var i = 0; i < DOL_PALETTE.length; i++) {
        var dr = r - DOL_PALETTE[i][0];
        var dg = g - DOL_PALETTE[i][1];
        var db = b - DOL_PALETTE[i][2];
        var dist = dr * dr + dg * dg + db * db;
        if (dist < bestD) { bestD = dist; bestI = i; }
      }
      d[p] = DOL_PALETTE[bestI][0];
      d[p + 1] = DOL_PALETTE[bestI][1];
      d[p + 2] = DOL_PALETTE[bestI][2];
    }
    return imgData;
  }

  function postProcess(srcDataURL, cfg, catKey) {
    var cat = CATEGORIES[catKey] || CATEGORIES.icon;
    if (catKey === 'concept') return Promise.resolve(srcDataURL); // 概念图不处理

    return loadImage(srcDataURL).then(function (img) {
      // 第一步：直接画到 canvas
      var c1 = document.createElement('canvas');
      c1.width = img.naturalWidth; c1.height = img.naturalHeight;
      var ctx1 = c1.getContext('2d');
      ctx1.drawImage(img, 0, 0);
      var data = ctx1.getImageData(0, 0, c1.width, c1.height);

      // 抠透明背景
      data = alphaFromBg(data, 30);
      // DoL 调色板量化
      if (cfg.paletteMode === 'dol') data = quantizeToPalette(data);
      ctx1.putImageData(data, 0, 0);

      // 第二步：缩放到目标尺寸（保持 aspect）
      var target = cfg.outputSize > 0 ? cfg.outputSize : (cat.defaultSize || 0);
      if (target > 0 && target !== c1.width) {
        var c2 = document.createElement('canvas');
        c2.width = target; c2.height = target;
        var ctx2 = c2.getContext('2d');
        ctx2.imageSmoothingEnabled = false;
        // 等比缩放居中
        var ratio = Math.min(target / c1.width, target / c1.height);
        var w = Math.round(c1.width * ratio);
        var h = Math.round(c1.height * ratio);
        var dx = Math.floor((target - w) / 2);
        var dy = Math.floor((target - h) / 2);
        ctx2.drawImage(c1, dx, dy, w, h);
        return c2.toDataURL('image/png');
      }
      return c1.toDataURL('image/png');
    });
  }

  // ---------- 7. 历史画廊 ----------
  function saveHistory(record) {
    return idbPut(IDB_STORE_HIST, record).catch(function () { });
  }
  function listHistory() { return idbAll(IDB_STORE_HIST).then(function (a) { return a.sort(function (x, y) { return y.id - x.id; }); }); }
  function delHistory(id) { return idbDel(IDB_STORE_HIST, id); }

  // ---------- 8. 下载 ----------
  function downloadDataURL(dataURL, filename) {
    var a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 100);
  }

  // ---------- 9. UI: 配置面板 ----------
  function buildConfigForm($root, isSettingsTab) {
    var cfg = loadCfg();
    var wrapperClass = isSettingsTab ? 'apg-cfg apg-cfg-settings' : 'apg-cfg';
    var $box = $('<div></div>').addClass(wrapperClass);

    // -- LLM 段 --
    $box.append('<h3>① 文本 LLM（用于智能扩写 prompt，推荐 DeepSeek）</h3>');
    var $llm = $('<div class="apg-cfg-form"></div>');
    [
      ['llmEndpoint', 'LLM Endpoint', 'text'],
      ['llmKey', 'LLM API Key', 'password'],
      ['llmModel', 'LLM Model', 'text'],
    ].forEach(function (r) {
      $llm.append($('<label></label>').text(r[1]));
      $llm.append($('<input>').attr({ type: r[2], 'data-k': r[0] }).val(cfg[r[0]]));
    });
    $box.append($llm);

    // -- 图像 段 --
    $box.append('<h3>② 图像生成 API（推荐 SiliconFlow Flux）</h3>');
    var $img = $('<div class="apg-cfg-form"></div>');
    $img.append($('<label>图像 API 类型</label>'));
    var $apiType = $('<select data-k="imgApiType"></select>');
    [
      ['siliconflow', 'SiliconFlow / Flux / Z-Image'],
      ['openai', 'OpenAI Images'],
      ['sd', 'Stable Diffusion / WebUI'],
      ['novelai', 'NovelAI / NAI'],
      ['comfyui', 'ComfyUI simple endpoint'],
      ['custom', 'Custom / 保持通用请求']
    ].forEach(function (r) { $apiType.append($('<option></option>').attr('value', r[0]).text(r[1])); });
    $apiType.val(cfg.imgApiType || 'siliconflow');
    $img.append($apiType);
    $img.append($('<label>提示词协议</label>'));
    var $protocol = $('<select data-k="promptProtocol"></select>');
    [
      ['auto', '自动：根据 API 类型切换'],
      ['natural', '自然语言：Flux/OpenAI 友好'],
      ['tags', '关键词 tags：SD/NovelAI 友好']
    ].forEach(function (r) { $protocol.append($('<option></option>').attr('value', r[0]).text(r[1])); });
    $protocol.val(cfg.promptProtocol || 'auto');
    $img.append($protocol);
    [
      ['imgEndpoint', 'Image Endpoint', 'text'],
      ['imgKey', 'Image API Key', 'password'],
      ['imgModel', 'Image Model', 'text'],
      ['imgSize', '分辨率 (WxH)', 'text'],
      ['imgSteps', '推理步数', 'number'],
      ['comfySampler', 'ComfyUI Sampler', 'text'],
      ['comfyScheduler', 'ComfyUI Scheduler', 'text'],
      ['comfyCfgScale', 'ComfyUI CFG Scale', 'number'],
      ['comfySeed', 'ComfyUI Seed (-1 random)', 'number'],
    ].forEach(function (r) {
      $img.append($('<label></label>').text(r[1]));
      $img.append($('<input>').attr({ type: r[2], 'data-k': r[0] }).val(cfg[r[0]]));
    });
    $box.append($img);

    // -- 风格 / 后处理 段 --
    $box.append('<h3>③ 风格与后处理</h3>');
    var $sty = $('<div class="apg-cfg-form"></div>');
    $sty.append($('<label>风格关键词</label>'));
    $sty.append($('<textarea data-k="styleSuffix" rows="3"></textarea>').val(cfg.styleSuffix));
    $sty.append($('<label>个人追加提示词</label>'));
    $sty.append($('<textarea data-k="personalPrompt" rows="3" placeholder="每次生成图片都会追加，例如：soft moonlight, delicate background, elegant pose"></textarea>').val(cfg.personalPrompt || ''));
    $sty.append($('<label>负面提示词</label>'));
    $sty.append($('<textarea data-k="negativePrompt" rows="3" placeholder="不想出现的内容，例如：text, watermark, bad anatomy"></textarea>').val(cfg.negativePrompt || ''));
    $sty.append($('<label>角色外观锁定</label>'));
    $sty.append($('<textarea data-k="lockedAppearance" rows="3" placeholder="固定玩家外观/服装，例如：wearing a red and white miko outfit, long white hair, oil-paper umbrella"></textarea>').val(cfg.lockedAppearance || ''));
    $sty.append($('<label>构图偏好</label>'));
    var $comp = $('<select data-k="compositionPreset"></select>');
    [
      ['', '自动'],
      ['wide environmental scene, character small in frame', '远景环境图'],
      ['full-body character, readable outfit, centered composition', '全身角色'],
      ['half-body character, outfit and expression emphasized', '半身角色'],
      ['over-the-shoulder cinematic composition', '越肩电影感'],
      ['top-down RPG scene composition', '俯视 RPG'],
      ['side-view visual novel composition', '侧视 VN']
    ].forEach(function (r) { $comp.append($('<option></option>').attr('value', r[0]).text(r[1])); });
    $comp.val(cfg.compositionPreset || '');
    $sty.append($comp);
    $sty.append($('<label>调色板模式</label>'));
    var $pal = $('<select data-k="paletteMode"></select>');
    $pal.append('<option value="dol">DoL 调色板量化</option>');
    $pal.append('<option value="free">自由（不量化）</option>');
    $pal.val(cfg.paletteMode);
    $sty.append($pal);
    $sty.append($('<label>输出尺寸 (px)</label>'));
    $sty.append($('<input type="number" data-k="outputSize" min="0">').val(cfg.outputSize));
    $sty.append($('<label>自定义生图类型</label>'));
    var $customStyleWrap = $('<div class="apg-custom-style-wrap"></div>');
    $customStyleWrap.append($('<div class="apg-meta"></div>').text('这里添加的风格会出现在剧情页“生图风格/类型”下拉框里。自然语言适合 Flux/OpenAI，tags 适合 SD/NovelAI/ComfyUI；tags 留空时会自动从自然语言简化。'));
    var $customStyleList = $('<div class="apg-custom-style-list"></div>');
    function addCustomStyleRow(style) {
      style = style || {};
      var $row = $('<div class="apg-custom-style-row"></div>');
      var $head = $('<div class="apg-custom-style-head"></div>');
      $head.append($('<input type="text" data-custom-style-label placeholder="风格名，例如：柔和赛璐璐">').val(style.label || ''));
      var $remove = $('<button type="button" class="apg-btn apg-custom-style-remove">删除</button>');
      $remove.on('click', function () { $row.remove(); });
      $head.append($remove);
      $row.append($head);
      $row.append($('<label class="apg-custom-style-field"></label>')
        .append($('<span></span>').text('自然语言风格提示词'))
        .append($('<textarea rows="2" data-custom-style-prompt placeholder="适合 Flux/OpenAI，例如：soft cel shaded visual novel CG, gentle lighting, clean linework"></textarea>').val(style.prompt || '')));
      $row.append($('<label class="apg-custom-style-field"></label>')
        .append($('<span></span>').text('Tags 风格提示词'))
        .append($('<textarea rows="2" data-custom-style-tags placeholder="适合 SD/NovelAI/ComfyUI，例如：visual novel CG, cel shading, clean lineart, soft lighting"></textarea>').val(style.tags || '')));
      $customStyleList.append($row);
    }
    normalizeCustomStyles(cfg.customStyles).forEach(function (style) { addCustomStyleRow(style); });
    var $btnAddStyle = $('<button type="button" class="apg-btn">添加自定义风格</button>');
    $btnAddStyle.on('click', function () { addCustomStyleRow({}); });
    $customStyleWrap.append($customStyleList).append($btnAddStyle);
    $sty.append($customStyleWrap);
    $box.append($sty);

    // -- AIStoryGen 辅助 段 --
    $box.append('<h3>④ AIStoryGen 辅助功能</h3>');
    var $asg = $('<div class="apg-cfg-form"></div>');
    var storyAssistRows = [
      ['aiStoryAssist', '启用 AIStoryGen 绘图入口'],
      ['aiStorySceneButton', 'AI 剧情旁显示场景图按钮']
    ];
    storyAssistRows.forEach(function (r) {
      $asg.append($('<label></label>').text(r[1]));
      var $sel = $('<select></select>').attr('data-k', r[0]);
      $sel.append('<option value="1">开</option>');
      $sel.append('<option value="0">关</option>');
      $sel.val(String(cfg[r[0]] == null ? 1 : cfg[r[0]]));
      $asg.append($sel);
    });
    $asg.append($('<label>剧情最短字数</label>'));
    $asg.append($('<input type="number" data-k="aiStoryMinText" min="0">').val(cfg.aiStoryMinText));
    $box.append($asg);

    // -- 按钮 / 消息 --
    var $btnSave = $('<button class="apg-btn apg-btn-primary">💾 保存</button>');
    var $btnTestLLM = $('<button class="apg-btn">🔌 测试 LLM</button>');
    var $btnTestImg = $('<button class="apg-btn">🎨 测试图像 API</button>');
    var $msg = $('<div class="apg-msg info"></div>');
    var $btns = $('<div></div>').append($btnSave).append($btnTestLLM).append($btnTestImg);
    $box.append($btns).append($msg);

    function readForm() {
      var c = Object.assign({}, cfg);
      $box.find('[data-k]').each(function () {
        var k = $(this).attr('data-k');
        var v = $(this).val();
        if (this.type === 'number') v = Number(v) || 0;
        c[k] = v;
      });
      c.customStyles = [];
      $customStyleList.find('.apg-custom-style-row').each(function () {
        var label = cleanText($(this).find('[data-custom-style-label]').val(), 60);
        var prompt = cleanText($(this).find('[data-custom-style-prompt]').val(), 700);
        var tags = cleanText($(this).find('[data-custom-style-tags]').val(), 700);
        if (label && (prompt || tags)) c.customStyles.push({ label: label, prompt: prompt, tags: tags });
      });
      c.customStyles = normalizeCustomStyles(c.customStyles);
      return c;
    }

    $btnSave.on('click', function () {
      cfg = readForm();
      saveCfg(cfg);
      $msg.removeClass('err ok').addClass('ok').text('✔ 已保存');
    });

    $btnTestLLM.on('click', function () {
      cfg = readForm(); saveCfg(cfg);
      $msg.removeClass('err ok').addClass('info').text('LLM 测试中…');
      callLLM('Reply with one word: OK', 'ping', cfg)
        .then(function (t) { $msg.removeClass('err').addClass('ok').text('✔ LLM OK → ' + t.slice(0, 120)); })
        .catch(function (e) { $msg.removeClass('ok').addClass('err').text('✘ ' + e.message); });
    });
    $btnTestImg.on('click', function () {
      cfg = readForm(); saveCfg(cfg);
      $msg.removeClass('err ok').addClass('info').text('图像测试中…（首次约 5~15 秒）');
      callImgAPI('a tiny pixel-art apple, white background', cfg)
        .then(function (dataURL) {
          $msg.removeClass('err').addClass('ok').empty();
          $msg.append('<span>✔ 图像 API OK</span><br>');
          $msg.append($('<img>').attr('src', dataURL).css({ maxWidth: '128px', maxHeight: '128px', marginTop: '4px', imageRendering: 'pixelated' }));
        })
        .catch(function (e) { $msg.removeClass('ok').addClass('err').text('✘ ' + e.message); });
    });
    if ($btnTestLocalImg && $btnTestLocalImg.length) {
      $btnTestLocalImg.on('click', function () {
        cfg = readForm();
        saveCfg(cfg);
        var localCfg = specialSceneCfg(cfg);
        $localMsg.removeClass('err ok').addClass('info').text('本地 ComfyUI 生成测试中…（首次加载模型可能需要更久）');
        callImgAPI('local ComfyUI test image, simple red apple on a wooden table, clean composition, no text, no watermark', localCfg)
          .then(function (dataURL) {
            $localMsg.removeClass('err').addClass('ok').empty();
            $localMsg.append('<span>✔ 本地生成 AI OK</span><br>');
            $localMsg.append($('<img>').attr('src', dataURL).css({ maxWidth: '160px', maxHeight: '160px', marginTop: '4px', imageRendering: 'auto' }));
          })
          .catch(function (e) {
            var detail = e && e.message ? e.message : String(e || 'unknown error');
            var hint = /Failed to fetch|NetworkError|CORS/i.test(detail)
              ? '。通常是浏览器跨域或局域网预检限制：请重启已补好 CORS/PNA 的 ComfyUI'
              : '';
            $localMsg.removeClass('ok').addClass('err').text('✘ 本地生成 AI 失败：' + detail + hint);
          });
      });
    }

    $root.empty().append($box);
  }

  function buildPersonalSettings($root) {
    var cfg = loadCfg();
    var $box = $('<div class="apg-cfg apg-personal-settings"></div>');
    $box.append('<h3>AI生图玩家个人设定</h3>');
    $box.append($('<div class="apg-hint"></div>').text('这些设置会影响剧情生图、姿态图和一键生成。适合固定玩家外观、偏好画风、排除不想出现的内容。'));
    var $form = $('<div class="apg-cfg-form"></div>');
    function addText(k, label, rows, placeholder) {
      $form.append($('<label></label>').text(label));
      $form.append($('<textarea></textarea>').attr({ 'data-k': k, rows: rows || 3, placeholder: placeholder || '' }).val(cfg[k] || ''));
    }
    function addSelect(k, label, options) {
      $form.append($('<label></label>').text(label));
      var $sel = $('<select></select>').attr('data-k', k);
      options.forEach(function (r) { $sel.append($('<option></option>').attr('value', r[0]).text(r[1])); });
      $sel.val(cfg[k] || '');
      $form.append($sel);
    }
    addText('lockedAppearance', '角色外观锁定', 4, '例如：wearing a red and white miko outfit, long white hair, holding an oil-paper umbrella');
    addText('personalPrompt', '个人追加提示词', 4, '例如：soft moonlight, delicate background, elegant pose, readable outfit');
    addText('negativePrompt', '负面提示词', 4, '例如：text, watermark, logo, UI, bad anatomy, extra fingers');
    addSelect('compositionPreset', '构图偏好', [
      ['', '自动'],
      ['wide environmental scene, character small in frame', '远景环境图'],
      ['full-body character, readable outfit, centered composition', '全身角色'],
      ['half-body character, outfit and expression emphasized', '半身角色'],
      ['over-the-shoulder cinematic composition', '越肩电影感'],
      ['top-down RPG scene composition', '俯视 RPG'],
      ['side-view visual novel composition', '侧视 VN']
    ]);
    $box.append($form);

    var $quick = $('<div class="apg-personal-quick"></div>');
    [
      ['强调服装清晰', 'readable outfit details, clear clothing silhouette, accurate accessories'],
      ['角色一致性', 'consistent character design, preserve hairstyle, outfit colors, accessories, and body silhouette'],
      ['全身可见', 'full-body composition, entire outfit visible, head-to-toe view'],
      ['半身精细', 'half-body composition, detailed face, hair, upper outfit, and accessories'],
      ['背景更细', 'detailed background, story-relevant props, readable environment'],
      ['干净构图', 'clean composition, uncluttered scene, clear focal point'],
      ['柔和月光', 'soft moonlight, quiet night atmosphere, gentle shadows'],
      ['暖色室内光', 'warm indoor lamplight, cozy shadows, soft amber highlights'],
      ['色彩更亮', 'brighter colors, avoid overly dark clothing, clear red and white color separation'],
      ['更像游戏CG', 'polished visual novel game CG, clean linework, refined lighting'],
      ['DoL小图感', 'small DoL-inspired game illustration, clean silhouette, limited palette'],
      ['避免黑衣', 'avoid black clothing, avoid dark robes, preserve intended clothing colors']
    ].forEach(function (r) {
      var $b = $('<button class="apg-btn" type="button"></button>').text(r[0]);
      $b.on('click', function () {
        var $ta = $form.find('[data-k="personalPrompt"]');
        var cur = String($ta.val() || '').trim();
        $ta.val(cur ? cur + ', ' + r[1] : r[1]);
      });
      $quick.append($b);
    });
    $box.append($('<div class="apg-meta">快捷追加到“个人追加提示词”：</div>')).append($quick);

    var $btnSave = $('<button class="apg-btn apg-btn-primary">保存个人设定</button>');
    var $btnReset = $('<button class="apg-btn">清空个人设定</button>');
    var $msg = $('<div class="apg-msg info"></div>');
    $btnSave.on('click', function () {
      var next = Object.assign({}, loadCfg());
      $box.find('[data-k]').each(function () { next[$(this).attr('data-k')] = $(this).val(); });
      $btnSave.prop('disabled', true);
      $msg.removeClass('err ok').addClass('info').text('正在将中文个人设定转换为英文提示词...');
      normalizePersonalSettingsForSave(next, next)
        .then(function (changed) {
          $box.find('[data-k]').each(function () {
            var k = $(this).attr('data-k');
            if (next[k] !== undefined) $(this).val(next[k]);
          });
          saveCfg(next);
          cfg = next;
          var suffix = changed.length ? '，已转换：' + changed.join('、') : '';
          $msg.removeClass('err info').addClass('ok').text('已保存个人生图设定' + suffix);
        })
        .catch(function (e) {
          $msg.removeClass('ok info').addClass('err').text('保存失败：' + ((e && e.message) || e));
        })
        .then(function () { $btnSave.prop('disabled', false); });
    });
    $btnReset.on('click', function () {
      $form.find('[data-k="lockedAppearance"], [data-k="personalPrompt"]').val('');
      $form.find('[data-k="negativePrompt"]').val(DEFAULT_CFG.negativePrompt);
      $form.find('[data-k="compositionPreset"]').val('');
      $msg.removeClass('err ok').addClass('info').text('已清空表单，点击保存后生效');
    });
    $box.append($('<div></div>').append($btnSave).append($btnReset)).append($msg);
    $root.empty().append($box);
  }

  function normalizeNpcSettingsForSave(next, cfg) {
    next.npcAppearances = next.npcAppearances || {};
    var changed = [];
    var p = Promise.resolve();
    Object.keys(next.npcAppearances).forEach(function (name) {
      p = p.then(function () {
        var before = cleanText(next.npcAppearances[name], 900);
        if (!before) {
          delete next.npcAppearances[name];
          return null;
        }
        return normalizePersonalPromptField('npcAppearance', before, cfg).then(function (after) {
          if (after !== before) changed.push(name);
          next.npcAppearances[name] = after;
        });
      });
    });
    p = p.then(function () {
      var custom = parseCustomNpcAppearances(next.customNpcAppearances);
      var out = [];
      var chain = Promise.resolve();
      custom.forEach(function (r) {
        chain = chain.then(function () {
          return normalizePersonalPromptField('npcAppearance', r.desc, cfg).then(function (after) {
            if (after !== r.desc) changed.push(r.name);
            out.push(r.name + ': ' + after);
          });
        });
      });
      return chain.then(function () { next.customNpcAppearances = out.join('\n'); });
    });
    return p.then(function () { return changed; });
  }

  function buildNpcAppearanceSettings($root) {
    var cfg = loadCfg();
    var $box = $('<div class="apg-cfg apg-npc-settings"></div>');
    $box.append('<h3>NPC形象设置</h3>');
    $box.append($('<div class="apg-hint"></div>').text('给常见 NPC 或自定义角色填写外观描述。生成图片时，如果当前剧情/提示词里出现对应名字，系统会自动把这里的外观描述加入生图提示词。中文描述保存时会自动转换成英文。'));

    var $list = $('<div class="apg-npc-list"></div>');
    NPC_APPEARANCE_PRESETS.forEach(function (r) {
      var name = r[0];
      var aliases = (r[1] || []).join(', ');
      var $row = $('<div class="apg-npc-row"></div>');
      $row.append($('<label></label>').text(aliases ? name + ' / ' + aliases : name));
      $row.append($('<textarea rows="2" placeholder="例如：short brown hair, gentle expression, simple school uniform, slim build"></textarea>')
        .attr('data-npc-name', name)
        .val((cfg.npcAppearances && cfg.npcAppearances[name]) || ''));
      $list.append($row);
    });
    $box.append($list);

    var $custom = $('<div class="apg-npc-custom"></div>');
    $custom.append($('<h3></h3>').text('玩家自定义NPC'));
    $custom.append($('<div class="apg-meta"></div>').text('点击添加角色后，左侧填写名字，右侧填写希望的外观描述。'));
    var $customList = $('<div class="apg-npc-custom-list"></div>');
    function addCustomNpcRow(name, desc) {
      var $row = $('<div class="apg-npc-row apg-npc-custom-row"></div>');
      $row.append($('<input type="text" class="apg-npc-name-input" data-custom-npc-name placeholder="名字">').val(name || ''));
      $row.append($('<textarea rows="2" data-custom-npc-desc placeholder="外观描述，例如：silver hair, blue eyes, black cloak"></textarea>').val(desc || ''));
      var $remove = $('<button type="button" class="apg-btn apg-npc-remove">删除</button>');
      $remove.on('click', function () { $row.remove(); });
      $row.append($remove);
      $customList.append($row);
    }
    parseCustomNpcAppearances(cfg.customNpcAppearances).forEach(function (r) {
      addCustomNpcRow(r.name, r.desc);
    });
    var $btnAddCustom = $('<button type="button" class="apg-btn">添加角色</button>');
    $btnAddCustom.on('click', function () { addCustomNpcRow('', ''); });
    $custom.append($customList).append($btnAddCustom);
    $box.append($custom);

    var $btnSave = $('<button class="apg-btn apg-btn-primary">保存NPC形象设置</button>');
    var $btnReset = $('<button class="apg-btn">清空NPC形象设置</button>');
    var $msg = $('<div class="apg-msg info"></div>');
    $btnSave.on('click', function () {
      var next = Object.assign({}, loadCfg());
      next.npcAppearances = {};
      $box.find('[data-npc-name]').each(function () {
        var name = $(this).attr('data-npc-name');
        var desc = cleanText($(this).val(), 900);
        if (desc) next.npcAppearances[name] = desc;
      });
      var customLines = [];
      $box.find('.apg-npc-custom-row').each(function () {
        var name = cleanText($(this).find('[data-custom-npc-name]').val(), 80);
        var desc = cleanText($(this).find('[data-custom-npc-desc]').val(), 900);
        if (name && desc) customLines.push(name + ': ' + desc);
      });
      next.customNpcAppearances = customLines.join('\n');
      $btnSave.prop('disabled', true);
      $msg.removeClass('err ok').addClass('info').text('正在保存NPC形象设置...');
      normalizeNpcSettingsForSave(next, next)
        .then(function (changed) {
          $box.find('[data-npc-name]').each(function () {
            var name = $(this).attr('data-npc-name');
            $(this).val((next.npcAppearances && next.npcAppearances[name]) || '');
          });
          $customList.empty();
          parseCustomNpcAppearances(next.customNpcAppearances).forEach(function (r) {
            addCustomNpcRow(r.name, r.desc);
          });
          saveCfg(next);
          cfg = next;
          var suffix = changed.length ? '，已转换：' + changed.join('、') : '';
          $msg.removeClass('err info').addClass('ok').text('已保存NPC形象设置' + suffix);
        })
        .catch(function (e) {
          $msg.removeClass('ok info').addClass('err').text('保存失败：' + ((e && e.message) || e));
        })
        .then(function () { $btnSave.prop('disabled', false); });
    });
    $btnReset.on('click', function () {
      $box.find('[data-npc-name]').val('');
      $customList.empty();
      $msg.removeClass('err ok').addClass('info').text('已清空表单，点击保存后生效');
    });
    $box.append($('<div></div>').append($btnSave).append($btnReset)).append($msg);
    $root.empty().append($box);
  }

  // ---------- 10. UI: 个人设定 ----------
  function buildWorkshop($root) {
    buildPersonalSettings($root);
    return;
    var cfg = loadCfg();
    var $wrap = $('<div class="apg-workshop"></div>');

    // 左侧：输入面板
    var $left = $('<div class="apg-panel"></div>');
    $left.append('<h3>1. 描述</h3>');

    var $catRow = $('<div class="apg-row"></div>');
    $catRow.append('<label>类别</label>');
    var $cat = $('<select id="apg-cat"></select>');
    Object.keys(CATEGORIES).forEach(function (k) {
      $cat.append($('<option></option>').attr('value', k).text(CATEGORIES[k].label));
    });
    $catRow.append($cat);
    $left.append($catRow);

    var $hint = $('<div class="apg-meta"></div>');
    $left.append($hint);
    function updateHint() {
      var c = CATEGORIES[$cat.val()];
      $hint.text('提示：' + c.hint + '  | 默认尺寸: ' + (c.defaultSize || '原始') + '  | 目标目录: ' + c.targetDir);
    }
    $cat.on('change', updateHint); updateHint();

    $left.append('<div style="margin-top:0.6em;font-weight:bold;font-size:0.92em;">中文描述：</div>');
    var $userText = $('<textarea class="apg-textarea" rows="3" placeholder="例：一把生锈的青铜匕首，黑色皮柄，刀刃带缺口"></textarea>');
    $left.append($userText);

    $left.append('<div style="margin-top:0.4em;font-weight:bold;font-size:0.92em;">英文 Prompt（可手动改）：</div>');
    var $engPrompt = $('<textarea class="apg-textarea" rows="4" placeholder="点【智能扩写】自动生成，或直接粘贴英文 prompt"></textarea>');
    $left.append($engPrompt);

    var $btnExpand = $('<button class="apg-btn">✨ 智能扩写 (DeepSeek)</button>');
    var $btnGen = $('<button class="apg-btn apg-btn-primary">🎨 生成图片</button>');
    $left.append($btnExpand).append($btnGen);

    var $msgL = $('<div class="apg-msg info"></div>');
    $left.append($msgL);

    // 右侧：预览 + 历史
    var $right = $('<div class="apg-panel"></div>');
    $right.append('<h3>2. 预览</h3>');
    var $preview = $('<div class="apg-preview"></div>');
    var $previewEmpty = $('<div class="apg-preview-empty">尚无图片</div>');
    $preview.append($previewEmpty);
    $right.append($preview);

    var $btnDl = $('<button class="apg-btn" disabled>⬇ 下载 PNG</button>');
    var $btnRedo = $('<button class="apg-btn" disabled>🔄 重新生成</button>');
    var $fnameRow = $('<div class="apg-row"></div>');
    $fnameRow.append('<label>文件名</label>');
    var $fname = $('<input type="text" placeholder="留空自动命名">');
    $fnameRow.append($fname);
    $right.append($fnameRow);
    $right.append($btnDl).append($btnRedo);

    var $metaInfo = $('<div class="apg-meta"></div>');
    $right.append($metaInfo);

    $right.append('<h3 style="margin-top:0.8em;">3. 历史画廊</h3>');
    var $gallery = $('<div class="apg-gallery"></div>');
    $right.append($gallery);

    $wrap.append($left).append($right);
    $root.empty().append($wrap);

    // -- 状态 --
    var currentDataURL = null;
    var currentCat = 'icon';

    function refreshGallery() {
      $gallery.empty();
      listHistory().then(function (items) {
        if (!items.length) {
          $gallery.append('<div class="apg-gallery-empty">还没有历史记录</div>');
          return;
        }
        items.slice(0, 60).forEach(function (it) {
          var $it = $('<div class="apg-gallery-item"></div>');
          var $img = $('<img>').attr('src', it.dataURL).attr('title', it.prompt || '');
          $it.append($img);
          var $del = $('<button class="apg-gallery-del" title="删除">×</button>');
          $del.on('click', function (e) {
            e.stopPropagation();
            delHistory(it.id).then(refreshGallery);
          });
          $it.append($del);
          $it.on('click', function () {
            currentDataURL = it.dataURL;
            currentCat = it.category || currentCat;
            showPreview(it.dataURL);
            $userText.val(it.userText || '');
            $engPrompt.val(it.prompt || '');
            $cat.val(currentCat); updateHint();
            $metaInfo.text('已载入历史记录 #' + it.id);
          });
          $gallery.append($it);
        });
      });
    }
    refreshGallery();

    function showPreview(dataURL) {
      $preview.empty().append($('<img>').attr('src', dataURL));
      $btnDl.prop('disabled', false);
      $btnRedo.prop('disabled', false);
    }

    function setMsg(cls, txt) {
      $msgL.removeClass('ok err info').addClass(cls).text(txt);
    }

    $btnExpand.on('click', function () {
      cfg = loadCfg();
      var ut = $userText.val().trim();
      if (!ut) { setMsg('err', '请先填写中文描述'); return; }
      $btnExpand.prop('disabled', true); setMsg('info', 'DeepSeek 扩写中…');
      expandPrompt($cat.val(), ut, cfg).then(function (eng) {
        $engPrompt.val(eng);
        setMsg('ok', '✔ 扩写完成（可手动修改后再点生成）');
      }).catch(function (e) {
        setMsg('err', '扩写失败: ' + e.message);
      }).then(function () { $btnExpand.prop('disabled', false); });
    });

    function doGenerate() {
      cfg = loadCfg();
      var prompt = $engPrompt.val().trim();
      if (!prompt) {
        // 没有英文 prompt 就用中文 + 风格直接拼
        var ut = $userText.val().trim();
        if (!ut) { setMsg('err', '请先填写描述或英文 prompt'); return; }
        prompt = ut;
      }
      var fullPrompt = prompt + ', ' + (CATEGORIES[$cat.val()].stylePrompt) + ', ' + cfg.styleSuffix;
      currentCat = $cat.val();

      $btnGen.prop('disabled', true); $btnExpand.prop('disabled', true);
      $btnDl.prop('disabled', true); $btnRedo.prop('disabled', true);
      $preview.empty().append('<div class="apg-preview-loading">正在生成…（约 5~30 秒）</div>');
      setMsg('info', '调用图像 API 中…');

      callImgAPI(fullPrompt, cfg).then(function (rawDataURL) {
        setMsg('info', '正在做后处理（透明抠底 / 调色板 / 缩放）…');
        return postProcess(rawDataURL, cfg, currentCat);
      }).then(function (finalDataURL) {
        currentDataURL = finalDataURL;
        showPreview(finalDataURL);
        setMsg('ok', '✔ 生成完成');
        $metaInfo.text('Prompt: ' + fullPrompt.slice(0, 200) + (fullPrompt.length > 200 ? '…' : ''));
        // 入库
        saveHistory({
          id: Date.now(),
          category: currentCat,
          userText: $userText.val().trim(),
          prompt: prompt,
          fullPrompt: fullPrompt,
          dataURL: finalDataURL,
        }).then(refreshGallery);
      }).catch(function (e) {
        setMsg('err', '生成失败: ' + e.message);
        $preview.empty().append($previewEmpty);
        if (/CORS|Failed to fetch/i.test(e.message)) {
          $msgL.append('<br>提示：可能是图像 URL 跨域被拦截，请尝试在配置里把模型换成支持 b64_json 返回的端点。');
        }
      }).then(function () {
        $btnGen.prop('disabled', false); $btnExpand.prop('disabled', false);
      });
    }
    $btnGen.on('click', doGenerate);
    $btnRedo.on('click', doGenerate);

    $btnDl.on('click', function () {
      if (!currentDataURL) return;
      var name = $fname.val().trim();
      if (!name) {
        var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        name = 'apg_' + currentCat + '_' + stamp + '.png';
      } else if (!/\.(png|webp)$/i.test(name)) {
        name += '.png';
      }
      downloadDataURL(currentDataURL, name);
      setMsg('ok', '✔ 已下载: ' + name + '   建议放入 ' + CATEGORIES[currentCat].targetDir);
    });
  }

  // ---------- 11. 集成面板 (配置 + 个人设定子标签) ----------
  function buildPanel($root, isSettingsTab, defaultSub) {
    if (!isAIPixelEnabled()) {
      var $disabled = $('<div class="apg-cfg apg-cfg-disabled"></div>');
      $disabled.append($('<h3></h3>').text('AI绘图已关闭'));
      $disabled.append($('<div class="apg-hint"></div>').text('请在 AI 设置的「替换配置」页中开启「启用 AI 绘图」后再使用绘图配置。'));
      $root.empty().append($disabled);
      return;
    }
    var $box = $('<div class="apg-panel-wrap"></div>');
    var $tabs = $('<div class="apg-subtabs"></div>');
    var $btnCfg = $('<button class="apg-subtab">⚙ 配置</button>');
    var $btnWs  = $('<button class="apg-subtab">👤 个人设定</button>');
    var $btnNpc = $('<button class="apg-subtab">NPC形象设置</button>');
    $tabs.append($btnCfg).append($btnWs).append($btnNpc);
    var $content = $('<div class="apg-subcontent"></div>');
    $box.append($tabs).append($content);
    $root.empty().append($box);
    function showCfg() {
      $btnCfg.addClass('active'); $btnWs.removeClass('active'); $btnNpc.removeClass('active');
      buildConfigForm($content, isSettingsTab);
    }
    function showWs() {
      $btnWs.addClass('active'); $btnCfg.removeClass('active'); $btnNpc.removeClass('active');
      buildWorkshop($content);
    }
    function showNpc() {
      $btnNpc.addClass('active'); $btnCfg.removeClass('active'); $btnWs.removeClass('active');
      buildNpcAppearanceSettings($content);
    }
    $btnCfg.on('click', showCfg);
    $btnWs.on('click', showWs);
    $btnNpc.on('click', showNpc);
    if (defaultSub === 'workshop') showWs();
    else if (defaultSub === 'npc') showNpc();
    else showCfg();
  }

  // ---------- 12. 注册宏 + Passage 链接处理 ----------
  function registerMacros() {
    if (typeof Macro === 'undefined' || !Macro.add) {
      setTimeout(registerMacros, 50);
      return;
    }
    function macroExists(name) {
      try { if (typeof Macro.has === 'function' && Macro.has(name)) return true; } catch (e) {}
      try { if (typeof Macro.get === 'function' && Macro.get(name)) return true; } catch (e2) {}
      try { if (Macro._macros && Macro._macros[name]) return true; } catch (e3) {}
      return false;
    }
    function addMacroOnce(name, def) {
      if (macroExists(name)) {
        try { console.warn('[AIPixelGen] macro already exists, skipped: <<' + name + '>>'); } catch (e) {}
        return;
      }
      Macro.add(name, def);
    }
    addMacroOnce('aipixelconfig', {
      tags: null,
      handler: function () {
        var $out = $('<div></div>');
        $(this.output).append($out);
        buildPanel($out, false, 'config');
      },
    });
    addMacroOnce('aipixelworkshop', {
      tags: null,
      handler: function () {
        var $out = $('<div></div>');
        $(this.output).append($out);
        buildPanel($out, false, 'workshop');
      },
    });

    // <<aipixel "描述">> — 按钮触发式插图生成
    addMacroOnce('aipixel', {
      tags: null,
      handler: function () {
        var promptCN = String(this.args[0] || '').trim();
        if (!promptCN) return;
        var cfg = loadCfg();
        var instanceId = 'aipixel_' + (++_pixelGenCounter);
        var passageTitle = (typeof State !== 'undefined' && State.passage) || '';
        var cacheKey = strHash(passageTitle + '|' + promptCN + '|' + cfg.imgModel);
        var defaultCacheKey = makePixelCacheKey(cacheKey, promptCN, 'dol_pixel');
        var $placeholder = $('<span></span>').attr('id', instanceId).addClass('apg-pixel-placeholder');
        $(this.output).append($placeholder);
        getImgCache(defaultCacheKey)
          .then(function (cached) {
            if (cached && cached.dataURL) {
              renderPixelImage(instanceId, cached.dataURL, { cacheKeyBase: cacheKey, promptCN: promptCN, cfg: cfg, label: '🖼 生成插图（约 15 秒）' });
            } else {
              renderPixelButton(instanceId, cacheKey, promptCN, cfg);
            }
          })
          .catch(function () {
            renderPixelButton(instanceId, cacheKey, promptCN, cfg);
          });
      },
    });

    console.log('[AIPixelGen] macros registered: <<aipixelconfig>>, <<aipixelworkshop>>, <<aipixel>>');
  }
  registerMacros();

  // 处理 passage 内 <a class="apg-link" data-passage="..."> 跳转
  $(document).on('click', '.apg-link[data-passage]', function (e) {
    e.preventDefault();
    var p = $(this).attr('data-passage');
    if (p && typeof Engine !== 'undefined' && Engine.play) Engine.play(p);
  });

  // ---------- 13. Settings 页注入 "AI绘图" 标签 ----------
  var apgTabActive = false;

function injectAISettingsTab(active) {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') {
      $('#apgSettingsTab').remove();
      return false;
    }
    var $settingsOptions = $('#settingsOptions');
    var $container = $('#settingsOptions .containerStart');
    if (!$container.length) $container = $settingsOptions;
    if (!$container.length) return false;
    if ($('#apgSettingsTab').length) return true;
    var $tab = $('<div id="apgSettingsTab"></div>')
      .addClass(active ? 'gold buttonStartSelected' : 'buttonStart')
      .append($('<button>AI绘图</button>'));
    $tab.on('click', function () {
      apgTabActive = true;
      $('#settingsOptions .containerStart > div, #settingsOptions > div').removeClass('gold buttonStartSelected').addClass('buttonStart');
      $tab.addClass('gold buttonStartSelected').removeClass('buttonStart');
      var $wrap = $('<div class="solidBorderContainer settings-container"><div class="settingsGrid apg-settings-host"></div></div>');
      $('#settingsDiv').empty().append($wrap);
      buildPanel($wrap.find('.apg-settings-host'), true, 'config');
    });
    $container.append($tab);
    return true;
  }

  function scheduleAISettingsTabInjection(active) {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') return;
    var tries = 0;
    function tick() {
      tries += 1;
      if (injectAISettingsTab(active)) return;
      if (tries < 20) setTimeout(tick, 150);
    }
    tick();
  }

  // 复用 AIStoryGen 模式：:passagedisplay 检测 Settings 进入 → 建立 observer + 注入标签
  function setupSettingsObserver() {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') return;
    var passagesEl = document.getElementById('passages');
    if (!passagesEl) return;
    if (window._apgPassageObserver) {
      window._apgPassageObserver.disconnect();
    }
    window._apgPassageObserver = new MutationObserver(function () {
      var optsEl = document.getElementById('settingsOptions');
      if (!optsEl) return;
      if (!$('#apgSettingsTab').length) injectAISettingsTab(apgTabActive);
      if (apgTabActive && !$('#settingsDiv .apg-cfg-settings').length) {
        apgTabActive = false;
      }
      if (apgTabActive) {
        $('#apgSettingsTab').removeClass('buttonStart').addClass('gold buttonStartSelected');
      }
    });
    window._apgPassageObserver.observe(passagesEl, { childList: true, subtree: true });
  }

  $(document).on(':passagedisplay', function (ev) {
    var title = (ev && ev.passage && ev.passage.title) || (typeof State !== 'undefined' && State.passage) || '';
    setTimeout(cleanupKnownMenuErrors, 50);
    setTimeout(cleanupKnownMenuErrors, 350);
    scheduleAIStoryAssist();
    if (title !== 'Settings') return;
    apgTabActive = false;
    setTimeout(function () {
      setupSettingsObserver();
      scheduleAISettingsTabInjection(false);
    }, 150);
  });

  setInterval(function () {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') {
      $('#apgSettingsTab').remove();
      return;
    }
    var title = safeRead(function () { return State.passage; }, '');
    if (title === 'Settings' && !$('#apgSettingsTab').length) injectAISettingsTab(apgTabActive);
  }, 1000);

  // ---------- 14. Options Overlay 注入 (侧边栏 OPTIONS 浮层) ----------
  var apgOverlayTabActive = false;

  function injectOptionsOverlayTab() {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') {
      $('#apgOverlayTab').remove();
      return;
    }
    var $tabBar = $('#overlayTabs');
    if (!$tabBar.length) return;
    if ($('#apgOverlayTab').length) return;
    var $btn = $('<button>AI绘图</button>').attr('id', 'apgOverlayTab');
    $btn.on('click', function () {
      apgOverlayTabActive = true;
      $('#overlayTabs button').removeClass('tab-selected');
      $btn.addClass('tab-selected');
      var $wrap = $('<div class="settingsGrid apg-overlay-host"></div>');
      $('#customOverlayContent').empty().append($wrap);
      buildPanel($wrap, true, 'config');
    });
    var $closeBtn = $('#overlayTabs .customOverlayClose');
    if ($closeBtn.length) $btn.insertBefore($closeBtn);
    else $tabBar.append($btn);
  }

  function setupOptionsOverlayObserver() {
    if (APG_MODULE_SOURCE === 'AIStoryGen module') return;
    var overlay = document.getElementById('customOverlay');
    if (!overlay) return;
    var attrObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes' && m.attributeName === 'data-overlay') {
          if (overlay.getAttribute('data-overlay') === 'options') {
            apgOverlayTabActive = false;
            setTimeout(injectOptionsOverlayTab, 250);
          }
        }
      }
    });
    attrObserver.observe(overlay, { attributes: true, attributeFilter: ['data-overlay'] });
    var classObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'class') {
          if (!overlay.classList.contains('hidden') && overlay.getAttribute('data-overlay') === 'options') {
            setTimeout(function () {
              if (!$('#apgOverlayTab').length) injectOptionsOverlayTab();
            }, 300);
          }
        }
      }
    });
    classObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    var contentEl = document.getElementById('customOverlayContent');
    if (contentEl) {
      var contentObserver = new MutationObserver(function () {
        if (apgOverlayTabActive && !$('#customOverlayContent .apg-cfg-settings').length) {
          apgOverlayTabActive = false;
          $('#apgOverlayTab').removeClass('tab-selected');
        }
      });
      contentObserver.observe(contentEl, { childList: true });
    }
  }

  setTimeout(function () {
    setupOptionsOverlayObserver();
    setTimeout(function () {
      if (!document.getElementById('customOverlay')) return;
      if (!window._apgOptionsObserverReady) {
        window._apgOptionsObserverReady = true;
        setupOptionsOverlayObserver();
      }
    }, 2000);
  }, 500);

  function setupAIStoryAssistObserver() {
    var passagesEl = document.getElementById('passages');
    if (!passagesEl || window._apgAIStoryAssistObserver) return;
    window._apgAIStoryAssistObserver = new MutationObserver(function (mutations) {
      if (window._aiPanelLayoutMoving || areOnlyStoryOrPixelPanelMutations(mutations)) return;
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (target && target.closest && target.closest('.apg-ai-assist')) continue;
        if (isStoryOrPixelPanelMutation(mutations[i])) continue;
        var onlyAssistMutation = true;
        var added = mutations[i].addedNodes || [];
        var removed = mutations[i].removedNodes || [];
        for (var a = 0; a < added.length; a++) {
          if (!added[a].classList || !added[a].classList.contains('apg-ai-assist')) onlyAssistMutation = false;
        }
        for (var r = 0; r < removed.length; r++) {
          if (!removed[r].classList || !removed[r].classList.contains('apg-ai-assist')) onlyAssistMutation = false;
        }
        if ((added.length || removed.length) && onlyAssistMutation) continue;
        cleanupKnownMenuErrors();
        cleanupAssistPlaceholders();
        scheduleAIStoryAssist();
        break;
      }
    });
    window._apgAIStoryAssistObserver.observe(passagesEl, { childList: true, subtree: true });
  }
  setTimeout(setupAIStoryAssistObserver, 800);

  // 暴露调试接口
  var _publicAPI = window.AIPixelGen || {};
  Object.assign(_publicAPI, {
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    callLLM: callLLM,
    callImgAPI: callImgAPI,
    expandPrompt: expandPrompt,
    expandScenePrompt: expandScenePrompt,
    buildLocalScenePrompt: buildLocalScenePrompt,
    debugComposeFinalImagePrompt: composeFinalImagePrompt,
    debugStylePresetPrompt: stylePresetPrompt,
    buildAIStoryPrompt: buildAIStoryPrompt,
    injectAIStoryAssist: injectAIStoryAssist,
    renderInlinePixelPanel: renderInlinePixelPanel,
    isEnabled: isAIPixelEnabled,
    buildConfigForm: buildConfigForm,
    buildPanel: buildPanel,
    buildPersonalSettings: buildPersonalSettings,
    buildNpcAppearanceSettings: buildNpcAppearanceSettings,
    postProcess: postProcess,
    listHistory: listHistory,
    getImgCache: getImgCache,
    putImgCache: putImgCache,
    clearImgCache: clearImgCache,
    openConfig: function () { if (typeof Engine !== 'undefined') Engine.play('AIPixelGen_Config'); },
    openWorkshop: function () { if (typeof Engine !== 'undefined') Engine.play('AIPixelGen_Workshop'); },
    version: (window.AIStoryGen && window.AIStoryGen.VERSION) || '0.1.315',
    __loaded: true,
    __source: APG_MODULE_SOURCE,
    __mergedModule: APG_MODULE_SOURCE === 'AIStoryGen module',
  });
  window.AIPixelGen = _publicAPI;
  setTimeout(function () {
    if (isStoryPanelManagerActive()) {
      requestStoryPanelLayout(500);
      return;
    }
    installAssistOrderObserver();
  }, 500);
  console.log('[AIPixelGen] v' + window.AIPixelGen.version + ' loaded. <<aipixel>> macro available.');
})();


