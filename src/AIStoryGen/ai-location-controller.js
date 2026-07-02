/* ============================================================
 * AIStoryGen location controller helpers
 * Pure location lookup, graph adjacency, manual-arrive candidates,
 * and arrival gating logic.
 * ============================================================ */
(function () {
  'use strict';

  var root = window.AIStoryGen = window.AIStoryGen || {};
  var SCHEMA_VERSION = 1;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function createLocationTools(deps) {
    deps = deps || {};
    var commonLocations = Array.isArray(deps.commonLocations) ? deps.commonLocations : [];

    function cleanLabel(text) {
      try {
        if (typeof deps.cleanLabel === 'function') return deps.cleanLabel(text);
      } catch (_) {}
      return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function currentState() {
      try {
        var state = typeof deps.currentState === 'function' ? deps.currentState() : {};
        return state || {};
      } catch (_) {
        return {};
      }
    }

    function availableDestinations() {
      try {
        var list = typeof deps.getAvailableDestinations === 'function' ? deps.getAvailableDestinations() : [];
        return Array.isArray(list) ? list : [];
      } catch (_) {
        return [];
      }
    }

    function storyHas(raw) {
      raw = String(raw || '').trim();
      if (!raw) return false;
      try {
        if (typeof deps.storyHas === 'function') return !!deps.storyHas(raw);
      } catch (_) {}
      try {
        return typeof Story !== 'undefined' && Story && Story.has && Story.has(raw);
      } catch (_) {
        return false;
      }
    }

    function isUnsafeDirectPassage(raw) {
      raw = String(raw || '').trim();
      if (!raw) return false;
      try {
        if (typeof deps.isUnsafeDirectPassage === 'function') return !!deps.isUnsafeDirectPassage(raw);
      } catch (_) {}
      return /^(Moor|Bog)$/i.test(raw) || /^Prison\b/i.test(raw);
    }

    function normalizePassage(raw) {
      raw = String(raw || '').trim();
      if (!raw) return '';
      if (storyHas(raw)) return raw;
      var loc = findCommon(raw);
      if (loc && loc.raw) return loc.raw;
      var graphLoc = findGraph(raw);
      if (graphLoc && graphLoc.passage) return graphLoc.passage;
      return raw;
    }

    function looksLikeRawLocationLabel(label) {
      label = String(label || '').trim();
      return !!label && /^[A-Za-z0-9][A-Za-z0-9' _:-]*$/.test(label);
    }

    function findCommon(rawOrLabel) {
      var raw = String(rawOrLabel || '').trim();
      if (!raw) return null;
      var rawLower = raw.toLowerCase();
      for (var i = 0; i < commonLocations.length; i++) {
        var loc = commonLocations[i] || {};
        if (String(loc.raw || '').toLowerCase() === rawLower || loc.label === raw) return loc;
        if (loc.locId && String(loc.locId).toLowerCase() === rawLower) return loc;
        var aliases = loc.aliases || [];
        for (var j = 0; j < aliases.length; j++) {
          if (String(aliases[j]).toLowerCase() === rawLower) return loc;
        }
      }
      return null;
    }

    function findCommonByRaw(rawPassage) {
      rawPassage = String(rawPassage || '').trim();
      if (!rawPassage) return null;
      for (var i = 0; i < commonLocations.length; i++) {
        if ((commonLocations[i] || {}).raw === rawPassage) return commonLocations[i];
      }
      return null;
    }

    function findCommonByLocId(locId) {
      locId = String(locId || '').trim().toLowerCase();
      if (!locId) return null;
      for (var i = 0; i < commonLocations.length; i++) {
        if (String((commonLocations[i] || {}).locId || '').toLowerCase() === locId) return commonLocations[i];
      }
      return null;
    }

    function findCommonByPrefix(rawPassage) {
      rawPassage = normalizePassageWithoutCommon(rawPassage || '');
      if (!rawPassage) return null;
      var best = null;
      var bestLen = 0;
      for (var i = 0; i < commonLocations.length; i++) {
        var common = commonLocations[i] || {};
        if (common.raw && rawPassage.indexOf(common.raw + ' ') === 0 && common.raw.length > bestLen) {
          best = common;
          bestLen = common.raw.length;
        }
      }
      return best;
    }

    function normalizePassageWithoutCommon(raw) {
      raw = String(raw || '').trim();
      if (!raw) return '';
      var graphLoc = findGraph(raw);
      if (graphLoc && graphLoc.passage) return graphLoc.passage;
      return raw;
    }

    function getGraph() {
      try {
        if (typeof deps.getLocationGraph === 'function') {
          var provided = deps.getLocationGraph();
          return provided && provided.nodes ? provided : null;
        }
      } catch (_) {}
      try {
        return (typeof window !== 'undefined' && window.AIStoryGenLocationGraph && window.AIStoryGenLocationGraph.nodes)
          ? window.AIStoryGenLocationGraph
          : null;
      } catch (_) {
        return null;
      }
    }

    function findGraph(rawOrLabel) {
      var graph = getGraph();
      var raw = String(rawOrLabel || '').trim();
      if (!graph || !raw) return null;
      var nodes = graph.nodes || {};
      if (nodes[raw]) return nodes[raw];
      var lower = raw.toLowerCase();
      for (var key in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, key)) continue;
        var node = nodes[key] || {};
        if (String(node.passage || '').toLowerCase() === lower) return node;
        if (String(node.locId || '').toLowerCase() === lower) return node;
        if (String(node.label || '').toLowerCase() === lower || String(node.label || '') === raw) return node;
        var aliases = node.aliases || [];
        for (var i = 0; i < aliases.length; i++) {
          if (String(aliases[i] || '').toLowerCase() === lower || aliases[i] === raw) return node;
        }
      }
      return null;
    }

    function resolveLabel(passageName) {
      if (!passageName) return '';
      passageName = normalizePassage(passageName);
      for (var i = 0; i < commonLocations.length; i++) {
        if ((commonLocations[i] || {}).raw === passageName) return commonLocations[i].label;
      }
      var prefixLoc = findCommonByPrefix(passageName);
      if (prefixLoc && prefixLoc.label) return prefixLoc.label;
      var graphLoc = findGraph(passageName);
      if (graphLoc) {
        var locIdLoc = graphLoc.locId ? findCommon(graphLoc.locId) : null;
        if (locIdLoc && locIdLoc.label) return locIdLoc.label;
        if (graphLoc.label && !looksLikeRawLocationLabel(graphLoc.label)) return graphLoc.label;
      }
      return passageName;
    }

    function resolveDisplay(raw, label) {
      raw = normalizePassage(raw || '');
      label = cleanLabel(label || '');
      var resolved = resolveLabel(raw);
      if (resolved && resolved !== raw) return resolved;
      var labelLoc = label ? findCommon(label) : null;
      if (labelLoc && labelLoc.label) return labelLoc.label;
      if (label && !looksLikeRawLocationLabel(label)) return label;
      var graphLoc = findGraph(raw || label);
      if (graphLoc) {
        var locIdLoc = graphLoc.locId ? findCommon(graphLoc.locId) : null;
        if (locIdLoc && locIdLoc.label) return locIdLoc.label;
        if (graphLoc.label && !looksLikeRawLocationLabel(graphLoc.label)) return graphLoc.label;
      }
      return label || resolved || raw;
    }

    function pushManualArriveCandidate(list, seen, raw, label) {
      list = Array.isArray(list) ? list : [];
      seen = seen || {};
      raw = normalizePassage(raw || '');
      if (!raw || seen[raw]) return;
      if (isUnsafeDirectPassage(raw)) return;
      var graphLoc = findGraph(raw);
      var exactCommon = findCommonByRaw(raw);
      var canonical = exactCommon || findCommonByPrefix(raw);
      if (!canonical && graphLoc && graphLoc.locId) canonical = findCommonByLocId(graphLoc.locId);
      if (canonical && canonical.raw && canonical.raw !== raw) {
        raw = canonical.raw;
        label = canonical.label || label;
        if (seen[raw]) return;
      }
      if (typeof deps.storyHas === 'function' && !storyHas(raw)) return;
      seen[raw] = true;
      list.push({
        raw: raw,
        label: resolveDisplay(raw, label) || raw,
      });
    }

    function getAvailableDestination(raw) {
      raw = normalizePassage(raw || '');
      if (!raw) return null;
      var list = availableDestinations();
      for (var i = 0; i < list.length; i++) {
        var dest = list[i] || {};
        if (normalizePassage(dest.raw || '') === raw) return dest;
      }
      return null;
    }

    function isGraphExitTo(baseRaw, destRaw) {
      baseRaw = normalizePassage(baseRaw || '');
      destRaw = normalizePassage(destRaw || '');
      if (!baseRaw || !destRaw || baseRaw === destRaw) return !!(baseRaw && destRaw);
      var baseNode = findGraph(baseRaw);
      if (!baseNode || !baseNode.exits) return false;
      for (var i = 0; i < baseNode.exits.length; i++) {
        var edge = baseNode.exits[i] || {};
        var edgeRaw = normalizePassage(edge.passage || '');
        if (edgeRaw === destRaw) return true;
        var targets = edge.targetPassages || [];
        for (var j = 0; j < targets.length; j++) {
          if (normalizePassage(targets[j] || '') === destRaw) return true;
        }
      }
      return false;
    }

    function isGraphAdjacentToAnyBase(destRaw) {
      destRaw = normalizePassage(destRaw || '');
      if (!destRaw) return false;
      var state = currentState();
      var bases = [];
      function add(raw) {
        raw = normalizePassage(raw || '');
        if (raw && bases.indexOf(raw) < 0) bases.push(raw);
      }
      add(state.currentLocationPassage);
      add(state.replaceTargetPassage);
      add(state.replaceOriginPassage);
      add(state.statePassage);
      for (var i = 0; i < bases.length; i++) {
        if (bases[i] === destRaw || isGraphExitTo(bases[i], destRaw)) return true;
      }
      return false;
    }

    function locationHasExplicitLongDistanceTransition(eventData, sourceText) {
      var eventType = String(eventData && (eventData.eventType || eventData.event_type) || '').toLowerCase();
      var text = String(sourceText || '');
      var travelSignal = /(bus|taxi|carriage|train|boat|ship|ferry|flight|fly|flew|abduct|kidnap|rescued|carried|transport|teleport|woke up|wake up|\u516c\u4ea4|\u5df4\u58eb|\u51fa\u79df\u8f66|\u9a6c\u8f66|\u706b\u8f66|\u8239|\u6e21\u8f6e|\u98de|\u98de\u884c|\u62b1\u8d70|\u5e26\u8d70|\u8f7d\u5230|\u88ab\u5e26|\u88ab\u6293|\u88ab\u63b3|\u88ab\u6551|\u660f\u8ff7|\u9192\u6765|\u4f20\u9001)/i.test(text);
      return travelSignal || (eventType === 'travel' && /(transport|abduction|rescue|vehicle|flight|\u4ea4\u901a|\u8f6c\u79fb|\u8fdc\u8ddd\u79bb|\u98de\u884c|\u62b1\u8d70|\u88ab\u5e26)/i.test(text));
    }

    function evaluateArrivalCandidate(rawPassage, opts) {
      opts = opts || {};
      var dest = normalizePassage(rawPassage || '');
      var decision = {
        dest: dest,
        allowed: false,
        reason: '',
        source: opts.source || '',
        requestedStatus: opts.status || '',
        arrived: false,
      };
      if (!dest) {
        decision.reason = 'empty';
        return decision;
      }
      if (isUnsafeDirectPassage(dest)) {
        decision.reason = 'unsafe direct passage';
        return decision;
      }
      if (typeof deps.storyHas === 'function' && !storyHas(dest)) {
        decision.reason = 'missing Story passage';
        return decision;
      }
      var state = currentState();
      var currentPassage = normalizePassage(state.statePassage || '');
      if (currentPassage && dest === currentPassage) {
        decision.allowed = true;
        decision.reason = 'current passage';
      }
      var available = getAvailableDestination(dest);
      if (!decision.allowed && available && /^(page|graph|manual)$/i.test(String(available.source || ''))) {
        decision.allowed = true;
        decision.reason = 'current available ' + available.source;
      }
      var target = normalizePassage(state.replaceTargetPassage || '');
      if (!decision.allowed && target && dest === target) {
        decision.allowed = true;
        decision.reason = 'clicked target';
      }
      if (!decision.allowed && isGraphAdjacentToAnyBase(dest)) {
        decision.allowed = true;
        decision.reason = 'graph adjacent';
      }
      if (!decision.allowed && locationHasExplicitLongDistanceTransition(opts.eventData, opts.sourceText)) {
        decision.allowed = true;
        decision.reason = 'explicit long-distance transition';
      }
      if (!decision.allowed && !decision.reason) {
        decision.reason = 'not current, adjacent, linked, or explicit travel';
      }
      decision.arrived = !!decision.allowed && opts.status !== 'inTransit';
      return decision;
    }

    function collectManualArriveCandidates(primaryPassage) {
      var list = [];
      var seen = {};
      var state = currentState();
      var bases = [];
      function addBase(raw) {
        raw = normalizePassage(raw || '');
        if (raw && bases.indexOf(raw) < 0) bases.push(raw);
      }
      addBase(primaryPassage);
      addBase(state.currentLocationPassage);
      addBase(state.replaceTargetPassage);
      addBase(state.replaceOriginPassage);
      addBase(state.statePassage);

      for (var bi = 0; bi < bases.length; bi++) {
        var baseRaw = bases[bi];
        var baseNode = findGraph(baseRaw);
        if (!baseNode) continue;
        pushManualArriveCandidate(list, seen, baseNode.passage || baseRaw, baseNode.label);
        var exits = baseNode.exits || baseNode.edgeSamples || [];
        for (var ei = 0; ei < exits.length; ei++) {
          var edge = exits[ei] || {};
          var destRaw = edge.passage || (edge.targetPassages && edge.targetPassages[0]) || '';
          var destLabel = edge.label || '';
          pushManualArriveCandidate(list, seen, destRaw, destLabel);
        }
      }

      var available = availableDestinations();
      for (var ai = 0; ai < available.length; ai++) {
        var d = available[ai] || {};
        pushManualArriveCandidate(list, seen, d.raw, d.label);
      }
      pushManualArriveCandidate(list, seen, primaryPassage, '');
      pushManualArriveCandidate(list, seen, state.currentLocationPassage, '');
      pushManualArriveCandidate(list, seen, state.replaceTargetPassage, '');
      return list.slice(0, 24);
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      commonLocations: commonLocations,
      commonLocationCount: function () { return commonLocations.length; },
      clone: clone,
      looksLikeRawLocationLabel: looksLikeRawLocationLabel,
      normalizePassage: normalizePassage,
      resolveLabel: resolveLabel,
      resolveDisplay: resolveDisplay,
      findCommon: findCommon,
      findCommonByRaw: findCommonByRaw,
      findCommonByLocId: findCommonByLocId,
      findCommonByPrefix: findCommonByPrefix,
      getGraph: getGraph,
      findGraph: findGraph,
      pushManualArriveCandidate: pushManualArriveCandidate,
      getAvailableDestination: getAvailableDestination,
      isGraphExitTo: isGraphExitTo,
      isGraphAdjacentToAnyBase: isGraphAdjacentToAnyBase,
      locationHasExplicitLongDistanceTransition: locationHasExplicitLongDistanceTransition,
      evaluateArrivalCandidate: evaluateArrivalCandidate,
      collectManualArriveCandidates: collectManualArriveCandidates,
    };
  }

  var api = {
    schemaVersion: SCHEMA_VERSION,
    create: createLocationTools,
  };

  root.LocationControllerModule = api;
  window.AIStoryGenLocationControllerModule = api;
})();
