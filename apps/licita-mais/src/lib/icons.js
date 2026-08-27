/* =========================================================
   LICITA+ — Ícones
   ---------------------------------------------------------
   Conjunto no traço do Lucide: grade 24, traço 2, pontas e
   junções arredondadas. Um estilo só, sem mistura.

   São inline em vez de vir de CDN por duas razões: a prévia
   publicada roda sob CSP que bloqueia host externo, e um
   ícone que falha em carregar deixa botão sem rótulo visível.
   Inline, o conjunto não tem como faltar.
   ========================================================= */

const D = {
  painel: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  faisca: '<path d="M9.9 2.6 8.5 6.4a2 2 0 0 1-1.2 1.2l-3.8 1.4a1 1 0 0 0 0 1.9l3.8 1.4a2 2 0 0 1 1.2 1.2l1.4 3.8a1 1 0 0 0 1.9 0l1.4-3.8a2 2 0 0 1 1.2-1.2l3.8-1.4a1 1 0 0 0 0-1.9l-3.8-1.4a2 2 0 0 1-1.2-1.2L11.8 2.6a1 1 0 0 0-1.9 0Z"/><path d="M18.5 15.5 19 17l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 17l1.5-.5Z"/>',
  sino: '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M21 18H3s3-2 3-9a6 6 0 0 1 12 0c0 7 3 9 3 9Z"/>',
  estrela: '<path d="M11.5 2.8a.6.6 0 0 1 1 0l2.4 4.9 5.4.8a.6.6 0 0 1 .3 1l-3.9 3.8.9 5.4a.6.6 0 0 1-.9.6L12 16.8l-4.8 2.5a.6.6 0 0 1-.9-.6l.9-5.4-3.9-3.8a.6.6 0 0 1 .3-1l5.4-.8Z"/>',
  grafico: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  predio: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  engrenagem: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2 2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0 2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7 2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7 2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7 2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7 2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2 2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0 2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7 2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7 2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7 2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7 2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  pasta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  maleta: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  seta_dir: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  seta_esq: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  chevron_dir: '<path d="m9 18 6-6-6-6"/>',
  chevron_esq: '<path d="m15 18-6-6 6-6"/>',
  chevron_baixo: '<path d="m6 9 6 6 6-6"/>',
  chevron_cima: '<path d="m18 15-6-6-6 6"/>',
  fechar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  check_circulo: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  mais: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  menos: '<path d="M5 12h14"/>',
  filtro: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  ordenar: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M21 8h-6"/><path d="M19 12h-4"/><path d="M17 16h-2"/>',
  pin: '<path d="M20 10c0 4.99-5.14 11.2-7.1 13.4a1.2 1.2 0 0 1-1.8 0C9.14 21.2 4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  calendario: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  documento: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  subindo: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  descendo: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  alerta: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  casa: '<path d="M3 10.2 12 3l9 7.2V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  usuario: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  lista: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  grade: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  marcador: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  olho: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.7 10.7 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  mais_opcoes: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  raio: '<path d="M13 2 4.1 12.9a1 1 0 0 0 .8 1.6H11l-1 7.5 8.9-10.9a1 1 0 0 0-.8-1.6H12Z"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1 1 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
  atualizar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  carteira: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  martelo: '<path d="m14 13-8.4 8.4a2 2 0 0 1-2.8-2.8L11 10"/><path d="m17.6 6.4-4.2 4.2"/><path d="m10.6 9.4 4.2-4.2"/><path d="M13.5 2.5 21.5 10.5"/><path d="m18.5 7.5-4 4"/>',
  chapeu: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  coracao: '<path d="M19 14c1.5-1.5 3-3.4 3-5.5A5.5 5.5 0 0 0 12 5.4 5.5 5.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7Z"/>',
  salvar: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h6"/>',
  sino_ativo: '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M22 8c0-2.3-.8-4.3-2-6"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M21 18H3s3-2 3-9a6 6 0 0 1 12 0c0 7 3 9 3 9Z"/>',
  arquivo_x: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a1 1 0 0 0 1 1h5"/><path d="m9.5 12.5 5 5"/><path d="m14.5 12.5-5 5"/>',
  balanca: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m3 13 3-6 3 6a3 3 0 0 1-6 0Z"/><path d="m15 13 3-6 3 6a3 3 0 0 1-6 0Z"/><path d="M7 21h10"/>',
};

/**
 * Devolve o SVG do ícone. `nome` desconhecido volta string
 * vazia em vez de quebrar a página — um ícone faltando é um
 * detalhe visual, não motivo para derrubar a tela inteira.
 */
export function icone(nome, { tamanho, classe = '', rotulo } = {}) {
  const corpo = D[nome];
  if (!corpo) return '';

  const acessivel = rotulo
    ? `role="img" aria-label="${rotulo}"`
    : 'aria-hidden="true" focusable="false"';

  const dimensao = tamanho ? ` width="${tamanho}" height="${tamanho}"` : '';

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" class="${classe}"${dimensao} ${acessivel}>${corpo}</svg>`;
}

export const nomesDeIcone = Object.keys(D);
