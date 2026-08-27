/* =========================================================
   Nexor Licitações — Perfil do fornecedor
   ---------------------------------------------------------
   O perfil é a única coisa que o usuário realmente configura, e
   é o que decide se o radar serve ou vira ruído. Por isso ele é
   validado com rigor de entrada de API: um campo errado aqui não
   dá erro visível, só faz a lista vir vazia por semanas — o pior
   tipo de falha, porque parece funcionamento normal.
   ========================================================= */

import type { LinhaFornecimento, PerfilEmpresa, PorteEmpresa } from './dominio.ts';
import { modalidadesDeEntrada } from './pncp-tabelas.ts';

const PORTES: PorteEmpresa[] = ['mei', 'me', 'epp', 'demais'];

export class PerfilInvalidoError extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Perfil inválido:\n  - ${problemas.join('\n  - ')}`);
    this.name = 'PerfilInvalidoError';
    this.problemas = problemas;
  }
}

/**
 * Valida e normaliza um perfil vindo de JSON. Devolve um objeto
 * novo — nunca muta a entrada — com CNPJ sem máscara, UF em
 * caixa alta e modalidades padrão quando omitidas.
 */
export function carregarPerfil(bruto: unknown): PerfilEmpresa {
  const problemas: string[] = [];
  const dados = (bruto ?? {}) as Record<string, unknown>;

  const texto = (campo: string, obrigatorio = true): string => {
    const valor = dados[campo];
    if (typeof valor !== 'string' || valor.trim().length === 0) {
      if (obrigatorio) problemas.push(`"${campo}" é obrigatório e deve ser texto`);
      return '';
    }
    return valor.trim();
  };

  const numero = (campo: string, padrao: number): number => {
    const valor = dados[campo];
    if (valor === undefined || valor === null) return padrao;
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
      problemas.push(`"${campo}" deve ser um número positivo`);
      return padrao;
    }
    return valor;
  };

  const razaoSocial = texto('razaoSocial');
  const cnpj = texto('cnpj').replace(/\D/g, '');
  if (cnpj.length > 0 && cnpj.length !== 14) {
    problemas.push('"cnpj" deve ter 14 dígitos');
  }

  const porteBruto = texto('porte', false).toLowerCase();
  let porte: PorteEmpresa = 'me';
  if ((PORTES as string[]).includes(porteBruto)) {
    porte = porteBruto as PorteEmpresa;
  } else {
    problemas.push(`"porte" deve ser um de: ${PORTES.join(', ')}`);
  }

  const uf = texto('uf').toUpperCase();
  if (uf.length > 0 && uf.length !== 2) {
    problemas.push('"uf" deve ser a sigla de duas letras');
  }

  const municipioIbge = texto('municipioIbge');
  if (municipioIbge.length > 0 && !/^\d{7}$/.test(municipioIbge)) {
    problemas.push('"municipioIbge" deve ser o código IBGE de 7 dígitos');
  }

  const municipiosRegiao = listaDeTexto(dados.municipiosRegiao, 'municipiosRegiao', problemas);
  for (const codigo of municipiosRegiao) {
    if (!/^\d{7}$/.test(codigo)) {
      problemas.push(`"municipiosRegiao" contém código IBGE inválido: ${codigo}`);
    }
  }

  const linhas = carregarLinhas(dados.linhas, problemas);

  const valorMinimo = numero('valorMinimo', 0);
  const valorMaximo = numero('valorMaximo', 80_000);
  if (valorMaximo <= valorMinimo) {
    problemas.push('"valorMaximo" deve ser maior que "valorMinimo"');
  }

  const modalidades = carregarModalidades(dados.modalidades, problemas);

  const diasMinimosPreparo = numero('diasMinimosPreparo', 3);
  if (diasMinimosPreparo < 1) {
    problemas.push('"diasMinimosPreparo" deve ser pelo menos 1');
  }

  if (problemas.length > 0) throw new PerfilInvalidoError(problemas);

  return {
    razaoSocial,
    cnpj,
    porte,
    uf,
    municipioIbge,
    municipiosRegiao,
    linhas,
    valorMinimo,
    valorMaximo,
    modalidades,
    diasMinimosPreparo,
  };
}

function listaDeTexto(valor: unknown, campo: string, problemas: string[]): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) {
    problemas.push(`"${campo}" deve ser uma lista`);
    return [];
  }
  return valor.map(String).map((s) => s.trim()).filter((s) => s.length > 0);
}

function carregarLinhas(valor: unknown, problemas: string[]): LinhaFornecimento[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    problemas.push('"linhas" precisa de ao menos uma linha de fornecimento');
    return [];
  }

  const linhas: LinhaFornecimento[] = [];
  valor.forEach((item, indice) => {
    const l = (item ?? {}) as Record<string, unknown>;
    const nome = typeof l.nome === 'string' ? l.nome.trim() : '';
    if (nome.length === 0) {
      problemas.push(`linhas[${indice}]: "nome" é obrigatório`);
    }

    const palavrasChave = listaDeTexto(l.palavrasChave, `linhas[${indice}].palavrasChave`, problemas);
    if (palavrasChave.length === 0) {
      problemas.push(`linhas[${indice}] ("${nome}"): precisa de ao menos uma palavra-chave`);
    }

    linhas.push({
      nome,
      palavrasChave,
      palavrasExcluidas: listaDeTexto(
        l.palavrasExcluidas,
        `linhas[${indice}].palavrasExcluidas`,
        problemas,
      ),
    });
  });

  return linhas;
}

/**
 * Sem modalidades declaradas, o padrão são as de entrada —
 * dispensa, pregão eletrônico e credenciamento. É a escolha
 * segura para quem está começando, e evita que o primeiro
 * relatório venha cheio de concorrência de obra pública.
 */
function carregarModalidades(valor: unknown, problemas: string[]): number[] {
  if (valor === undefined || valor === null) {
    return modalidadesDeEntrada().map((m) => m.codigo);
  }
  if (!Array.isArray(valor)) {
    problemas.push('"modalidades" deve ser uma lista de códigos numéricos');
    return [];
  }
  const codigos: number[] = [];
  for (const item of valor) {
    const codigo = Number(item);
    if (!Number.isInteger(codigo) || codigo < 1) {
      problemas.push(`"modalidades" contém código inválido: ${String(item)}`);
      continue;
    }
    codigos.push(codigo);
  }
  return codigos;
}
