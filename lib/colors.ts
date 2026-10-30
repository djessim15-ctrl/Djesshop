export const COLORS = [
  { name: 'Noir', value: '#242528' },
  { name: 'Gris', value: '#9ca0a3' },
  { name: 'Rouge', value: '#dc4d45' },
  { name: 'Rose', value: '#ee9eb2' },
  { name: 'Jaune', value: '#f1c74c' },
  { name: 'Bleu', value: '#3454d9' },
  { name: 'Vert', value: '#6a9a71' },
] as const;

export type ColorName = (typeof COLORS)[number]['name'];
export const isColor = (value: unknown): value is ColorName =>
  typeof value === 'string' && COLORS.some((color) => color.name === value);
