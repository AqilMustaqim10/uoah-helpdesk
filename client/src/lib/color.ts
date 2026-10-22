// Color helpers for the branding page. These only give instant feedback;
// the SERVER checks the color again and has the final say.

export const isHexColor = (v: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(v);

/** How bright a color is (0 = black, 1 = white), using the standard accessibility formula. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Contrast between white text and this background color. 4.5 or more is readable. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}
