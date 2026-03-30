# Pixel Office Figma Upgrade Spec

> Status: prepared while Figma MCP writes are rate-limited on the Starter plan  
> Target file: `https://www.figma.com/design/TVqn19qfYsusADPtmGdtMX`  
> Figma page: `Pixel Office Upgrade`

## 1. Goal

Upgrade the Pixel Office into a **stage-first operator dashboard** that preserves
the current six-room Conitens semantics while matching the calmer, flatter,
more architectural reference language from `docs/pixel_office_dashboard.html`.

This spec is the next-write blueprint for the Figma file once MCP write limits
reset.

## 2. Reference DNA

### Shell

- warm off-white app background: `#faf9f6`
- white top bar: `48px` tall
- bottom border on top bar: `1px`
- horizontal padding in top bar: `24px`
- pixel brand on the left, quiet utility nav on the right

### Main layout

- dashboard split: `1fr / 340px`
- left side is the hero stage
- right side is a narrow operational rail

### Stage

- pale floor with a `24px` dotted grid
- centered room container: `800 × 600`
- white frame with thin border and very light shadow
- flat room composition with thin dividers doing most of the work

### Right rail

Three stacked sections:

1. `Active Agents`
2. `Task Queue`
3. `Recent Handoffs`

Style is dense, flat, and card-light.

### Typography

- `Inter` for functional UI copy
- `Press Start 2P` only for small labels, room titles, and pixel accents

## 3. Current Codebase Intent to Preserve

Keep the existing Conitens room semantics and data wiring:

- `ops-control`
- `impl-office`
- `project-main`
- `research-lab`
- `validation-office`
- `review-office`

Preserve the current model layer and selection flow:

- `packages/dashboard/src/dashboard-model.ts`
- `packages/dashboard/src/office-presence-model.ts`
- `packages/dashboard/src/office-stage-schema.ts`
- `packages/dashboard/src/office-system.ts`

Do **not** redesign this into the literal four-room reference.

## 4. Upgrade Moves to Reflect in Figma

### A. Stronger floorplate, fewer room-widget vibes

- keep one dominant office floorplate
- flatten room chrome
- reduce “mini dashboard tile” feeling
- let the rooms feel like architectural zones first, UI widgets second

### B. Schema-driven geometry

Use the authored six-room semantics but compose them more like a believable
floorplate:

- **left ops spine**
  - `Ops Control`
  - `Impl Office`
- **center shared floor**
  - `Central Commons`
- **right specialist wing**
  - `Research Lab`
  - `Validation Office`
  - `Review Office`

### C. Calmer right rail

- keep the three core sections
- compress selected-state/focus details into one compact strip
- avoid dossier energy

### D. Ambient pixel cues only

- use avatars, props, and task markers as ambient meaning
- keep motion and status accents restrained
- avoid turning the screen into a simulation/game board

## 5. Figma Screen Blueprint

## Frame

- top-level screen frame: `1440 × 980`
- background: `#faf9f6`

## Top bar

- frame height: `48`
- fill: `#ffffff`
- bottom stroke: `#e2dfd8`
- left brand: `Conitens`
- nav labels:
  - `Overview`
  - `Workflows`
  - `Metrics`
  - `Audit Log`

## Main split

- stage region: `1100 × 932`
- rail region: `340 × 932`

## Stage region

- pale workspace background
- dotted grid at `24px`
- centered office container: `820 × 600`
- office container fill: `#ffffff`
- stroke: `#e2dfd8`

## Room geometry target

These are the intended visual proportions for the upgraded screen, not literal
code coordinates:

- `Ops Control`
  - top-left
  - approx `200 × 250`
  - pale blue
- `Impl Office`
  - bottom-left
  - approx `200 × 350`
  - pale workspace beige
- `Central Commons`
  - center
  - approx `395 × 600`
  - pale lobby beige
- `Research Lab`
  - top-right
  - approx `224 × 200`
  - pale lab green
- `Validation Office`
  - mid-right
  - approx `224 × 180`
  - pale validation green
- `Review Office`
  - bottom-right
  - approx `224 × 220`
  - pale review beige

## Room styling

- thin dividers
- tiny pixel team label
- small room title
- one compact state chip per room at most
- no heavy local card framing inside each room

## Props / fixtures

### Ops Control

- two operator stations
- one server/storage column
- one or two compact console fixtures
- one or two active avatars

### Impl Office

- workbench / desk
- shelf / cart support cluster
- one seated area and one standing area
- denser than the reference, but still breathable

### Central Commons

- reception edge or welcome fixture
- commons table cluster
- 2–3 scattered ambient props
- distributed placement, no giant empty void

### Research Lab

- bench + storage wall
- one analysis station
- low density, quiet feel

### Validation Office

- gate desk
- validation station
- one or two urgency markers

### Review Office

- critique desk
- display/screen
- compact accessories

## Right rail content blueprint

### Section 1: Active Agents

- four rows
- role color dots
- small right-aligned state chip

### Section 2: Task Queue

- four surfaced tasks
- pixel title text
- tiny owner/meta line
- one slim progress/status line

### Section 3: Recent Handoffs

- one to three compact rows
- route text + timestamp

### Compact focus strip

- one short selected-room or selected-agent summary
- no dossier copy

## 6. Typography + Token Targets

### Fonts

- `Press Start 2P`
  - brand
  - room/team labels
  - section headings
  - compact state chips
- `Inter`
  - body copy
  - task titles
  - rail metadata

### Color targets

- base background: `#faf9f6`
- border: `#e2dfd8`
- text main: `#111827`
- muted text: `#6b7280`
- room tones:
  - lobby/commons: `#efede0`
  - control: `#edf4f8`
  - workspace/review: `#f3ecdf`
  - lab/validation: `#edf3ea`

### Rail accents

- role colors should stay in dots and light chips
- avoid large saturated panels

## 7. Figma Build Order

When Figma MCP writes are available again, apply in this order:

1. **page shell**
   - top bar
   - stage background
   - right rail frame
2. **office container**
   - outer `820 × 600` frame
   - internal dividers
3. **room blocks**
   - six room rectangles
   - room labels
   - tiny state chips
4. **fixtures and ambient props**
   - distribute by room purpose
   - fix commons/impl density first
5. **avatars and task markers**
   - minimal, ambient, role-distinct
6. **right rail**
   - active agents
   - task queue
   - recent handoffs
   - compact focus strip
7. **final screenshot pass**
   - compare against reference and current code behavior

## 8. Current Figma State

Already created:

- file: `TVqn19qfYsusADPtmGdtMX`
- page: `Pixel Office Upgrade`
- `Reference Audit` frame with research cards
- `Pixel Office Upgrade Screen` wrapper frame

Blocked:

- further `use_figma` writes due **Starter plan MCP tool-call limit**

## 9. Immediate Next Step

Once Figma MCP write access resets, resume from the existing file and build the
screen in small increments:

1. shell
2. room geometry
3. fixtures
4. rail
5. screenshot validation
