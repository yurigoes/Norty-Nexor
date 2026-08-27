/* =========================================================
   LICITA+ — Formatação pt-BR
   ---------------------------------------------------------
   Toda data, moeda e número passam por aqui. Centralizar
   evita o clássico: a mesma quantia aparecendo como
   "R$ 185400" numa tela e "185.400,00" na outra.
   ========================================================= */

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MOEDA_INTEIRA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});
const NUMERO = new Intl.NumberFormat('pt-BR');
const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export const moeda = (valor) => MOEDA.format(valor ?? 0);
export const numero = (valor) => NUMERO.format(valor ?? 0);

/**
 * Valor abreviado para cartão de indicador: "R$ 12,6 mi".
 * Números longos quebram o layout de um StatCard e ninguém lê
 * os centavos de um total agregado.
 */
export function moedaCurta(valor) {
  const v = valor ?? 0;
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return MOEDA_INTEIRA.format(v);
}

export const data = (iso) => (iso ? DATA.format(new Date(iso)) : '—');
export const dataHora = (iso) => (iso ? DATA_HORA.format(new Date(iso)) : '—');

/** Dias inteiros até a data; negativo quando já passou. */
export function diasAte(iso, agora = new Date()) {
  if (!iso) return null;
  const alvo = new Date(iso);
  if (Number.isNaN(alvo.getTime())) return null;
  const umDia = 24 * 60 * 60 * 1000;
  return Math.ceil((alvo.getTime() - agora.getTime()) / umDia);
}

export function prazoTexto(iso, agora = new Date()) {
  const dias = diasAte(iso, agora);
  if (dias === null) return 'sem prazo';
  if (dias < 0) return 'encerrado';
  if (dias === 0) return 'encerra hoje';
  if (dias === 1) return 'encerra amanhã';
  return `${dias} dias`;
}

export const prazoUrgente = (iso, agora = new Date()) => {
  const dias = diasAte(iso, agora);
  return dias !== null && dias >= 0 && dias <= 3;
};

/** "há 2 h", "há 3 dias" — para notificações. */
export function tempoRelativo(iso, agora = new Date()) {
  const minutos = Math.round((agora.getTime() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

export const cnpj = (digitos) =>
  String(digitos ?? '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export const iniciais = (nome) =>
  String(nome ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();

/**
 * Faixa da compatibilidade. Devolve também o rótulo por
 * extenso, porque a interface nunca comunica a faixa só pela
 * cor — quem não distingue verde de amarelo lê "Alta".
 */
export function faixaScore(valor) {
  if (valor >= 80) return { chave: 'alta', rotulo: 'Alta', descricao: 'Forte aderência ao seu perfil' };
  if (valor >= 60) return { chave: 'media', rotulo: 'Média', descricao: 'Aderência parcial ao seu perfil' };
  if (valor >= 40) return { chave: 'baixa', rotulo: 'Baixa', descricao: 'Aderência fraca — avalie com atenção' };
  return { chave: 'minima', rotulo: 'Mínima', descricao: 'Pouca relação com o seu perfil' };
}

/** Normaliza para busca: sem acento, sem caixa. */
export const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
