import React, { useRef, useState, useEffect } from "react";
import stageStyles from "../office-room.module.css";
import { getOfficeFixtureStyle } from "../office-fixture-registry.js";

interface DraggableFixtureProps {
  kind: string;
  initialLeft: number;
  initialTop: number;
  onDragEnd: (left: number, top: number) => void;
  className?: string;
}

export function DraggableFixture({
  kind,
  initialLeft,
  initialTop,
  onDragEnd,
  className,
}: DraggableFixtureProps) {
  const [posX, setPosX] = useState(initialLeft);
  const [posY, setPosY] = useState(initialTop);
  const [isDragging, setIsDragging] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);
  
  // Update state if props change externally
  useEffect(() => {
    setPosX(initialLeft);
    setPosY(initialTop);
  }, [initialLeft, initialTop]);

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = posX;
    const startPosY = posY;
    
    // We need to calculate % change relative to parent container
    const parentContainer = target.parentElement as HTMLElement;
    if (!parentContainer) return;
    const parentRect = parentContainer.getBoundingClientRect();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const deltaPercentX = (deltaX / parentRect.width) * 100;
      const deltaPercentY = (deltaY / parentRect.height) * 100;
      
      const newX = Math.min(Math.max(startPosX + deltaPercentX, 0), 100);
      const newY = Math.min(Math.max(startPosY + deltaPercentY, 0), 100);
      
      setPosX(newX);
      setPosY(newY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      setIsDragging(false);
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", handlePointerMove);
      target.removeEventListener("pointerup", handlePointerUp);
      
      const deltaX = upEvent.clientX - startX;
      const deltaY = upEvent.clientY - startY;
      const deltaPercentX = (deltaX / parentRect.width) * 100;
      const deltaPercentY = (deltaY / parentRect.height) * 100;
      const finalX = Math.min(Math.max(startPosX + deltaPercentX, 0), 100);
      const finalY = Math.min(Math.max(startPosY + deltaPercentY, 0), 100);
      
      onDragEnd(finalX, finalY);
    };

    target.addEventListener("pointermove", handlePointerMove);
    target.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <span
      ref={elementRef}
      className={[className, stageStyles["office-fixture"]].filter(Boolean).join(" ")}
      style={{
        ...getOfficeFixtureStyle(kind),
        left: `${posX}%`,
        top: `${posY}%`,
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: isDragging ? 10 : undefined,
        transform: isDragging ? "scale(1.1) translateY(-2px)" : "none",
        transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
        transformOrigin: "bottom center",
      }}
      onPointerDown={handlePointerDown}
    />
  );
}
