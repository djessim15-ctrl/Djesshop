import { isColor } from './colors';

export type RequestInput = {
  name: string;
  email: string;
  description: string;
  color: string;
  quantity: number;
};

export function validateRequest(input: unknown): { data: RequestInput; error?: never } | { error: string; data?: never } {
  if (!input || typeof input !== 'object') return { error: 'La demande est invalide.' };
  const item = input as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const email = typeof item.email === 'string' ? item.email.trim().toLowerCase() : '';
  const description = typeof item.description === 'string' ? item.description.trim() : '';
  const color = item.color;
  const quantity = Number(item.quantity);
  if (name.length < 2 || name.length > 100) return { error: 'Indiquez votre nom (2 à 100 caractères).' };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Indiquez une adresse e-mail valide.' };
  if (description.length < 10 || description.length > 3000) return { error: 'Décrivez votre projet en 10 à 3 000 caractères.' };
  if (!isColor(color)) return { error: 'Choisissez une couleur proposée.' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return { error: 'La quantité doit être comprise entre 1 et 1 000.' };
  return { data: { name, email, description, color, quantity } };
}
