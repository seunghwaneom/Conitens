# Pixel Office Figma Post-Limit Execution Checklist

> Use this immediately when Figma MCP write access returns  
> Figma file: `https://www.figma.com/design/TVqn19qfYsusADPtmGdtMX`  
> Page: `Pixel Office Upgrade`

## 1. Do first: lock shell and hierarchy

- [ ] Reuse the existing `Pixel Office Upgrade Screen` wrapper frame
- [ ] Keep the shell at `1440 × 980`
- [ ] Keep the top bar at `48px`
- [ ] Keep the warm off-white app background
- [ ] Keep the main split at `1fr / 340px`
- [ ] Make sure the left stage dominates immediately; do not let secondary chrome steal height

## 2. Build floorplate geometry before props

- [ ] Keep the six-room Conitens semantics
- [ ] Do **not** collapse to the literal four-room reference
- [ ] Organize the screen as:
  - left ops spine
    - `Ops Control`
    - `Impl Office`
  - dominant center shared floor
    - `Central Commons`
  - right specialist wing
    - `Research Lab`
    - `Validation Office`
    - `Review Office`
- [ ] Use thin dividers and pale room fills
- [ ] Keep chips minimal; one compact state cue per room at most

## 3. Densify the two most important rooms first

### Central Commons
- [ ] reception edge / welcome fixture
- [ ] commons table cluster
- [ ] shared board / surface
- [ ] light scattered ambient props
- [ ] make sure it does **not** read as a giant empty void

### Impl Office
- [ ] workbench / main desk
- [ ] shelf support
- [ ] cart support
- [ ] one seated zone + one standing zone
- [ ] denser than the other rooms, but still breathable

## 4. Then add the specialist-wing rooms

### Ops Control
- [ ] two operator stations
- [ ] compact console fixtures
- [ ] one server/storage column
- [ ] one or two active avatars only

### Research Lab
- [ ] bench
- [ ] storage wall
- [ ] one analysis station
- [ ] one low-key screen indicator

### Validation Office
- [ ] gate desk
- [ ] validation station
- [ ] one or two restrained urgency markers

### Review Office
- [ ] critique desk
- [ ] display / screen
- [ ] compact accessories only

## 5. Systematize the rail

### Active Agents
- [ ] four rows max
- [ ] role dot + name/meta + compact state chip
- [ ] flat ledger rows, not cards

### Task Queue
- [ ] four surfaced tasks
- [ ] title + tiny meta line + slim status line
- [ ] stronger row contrast than the stage, but still restrained

### Recent Handoffs
- [ ] one to three rows only
- [ ] explicit route text + timestamp
- [ ] no route-diagram theatrics

### Compact focus strip
- [ ] selected room or selected agent
- [ ] one short status line
- [ ] no dossier block

## 6. Ambient signals only

- [ ] avatars remain ambient, not dominant
- [ ] task markers stay small
- [ ] urgency is visible but not loud
- [ ] no heavy motion ideas
- [ ] no glossy/gamey effects

## 7. Validation order

1. [ ] `get_metadata` on page `1:2`
2. [ ] `get_screenshot` on wrapper/screen frame `1:6`
3. [ ] compare against:
   - `docs/pixel_office_dashboard.html`
   - `output/pencil/pixel-office-upgrade-v3.png`
   - current coded screen screenshot

## 8. If time is short

Prioritize in this order:

1. shell
2. room geometry
3. commons + impl density
4. rail rows
5. specialist wing props
6. ambient signals

## 9. Reference artifacts

- `docs/pixel-office-figma-upgrade-spec.md`
- `docs/pixel-office-figma-use-figma-chunks.md`
- `output/pencil/pixel-office-upgrade-v3.png`
