"use client";

import { useEffect, useRef, useMemo } from "react";

/**
 * Whimsical 3D floating shapes — varied geometry, pastel tones,
 * slow rotation via CSS 3D transforms. Pure CSS, zero dependencies.
 *
 * Each shape gets its own unique keyframe so no two rotate the same way.
 * Shapes are scattered across the full page with wide size + color variety.
 */

// ── Types ───────────────────────────────────────────────────────────

type ShapeKind = "torus" | "gem" | "pill" | "blob" | "discs";

interface ShapeDef {
  id: number;
  kind: ShapeKind;
  color: string;
  size: number;
  x: string;
  y: string;
  delay: number;
  duration: number;
  /** Unique rotation axes so no two shapes of the same kind look identical */
  rx: number;
  ry: number;
  rz: number;
  /** Some shapes get a slight blur for atmospheric depth */
  blur: number;
  /** Direction: 1 = clockwise Y, -1 = counterclockwise */
  dir: number;
}

// ── Palette ─────────────────────────────────────────────────────────

const PALETTE = [
  "rgba(13,148,136,",   // teal
  "rgba(179,136,235,",  // lavender
  "rgba(251,191,36,",   // amber
  "rgba(16,185,129,",   // mint
  "rgba(59,130,246,",   // sky blue
  "rgba(236,72,153,",   // rose
  "rgba(168,85,247,",   // violet
  "rgba(245,158,11,",   // warm gold
  "rgba(99,102,241,",   // indigo
  "rgba(20,184,166,",   // cyan
];

function pickColor(i: number, alpha: number): string {
  return PALETTE[i % PALETTE.length] + alpha.toFixed(2) + ")";
}

// ── Shape layout — scattered across full page ───────────────────────

function buildShapes(): ShapeDef[] {
  const shapes: ShapeDef[] = [];
  const kinds: ShapeKind[] = ["torus", "gem", "pill", "blob", "discs"];

  // Minimal — just 8 shapes, wide spread, very low opacity
  const positions = [
    { x: "8%",  y: "8%" },
    { x: "75%", y: "14%" },
    { x: "45%", y: "30%" },
    { x: "18%", y: "48%" },
    { x: "82%", y: "42%" },
    { x: "55%", y: "62%" },
    { x: "12%", y: "78%" },
    { x: "70%", y: "88%" },
  ];

  const sizes   = [100, 160, 120, 180, 90, 140, 110, 150];
  const alphas  = [0.06, 0.08, 0.05, 0.07, 0.06, 0.08, 0.05, 0.07];

  for (let i = 0; i < 8; i++) {
    const pos = positions[i];
    const kind = kinds[i % kinds.length];
    const rx = 30 + Math.round(Math.random() * 60);
    const rz = -25 + Math.round(Math.random() * 50);
    const dir = Math.random() > 0.5 ? 1 : -1;

    shapes.push({
      id: i,
      kind,
      color: pickColor(i, alphas[i]),
      size: sizes[i],
      x: pos.x,
      y: pos.y,
      delay: Math.round(Math.random() * 14),
      duration: 26 + Math.round(Math.random() * 34),
      rx,
      ry: 0,
      rz,
      blur: i % 5 === 0 ? 1 : 0,
      dir,
    });
  }
  return shapes;
}

const SHAPES = buildShapes();

// ── Per-shape keyframes CSS ─────────────────────────────────────────

function buildCSS(shapes: ShapeDef[]): string {
  let css = "";

  for (const s of shapes) {
    const name = `spin-${s.id}`;
    const yEnd = s.dir * 360;
    css += `@keyframes ${name} {
  0%   { transform: rotateX(${s.rx}deg) rotateY(0deg) rotateZ(${s.rz}deg); }
  100% { transform: rotateX(${s.rx}deg) rotateY(${yEnd}deg) rotateZ(${s.rz}deg); }
}`;
  }

  // Blob shapes get a multi-keyframe wobble variant
  for (const s of shapes) {
    if (s.kind !== "blob") continue;
    const name = `spin-wobble-${s.id}`;
    css += `@keyframes ${name} {
  0%   { transform: rotateX(${s.rx}deg) rotateY(0deg) rotateZ(${s.rz}deg); }
  25%  { transform: rotateX(${s.rx - 20}deg) rotateY(${s.dir * 90}deg) rotateZ(${s.rz + 15}deg); }
  50%  { transform: rotateX(${s.rx + 10}deg) rotateY(${s.dir * 180}deg) rotateZ(${s.rz - 10}deg); }
  75%  { transform: rotateX(${s.rx - 5}deg) rotateY(${s.dir * 270}deg) rotateZ(${s.rz + 5}deg); }
  100% { transform: rotateX(${s.rx}deg) rotateY(${s.dir * 360}deg) rotateZ(${s.rz}deg); }
}`;
  }

  css += `.whimsical-shape {
  position: absolute;
  pointer-events: none;
  transform-style: preserve-3d;
  will-change: transform;
  opacity: 0.9;
}`;

  return css;
}

