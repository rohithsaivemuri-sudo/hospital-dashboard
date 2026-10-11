// A translucent version of any colour, including CSS variables. Appending two hex alpha digits to a
// colour string only works for '#rrggbb' values: with 'var(--success)' it produced invalid CSS that
// browsers silently dropped. percent: 6 ≈ the old suffix 10, 12.5 ≈ 20, 25 ≈ 40.
export const tint = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;
