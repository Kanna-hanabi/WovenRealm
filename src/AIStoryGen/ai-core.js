/* ============================================================
 * AIStoryGen core helpers
 * Shared config, error, network, and safe-read utilities.
 * ============================================================ */
(function () {
  'use strict';

  var root = window.AIStoryGen = window.AIStoryGen || {};

  var DEFAULT_LONG_TERM_REFINE_PROMPT = [
    '你是游戏剧情长期记忆整理器。请把下面内容压缩成可用的剧情索引，不要保留完整叙事原文。',
    '必须保留：当前AI剧情状态、重要地点与路线顺序、人物关系变化、剧情线索或剧情物品、未完成目标。',
    '剧情物品指的是对后续剧情有意义的线索物，例如原石、旧笔记、地图、名片、特殊硬币；不要把普通库存清单和数量当成记忆重点。',
    '必须删除：原版状态数据、玩家属性、技能、性癖、穿着、金钱数值、普通道具库存数量、房租任务、自由任务、资源状态、版本号、菜单文字、房间静态描写、重复句、心理铺陈和普通动作过程。',
    '如果原文包含AI剧情事件，不要回答「没有可保留的关键数据」；至少保留一条可用剧情索引。',
    '输出中文，只能使用以下五类格式；每类最多 6 条，每条不超过 80 字，只写事实变化：',
    '### 当前剧情状态 / 精炼',
    '- ...',
    '### 地点与路线 / 精炼',
    '- ...',
    '### 人物关系变化 / 精炼',
    '- ...',
    '### 线索与剧情物品 / 精炼',
    '- ...',
    '### 未完成目标 / 精炼',
    '- ...',
    '',
    '{{memory}}'
  ].join('\n');

  var DEFAULT_CFG = {
    apiKey: '',
    uiLayoutMode: 'auto',
    aiPixelEnabled: 1,
    aiSexModeEnabled: 0,
    sexModeEngine: 'ask',
    aiIntimateDynamicActions: 0,
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-flash',
    highQualityMode: 1,
    highQualityEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    highQualityModel: 'deepseek-v4-pro',
    temperature: 0.9,
    max_tokens: 400,
    jailbreak: '',
    tier: 2,
    language: 'zh',
    recentMax: 3,
    recentLimit: 600,
    autoChoices: 1,
    aiChoiceMode: 1,
    aiReplaceLinks: 1,
    postProcessPattern: '',
    postProcessReplacement: '',
    statChangeLimit: 50,
    enableCombat: 1,
    combatMaxTokens: 1000,
    combatTemperature: 0.8,
    combatWindowTurns: 3,
    combatPostProcessPattern: '',
    combatPostProcessReplacement: '',
    combatIncludeOriginal: 0,
    combatPromptTemplate: '',
    cacheEnabled: 1,
    cacheTTLMinutes: 5,
    summarizeTrigger: 8,
    longTermCompressTrigger: 5,
    systemPromptExtra: '',
    longTermRefinePrompt: DEFAULT_LONG_TERM_REFINE_PROMPT,
    storyStylePreset: 'none',
    storyStylePrompt: '',
    longTermMax: 0,
    playerStoryProfile: '',
    sexModeTriggerMode: 1,
  };

  function normalizeCfg(cfg) {
    cfg = cfg || {};
    if (!cfg.model || cfg.model === 'deepseek-chat') cfg.model = DEFAULT_CFG.model;
    if (cfg.highQualityMode == null) cfg.highQualityMode = DEFAULT_CFG.highQualityMode;
    if (!cfg.highQualityEndpoint) cfg.highQualityEndpoint = DEFAULT_CFG.highQualityEndpoint;
    if (!cfg.highQualityModel || cfg.highQualityModel === 'deepseek-chat') cfg.highQualityModel = DEFAULT_CFG.highQualityModel;
    if (cfg.aiPixelEnabled == null) cfg.aiPixelEnabled = DEFAULT_CFG.aiPixelEnabled;
    if (!/^(auto|mobile|tablet|desktop)$/.test(String(cfg.uiLayoutMode || 'auto'))) cfg.uiLayoutMode = DEFAULT_CFG.uiLayoutMode;
    if (cfg.aiSexModeEnabled == null) cfg.aiSexModeEnabled = DEFAULT_CFG.aiSexModeEnabled;
    if (!cfg.sexModeEngine) cfg.sexModeEngine = DEFAULT_CFG.sexModeEngine;
    if (!/^(ai|native|both|ask)$/.test(String(cfg.sexModeEngine || '').toLowerCase())) cfg.sexModeEngine = DEFAULT_CFG.sexModeEngine;
    if (cfg.aiIntimateDynamicActions == null) cfg.aiIntimateDynamicActions = DEFAULT_CFG.aiIntimateDynamicActions;
    if (cfg.longTermMax == null) cfg.longTermMax = DEFAULT_CFG.longTermMax;
    if (cfg.playerStoryProfile == null) cfg.playerStoryProfile = DEFAULT_CFG.playerStoryProfile;
    if (cfg.sexModeTriggerMode == null) cfg.sexModeTriggerMode = DEFAULT_CFG.sexModeTriggerMode;
    if (cfg.longTermRefinePrompt == null) cfg.longTermRefinePrompt = DEFAULT_CFG.longTermRefinePrompt;
    if (cfg.storyStylePrompt == null) cfg.storyStylePrompt = '';
    if (!/^(none|custom|minimal|epic|cult)$/.test(String(cfg.storyStylePreset || 'none'))) cfg.storyStylePreset = DEFAULT_CFG.storyStylePreset;
    return cfg;
  }

  var AIErrorType = {
    NOT_CONFIGURED: 'not_configured',
    AUTH_ERROR: 'auth_error',
    RATE_LIMIT: 'rate_limit',
    NETWORK_ERROR: 'network_error',
    TIMEOUT: 'timeout',
    MODEL_ERROR: 'model_error',
    CONTENT_FILTER: 'content_filter',
    SERVER_ERROR: 'server_error',
    UNKNOWN: 'unknown',
  };

  function AIError(type, userMessage, detail, statusCode) {
    this.name = 'AIError';
    this.type = type;
    this.message = userMessage;
    this.detail = detail || '';
    this.statusCode = statusCode || 0;
  }

  function userErrorMessage(type, detail, lang) {
    var zh = lang === 'zh';
    var msgs = {
      not_configured: zh ? '请先在「设置 → AI 设置」或侧边栏 OPTIONS → AI 设置 中配置 API 密钥，才能使用 AI 功能。' : 'Configure your API Key in Settings → AI Settings before using AI features.',
      auth_error: zh ? 'API 认证失败 (401/403)，请检查 API 密钥。' : 'API auth failed (401/403). Check your API key.',
      rate_limit: zh ? 'API 请求频率超限 (429)，请稍后重试。' : 'API rate limit exceeded (429). Try later.',
      network_error: zh ? '网络连接失败，请检查网络或 API 地址。' : 'Network error. Check your connection and API endpoint.',
      timeout: zh ? 'API 请求超时，请稍后重试。' : 'API request timed out. Try again later.',
      model_error: zh ? '模型不可用 (404)，请检查模型名称。' : 'Model not found (404). Check the model name.',
      content_filter: zh ? 'AI 内容被过滤，请调整提示词或重试。' : 'Content was filtered. Adjust your prompt or retry.',
      server_error: zh ? 'API 服务器错误 (5xx)，请稍后重试。' : 'API server error (5xx). Try again later.',
      unknown: zh ? '未知错误' : 'Unknown error',
    };
    var msg = msgs[type] || msgs.unknown;
    if (detail && type !== 'not_configured') {
      msg += (zh ? ' (详情: ' : ' (detail: ') + detail + ')';
    }
    return msg;
  }

  function classifyError(err, lang) {
    if (err instanceof AIError) return err;
    var name = (err && err.name) || '';
    var message = (err && err.message) || String(err);

    if (name === 'AbortError' || message.indexOf('aborted') !== -1) {
      return new AIError(AIErrorType.TIMEOUT, userErrorMessage('timeout', '', lang));
    }

    var statusMatch = message.match(/HTTP\s+(\d{3})/);
    var statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    var detail = message.replace(/^HTTP\s+\d{3}\s*/, '').slice(0, 300);

    if (statusCode === 401 || statusCode === 403) {
      return new AIError(AIErrorType.AUTH_ERROR, userErrorMessage('auth_error', detail, lang), detail, statusCode);
    }
    if (statusCode === 429) {
      return new AIError(AIErrorType.RATE_LIMIT, userErrorMessage('rate_limit', '', lang), detail, statusCode);
    }
    if (statusCode === 404) {
      return new AIError(AIErrorType.MODEL_ERROR, userErrorMessage('model_error', '', lang), detail, statusCode);
    }
    if (statusCode >= 500 && statusCode < 600) {
      return new AIError(AIErrorType.SERVER_ERROR, userErrorMessage('server_error', '', lang), detail, statusCode);
    }

    var lowerMsg = message.toLowerCase();
    if (lowerMsg.indexOf('content_filter') !== -1 || lowerMsg.indexOf('content filter') !== -1) {
      return new AIError(AIErrorType.CONTENT_FILTER, userErrorMessage('content_filter', '', lang));
    }
    if (err instanceof TypeError || message.indexOf('fetch') !== -1 || lowerMsg.indexOf('network') !== -1) {
      return new AIError(AIErrorType.NETWORK_ERROR, userErrorMessage('network_error', detail, lang), detail);
    }
    if (message.indexOf('未设置 API 密钥') !== -1 || message.indexOf('API Key not set') !== -1) {
      return new AIError(AIErrorType.NOT_CONFIGURED, message);
    }

    return new AIError(AIErrorType.UNKNOWN, userErrorMessage('unknown', detail, lang), detail);
  }

  function getSafeV() {
    try {
      return (typeof State !== 'undefined' && State.variables) ? State.variables : null;
    } catch (e) {
      return null;
    }
  }

  function safeRead(fn, fallback) {
    try {
      var v = fn();
      if (typeof v === 'function') return fallback;
      return (v != null) ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function checkNetwork(apiUrl, apiKey, callback) {
    if (!apiUrl) { callback({ status: 'not_configured', message: '未配置 API 地址' }); return; }
    var baseUrl = apiUrl.replace(/\/+$/, '');
    var modelsUrl = baseUrl.replace(/\/chat\/completions\/?$/, '/models');
    var cspViolated = false;
    var cspHandler = function () { cspViolated = true; };
    document.addEventListener('securitypolicyviolation', cspHandler);

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);

    var headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

    fetch(modelsUrl, { method: 'GET', headers: headers, signal: controller.signal })
      .then(function (resp) {
        clearTimeout(timer);
        document.removeEventListener('securitypolicyviolation', cspHandler);
        if (cspViolated) { callback({ status: 'csp_blocked', message: 'CSP 策略阻止了请求' }); return; }
        if (resp.ok) { callback({ status: 'ok', message: '连接正常' }); return; }
        if (resp.status === 401 || resp.status === 403) {
          callback({ status: 'auth_error', message: '认证失败 (HTTP ' + resp.status + ')，API Key 可能无效' });
        } else {
          callback({ status: 'api_error', message: 'API 返回错误 HTTP ' + resp.status });
        }
      })
      .catch(function (err) {
        clearTimeout(timer);
        document.removeEventListener('securitypolicyviolation', cspHandler);
        if (cspViolated) { callback({ status: 'csp_blocked', message: 'CSP 策略阻止了请求' }); return; }
        if (err.name === 'AbortError') { callback({ status: 'timeout', message: '连接超时 (10秒)' }); return; }
        callback({ status: 'network_error', message: '网络错误: ' + (err.message || String(err)).slice(0, 80) });
      });
  }

  function applyPostProcess(text, cfg) {
    var pattern = cfg.postProcessPattern;
    if (!pattern) return text;
    try {
      var match = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
      if (!match) return text;
      var regex = new RegExp(match[1], match[2]);
      var replacement = cfg.postProcessReplacement || '';
      return text.replace(regex, replacement);
    } catch (e) {
      console.warn('[AIStoryGen] post-process regex error', e);
      return text;
    }
  }

  var Core = {
    schemaVersion: 1,
    DEFAULT_CFG: DEFAULT_CFG,
    DEFAULT_LONG_TERM_REFINE_PROMPT: DEFAULT_LONG_TERM_REFINE_PROMPT,
    normalizeCfg: normalizeCfg,
    AIErrorType: AIErrorType,
    AIError: AIError,
    userErrorMessage: userErrorMessage,
    classifyError: classifyError,
    getSafeV: getSafeV,
    safeRead: safeRead,
    checkNetwork: checkNetwork,
    applyPostProcess: applyPostProcess,
  };

  root.Core = Core;
  window.AIStoryGenCore = Core;
})();
