# Pixel Office Figma `use_figma` Chunks

> Use when Figma MCP write access becomes available again  
> File key: `TVqn19qfYsusADPtmGdtMX`  
> Page: `Pixel Office Upgrade`  
> Existing nodes:
> - page: `1:2`
> - `Reference Audit` frame: `1:3`
> - `Pixel Office Upgrade Screen` frame: `1:6`

## References

- reference screenshot: `.playwright-cli/page-2026-03-29T22-48-10-849Z.png`
- current upgraded code screenshot: `.playwright-cli/page-2026-03-29T22-51-06-343Z.png`
- reference spec: `docs/pixel-office-figma-upgrade-spec.md`

## Notes

- No connected Figma design-system components were found via `search_design_system`.
- These chunks intentionally use **manual primitives + repo tokens**.
- Run them incrementally and validate after each chunk.

---

## Chunk 1 — Screen shell

```js
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
await figma.loadFontAsync({ family: 'Press Start 2P', style: 'Regular' });

const page = figma.root.children.find((p) => p.name === 'Pixel Office Upgrade');
await figma.setCurrentPageAsync(page);
const screen = await figma.getNodeByIdAsync('1:6');
if (!screen || screen.type !== 'FRAME') throw new Error('screen missing');

for (const child of [...screen.children]) child.remove();

function color(hex) {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
}
function fill(hex) {
  return [{ type: 'SOLID', color: color(hex) }];
}

const topBar = figma.createRectangle();
topBar.resize(1440, 48);
topBar.fills = fill('#FFFFFF');
topBar.strokes = fill('#E2DFD8');
topBar.strokeWeight = 1;
screen.appendChild(topBar);

const brand = figma.createText();
brand.fontName = { family: 'Press Start 2P', style: 'Regular' };
brand.fontSize = 10;
brand.characters = 'Conitens';
brand.x = 24;
brand.y = 16;
brand.fills = fill('#111827');
screen.appendChild(brand);

const nav = [
  ['Overview', 140, true],
  ['Workflows', 250, false],
  ['Metrics', 360, false],
  ['Audit Log', 470, false],
];
for (const [label, x, active] of nav) {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: active ? 'Medium' : 'Regular' };
  t.fontSize = 13;
  t.characters = label;
  t.x = x;
  t.y = 15;
  t.fills = fill(active ? '#111827' : '#6B7280');
  screen.appendChild(t);
}

const stageBg = figma.createRectangle();
stageBg.resize(1100, 932);
stageBg.x = 0;
stageBg.y = 48;
stageBg.fills = fill('#F3ECDF');
screen.appendChild(stageBg);

const rail = figma.createRectangle();
rail.resize(340, 932);
rail.x = 1100;
rail.y = 48;
rail.fills = fill('#FFFFFF');
rail.strokes = fill('#E2DFD8');
rail.strokeWeight = 1;
screen.appendChild(rail);

const office = figma.createRectangle();
office.resize(820, 600);
office.x = 70;
office.y = 135;
office.fills = fill('#FFFFFF');
office.strokes = fill('#E2DFD8');
office.strokeWeight = 1;
screen.appendChild(office);

return { createdNodeIds: [topBar.id, brand.id, stageBg.id, rail.id, office.id], mutatedNodeIds: [screen.id] };
```

---

## Chunk 2 — Office container geometry

```js
const page = figma.root.children.find((p) => p.name === 'Pixel Office Upgrade');
await figma.setCurrentPageAsync(page);
const screen = await figma.getNodeByIdAsync('1:6');
if (!screen || screen.type !== 'FRAME') throw new Error('screen missing');

function color(hex) {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
}
function fill(hex) {
  return [{ type: 'SOLID', color: color(hex) }];
}
function rect(x, y, w, h, hex) {
  const r = figma.createRectangle();
  r.x = x; r.y = y; r.resize(w, h); r.fills = fill(hex);
  screen.appendChild(r);
  return r;
}

// dividers
const divider1 = rect(270, 135, 1, 600, '#E2DFD8');
const divider2 = rect(665, 135, 1, 600, '#E2DFD8');
const divider3 = rect(271, 335, 619, 1, '#E2DFD8');

// room blocks
const ops = rect(71, 136, 199, 249, '#EDF4F8');
const commons = rect(271, 136, 394, 599, '#EFEDE0');
const research = rect(666, 136, 223, 199, '#EDF3EA');
const impl = rect(71, 386, 199, 349, '#F3ECDF');
const validation = rect(666, 336, 223, 179, '#EDF3EA');
const review = rect(666, 516, 223, 219, '#F3ECDF');

return {
  createdNodeIds: [divider1.id, divider2.id, divider3.id, ops.id, commons.id, research.id, impl.id, validation.id, review.id],
  mutatedNodeIds: [screen.id],
};
```

---

## Chunk 3 — Room labels + state chips

