# Spatial Lens Assets

This folder owns the optional Spatial Lens asset registry. It is not mounted
into the current dashboard route yet; Prompt 2 only establishes the manifest
contract and safe local placeholders.

Manual imports should live under:

```text
packages/dashboard/public/spatial-lens/
  floors/
  walls/
  furniture/
  characters/
```

Generated Spatial Lens references and sprite sheets live under:

```text
packages/dashboard/public/assets/spatial-lens/generated/
```

The generated sheet is sliced manually by
`packages/dashboard/src/spatial-lens/assets/generatedAssetManifest.ts`.
Use `pixel-office-asset-sheet-1x.png` for frontend sprites; keep the full source
sheet only as generated reference/source material.

Rules for adding assets:

- Do not download or vendor third-party assets until license, attribution, and
  redistribution rights are reviewed.
- Prefer existing local dashboard assets while the registry is experimental.
- Every registry entry must declare `id`, `kind`, `src`, `tileSize`, `anchor`,
  `rotationGroup`, `stateGroup`, and `animationFrames`.
- Use `src: null` plus a CSS fallback for placeholders or future manual-import
  slots.
- Keep read-only preview work separate from task mutation, provider auth, or
  approval flows.

The current registry references existing local floor tiles, the existing local
fixture sprite sheet, existing local command-center agent sprites, and CSS
placeholders for wall and missing-asset cases.