// ── Shape renderers ─────────────────────────────────────────────────

function Torus({ size, color }: { size: number; color: string }) {
  const thickness = Math.round(size * 0.16);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${thickness}px solid transparent`,
        borderTopColor: color,
        borderRightColor: color,
        borderBottomColor: color,
        background: "transparent",
        boxShadow: `inset 0 0 ${size * 0.12}px ${color}`,
      }}
    />
  );
}

function Gem({ size, color }: { size: number; color: string }) {
  const w = Math.round(size * 0.82);
  return (
    <div
      style={{
        width: w,
        height: size,
        clipPath: "polygon(50% 0%, 100% 35%, 85% 100%, 15% 100%, 0% 35%)",
        background: `linear-gradient(135deg, ${color}, transparent 55%)`,
        boxShadow: `0 0 ${size * 0.25}px ${color}`,
      }}
    />
  );
}

function Pill({ size, color }: { size: number; color: string }) {
  const w = Math.round(size * 0.5);
  return (
    <div
      style={{
        width: w,
        height: size,
        borderRadius: w / 2,
        background: `linear-gradient(180deg, ${color}, transparent 65%)`,
        boxShadow: `0 0 ${size * 0.18}px ${color}`,
      }}
    />
  );
}

function Blob({ size, color }: { size: number; color: string }) {
  return (
    <div
      style={{
        width: size,
        height: Math.round(size * 0.8),
        borderRadius: "58% 42% 51% 49% / 42% 55% 45% 58%",
        background: `radial-gradient(ellipse at 35% 35%, ${color}, transparent 65%)`,
        boxShadow: `0 0 ${size * 0.22}px ${color}`,
      }}
    />
  );
}

function StackedDiscs({ size, color }: { size: number; color: string }) {
  const discH = Math.round(size * 0.1);
  const count = 3 + Math.round(Math.random() * 2); // 3-5 discs
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            width: size - i * 18,
            height: discH,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${color}, transparent 75%)`,
            boxShadow: `0 0 ${size * 0.08}px ${color}`,
            transform: `translateZ(${i * 12}px)`,
          }}
        />
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────

export default function WhimsicalShapes() {
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const css = useMemo(() => buildCSS(SHAPES), []);

  useEffect(() => {
    if (!document.getElementById("whimsical-shapes-css")) {
      const style = document.createElement("style");
      style.id = "whimsical-shapes-css";
      style.textContent = css;
      document.head.appendChild(style);
      styleRef.current = style;
    }
    return () => {
      const el = document.getElementById("whimsical-shapes-css");
      if (el && styleRef.current === el) el.remove();
    };
  }, [css]);

  const renderShape = (s: ShapeDef) => {
    const inner = (() => {
      switch (s.kind) {
        case "torus": return <Torus size={s.size} color={s.color} />;
        case "gem": return <Gem size={s.size} color={s.color} />;
        case "pill": return <Pill size={s.size} color={s.color} />;
        case "blob": return <Blob size={s.size} color={s.color} />;
        case "discs": return <StackedDiscs size={s.size} color={s.color} />;
      }
    })();

    // Blobs get wobbly animation; others get linear spin
    const animName =
      s.kind === "blob" ? `spin-wobble-${s.id}` : `spin-${s.id}`;

    return (
      <div
        key={s.id}
        className="whimsical-shape"
        style={{
          left: s.x,
          top: s.y,
          width: s.size,
          height: s.size,
          animationName: animName,
          animationDuration: `${s.duration}s`,
          animationDelay: `${s.delay}s`,
          animationIterationCount: "infinite",
          animationTimingFunction: s.kind === "blob" ? "ease-in-out" : "linear",
          filter: s.blur ? `blur(${s.blur}px)` : undefined,
          transformOrigin: "center center",
        }}
      >
        {inner}
      </div>
    );
  };

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        perspective: "900px",
        perspectiveOrigin: "50% 50%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {SHAPES.map(renderShape)}
    </div>
  );
}
