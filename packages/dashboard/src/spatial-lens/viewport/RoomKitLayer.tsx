import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import styles from "../styles/spatial-lens.module.css";
import { getRoomKitSpriteSpecs } from "./roomKit.js";
import type { RoomTemplate } from "./roomTemplates.js";

export function RoomKitLayer({ template }: { template: RoomTemplate }) {
  const sprites = getRoomKitSpriteSpecs(template);
  if (sprites.length === 0) return null;

  return (
    <div
      className={styles["room-kit-layer"]}
      data-room-kit-layer={template.roomId}
      data-room-kit-theme={template.theme}
      aria-hidden="true"
    >
      {sprites.map((sprite) => (
        <GeneratedSprite
          key={sprite.id}
          sprite={sprite.sprite}
          scale={sprite.scale}
          className={`${styles["room-kit-sprite"]} ${styles["pixel-generated-sprite"]}`}
          data-room-kit-sprite={sprite.id}
          data-room-kit-role={sprite.role}
          style={{
            left: `${sprite.x}%`,
            top: `${sprite.y}%`,
            zIndex: sprite.zIndex,
          }}
        />
      ))}
    </div>
  );
}
