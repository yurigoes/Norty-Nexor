/* Utilidades do site público: endereço de arquivos, metatags e contraste da cor da marca. */
import { createContext, useContext, useEffect } from 'react';
import type { PublicSite } from '@nortycar/shared';
import { API_URL } from '../../lib/api';

export interface SiteContextValue {
  site: PublicSite;
  /** Prefixo dos links: `/site/<slug>` dentro do app, vazio em domínio próprio. */
  base: string;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const value = useContext(SiteContext);
  if (!value) throw new Error('useSite fora do site');
  return value;
}

export function fileUrl(slug: string, fileId: string | null | undefined): string | null {
  return fileId ? `${API_URL}/public/sites/${slug}/files/${fileId}` : null;
}

/** Título e descrição da página (o robô de busca que executa JS lê daqui). */
export function usePageMeta(title: string, description?: string | null) {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    if (description) meta.content = description.slice(0, 170);
  }, [title, description]);
}

/** Luminância relativa (WCAG) de uma cor #RRGGBB. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Texto que fica legível sobre a cor da marca: branco ou quase preto. */
export function textOn(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#101828') ? '#ffffff' : '#101828';
}

/** Escurece uma cor para os estados de hover/pressionado. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
