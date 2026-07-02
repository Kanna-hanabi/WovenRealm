/* ============================================================
 * AIStoryGen page classifier
 * Centralizes high-confidence page-level rules for vanilla pages
 * that should not receive AI story UI.
 * ============================================================ */
(function (root) {
  'use strict';

  root.AIStoryGen = root.AIStoryGen || {};

  var MODULE_SCHEMA_VERSION = 1;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isFarmUpgradePassage(name) {
    return /^(Farm Upgrades|Farm Upgrade|Upgrade|Upgrades)\b/i.test(normalizeText(name));
  }

  function hasManagementHint(pageText) {
    return /(\u5347\u7ea7\u65b9\u6848|\u6269\u5927|\u6269\u5efa|\u4fee\u5efa|\u5efa\u9020|\u8d2d\u4e70\u66f4\u591a|\u5f53\u524d\u7b49\u7ea7|upgrade|upgrades|expand|build|construction)/i.test(normalizeText(pageText));
  }

  function isPriceLikeLink(text) {
    text = normalizeText(text);
    return /([£\u00a3\u62e2$]\s*\d|\d+\s*(?:[£\u00a3\u62e2$])|\u8d2d\u4e70|\u4e70\u4e0b|\u51fa\u552e|\u552e\u51fa|\u4ef7\u683c|buy|sell|price|cost)/i.test(text);
  }

  function isManagementActionLink(text, passage) {
    text = normalizeText(text);
    passage = normalizeText(passage);
    if (/(\u6269\u5927|\u6269\u5efa|\u4fee\u5efa|\u5efa\u9020|\u8d2d\u4e70\u66f4\u591a|upgrade|expand|build|buy more)/i.test(text)) return true;
    if (/Upgrades?/i.test(passage)) return true;
    return false;
  }

  function isInventoryActionLink(text) {
    text = normalizeText(text);
    return /(\u6dfb\u52a0|\u5378\u4e0b|\u7a7f\u6234|\u4e22\u5f03|\u5173\u4e0a|\u51fa\u552e\u5168\u90e8|\u6dfb\u52a0\u5168\u90e8|\u53d1\u9001|^Send$|^Equip$|^Discard$|^Add$|^Remove$|^Wear$|^Close$)/i.test(text);
  }

  function summarizeLinks(links) {
    links = Array.isArray(links) ? links : [];
    var counts = {
      total: links.length,
      price: 0,
      inventoryAction: 0,
      managementAction: 0
    };
    links.forEach(function (link) {
      link = link || {};
      var text = link.text != null ? link.text : link.linkText;
      var passage = link.passage != null ? link.passage : link.targetPassage;
      if (isPriceLikeLink(text)) counts.price += 1;
      if (isInventoryActionLink(text)) counts.inventoryAction += 1;
      if (isManagementActionLink(text, passage)) counts.managementAction += 1;
    });
    return counts;
  }

  function classifyPage(data) {
    data = data || {};
    var passageName = normalizeText(data.passageName);
    var markers = data.markers || {};
    if (markers.wardrobeLike) {
      return { skip: true, type: 'management', reason: 'wardrobe marker' };
    }
    if (markers.shopTableLike) {
      return { skip: true, type: 'shop', reason: 'shop table marker' };
    }
    if (isFarmUpgradePassage(passageName)) {
      return { skip: true, type: 'management', reason: 'upgrade passage' };
    }

    var links = Array.isArray(data.links) ? data.links : [];
    var counts = summarizeLinks(links);
    var threshold = counts.total * 0.3;
    if (counts.total >= 4) {
      if (counts.price >= 3 && counts.price >= threshold) {
        return { skip: true, type: 'shop', reason: 'price links', counts: counts };
      }
      if (counts.inventoryAction >= 3 && counts.inventoryAction >= threshold) {
        return { skip: true, type: 'management', reason: 'inventory action links', counts: counts };
      }
      if (hasManagementHint(data.pageText) && counts.managementAction >= 2 && counts.managementAction >= threshold) {
        return { skip: true, type: 'management', reason: 'management links', counts: counts };
      }
    }
    return { skip: false, type: 'story', reason: 'story page', counts: counts };
  }

  function isShopOrUIPage(data) {
    return !!classifyPage(data).skip;
  }

  function create() {
    return {
      schemaVersion: 1,
      moduleSchemaVersion: MODULE_SCHEMA_VERSION,
      classifyPage: classifyPage,
      isShopOrUIPage: isShopOrUIPage,
      summarizeLinks: summarizeLinks,
      hasManagementHint: hasManagementHint,
      isFarmUpgradePassage: isFarmUpgradePassage
    };
  }

  var moduleApi = {
    schemaVersion: MODULE_SCHEMA_VERSION,
    create: create,
    classifyPage: classifyPage,
    isShopOrUIPage: isShopOrUIPage,
    summarizeLinks: summarizeLinks,
    hasManagementHint: hasManagementHint,
    isFarmUpgradePassage: isFarmUpgradePassage
  };

  root.AIStoryGen.PageClassifierModule = moduleApi;
  root.AIStoryGenPageClassifierModule = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
