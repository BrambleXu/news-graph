/* global G6, layoutComponents */
(() => {
  'use strict';

  /** @typedef {{id: string, data: {label: string, types: string[], degree: number}}} GraphNode */
  /** @typedef {{id: string, source: string, target: string, data: {kind: string}}} GraphEdge */
  /** @type {{nodes: GraphNode[], edges: GraphEdge[], keywords: string[], frequentWords: string[], sourceText: string}} */
  const data = JSON.parse(document.getElementById('graph-data').textContent);
  const el = (id) => document.getElementById(id);
  const entityTypes = ['Person', 'Organization', 'Location'];
  const enabledTypes = new Set(entityTypes);
  const colors = { Person: '#8974b4', Organization: '#4d8eaf', Location: '#b79252', concept: '#8b9984' };
  const fills = { Person: '#e9e2f3', Organization: '#ddecf3', Location: '#f1e8d4', concept: '#e8ede3' };
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  let graph;
  let selectedId = null;
  let visibleNodes = [];
  let visibleEdges = [];
  let neighbors = new Map();
  let queue = Promise.resolve();

  const typeOf = (node) => entityTypes.find((type) => node.data.types.includes(type)) || 'concept';
  const isEntity = (node) => typeOf(node) !== 'concept';
  const matchesQuery = (node) => node.data.label.toLocaleLowerCase().includes(el('search').value.trim().toLocaleLowerCase());
  const connected = (id) => neighbors.get(id) || new Set();

  function message(title, description) {
    el('graph-message').hidden = false;
    el('graph-message').querySelector('strong').textContent = title;
    el('graph-message').querySelector('p').textContent = description;
  }

  // Serialize G6's async rendering calls so rapid filter changes stay consistent.
  function schedule(task) {
    queue = queue.then(task).catch((error) => {
      console.error(error);
      message('The graph could not be displayed.', 'Reload this page to try again. The source text is still available below.');
    });
  }

  function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }

  function entityRow(node) {
    const row = document.createElement('button');
    row.className = 'entity-row';
    row.setAttribute('aria-label', `Explore ${node.data.label}`);
    const icon = textElement('span', '', 'entity-icon');
    icon.append(textElement('i', '', typeOf(node).toLowerCase()));
    row.append(icon, textElement('span', node.data.label, 'entity-label'), textElement('small', String(connected(node.id).size)));
    row.addEventListener('click', () => select(node.id));
    return row;
  }

  function sourceMatches(node) {
    const container = el('source-matches');
    container.replaceChildren();
    if (!data.sourceText) {
      container.append(textElement('p', 'No source text was supplied with this graph.', 'empty-list'));
      return;
    }
    const pattern = new RegExp(node.data.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    const text = data.sourceText;
    let offset = 0;
    let count = 0;
    // Context windows deliberately avoid claiming to be sentence-level evidence.
    while (count < 3) {
      pattern.lastIndex = offset;
      const match = pattern.exec(text);
      if (!match) break;
      const index = match.index;
      const start = Math.max(0, index - 75);
      const end = Math.min(text.length, index + match[0].length + 100);
      const passage = textElement('blockquote', '', 'source-match');
      passage.append(
        document.createTextNode((start ? '…' : '') + text.slice(start, index)),
        textElement('mark', match[0]),
        document.createTextNode(text.slice(index + match[0].length, end) + (end < text.length ? '…' : '')),
      );
      container.append(passage);
      offset = end;
      count += 1;
    }
    if (!count) container.append(textElement('p', 'No literal match in the supplied text. The extractor may have normalized this label.', 'empty-list'));
  }

  function updateInspector() {
    const node = nodesById.get(selectedId);
    el('entity-list').hidden = Boolean(node);
    el('detail').hidden = !node;
    el('clear-selection').hidden = !node;
    el('inspector-label').textContent = node ? 'ENTITY DETAILS' : 'EXPLORE THE ENTITIES';
    if (node) {
      el('detail-name').textContent = node.data.label;
      el('detail-types').replaceChildren(...(node.data.types.length ? node.data.types : ['Rule output']).map((type) => textElement('span', type)));
      el('detail-count').textContent = `${connected(node.id).size} connections in the current view`;
      const related = visibleNodes.filter((other) => connected(node.id).has(other.id));
      el('neighbor-list').replaceChildren(...related.map(entityRow));
      if (!related.length) el('neighbor-list').append(textElement('p', 'No connections under these filters.', 'empty-list'));
      sourceMatches(node);
    } else {
      const list = visibleNodes.filter(matchesQuery).sort((a, b) => connected(b.id).size - connected(a.id).size || a.data.label.localeCompare(b.data.label));
      el('entity-list').replaceChildren(...list.map(entityRow));
      if (!list.length) el('entity-list').append(textElement('p', 'No entities match this view. Try another search or reset the filters.', 'empty-list'));
    }
  }

  async function highlight() {
    const query = el('search').value.trim();
    const matches = new Set(visibleNodes.filter(matchesQuery).map((node) => node.id));
    const nearby = new Set(selectedId ? [selectedId, ...connected(selectedId)] : []);
    const focusOnly = Boolean(selectedId && el('neighbors-only').checked);
    const states = {};
    const visibility = {};
    for (const node of visibleNodes) {
      const emphasized = selectedId ? nearby.has(node.id) : matches.has(node.id);
      states[node.id] = !emphasized ? ['muted'] : node.id === selectedId ? ['selected'] : query && matches.has(node.id) ? ['matched'] : [];
      visibility[node.id] = focusOnly && !nearby.has(node.id) ? 'hidden' : 'visible';
    }
    for (const edge of visibleEdges) {
      const active = selectedId ? edge.source === selectedId || edge.target === selectedId : !query || matches.has(edge.source) || matches.has(edge.target);
      states[edge.id] = active ? selectedId ? ['selected'] : [] : ['muted'];
      visibility[edge.id] = focusOnly && !(nearby.has(edge.source) && nearby.has(edge.target)) ? 'hidden' : 'visible';
    }
    await graph.setElementVisibility(visibility, false);
    await graph.setElementState(states, false);
    const shown = focusOnly ? nearby.size : visibleNodes.length;
    el('visible-count').textContent = `${shown} nodes · ${query ? `${matches.size} search matches` : `${visibleEdges.filter((edge) => visibility[edge.id] === 'visible').length} links`}`;
    el('graph-message').hidden = visibleNodes.length > 0 && (!query || matches.size > 0);
    if (!visibleNodes.length) message('No entities in this view.', 'Reset the filters, or inspect the keyword lists below.');
    else if (query && !matches.size) message('No matching entities.', 'Try a different name or clear the search.');
    updateInspector();
  }

  function select(id) {
    selectedId = id;
    el('search').value = '';
    schedule(async () => {
      await highlight();
      await graph.focusElement(id, false);
    });
  }

  async function renderView() {
    const includeRaw = el('show-extracted').checked;
    const rawEndpoints = new Set(data.edges.filter((edge) => edge.data.kind === 'extracted').flatMap((edge) => [edge.source, edge.target]));
    visibleNodes = data.nodes.filter((node) => isEntity(node)
      ? node.data.types.some((type) => enabledTypes.has(type))
      : includeRaw && rawEndpoints.has(node.id));
    const ids = new Set(visibleNodes.map((node) => node.id));
    visibleEdges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (includeRaw || edge.data.kind === 'cooccurrence'));
    neighbors = new Map(visibleNodes.map((node) => [node.id, new Set()]));
    for (const edge of visibleEdges) {
      neighbors.get(edge.source).add(edge.target);
      neighbors.get(edge.target).add(edge.source);
    }
    if (!ids.has(selectedId)) {
      selectedId = null;
      el('neighbors-only').checked = false;
    }
    const arranged = await layoutComponents(G6, visibleNodes, visibleEdges, el('graph-viewport').clientWidth / el('graph-viewport').clientHeight);
    el('layout-summary').textContent = `${arranged.groupCount} connected groups · ${arranged.isolatedCount} unlinked entities`;
    graph.setData({
      nodes: arranged.nodes.map((node) => {
        const type = typeOf(node);
        return { ...node, type: 'circle', style: {
          ...node.style,
          fill: fills[type], stroke: colors[type],
          labelText: node.data.label, labelFill: '#40544b',
        } };
      }),
      edges: arranged.edges.map((edge) => ({ ...edge, style: {
        ...edge.style,
        lineDash: edge.data.kind === 'extracted' ? [4, 4] : [],
        endArrow: edge.data.kind === 'extracted',
      } })),
    });
    await graph.render();
    await highlight();
    if (visibleNodes.length) await graph.fitView({ when: 'always' }, false);
    for (const id of ['zoom-in', 'zoom-out', 'fit']) el(id).disabled = !visibleNodes.length;
  }

  function wordList(id, words) {
    const container = el(id);
    words.forEach((word, index) => {
      const tag = document.createElement('span');
      tag.append(textElement('small', String(index + 1).padStart(2, '0')), document.createTextNode(word));
      container.append(tag);
    });
    if (!words.length) container.append(textElement('p', 'No words extracted.', 'empty-list'));
  }

  el('entity-total').textContent = String(data.nodes.filter(isEntity).length);
  el('connection-total').textContent = String(data.edges.filter((edge) => edge.data.kind === 'cooccurrence').length);
  el('source-text').textContent = data.sourceText || 'No source text was supplied with this graph.';
  wordList('keywords', data.keywords);
  wordList('frequent-words', data.frequentWords);

  schedule(async () => {
    graph = new G6.Graph({
      container: el('graph'), autoResize: false, animation: false, padding: 24,
      zoomRange: [0.2, 4],
      node: {
        style: { opacity: 1, halo: false, lineWidth: 1.6, labelPlacement: 'bottom', labelOffsetY: 8, labelFontSize: 14, labelFontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', labelBackground: true, labelBackgroundFill: '#fdfefb', labelPadding: [2, 4], labelMaxWidth: 128, labelWordWrap: true, labelMaxLines: 2 },
        state: { muted: { opacity: 0.15 }, selected: { lineWidth: 3, halo: true, haloStroke: '#86a991', haloLineWidth: 10, haloOpacity: 0.18 }, matched: { lineWidth: 3 } },
      },
      edge: { type: 'line', style: { stroke: '#aabcb0', lineWidth: 1.4, opacity: 0.85 }, state: { muted: { opacity: 0.08 }, selected: { stroke: '#759a80', lineWidth: 2 } } },
      behaviors: ['drag-canvas', 'zoom-canvas'],
    });
    graph.on('node:click', (event) => select(event.target.id));
    graph.on('canvas:click', () => {
      selectedId = null;
      el('neighbors-only').checked = false;
      schedule(highlight);
    });
    await renderView();
    // Observe the CSS-sized wrapper, not the container whose size G6 writes.
    let width = el('graph-viewport').clientWidth;
    let height = el('graph-viewport').clientHeight;
    new ResizeObserver(() => {
      const nextWidth = el('graph-viewport').clientWidth;
      const nextHeight = el('graph-viewport').clientHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      schedule(async () => {
        graph.setSize(width, height);
        await renderView();
      });
    }).observe(el('graph-viewport'));
  });

  el('search').addEventListener('input', () => { selectedId = null; el('neighbors-only').checked = false; schedule(highlight); });
  document.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => {
    const type = button.dataset.type;
    enabledTypes.has(type) ? enabledTypes.delete(type) : enabledTypes.add(type);
    button.setAttribute('aria-pressed', String(enabledTypes.has(type)));
    schedule(renderView);
  }));
  el('show-extracted').addEventListener('change', () => schedule(renderView));
  el('neighbors-only').addEventListener('change', () => schedule(highlight));
  el('clear-selection').addEventListener('click', () => { selectedId = null; el('neighbors-only').checked = false; schedule(highlight); });
  el('zoom-in').addEventListener('click', () => schedule(() => graph.zoomBy(1.25, false)));
  el('zoom-out').addEventListener('click', () => schedule(() => graph.zoomBy(0.8, false)));
  el('fit').addEventListener('click', () => schedule(() => graph.fitView({ when: 'always' }, false)));
  el('reset').addEventListener('click', () => {
    selectedId = null;
    el('search').value = '';
    el('neighbors-only').checked = false;
    el('show-extracted').checked = false;
    entityTypes.forEach((type) => enabledTypes.add(type));
    document.querySelectorAll('[data-type]').forEach((button) => button.setAttribute('aria-pressed', 'true'));
    schedule(renderView);
  });
})();
