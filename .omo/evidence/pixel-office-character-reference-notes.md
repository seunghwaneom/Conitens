# Pixel Office Character Reference Notes - 2026-06-28

## Sources Used

- SLYNYRD Pixelblog 22, Top Down Character Sprites:
  https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites
- SLYNYRD Pixelblog 55, Top Down Character Animation:
  https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation
- Pixel Office 32x32 by Masalimov Ilnur:
  https://masalimov-ilnur.itch.io/pixel-office
- Pixel art Character NPC Top Down Base by Pixeline:
  https://pixeline-k.itch.io/character-spritesheet-32-px-walk-idle

## Extracted Direction

- Use references as art direction only; do not copy source pixels or import
  source sheets.
- Keep the office camera in a top-down RPG family: compact stance, visible
  crown/hair, readable shoulder block, and feet anchored near the bottom.
- Treat identity as paper-doll layers: hair/head, chest/jacket, legs/boots,
  and tools/props should read as separate pieces even at small sizes.
- Preserve a limited palette and crisp pixel clusters. Avoid extra texture
  that becomes dashboard noise.
- Give office roles distinct silhouettes through practical work props:
  tablet, wrench, lens/book, clipboard, shield.
- Keep animation short and readable. A small body shift plus prop/hand motion
  is better than noisy locomotion for the Agent stage.

## Applied To Conitens

- `agent_sprite_design.py` style contract now says
  `reference-informed top-down pixel office human character sprite`.
- Generated `sprite-request.json` files record reference source URLs and the
  no-copy art-direction note.
- Agent stage renders the generated 48px cells at 3x for a stronger first-read
  cast while room/classic avatar defaults stay smaller.
