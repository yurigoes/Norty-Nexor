import { useEffect, useState } from 'react';

import { chamar } from './cliente';

export type MarcaPublica = {
  productName: string;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
};

const PADRAO: MarcaPublica = {
  productName: 'Norty Desk',
  tagline: null,
  logoUrl: null,
  faviconUrl: null,
  version: 0,
};

export const obterMarca = () => chamar<MarcaPublica>('/brand');

export const enviarLogo = (arquivo: File, qual: 'logo' | 'favicon' = 'logo') => {
  const forma = new FormData();
  forma.append('file', arquivo);
  return chamar<MarcaPublica>(`/brand/${qual}`, { metodo: 'POST', corpo: forma });
};

export const removerLogo = (qual: 'logo' | 'favicon' = 'logo') =>
  chamar<MarcaPublica>(`/brand/${qual}`, { metodo: 'DELETE' });

export const editarMarca = (dados: { productName?: string; tagline?: string }) =>
  chamar<MarcaPublica>('/brand', { metodo: 'PATCH', corpo: dados });

/**
 * A marca da instalação.
 *
 * Carrega antes do login — o endpoint é público justamente por isso. Se
 * falhar, cai no padrão embutido: a tela de entrada nunca fica em
 * branco porque a marca não respondeu.
 */
export function useMarca(): MarcaPublica {
  const [marca, setMarca] = useState<MarcaPublica>(PADRAO);

  useEffect(() => {
    let ativo = true;

    obterMarca()
      .then((m) => ativo && setMarca(m))
      .catch(() => undefined);

    return () => {
      ativo = false;
    };
  }, []);

  // O título da aba e o ícone acompanham a marca configurada.
  useEffect(() => {
    document.title = marca.productName;

    if (marca.faviconUrl) {
      let icone = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!icone) {
        icone = document.createElement('link');
        icone.rel = 'icon';
        document.head.appendChild(icone);
      }
      icone.href = marca.faviconUrl;
    }
  }, [marca.productName, marca.faviconUrl]);

  return marca;
}
