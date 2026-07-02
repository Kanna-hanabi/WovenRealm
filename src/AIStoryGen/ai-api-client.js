/* ============================================================
 * AIStoryGen API client helpers
 * Normalizes OpenAI-compatible chat responses and request flags.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function contentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(function (part) {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        if (part.type === 'text' && typeof part.value === 'string') return part.value;
        return '';
      }).join('');
    }
    return '';
  }

  function extractResponseText(payload) {
    if (!payload) return '';
    var choice = payload.choices && payload.choices[0];
    if (choice) {
      var msg = choice.message || {};
      var out = contentToText(msg.content);
      if (out) return out;
      out = contentToText(choice.text);
      if (out) return out;
      out = contentToText(msg.output_text || msg.response || msg.text);
      if (out) return out;
    }
    if (typeof payload.output_text === 'string') return payload.output_text;
    return '';
  }

  function isLocalEndpoint(endpoint) {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(String(endpoint || ''));
  }

  function shouldDisableThinking(endpoint, model, opts) {
    if (opts && opts.enableThinking) return false;
    endpoint = String(endpoint || '');
    model = String(model || '');
    if (!/api\.deepseek\.com/i.test(endpoint)) return false;
    return /^deepseek-v4-/i.test(model);
  }

  function applyProviderOptions(body, endpoint, model, opts) {
    body = body || {};
    if (shouldDisableThinking(endpoint, model, opts)) {
      body.thinking = { type: 'disabled' };
    }
    return body;
  }

  function emptyResponseMessage(payload, lang) {
    var zh = lang === 'zh';
    var choice = payload && payload.choices && payload.choices[0];
    var finish = choice && choice.finish_reason;
    if (finish === 'content_filter') {
      return zh ? '\u0041\u0050\u0049 \u8fd4\u56de\u7a7a\u54cd\u5e94\uff1a\u5185\u5bb9\u88ab\u63a5\u53e3\u8fc7\u6ee4\u3002' : 'API returned empty response: content was filtered.';
    }
    if (finish === 'length') {
      return zh ? '\u0041\u0050\u0049 \u8fd4\u56de\u7a7a\u54cd\u5e94\uff1a\u8f93\u51fa\u957f\u5ea6\u4e0d\u8db3\uff0c\u5df2\u8fbe\u5230 max_tokens\u3002' : 'API returned empty response: max_tokens was reached.';
    }
    if (finish) {
      return zh ? ('\u0041\u0050\u0049 \u8fd4\u56de\u7a7a\u54cd\u5e94\uff1afinish_reason=' + finish) : ('API returned empty response: finish_reason=' + finish);
    }
    return zh ? '\u0041\u0050\u0049 \u8fd4\u56de\u7a7a\u54cd\u5e94\uff1a\u63a5\u53e3\u6ca1\u6709\u8fd4\u56de\u53ef\u8bfb\u53d6\u6587\u672c\u3002' : 'API returned empty response: no readable text in response.';
  }

  function emptyResponseDetail(payload, maxLen) {
    maxLen = maxLen || 200;
    try {
      return JSON.stringify({
        id: payload && payload.id,
        model: payload && payload.model,
        finish_reason: payload && payload.choices && payload.choices[0] && payload.choices[0].finish_reason,
        usage: payload && payload.usage
      }).slice(0, maxLen);
    } catch (_) {
      return '';
    }
  }

  function selectEndpointAndModel(cfg, opts, defaults) {
    cfg = cfg || {};
    opts = opts || {};
    defaults = defaults || {};
    var useHighQuality = !!(opts.highQuality || opts.quality === 'high') && Number(cfg.highQualityMode || 0) > 0;
    var endpoint = useHighQuality ? (cfg.highQualityEndpoint || cfg.endpoint || '') : (cfg.endpoint || '');
    var model = useHighQuality ? (cfg.highQualityModel || cfg.model || defaults.highQualityModel) : (cfg.model || defaults.model);
    return {
      endpoint: endpoint,
      model: model,
      useHighQuality: useHighQuality
    };
  }

  function buildChatBody(cfg, opts, defaults) {
    cfg = cfg || {};
    opts = opts || {};
    defaults = defaults || {};
    var selected = selectEndpointAndModel(cfg, opts, defaults);
    var body = {
      model: selected.model,
      messages: opts.messages || [],
      temperature: (opts.temperature != null) ? opts.temperature : cfg.temperature,
      max_tokens: (opts.max_tokens != null) ? opts.max_tokens : cfg.max_tokens,
      stream: false
    };
    applyProviderOptions(body, selected.endpoint, selected.model, opts);
    return Object.assign(selected, { body: body });
  }

  var ApiClientModule = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    contentToText: contentToText,
    extractResponseText: extractResponseText,
    isLocalEndpoint: isLocalEndpoint,
    shouldDisableThinking: shouldDisableThinking,
    applyProviderOptions: applyProviderOptions,
    emptyResponseMessage: emptyResponseMessage,
    emptyResponseDetail: emptyResponseDetail,
    selectEndpointAndModel: selectEndpointAndModel,
    buildChatBody: buildChatBody
  };

  root.AIStoryGen.ApiClientModule = ApiClientModule;
  root.AIStoryGenApiClientModule = ApiClientModule;
})(typeof window !== 'undefined' ? window : globalThis);
