# 3D Extension Path — Pixel Agents to Voxel/Low-Poly Models

Strategy for evolving the 2D pixel-art sprite avatars into 3D voxel or low-poly models
while preserving the existing animation system, feature flag, and visual identity.

## Current State (Sprites)

- 5 agent roles rendered as 48x48 pixel-art sprite sheets (384x240, 8x5 grid)
- 6 animation clips: idle, work, walk, error-flash, spawn-in, greyscale-idle
- `SpriteAvatar.tsx` renders via `THREE.SpriteMaterial` with UV offset animation
- `useSpriteAnimator` hook drives frame selection from `SpriteSheetConfig`
- Feature flag `usePixelSprites` toggles sprite vs 3D geometry at runtime

## Voxel Pipeline

Convert sprite frames into voxel models using MagicaVoxel (v0.99.7+):

1. **Front-view slices**: Each 48x48 sprite frame serves as the front-view reference
2. **Color palette extraction**: Each character uses 4-6 colors — export as `.pal`
3. **Voxelization**: Model in MagicaVoxel at 48x48x24 resolution (half-depth for chibi proportions)
4. **Export**: `.vox` → glTF via [VoxToGLB](https://github.com/nicoptere/vox-to-gltf) or Blender plugin
5. **Load in Three.js**: `GLTFLoader` imports `.glb` with embedded materials

Per-role model files: `public/models/agent-{role}.glb`

## Low-Poly Alternative

For higher visual fidelity without the blocky voxel aesthetic:

1. **Silhouette reference**: Use the sprite sheet front/side views as modeling guides
2. **Model in Blender** (4.0+): Target 200-500 triangles per character (chibi proportions)
3. **Material slots**: Map the 4-6 color palette to named materials matching `ROLE_COLORS`
4. **Rigging**: Simple 6-bone skeleton (root, spine, head, L-arm, R-arm, legs)
5. **Export**: `.glb` with Draco compression for web delivery

Per-role model files: `public/models/agent-{role}-lowpoly.glb`

## Animation Mapping

The 6 sprite animation clip names map 1:1 to 3D skeletal/morph animations:

| Clip Name | Sprite (UV frames) | 3D Equivalent |
|-----------|-------------------|---------------|
| `idle` | Row 0, 4f @ 6fps | Breathing loop (subtle Y-scale + head bob) |
| `work` | Row 1, 4f @ 8fps | Arm movement loop (typing/inspecting) |
| `walk` | Row 2, 4f @ 8fps | Walk cycle (leg + arm swing) |
| `error-flash` | Row 3, 2f @ 12fps | Red emission flash (material emissive pulse) |
| `spawn-in` | Row 3, 2f @ 8fps | Scale pop (0.5 → 1.0) with particle burst |
| `greyscale-idle` | Row 4, 4f @ 6fps | Desaturated material + slowed breathing |

### Shared Animation Controller Interface

```typescript
interface AgentAnimationController {
  play(clipName: string, speedMultiplier?: number): void;
  stop(): void;
  readonly currentClip: string;
  readonly finished: boolean;
}
```

- `SpriteAnimationController`: Wraps `useSpriteAnimator` (UV offset)
- `SkeletalAnimationController`: Wraps `THREE.AnimationMixer` (bone transforms)
- Both implement the same interface — the consumer doesn't know which renderer is active

## Migration Strategy

### Feature Flag Extension

The current boolean `usePixelSprites` extends to a tri-state enum:

```typescript
type AvatarRenderer = "sprite" | "voxel" | "lowpoly";
```

In `agent-store.ts`:
```typescript
avatarRenderer: AvatarRenderer; // default: "sprite"
setAvatarRenderer: (renderer: AvatarRenderer) => void;
```

### Component Architecture

`AgentAvatar` remains the stable wrapper. The inner renderer swaps:

```
<AgentAvatar>
  ├── avatarRenderer === "sprite"  → <SpriteAvatar />
  ├── avatarRenderer === "voxel"   → <VoxelAvatar />   (future)
  └── avatarRenderer === "lowpoly" → <LowPolyAvatar /> (future)
  ├── <FootRing />        (shared)
  ├── <StatusDot />       (shared)
  ├── <AgentBadge />      (shared)
  └── <MeetingOrbitRing /> (shared)
</AgentAvatar>
```

All overlays (FootRing, StatusDot, AgentBadge, MeetingOrbitRing) work identically
across all three renderers since they operate on the parent group's position.

### Incremental Rollout

1. **Phase A** (current): Sprite renderer with full feature set
2. **Phase B**: Create one voxel model (orchestrator) as proof of concept
3. **Phase C**: Generate all 5 voxel models, add VoxelAvatar component
4. **Phase D**: Optional low-poly models for high-end clients

Each phase is independently deployable behind the feature flag.

## Visual Consistency

All three representations MUST share:

- **Role color palette**: orchestrator=#FF7043, implementer=#66BB6A, researcher=#AB47BC, reviewer=#42A5F5, validator=#EF5350
- **Chibi proportions**: Head ~60% of total height
- **Role-identifying accessories**: Crown, wrench, goggles, clipboard, shield
- **Status visual language**: Opacity from `STATUS_CONFIG`, greyscale for inactive/terminated, glow for active/busy

## Tools and Versions

| Tool | Version | Purpose |
|------|---------|---------|
| MagicaVoxel | 0.99.7+ | Voxel modeling from sprite references |
| Blender | 4.0+ | Low-poly modeling, rigging, glTF export |
| Three.js GLTFLoader | r175 | Runtime model loading |
| Draco | 1.5+ | glTF compression for web delivery |
| gltf-pipeline | 4.x | Offline glTF optimization (optional) |