```js
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Press Start 2P', style: 'Regular' });

const page = figma.root.children.find((p) => p.name === 'Pixel Office Upgrade');
await figma.setCurrentPageAsync(page);
const screen = await figma.getNodeByIdAsync('1:6');
if (!screen || screen.type !== 'FRAME') throw new Error('screen missing');

function color(hex) {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
}
function fill(hex) {
  return [{ type: 'SOLID', color: color(hex) }];
}
function text(chars, x, y, size, width, family, colorHex) {
  const t = figma.createText();
  t.fontName = { family, style: 'Regular' };
  t.fontSize = size;
  t.characters = chars;
  t.x = x;
  t.y = y;
  if (width) {
    t.resize(width, t.height);
    t.textAutoResize = 'HEIGHT';
  }
  t.fills = fill(colorHex);
  screen.appendChild(t);
  return t;
}
function rect(x, y, w, h, fillHex, strokeHex) {
  const r = figma.createRectangle();
  r.x = x; r.y = y; r.resize(w, h);
  r.fills = fill(fillHex);
  if (strokeHex) {
    r.strokes = fill(strokeHex);
    r.strokeWeight = 1;
  }
  screen.appendChild(r);
  return r;
}

const rooms = [
  ['PLAN TEAM', 'Ops Control', 'LIVE', 71, 136, 199, 249, '#2563EB'],
  ['ADVISING TEAM', 'Central Commons', 'QUIET', 271, 136, 394, 599, '#6B7280'],
  ['RESEARCH TEAM', 'Research Lab', 'QUIET', 666, 136, 223, 199, '#6B7280'],
  ['REFACTOR TEAM', 'Impl Office', 'OCCUPIED', 71, 386, 199, 349, '#B45309'],
  ['REVIEW TEAM', 'Validation Office', 'LIVE', 666, 336, 223, 179, '#2563EB'],
  ['DESIGN TEAM', 'Review Office', 'QUIET', 666, 516, 223, 219, '#6B7280'],
];

const ids = [];
for (const [team, label, status, x, y, w, h, tone] of rooms) {
  ids.push(text(team, x + 12, y + 16, 8, 70, 'Press Start 2P', '#5D7290').id);
  ids.push(text(label, x + 58, y + 15, 12, w - 128, 'Press Start 2P', '#222222').id);
  const pill = rect(x + w - 62, y + 10, 40, 24, '#F7F4EE', '#D8D1C4');
  ids.push(pill.id);
  ids.push(text(status, x + w - 56, y + 17, 7, 30, 'Press Start 2P', tone).id);
}

return { createdNodeIds: ids, mutatedNodeIds: [screen.id] };
```

---

## Chunk 4 — Rail scaffold

```js
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Press Start 2P', style: 'Regular' });

const page = figma.root.children.find((p) => p.name === 'Pixel Office Upgrade');
await figma.setCurrentPageAsync(page);
const screen = await figma.getNodeByIdAsync('1:6');
if (!screen || screen.type !== 'FRAME') throw new Error('screen missing');

function color(hex) {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
}
function fill(hex) {
  return [{ type: 'SOLID', color: color(hex) }];
}
function text(chars, x, y, size, width, family, colorHex) {
  const t = figma.createText();
  t.fontName = { family, style: 'Regular' };
  t.fontSize = size;
  t.characters = chars;
  t.x = x;
  t.y = y;
  if (width) {
    t.resize(width, t.height);
    t.textAutoResize = 'HEIGHT';
  }
  t.fills = fill(colorHex);
  screen.appendChild(t);
  return t;
}
function rect(x, y, w, h, fillHex, strokeHex) {
  const r = figma.createRectangle();
  r.x = x; r.y = y; r.resize(w, h);
  r.fills = fill(fillHex);
  if (strokeHex) {
    r.strokes = fill(strokeHex);
    r.strokeWeight = 1;
  }
  screen.appendChild(r);
  return r;
}
function dot(x, y, hex) {
  const e = figma.createEllipse();
  e.resize(6, 6);
  e.x = x; e.y = y;
  e.fills = fill(hex);
  screen.appendChild(e);
  return e;
}

const ids = [];
ids.push(text('ACTIVE AGENTS', 1128, 92, 11, 170, 'Press Start 2P', '#111827').id);
ids.push(text('4 ONLINE', 1270, 92, 11, 90, 'Press Start 2P', '#5D7290').id);
ids.push(text('TASK QUEUE', 1128, 424, 11, 150, 'Press Start 2P', '#111827').id);
ids.push(text('6 SURFACED', 1270, 424, 11, 100, 'Press Start 2P', '#5D7290').id);
ids.push(text('RECENT HANDOFFS', 1128, 860, 11, 170, 'Press Start 2P', '#111827').id);

const roster = [
  ['architect', 'Plan Team / orchestrator', '#FF7043', 'RUNNING', '#2563EB'],
  ['sentinel', 'Review Team / validator', '#EF5350', 'RUNNING', '#2563EB'],
  ['owner', 'Plan Team / orchestrator', '#FF7043', 'IDLE', '#6B7280'],
  ['worker-1', 'Refactor Team / implementer', '#66BB6A', 'IDLE', '#6B7280'],
];

for (let i = 0; i < roster.length; i++) {
  const [name, meta, accent, state, stateColor] = roster[i];
  const y = 136 + i * 84;
  ids.push(dot(1130, y + 8, accent).id);
  ids.push(text(name, 1146, y, 11, 140, 'Press Start 2P', '#111827').id);
  ids.push(text(meta, 1146, y + 24, 176, 'Inter', '#5D7290').id);
  const pill = rect(1320, y + 2, 60, 28, '#F7F4EE', '#D8D1C4');
  ids.push(pill.id);
  ids.push(text(state, 1330, y + 12, 8, 42, 'Press Start 2P', stateColor).id);
}

return { createdNodeIds: ids, mutatedNodeIds: [screen.id] };
```

---

## Chunk 5 — Validation snapshot pass

After each chunk:

1. `get_metadata` on page `1:2`
2. `get_screenshot` on screen frame `1:6`
3. Compare against:
   - reference screenshot
   - current code screenshot

Focus checks:

- does the left pane read as one dominant floorplate?
- does the rail stay narrow and ledger-like?
- are room labels and state chips quiet enough?
- does the commons feel intentional rather than empty?
