/**
 * Lemon's five-color sticker palette (+ one flat shade per form).
 * One outline color and weight everywhere; no gradients.
 */
export const C = {
  line: "#16243f", // navy outline, brows, eyes, mouth
  lemon: "#ffd43b",
  lemonShade: "#f2b705",
  lemonHi: "#fff7cf",
  leaf: "#3fae55",
  leafShade: "#2a8a40",
  hoodie: "#2b3f6e",
  hoodieShade: "#20315a",
  cord: "#fffaf0",
  shorts: "#262a33",
  shortsShade: "#1b1e25",
  glove: "#ffffff",
  gloveShade: "#e3e7f0",
  sneaker: "#2fa855",
  sneakerShade: "#22863f",
  sole: "#fffaf0",
  tongue: "#ff6b5b",
  blush: "#ff8a7a",
  shadow: "#16243f",
} as const;

/** Outline weight in viewBox units (≈1.3% of figure height — 3px at 240px). */
export const SW = 3.4;
