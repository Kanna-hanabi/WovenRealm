/* ============================================================
 * AIStoryGen memory UI
 * Renders the AI memory log page and owns memory edit/refine controls.
 * Runtime storage stays in aiMacro.js / ai-state-store.js.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function clean(value) {
    return String(value || '').trim();
  }

  function defaultMemoryEntry(name, text) {
    return {
      name: clean(name),
      text: clean(text),
      ts: Date.now()
    };
  }

  function normalizeEntry(entry, normalizeFn) {
    if (typeof normalizeFn === 'function') {
      try { return normalizeFn(entry); } catch (_) {}
    }
    entry = entry && typeof entry === 'object' ? entry : {};
    return {
      name: clean(entry.name) || '\u957f\u671f\u8bb0\u5fc6',
      text: clean(entry.text),
      tag: clean(entry.tag) || '\u5267\u60c5',
      locked: !!entry.locked,
      auto: !!entry.auto,
      ts: entry.ts || Date.now()
    };
  }

  function formatLongTermMemory(entries, normalizeFn) {
    entries = Array.isArray(entries) ? entries : [];
    return entries.map(function (entry, i) {
      entry = normalizeEntry(entry, normalizeFn);
      entries[i] = entry;
      var title = entry.name || '\u957f\u671f\u8bb0\u5fc6';
      var tag = entry.tag && entry.tag !== '\u5267\u60c5' ? ' / ' + entry.tag : '';
      return '### ' + title + tag + '\n' + (entry.text || '');
    }).join('\n\n');
  }

  function parseLongTermMemory(raw, memoryEntryFn) {
    raw = clean(raw);
    if (!raw) return [];
    var parts = raw.split(/\n(?=###\s+)/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) parts = [raw];
    var out = [];
    parts.forEach(function (part) {
      var lines = part.split('\n');
      var first = clean(lines[0]);
      var name = '[\u73a9\u5bb6\u957f\u671f\u8bb0\u5fc6]';
      var tag = '\u73a9\u5bb6\u8bbe\u5b9a';
      if (first.indexOf('###') === 0) {
        first = first.replace(/^###\s*/, '').trim();
        var titleParts = first.split(/\s+\/\s+/);
        name = titleParts[0] ? clean(titleParts[0]) : name;
        tag = titleParts[1] ? clean(titleParts.slice(1).join(' / ')) : tag;
        lines.shift();
      }
      var text = lines.join('\n').trim();
      if (!text && first && name === '[\u73a9\u5bb6\u957f\u671f\u8bb0\u5fc6]') text = first;
      if (!text) return;
      var entry;
      if (typeof memoryEntryFn === 'function') {
        try { entry = memoryEntryFn(name, text); } catch (_) {}
      }
      entry = entry || defaultMemoryEntry(name, text);
      entry.tag = tag || '\u73a9\u5bb6\u8bbe\u5b9a';
      entry.locked = true;
      out.push(entry);
    });
    return out;
  }

  function formatShortTermMemory(entries) {
    entries = Array.isArray(entries) ? entries : [];
    return entries.map(function (entry, i) {
      entry = entry && typeof entry === 'object' ? entry : {};
      return '[' + (i + 1) + '] ' + (entry.name || '\u5267\u60c5') + '\n' + (entry.text || '');
    }).join('\n\n');
  }

  function parseShortTermMemory(raw) {
    raw = clean(raw);
    if (!raw) return [];
    var out = [];
    raw.split(/\n{2,}/).forEach(function (part) {
      part = part.replace(/^\s*\[\d+\]\s*/, '').trim();
      if (!part) return;
      var lines = part.split('\n');
      var name = lines.length > 1 ? clean(lines.shift()) : '[\u77ed\u671f]';
      var text = lines.join('\n').trim() || name;
      if (text === name) name = '[\u77ed\u671f]';
      out.push({ name: name, text: text });
    });
    return out;
  }

  function buildLongTermRefinePrompt(raw, customPrompt) {
    customPrompt = clean(customPrompt);
    if (customPrompt) {
      if (customPrompt.indexOf('{{memory}}') >= 0) return customPrompt.replace(/\{\{\s*memory\s*\}\}/g, raw);
      return customPrompt + '\n\n' + raw;
    }
    return [
      '\u4f60\u662f\u6e38\u620f\u5267\u60c5\u957f\u671f\u8bb0\u5fc6\u6574\u7406\u5668\u3002\u8bf7\u628a\u4e0b\u9762\u5185\u5bb9\u538b\u7f29\u6210\u53ef\u7528\u7684\u5267\u60c5\u7d22\u5f15\uff0c\u4e0d\u8981\u4fdd\u7559\u5b8c\u6574\u53d9\u4e8b\u539f\u6587\u3002',
      '\u5fc5\u987b\u4fdd\u7559\uff1a\u5f53\u524dAI\u5267\u60c5\u72b6\u6001\u3001\u91cd\u8981\u5730\u70b9\u4e0e\u8def\u7ebf\u987a\u5e8f\u3001\u4eba\u7269\u5173\u7cfb\u53d8\u5316\u3001\u5267\u60c5\u7ebf\u7d22\u6216\u5267\u60c5\u7269\u54c1\u3001\u672a\u5b8c\u6210\u76ee\u6807\u3002',
      '\u5267\u60c5\u7269\u54c1\u6307\u7684\u662f\u5bf9\u540e\u7eed\u5267\u60c5\u6709\u610f\u4e49\u7684\u7ebf\u7d22\u7269\uff0c\u4f8b\u5982\u539f\u77f3\u3001\u65e7\u7b14\u8bb0\u3001\u5730\u56fe\u3001\u540d\u7247\u3001\u7279\u6b8a\u786c\u5e01\uff1b\u4e0d\u8981\u628a\u666e\u901a\u5e93\u5b58\u6e05\u5355\u548c\u6570\u91cf\u5f53\u6210\u8bb0\u5fc6\u91cd\u70b9\u3002',
      '\u5fc5\u987b\u5220\u9664\uff1a\u539f\u7248\u72b6\u6001\u6570\u636e\u3001\u73a9\u5bb6\u5c5e\u6027\u3001\u6280\u80fd\u3001\u6027\u7656\u3001\u7a7f\u7740\u3001\u91d1\u94b1\u6570\u503c\u3001\u666e\u901a\u9053\u5177\u5e93\u5b58\u6570\u91cf\u3001\u623f\u79df\u4efb\u52a1\u3001\u81ea\u7531\u4efb\u52a1\u3001\u8d44\u6e90\u72b6\u6001\u3001\u7248\u672c\u53f7\u3001\u83dc\u5355\u6587\u5b57\u3001\u623f\u95f4\u9759\u6001\u63cf\u5199\u3001\u91cd\u590d\u53e5\u3001\u5fc3\u7406\u94fa\u9648\u548c\u666e\u901a\u52a8\u4f5c\u8fc7\u7a0b\u3002',
      '\u5982\u679c\u539f\u6587\u5305\u542bAI\u5267\u60c5\u4e8b\u4ef6\uff0c\u4e0d\u8981\u56de\u7b54\u300c\u6ca1\u6709\u53ef\u4fdd\u7559\u7684\u5173\u952e\u6570\u636e\u300d\uff1b\u81f3\u5c11\u4fdd\u7559\u4e00\u6761\u53ef\u7528\u5267\u60c5\u7d22\u5f15\u3002',
      '\u8f93\u51fa\u4e2d\u6587\uff0c\u53ea\u80fd\u4f7f\u7528\u4ee5\u4e0b\u4e94\u7c7b\u683c\u5f0f\uff1b\u6bcf\u7c7b\u6700\u591a 6 \u6761\uff0c\u6bcf\u6761\u4e0d\u8d85\u8fc7 80 \u5b57\uff0c\u53ea\u5199\u4e8b\u5b9e\u53d8\u5316\uff1a',
      '### \u5f53\u524d\u5267\u60c5\u72b6\u6001 / \u7cbe\u70bc',
      '- ...',
      '### \u5730\u70b9\u4e0e\u8def\u7ebf / \u7cbe\u70bc',
      '- ...',
      '### \u4eba\u7269\u5173\u7cfb\u53d8\u5316 / \u7cbe\u70bc',
      '- ...',
      '### \u7ebf\u7d22\u4e0e\u5267\u60c5\u7269\u54c1 / \u7cbe\u70bc',
      '- ...',
      '### \u672a\u5b8c\u6210\u76ee\u6807 / \u7cbe\u70bc',
      '- ...',
      '',
      raw
    ].join('\n');
  }

  function buildShortTermCompressPrompt(entriesText) {
    return [
      '\u4f60\u662f\u5267\u60c5\u8bb0\u5fc6\u6574\u7406\u5668\u3002\u628a\u4ee5\u4e0b\u77ed\u671f\u5267\u60c5\u6309\u53d1\u751f\u987a\u5e8f\u6574\u7406\u6210 1-3 \u6761\u91cd\u70b9\u8bb0\u5fc6\u3002',
      '\u8981\u6c42\uff1a\u4fdd\u7559\u5267\u60c5\u987a\u5e8f\u3001\u5173\u952e\u4e8b\u4ef6\u3001\u5730\u70b9\u53d8\u5316\u3001NPC\u4e92\u52a8\u3001\u73a9\u5bb6\u72b6\u6001\u53d8\u5316\uff1b\u5220\u9664\u7410\u788e\u73af\u5883\u63cf\u5199\u3002',
      '\u6bcf\u6761\u4e0d\u8d85\u8fc7 220 \u5b57\u3002\u53ea\u8f93\u51fa\u6574\u7406\u540e\u7684\u8bb0\u5fc6\u6761\u76ee\u3002',
      '',
      entriesText
    ].join('\n');
  }

  function splitCompressedResult(result) {
    result = clean(result);
    if (!result) return [];
    var parts = result.split(/\n{2,}|\n(?=\s*(?:[-*]|\d+[\.\)]))/).filter(function (s) {
      return clean(s).length > 5;
    });
    if (!parts.length) parts = [result];
    return parts.map(function (part) {
      return clean(part)
        .replace(/^\s*(?:[-*]|\d+[\.\)])\s*/, '')
        .replace(/^\[\u6458\u8981\]\s*/i, '')
        .replace(/^\[Summary\]\s*/i, '')
        .trim();
    }).filter(Boolean);
  }

  function create(deps) {
    deps = deps || {};
    var lastLongTermBeforeRefine = '';

    function get$() {
      var jq = deps.$ || root.jQuery || root.$;
      if (!jq) throw new Error('[AIStoryGen] jQuery is required for ai-memory-ui.js');
      return jq;
    }

    function getLongTermMem() {
      var value = typeof deps.getLongTermMem === 'function' ? deps.getLongTermMem() : (root.AIStoryGen && root.AIStoryGen.longTermMem);
      return Array.isArray(value) ? value : [];
    }

    function getRecentBuf() {
      var value = typeof deps.getRecentBuf === 'function' ? deps.getRecentBuf() : (root.AIStoryGen && root.AIStoryGen.recentBuf);
      return Array.isArray(value) ? value : [];
    }

    function saveMemory() {
      if (typeof deps.saveMemoryBuffer === 'function') deps.saveMemoryBuffer();
    }

    function setMessage($msg, cls, text) {
      if (!$msg || !$msg.length) return;
      $msg.removeClass('err ok');
      if (cls) $msg.addClass(cls);
      $msg.text(text || '');
    }

    function renderMemoryEntries($container, $msg) {
      var $ = get$();
      $container.empty();
      var shortBuf = getRecentBuf();
      var importantBuf = getLongTermMem();

      function longTermToText() {
        return formatLongTermMemory(importantBuf, deps.normalizeImportantMemoryEntry);
      }

      function textToLongTerm(raw) {
        var parsed = parseLongTermMemory(raw, deps.memoryEntry);
        importantBuf.length = 0;
        parsed.forEach(function (entry) { importantBuf.push(entry); });
      }

      function saveLongTermOnly(message) {
        textToLongTerm($container.find('textarea[data-memory-type="long-bulk"]').val());
        saveMemory();
        $container.find('textarea[data-memory-type="long-bulk"]').val(longTermToText());
        setMessage($msg, 'ok', message || '\u957f\u671f\u8bb0\u5fc6\u5df2\u4fdd\u5b58\u3002');
      }

      async function refineLongTermMemory() {
        var $ta = $container.find('textarea[data-memory-type="long-bulk"]');
        var raw = clean($ta.val());
        if (!raw) {
          setMessage($msg, 'err', '\u957f\u671f\u8bb0\u5fc6\u4e3a\u7a7a\uff0c\u65e0\u9700\u7cbe\u70bc\u3002');
          return;
        }
        lastLongTermBeforeRefine = raw;
        setMessage($msg, '', '\u6b63\u5728\u7cbe\u70bc\u957f\u671f\u8bb0\u5fc6...');
        $container.find('button').prop('disabled', true);
        var refined = '';
        try {
          var cfg = typeof deps.loadCfg === 'function' ? (deps.loadCfg() || {}) : {};
          if (cfg.apiKey && cfg.endpoint && typeof deps.callAI === 'function') {
            refined = await deps.callAI(buildLongTermRefinePrompt(raw, cfg.longTermRefinePrompt), {
              highQuality: true,
              temperature: 0.25,
              max_tokens: 1000
            });
            if (typeof deps.isNoUsefulLongTermRefineOutput === 'function' && deps.isNoUsefulLongTermRefineOutput(refined)) {
              refined = '';
            } else if (typeof deps.refineLongTermMemoryBulkText === 'function') {
              refined = deps.refineLongTermMemoryBulkText(refined || '');
            }
            if (!refined && typeof deps.refineLongTermMemoryBulkText === 'function') {
              refined = deps.refineLongTermMemoryBulkText(raw);
            }
          } else if (typeof deps.refineLongTermMemoryBulkText === 'function') {
            refined = deps.refineLongTermMemoryBulkText(raw);
          }
        } catch (e) {
          if (typeof deps.refineLongTermMemoryBulkText === 'function') {
            refined = deps.refineLongTermMemoryBulkText(raw);
          }
          setMessage($msg, 'err', 'AI \u7cbe\u70bc\u5931\u8d25\uff0c\u5df2\u4f7f\u7528\u672c\u5730\u89c4\u5219\u7cbe\u70bc\u3002');
        } finally {
          $container.find('button').prop('disabled', false);
        }
        if (!refined) {
          $ta.val(raw);
          setMessage($msg, 'err', '\u957f\u671f\u8bb0\u5fc6\u7cbe\u70bc\u6ca1\u6709\u5f97\u5230\u53ef\u7528\u7ed3\u679c\uff0c\u5df2\u4fdd\u7559\u539f\u5185\u5bb9\uff0c\u672a\u8986\u76d6\u4fdd\u5b58\u3002');
          return;
        }
        $ta.val(refined);
        saveLongTermOnly('\u957f\u671f\u8bb0\u5fc6\u5df2\u7cbe\u70bc\u5e76\u4fdd\u5b58\u3002');
        $btnUndoRefineLong.prop('disabled', false).show();
      }

      var $long = $('<div style="margin-bottom:1em;"></div>');
      $long.append($('<div style="font-weight:bold;color:#d0b070;margin:0.5em 0;"></div>').text('\u957f\u671f\u8bb0\u5fc6\u533a'));
      $long.append($('<div style="font-size:0.8em;color:#9aa;margin-bottom:0.5em;"></div>').text('\u8fd9\u91cc\u53ea\u4fdd\u5b58\u7cbe\u70bc\u540e\u7684\u5173\u952e\u5267\u60c5\u3001\u5267\u60c5\u987a\u5e8f\u3001\u4eba\u7269\u5173\u7cfb\u548c\u91cd\u8981\u72b6\u6001\u3002\u9759\u6001\u623f\u95f4\u63cf\u8ff0\u3001\u7248\u672c\u53f7\u3001\u83dc\u5355\u6587\u5b57\u548c\u5927\u6bb5\u539f\u6587\u4e0d\u4f1a\u5199\u5165\u8fd9\u91cc\uff1b\u73a9\u5bb6\u4e5f\u53ef\u4ee5\u76f4\u63a5\u6539\u5199\u3001\u5220\u9664\u6216\u91cd\u6392\u3002'));
      $long.append($('<textarea rows="14" style="width:100%;font-size:0.86em;background:#1a1a2e;color:#ddd;border:1px solid #334;resize:vertical;" data-memory-type="long-bulk" placeholder="\u4f8b\u5982\uff1a&#10;### \u4e3b\u7ebf\u987a\u5e8f / \u73a9\u5bb6\u8bbe\u5b9a&#10;\u4e3b\u89d2\u5148\u5728\u5367\u5ba4\u53d1\u73b0\u7ebf\u7d22\uff0c\u4e4b\u540e\u524d\u5f80\u6d74\u5ba4\u8c03\u67e5\u3002&#10;&#10;### NPC\u5173\u7cfb / \u5267\u60c5&#10;\u67d0\u89d2\u8272\u5bf9\u4e3b\u89d2\u7684\u6001\u5ea6\u53d1\u751f\u53d8\u5316\u3002"></textarea>').val(longTermToText()));

      var $longBtns = $('<div style="margin-top:0.4em;"></div>');
      var $btnSaveLong = $('<button class="ai-cfg-btn"></button>').text('\u4fdd\u5b58').on('click', function () {
        saveLongTermOnly('\u957f\u671f\u8bb0\u5fc6\u5df2\u4fdd\u5b58\u3002');
      });
      var $btnRefineLong = $('<button class="ai-cfg-btn" style="margin-left:0.5em;"></button>').text('\u7cbe\u70bc\u8bb0\u5fc6').on('click', function () {
        refineLongTermMemory();
      });
      var $btnUndoRefineLong = $('<button class="ai-cfg-btn" style="margin-left:0.5em;"></button>').text('\u64a4\u56de\u7cbe\u70bc').prop('disabled', !lastLongTermBeforeRefine).toggle(!!lastLongTermBeforeRefine).on('click', function () {
        if (!lastLongTermBeforeRefine) {
          setMessage($msg, 'err', '\u6ca1\u6709\u53ef\u64a4\u56de\u7684\u7cbe\u70bc\u8bb0\u5f55\u3002');
          return;
        }
        $container.find('textarea[data-memory-type="long-bulk"]').val(lastLongTermBeforeRefine);
        saveLongTermOnly('\u5df2\u64a4\u56de\u4e0a\u4e00\u6b21\u957f\u671f\u8bb0\u5fc6\u7cbe\u70bc\u3002');
        lastLongTermBeforeRefine = '';
        $btnUndoRefineLong.prop('disabled', true).hide();
      });
      $longBtns.append($btnSaveLong).append($btnRefineLong).append($btnUndoRefineLong);
      $long.append($longBtns);

      var $short = $('<div style="margin-top:1em;border-top:1px solid #334;padding-top:0.8em;"></div>');
      $short.append($('<div style="font-weight:bold;color:#b4a078;margin:0.5em 0;"></div>').text('\u77ed\u671f\u5267\u60c5\u8bb0\u5fc6'));
      $short.append($('<div style="font-size:0.8em;color:#9aa;margin-bottom:0.5em;"></div>').text('\u8fd9\u662f\u8fd0\u884c\u65f6\u4e0d\u65ad\u8ffd\u52a0\u7684\u4e34\u65f6\u8bb0\u5f55\u3002\u8d85\u8fc7\u201c\u5267\u60c5\u8bb0\u5fc6\u6761\u6570\u201d\u540e\uff0c\u4f1a\u6574\u7406\u8fdb\u4e0a\u9762\u7684\u957f\u671f\u8bb0\u5fc6\u533a\u3002'));
      $short.append($('<textarea rows="8" style="width:100%;font-size:0.82em;background:#1a1a2e;color:#ccc;border:1px solid #334;resize:vertical;" data-memory-type="short-bulk" placeholder="\u6682\u65e0\u77ed\u671f\u8bb0\u5fc6\u3002\u65b0\u7684\u5267\u60c5\u4f1a\u4e0d\u65ad\u8ffd\u52a0\u5230\u8fd9\u91cc\u3002"></textarea>').val(formatShortTermMemory(shortBuf)));

      function updateAll() {
        textToLongTerm($container.find('textarea[data-memory-type="long-bulk"]').val());
        var parsedShort = parseShortTermMemory($container.find('textarea[data-memory-type="short-bulk"]').val());
        shortBuf.length = 0;
        parsedShort.forEach(function (entry) { shortBuf.push(entry); });
        if (typeof deps.enforceRecentMemoryLimit === 'function') {
          deps.enforceRecentMemoryLimit(typeof deps.loadCfg === 'function' ? deps.loadCfg() : {}, '\u624b\u52a8\u7f16\u8f91\u77ed\u671f\u8bb0\u5fc6');
        }
        saveMemory();
        setMessage($msg, 'ok', '\u8bb0\u5fc6\u5df2\u66f4\u65b0\u3002');
        renderMemoryEntries($container, $msg);
      }

      var $btnUpdate = $('<button class="ai-cfg-btn" style="margin-top:0.4em;"></button>').text('\u66f4\u65b0\u8bb0\u5fc6').on('click', updateAll);
      var $btnCompress = $('<button class="ai-cfg-btn" style="margin-top:0.4em;margin-left:0.5em;"></button>').text('\u6574\u7406\u77ed\u671f\u5230\u957f\u671f').on('click', function () {
        compressMemory($container, $msg);
      });
      var $btnClearShort = $('<button class="ai-cfg-btn" style="margin-top:0.4em;margin-left:0.5em;"></button>').text('\u6e05\u7a7a\u77ed\u671f').on('click', function () {
        var ask = typeof deps.confirm === 'function' ? deps.confirm : root.confirm;
        if (typeof ask === 'function' && !ask('\u786e\u5b9a\u6e05\u7a7a\u77ed\u671f\u5267\u60c5\u8bb0\u5fc6\uff1f\u957f\u671f\u8bb0\u5fc6\u533a\u4e0d\u4f1a\u6e05\u7a7a\u3002')) return;
        shortBuf.length = 0;
        saveMemory();
        renderMemoryEntries($container, $msg);
      });
      var $btnExport = $('<button class="ai-cfg-btn" style="margin-top:0.4em;margin-left:0.5em;"></button>').text('\u5bfc\u51fa\u8bb0\u5fc6').on('click', function () {
        updateAll();
        if (typeof deps.exportMemoryBuffer === 'function') deps.exportMemoryBuffer();
        setMessage($msg, 'ok', '\u8bb0\u5fc6\u5df2\u5bfc\u51fa\u4e3a JSON \u6587\u4ef6\u3002');
      });
      var $btnImport = $('<button class="ai-cfg-btn" style="margin-top:0.4em;margin-left:0.5em;"></button>').text('\u5bfc\u5165\u8bb0\u5fc6').on('click', function () {
        if (typeof deps.importMemoryBuffer !== 'function') return;
        deps.importMemoryBuffer(function (err, count) {
          if (err) setMessage($msg, 'err', '\u5bfc\u5165\u5931\u8d25: ' + (err.message || err));
          else {
            setMessage($msg, 'ok', '\u5df2\u5bfc\u5165 ' + count + ' \u6761\u8bb0\u5fc6\u3002');
            renderMemoryEntries($container, $msg);
          }
        });
      });

      $container.append($long).append($short)
        .append($btnUpdate).append($btnCompress).append($btnClearShort)
        .append($btnExport).append($btnImport);
    }

    async function compressMemory($container, $msg) {
      var buf = getRecentBuf();
      if (buf.length < 2) {
        setMessage($msg, 'err', '\u77ed\u671f\u8bb0\u5fc6\u4e0d\u8db3\uff0c\u81f3\u5c11 2 \u6761\u624d\u80fd\u538b\u7f29\u3002');
        return;
      }
      setMessage($msg, '', 'AI \u6b63\u5728\u538b\u7f29\u77ed\u671f\u8bb0\u5fc6\u5230\u91cd\u70b9\u8bb0\u5fc6\u533a...');
      $container.find('button').prop('disabled', true);
      try {
        var entries = buf.map(function (e, i) {
          e = e && typeof e === 'object' ? e : {};
          return '[' + (i + 1) + '] ' + (e.name || '') + ': ' + (e.text || '');
        }).join('\n\n');
        if (typeof deps.callAI !== 'function') throw new Error('AI API unavailable');
        var result = await deps.callAI(buildShortTermCompressPrompt(entries), {
          highQuality: true,
          temperature: 0.25,
          max_tokens: 800
        });
        splitCompressedResult(result).forEach(function (part) {
          var text = part.length > 300 ? part.slice(0, 300) + '...' : part;
          if (typeof deps.addImportantMemory === 'function') {
            deps.addImportantMemory('[\u538b\u7f29\u91cd\u70b9]', text, {
              silent: true,
              tag: '\u538b\u7f29',
              auto: true
            });
          }
        });
        buf.length = 0;
        saveMemory();
        setMessage($msg, 'ok', '\u77ed\u671f\u8bb0\u5fc6\u5df2\u538b\u7f29\u8fdb\u91cd\u70b9\u8bb0\u5fc6\u533a\u3002');
        renderMemoryEntries($container, $msg);
      } catch (e) {
        setMessage($msg, 'err', '\u538b\u7f29\u5931\u8d25: ' + (e.message || e));
      } finally {
        $container.find('button').prop('disabled', false);
      }
    }

    function buildOverlay($root) {
      var $ = get$();
      $root.empty().addClass('ai-memory-page ai-cfg');
      $root.append($('<h2></h2>').text('AI\u8bb0\u5fc6'));
      var $body = $('<div class="ai-memory-body"></div>');
      var $msg = $('<div class="ai-cfg-msg"></div>');
      renderMemoryEntries($body, $msg);
      $root.append($body).append($msg);
    }

    return {
      schemaVersion: MODULE_SCHEMA_VERSION,
      renderMemoryEntries: renderMemoryEntries,
      compressMemory: compressMemory,
      buildOverlay: buildOverlay
    };
  }

  var module = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    formatLongTermMemory: formatLongTermMemory,
    parseLongTermMemory: parseLongTermMemory,
    formatShortTermMemory: formatShortTermMemory,
    parseShortTermMemory: parseShortTermMemory,
    buildLongTermRefinePrompt: buildLongTermRefinePrompt,
    buildShortTermCompressPrompt: buildShortTermCompressPrompt,
    splitCompressedResult: splitCompressedResult
  };

  root.AIStoryGenMemoryUIModule = module;
  root.AIStoryGen.MemoryUIModule = module;
})(typeof window !== 'undefined' ? window : globalThis);
