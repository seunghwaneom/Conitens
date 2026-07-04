# Spatial Lens Assets

This folder owns the Spatial Lens asset registry used by the dashboard Office
Preview `Topology` mode. Focused `Agents` mode uses large portrait cutouts from
`public/agent-portraits/generated`; this registry stays responsible for floor,
wall, fixture, and compact map-character assets.

Manual imports should live under:

```text
packages/dashboard/public/spatial-lens/
  floors/
  walls/
  furniture/
  characters/
```

Current generated/static assets live under:

```text
packages/dashboard/public/
  office-floor-*.png
  office-fixtures.png
  agent-sprites/generated/
  agent-portraits/generated/
```

`assetRegistry.ts` slices `office-fixtures.png`, references the seven generated
floor tiles directly, and points character entries at the generated `64x64`
role sprite atlases under `agent-sprites/generated`. The large `288x512`
portrait PNGs are intentionally resolved outside this registry by
`agent-character-portraits.ts` because they belong to the Focused agent deck,
not the topology map.

Rules for adding assets:

- Do not download or vendor third-party assets until license, attribution, and
  redistribution rights are reviewed.
- Prefer existing local dashboard assets and generated static PNGs.
- Every registry entry must declare `id`, `kind`, `src`, `tileSize`, `anchor`,
  `rotationGroup`, `stateGroup`, and `animationFrames`.
- Use `src: null` plus a CSS fallback for placeholders or future manual-import
  slots.
- Keep read-only preview work separate from task mutation, provider auth, or
  approval flows.
- Do not route Focused portrait cards through this registry unless the map and
  card asset contracts are intentionally merged.

The current registry references generated local floor tiles, the generated
fixture sprite sheet, generated local agent sprite atlases, and CSS placeholders
for wall and missing-asset cases. It must not reference remote URLs.
