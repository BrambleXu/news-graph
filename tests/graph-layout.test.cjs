const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const G6 = require('../web/vendor/g6.min.js');
const layoutComponents = require('../web/graph-layout.js');

const html = readFileSync(path.join(__dirname, '../graph_show.html'), 'utf8');
const data = JSON.parse(html.match(/<script id="graph-data" type="application\/json">(.*?)<\/script>/s)[1]);
const types = ['Person', 'Organization', 'Location'];
const nodes = data.nodes.filter((node) => node.data.types.some((type) => types.includes(type)));
const ids = new Set(nodes.map((node) => node.id));
const edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));

function crosses(a, b, c, d) {
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < -1e-6 && side(c, d, a) * side(c, d, b) < -1e-6;
}

function checkGeometry(result) {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  const position = (id) => [byId.get(id).style.x, byId.get(id).style.y];
  for (const [index, node] of result.nodes.entries()) {
    const { x, y, size } = node.style;
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.equal(node.type, 'circle');
    for (const other of result.nodes.slice(index + 1)) {
      assert.ok(Math.hypot(x - other.style.x, y - other.style.y) > (size + other.style.size) / 2, `overlapping circles: ${node.id}, ${other.id}`);
    }
  }
  const routes = result.edges.map((edge) => {
    const points = [position(edge.source), position(edge.target)];
    return { edge, segments: points.slice(1).map((point, index) => [points[index], point]) };
  });
  for (const [index, { edge, segments }] of routes.entries()) {
    for (const node of result.nodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      const { x, y, size } = node.style;
      for (const [a, b] of segments) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
        assert.ok(Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) > size / 2, `${edge.id} crosses circle ${node.id}`);
      }
    }
    for (const other of routes.slice(index + 1)) {
      assert.ok(!segments.some(([a, b]) => other.segments.some(([c, d]) => crosses(a, b, c, d))), `crossing edges: ${edge.id}, ${other.edge.id}`);
    }
  }
}

test('geometry check catches a crossing and overlapping circles', () => {
  assert.ok(crosses([0, 0], [10, 10], [0, 10], [10, 0]));
  const result = { nodes: ['a', 'b'].map((id) => ({ id, type: 'circle', style: { x: 0, y: 0, size: 32 } })), edges: [] };
  assert.throws(() => checkGeometry(result), /overlapping circles/);
});

test('example retains all entities and links without crossings on desktop and mobile', async () => {
  for (const ratio of [1.65, 1, 0.6]) {
    const result = await layoutComponents(G6, nodes, edges, ratio);
    assert.equal(result.groupCount, 4);
    assert.equal(result.isolatedCount, 4);
    assert.deepEqual(result.nodes.map((node) => node.id), nodes.map((node) => node.id));
    assert.deepEqual(result.edges.map(({ id, source, target }) => [id, source, target]), edges.map(({ id, source, target }) => [id, source, target]));
    checkGeometry(result);
  }
});

test('all type-filter combinations and optional rule links remain separated', async () => {
  for (let mask = 0; mask < 8; mask += 1) {
    for (const raw of [false, true]) {
      const chosen = data.nodes.filter((node) => node.data.types.some((type) => types.includes(type))
        ? types.some((type, i) => (mask & (1 << i)) && node.data.types.includes(type))
        : raw && data.edges.some((edge) => edge.data.kind === 'extracted' && [edge.source, edge.target].includes(node.id)));
      const selected = new Set(chosen.map((node) => node.id));
      const links = data.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target) && (raw || edge.data.kind === 'cooccurrence'));
      checkGeometry(await layoutComponents(G6, chosen, links, 1.65));
    }
  }
});

test('empty, unlinked and cyclic graphs preserve data without overlapping circles', async () => {
  checkGeometry(await layoutComponents(G6, [], [], 1));
  const unlinked = nodes.slice(0, 5);
  checkGeometry(await layoutComponents(G6, unlinked, [], 1.5));
  const cycle = unlinked.map((node, i) => ({ id: `cycle-${i}`, source: node.id, target: unlinked[(i + 1) % unlinked.length].id, data: { kind: 'extracted' } }));
  const result = await layoutComponents(G6, unlinked, cycle, 1);
  assert.deepEqual(result.edges.map((edge) => [edge.source, edge.target]), cycle.map((edge) => [edge.source, edge.target]));
  checkGeometry(result);
});
