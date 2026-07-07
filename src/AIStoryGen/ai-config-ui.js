/* ============================================================
 * AIStoryGen config UI controller
 * Owns the merged settings tabs shared by story AI and image AI.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;
  var TAB_ORDER = ['story', 'prompt', 'pixel', 'personal', 'npc'];
  var TAB_LABELS = {
    story: '\u5267\u60c5AI\u8bbe\u7f6e',
    prompt: '\u63d0\u793a\u8bcd',
    pixel: '\u7ed8\u56fe\u8bbe\u7f6e',
    personal: '\u4e2a\u4eba\u8bbe\u5b9a',
    npc: 'NPC\u5f62\u8c61\u8bbe\u7f6e'
  };

  function isKnownTab(tab) {
    return TAB_ORDER.indexOf(String(tab || '')) >= 0;
  }

  function normaliseTab(tab, pixelEnabled) {
    tab = String(tab || 'story');
    if (!isKnownTab(tab)) tab = 'story';
    if (!pixelEnabled && tab !== 'story' && tab !== 'prompt') return 'story';
    return tab;
  }

  function getVisibleTabs(pixelEnabled) {
    return pixelEnabled ? TAB_ORDER.slice() : ['story', 'prompt'];
  }

  function create(deps) {
    deps = deps || {};
    var activeTab = 'story';

    function get$() {
      var jq = deps.$ || root.jQuery || root.$;
      if (!jq) throw new Error('[AIStoryGen] jQuery is required for ai-config-ui.js');
      return jq;
    }

    function loadCfg() {
      try {
        return typeof deps.loadCfg === 'function' ? (deps.loadCfg() || {}) : {};
      } catch (_) {
        return {};
      }
    }

    function isPixelEnabled() {
      try {
        if (typeof deps.isPixelEnabled === 'function') return !!deps.isPixelEnabled(loadCfg());
      } catch (_) {}
      var cfg = loadCfg();
      return Number(cfg.aiPixelEnabled == null ? 1 : cfg.aiPixelEnabled) !== 0;
    }

    function pixelGen() {
      try {
        if (typeof deps.getPixelGen === 'function') return deps.getPixelGen() || null;
      } catch (_) {}
      return root.AIPixelGen || null;
    }

    function renderMissing($content, message) {
      var $ = get$();
      $content.empty().append($('<div class="ai-cfg-msg err"></div>').text(message));
    }

    function renderUnifiedConfigForm($container, isSettingsTab, defaultTab) {
      var $ = get$();
      activeTab = normaliseTab(defaultTab || activeTab, isPixelEnabled());

      var $root = $('<div></div>').addClass('apg-panel-wrap ai-unified-settings ai-merged-settings');
      var $tabs = $('<div class="apg-subtabs ai-merged-subtabs"></div>');
      var buttons = {};
      TAB_ORDER.forEach(function (tab) {
        var cls = 'apg-subtab ai-merged-' + tab + '-tab';
        buttons[tab] = $('<button type="button"></button>').addClass(cls).text(TAB_LABELS[tab]);
        $tabs.append(buttons[tab]);
      });
      var $content = $('<div class="apg-subcontent ai-merged-content"></div>');
      $root.append($tabs).append($content);
      $container.empty().append($root);

      function pixelButtons() {
        return buttons.pixel.add(buttons.personal).add(buttons.npc);
      }

      function refreshPixelTabs() {
        var enabled = isPixelEnabled();
        pixelButtons().toggle(enabled);
        if (!enabled) {
          try { $('#passages .apg-ai-assist').remove(); } catch (_) {}
        }
        if (!enabled && ['pixel', 'personal', 'npc'].indexOf(activeTab) >= 0) showStory();
        return enabled;
      }

      function setActive(tab) {
        activeTab = normaliseTab(tab, isPixelEnabled());
        TAB_ORDER.forEach(function (key) {
          buttons[key].toggleClass('active', activeTab === key);
        });
      }

      function showStory() {
        setActive('story');
        if (typeof deps.renderStoryConfig === 'function') deps.renderStoryConfig($content, isSettingsTab);
        else renderMissing($content, 'AIStoryGen story settings renderer is unavailable.');
        refreshPixelTabs();
      }

      function showPrompt() {
        setActive('prompt');
        if (typeof deps.renderPromptConfig === 'function') deps.renderPromptConfig($content, isSettingsTab);
        else renderMissing($content, 'AIStoryGen prompt settings renderer is unavailable.');
        refreshPixelTabs();
      }

      function showPixel() {
        if (!refreshPixelTabs()) return;
        setActive('pixel');
        var api = pixelGen();
        if (api && typeof api.buildConfigForm === 'function') api.buildConfigForm($content, isSettingsTab);
        else renderMissing($content, 'AI\u7ed8\u56fe\u6a21\u5757\u5c1a\u672a\u52a0\u8f7d\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002');
      }

      function showPersonal() {
        if (!refreshPixelTabs()) return;
        setActive('personal');
        var api = pixelGen();
        if (api && typeof api.buildPersonalSettings === 'function') api.buildPersonalSettings($content);
        else renderMissing($content, 'AI\u7ed8\u56fe\u4e2a\u4eba\u8bbe\u5b9a\u5c1a\u672a\u52a0\u8f7d\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002');
      }

      function showNpc() {
        if (!refreshPixelTabs()) return;
        setActive('npc');
        var api = pixelGen();
        if (api && typeof api.buildNpcAppearanceSettings === 'function') api.buildNpcAppearanceSettings($content);
        else renderMissing($content, 'AI\u7ed8\u56feNPC\u5f62\u8c61\u8bbe\u7f6e\u5c1a\u672a\u52a0\u8f7d\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002');
      }

      buttons.story.on('click', showStory);
      buttons.prompt.on('click', showPrompt);
      buttons.pixel.on('click', showPixel);
      buttons.personal.on('click', showPersonal);
      buttons.npc.on('click', showNpc);

      root._AIStoryGenUnifiedSettingsRefresh = function () {
        if (!$root[0] || !root.document || !root.document.documentElement || !root.document.documentElement.contains($root[0])) return;
        refreshPixelTabs();
      };

      try {
        $(root.document).off('AIStoryGen:configSaved.aiUnified')
          .on('AIStoryGen:configSaved.aiUnified', function () {
            if (typeof root._AIStoryGenUnifiedSettingsRefresh === 'function') {
              root._AIStoryGenUnifiedSettingsRefresh();
            }
          });
      } catch (_) {}

      if (activeTab === 'prompt') showPrompt();
      else if (activeTab === 'pixel') showPixel();
      else if (activeTab === 'personal') showPersonal();
      else if (activeTab === 'npc') showNpc();
      else showStory();
      return getStatus();
    }

    function getStatus() {
      return {
        schemaVersion: MODULE_SCHEMA_VERSION,
        activeTab: activeTab,
        pixelEnabled: isPixelEnabled(),
        visibleTabs: getVisibleTabs(isPixelEnabled())
      };
    }

    return {
      schemaVersion: MODULE_SCHEMA_VERSION,
      normaliseTab: normaliseTab,
      getVisibleTabs: getVisibleTabs,
      renderUnifiedConfigForm: renderUnifiedConfigForm,
      getStatus: getStatus
    };
  }

  var api = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    tabOrder: TAB_ORDER.slice(),
    tabLabels: Object.assign({}, TAB_LABELS),
    normaliseTab: normaliseTab,
    getVisibleTabs: getVisibleTabs,
    create: create
  };

  root.AIStoryGen.ConfigUIModule = api;
  root.AIStoryGenConfigUIModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
