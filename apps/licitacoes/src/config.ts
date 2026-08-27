/* =========================================================
   Nexor Licitações — Carregamento do perfil
   ---------------------------------------------------------
   O perfil vem de um arquivo JSON, não de variáveis de ambiente:
   ele tem listas aninhadas, muda com frequência e o usuário
   precisa conseguir editá-lo à mão sem escapar aspas.

   Erro de leitura é fatal e explícito. Um perfil quebrado que
   silenciosamente vira "perfil vazio" produziria um radar que
   roda todo dia e nunca acha nada — falha que se confunde com
   ausência de oportunidade.
   ========================================================= */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type PerfilEmpresa, PerfilInvalidoError, carregarPerfil } from '@nexor/licitacoes-shared';

export const CAMINHO_PADRAO = 'perfil.json';

export class ErroDeConfiguracao extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeConfiguracao';
  }
}

export async function lerPerfil(caminho = CAMINHO_PADRAO): Promise<PerfilEmpresa> {
  const absoluto = resolve(caminho);

  let conteudo: string;
  try {
    conteudo = await readFile(absoluto, 'utf8');
  } catch (erro) {
    const causa = (erro as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'não existe' : 'não pôde ser lido';
    throw new ErroDeConfiguracao(
      `O arquivo de perfil ${absoluto} ${causa}.\n` +
        'Copie perfil.exemplo.json para perfil.json e ajuste com os dados da sua empresa.',
    );
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch (erro) {
    throw new ErroDeConfiguracao(
      `${absoluto} não é um JSON válido: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  try {
    return carregarPerfil(bruto);
  } catch (erro) {
    if (erro instanceof PerfilInvalidoError) {
      throw new ErroDeConfiguracao(`${absoluto} tem problemas:\n  - ${erro.problemas.join('\n  - ')}`);
    }
    throw erro;
  }
}
