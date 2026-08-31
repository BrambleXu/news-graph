/* Shared by the browser and the optional Node.js layout regression checks. */
async function layoutComponents(G6, nodes, edges, aspectRatio) {
  const labelWidth = 136;
  const nodeHeight = 94;
  const gap = 38;
  const adjacent = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    adjacent.get(edge.source).add(edge.target);
    adjacent.get(edge.target).add(edge.source);
  }

  const ordered = [...nodes].sort((a, b) => adjacent.get(b.id).size - adjacent.get(a.id).size || a.id.localeCompare(b.id));
  const visited = new Set();
  const groups = [];
  const isolated = [];
  for (const root of ordered) {
    if (visited.has(root.id)) continue;
    visited.add(root.id);
    if (!adjacent.get(root.id).size) {
      isolated.push(root);
      continue;
    }
    const ids = [root.id];
    for (let index = 0; index < ids.length; index += 1) {
      for (const id of adjacent.get(ids[index])) {
        if (!visited.has(id)) { visited.add(id); ids.push(id); }
      }
    }
    const members = new Set(ids);
    const groupEdges = edges.filter((edge) => members.has(edge.source));
    const layout = new G6.RadialLayout({ focusNode: root.id, center: [0, 0], unitRadius: 120, linkDistance: 120, nodeSize: 112, preventOverlap: true, maxIteration: 300 });
    await layout.execute({ nodes: ids.map((id) => ({ id })), edges: groupEdges });
    const positions = new Map();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    layout.forEachNode((node) => {
      positions.set(node.id, [node.x, node.y]);
      left = Math.min(left, node.x - labelWidth / 2);
      top = Math.min(top, node.y - 32);
      right = Math.max(right, node.x + labelWidth / 2);
      bottom = Math.max(bottom, node.y + 62);
    });
    layout.destroy();
    positions.forEach(([x, y], id) => positions.set(id, [x - left, y - top]));
    groups.push({ positions, width: right - left, height: bottom - top });
  }
  groups.sort((a, b) => b.height - a.height || b.width - a.width);

  // Try a few shelf widths and keep the arrangement that reads largest in
  // this viewport. Disconnected groups never share the same drawing area.
  const minimum = Math.max(labelWidth, ...groups.map((group) => group.width));
  const maximum = Math.max(minimum, isolated.length * (labelWidth + 24), groups.reduce((sum, group) => sum + group.width + gap, 0));
  let best;
  for (let limit = minimum; limit <= maximum; limit += labelWidth + gap) {
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let width = 0;
    const offsets = groups.map((group) => {
      if (x && x + group.width > limit) { y += rowHeight + gap; x = 0; rowHeight = 0; }
      const offset = [x, y];
      x += group.width + gap;
      width = Math.max(width, x - gap);
      rowHeight = Math.max(rowHeight, group.height);
      return offset;
    });
    const isolatedY = groups.length ? y + rowHeight + gap : 0;
    const columns = Math.max(1, Math.min(isolated.length, Math.floor((limit + 24) / (labelWidth + 24))));
    width = Math.max(width, isolated.length ? columns * (labelWidth + 24) - 24 : 0);
    const height = isolated.length ? isolatedY + Math.ceil(isolated.length / columns) * (nodeHeight + 24) - 24 : y + rowHeight;
    const cost = Math.max(width / aspectRatio, height);
    if (!best || cost < best.cost) best = { offsets, isolatedY, columns, cost };
  }

  const positions = new Map();
  groups.forEach((group, index) => {
    const [dx, dy] = best.offsets[index];
    group.positions.forEach(([x, y], id) => positions.set(id, [x + dx, y + dy]));
  });
  isolated.forEach((node, index) => positions.set(node.id, [labelWidth / 2 + (index % best.columns) * (labelWidth + 24), best.isolatedY + 32 + Math.floor(index / best.columns) * (nodeHeight + 24)]));
  return {
    nodes: nodes.map((node) => {
      const [x, y] = positions.get(node.id);
      return { ...node, type: 'circle', style: { ...node.style, x, y, size: 32 + Math.min(adjacent.get(node.id).size, 6) * 5 } };
    }),
    edges,
    groupCount: groups.length,
    isolatedCount: isolated.length,
  };
}

if (typeof module !== 'undefined') module.exports = layoutComponents;
