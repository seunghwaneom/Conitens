# Dormant Focused Map Contract Manifest

status: in_progress
proof_before: .omo/evidence/task-5-dormant-focused-map-before.txt
remove_or_decontract: FocusedRouteTargetEdge, FocusedCorridorContinuityLayer, MinimapDock, AgentOffscreenRail, FloorViewport focused data hooks
preserve: Floor Overview topology, generated room backdrop usage in Focused context thumbnails, Overview signal layers

## Before search
packages/dashboard/src/spatial-lens/components/FloorViewport.tsx:82:        data-operator-focus-map={isFocusedMode ? "true" : undefined}
packages/dashboard/src/spatial-lens/components/FocusedCorridorContinuityLayer.tsx:15:export function FocusedCorridorContinuityLayer({
packages/dashboard/src/spatial-lens/components/FocusedRouteTargetEdge.tsx:16:export function FocusedRouteTargetEdge({
packages/dashboard/src/spatial-lens/components/MinimapDock.tsx:5:export function MinimapDock({
packages/dashboard/src/spatial-lens/index.ts:35:  AgentOffscreenRail,
packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx:98:export function AgentOffscreenRail({
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:337:    "components/FocusedCorridorContinuityLayer.tsx",
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:341:  assert.doesNotMatch(viewportSource, /FocusedCorridorContinuityLayer/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:353:  const minimapSource = readSpatialLensSource("components/MinimapDock.tsx");
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:356:  assert.doesNotMatch(viewportSource, /import \{ MinimapDock \}/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:357:  assert.doesNotMatch(viewportSource, /<MinimapDock/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:363:  assert.doesNotMatch(officeStageSource, /viewMode="focused"/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:398:  assert.match(viewportSource, /data-operator-focus-map=/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:418:    "components/FocusedRouteTargetEdge.tsx",
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:429:    "components/FocusedRouteTargetEdge.tsx",
packages/dashboard/tests/spatial-lens-room-dressing.test.mjs:121:    "components/FocusedRouteTargetEdge.tsx",

## After search
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:337:  assert.doesNotMatch(viewportSource, /FocusedCorridorContinuityLayer/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:339:    existsSync(path.join(SPATIAL_LENS_ROOT, "components/FocusedCorridorContinuityLayer.tsx")),
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:348:  assert.equal(existsSync(path.join(SPATIAL_LENS_ROOT, "components/MinimapDock.tsx")), false);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:349:  assert.doesNotMatch(viewportSource, /import \{ MinimapDock \}/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:350:  assert.doesNotMatch(viewportSource, /<MinimapDock/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:356:  assert.doesNotMatch(officeStageSource, /viewMode="focused"/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:391:  assert.doesNotMatch(viewportSource, /data-operator-focus-map=/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:432:  assert.doesNotMatch(indexSource, /AgentOffscreenRail/);
packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:433:  assert.doesNotMatch(agentLayerSource, /export function AgentOffscreenRail/);

status: pass
tests: .omo/evidence/task-5-green.txt
