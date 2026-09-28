import { Injectable } from '@nestjs/common';
import { canonizarModelo, chaveDeModelo } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * De um nome de modelo escrito de qualquer jeito para a linha do catálogo.
 *
 * Irmão de `DicionarioDeFabricante`, e pelo mesmo motivo: o agente manda
 * o que o SMBIOS tiver, e o SMBIOS não combina as pontas. A mesma
 * máquina que reporta `Manufacturer` = "Hewlett-Packard" reporta
 * `Model` = "HP EliteBook 840 G8 Notebook PC" — com o fabricante colado
 * na frente e um sufixo que não distingue nada. Quem cadastra na tela
 * escreve "EliteBook 840 G8". São dois cadastros para um equipamento.
 *
 * Três camadas, na mesma ordem do fabricante:
 *
 * 1. **A chave do texto** (`chaveDeModelo`): tira caixa, pontuação, o
 *    fabricante da frente e o sufixo de gabinete genérico.
 * 2. **O filtro de lixo** (`modeloUtil`): "System Product Name" e "To
 *    Be Filled By O.E.M." não são modelos, e sem isto cada máquina
 *    branca criava uma linha com o nome de um campo vazio.
 * 3. **O que a casa ensinou**, na tabela de apelidos.
 *
 * A terceira camada é a que aqui pesa mais que no fabricante, e é a
 * razão de a tabela existir: **a Lenovo não manda o nome do produto.**
 * `Win32_ComputerSystem.Model` devolve "20XW00AABR"; o nome comercial
 * está em `Win32_ComputerSystemProduct.Version`, que nem toda máquina
 * preenche. Nenhuma regra de texto descobre que "20XW00AABR" é um
 * ThinkPad T14 Gen 2 — só alguém que sabe pode ensinar.
 */
@Injectable()
export class DicionarioDeModelo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O modelo que este texto quer dizer, criando-o se não existir.
   *
   * O fabricante entra como **par**: o id para gravar na linha nova, e o
   * texto para a chave. Os dois, e não só o id, porque a chave é
   * calculada em `packages/shared` a partir do nome — e ir buscar o nome
   * pelo id seria uma consulta a mais para chegar ao mesmo lugar.
   *
   * `null` quando o texto não informa modelo nenhum.
   */
  async resolver(
    organizationId: string,
    texto: string | null | undefined,
    fabricante: { id: string | null; texto: string | null | undefined },
  ): Promise<string | null> {
    const canonico = canonizarModelo(texto, fabricante.texto);
    if (!canonico) return null;

    const achado = await this.procurar(organizationId, canonico.chave);
    if (achado) return achado;

    try {
      const criado = await this.prisma.assetModel.create({
        // O fabricante vai junto. Antes o modelo nascia órfão mesmo com
        // o fabricante resolvido na mesma requisição, e o catálogo ficava
        // com "EliteBook 840 G8" sem marca — o que obriga alguém a
        // adivinhar depois, e é adivinhação que o dicionário evita.
        data: { organizationId, name: canonico.nome, manufacturerId: fabricante.id },
        select: { id: true },
      });

      await this.ensinar(organizationId, criado.id, [canonico.chave]);
      return criado.id;
    } catch {
      // Duas máquinas varrendo ao mesmo tempo: as duas leem "não
      // existe" e as duas criam. A segunda bate no índice único, e a
      // resposta certa é procurar de novo — não falhar a varredura por
      // causa do nome de um modelo.
      return this.procurar(organizationId, canonico.chave);
    }
  }

  /**
   * O modelo já cadastrado que responde por este texto, sem criar nada.
   *
   * É o que a tela consulta antes de aceitar um apelido, para recusar o
   * que já é de outro modelo.
   */
  async procurarPorTexto(
    organizationId: string,
    texto: string,
    fabricante?: string | null,
  ): Promise<string | null> {
    const canonico = canonizarModelo(texto, fabricante);
    if (!canonico) return null;

    return this.procurar(organizationId, canonico.chave);
  }

  /** Grava apelidos, ignorando os que já são de alguém. */
  async ensinar(
    organizationId: string,
    assetModelId: string,
    chaves: readonly string[],
  ): Promise<void> {
    const limpas = [...new Set(chaves.filter(Boolean))];
    if (limpas.length === 0) return;

    await this.prisma.assetModelAlias.createMany({
      data: limpas.map((alias) => ({ organizationId, assetModelId, alias })),
      skipDuplicates: true,
    });
  }

  /**
   * As chaves que um modelo com este nome reivindica.
   *
   * Duas quando o fabricante é conhecido: com o prefixo tirado e sem
   * tirar. A segunda cobre o modelo cujo nome cadastrado **começa** pelo
   * nome do fabricante de propósito ("HP Compaq 6200"), caso em que o
   * agente pode mandar as duas formas.
   */
  static chavesDe(nome: string, fabricante?: string | null): string[] {
    const chaves = [chaveDeModelo(nome, fabricante), chaveDeModelo(nome)];
    return [...new Set(chaves.filter(Boolean))];
  }

  // -------------------------------------------------------------------

  private async procurar(organizationId: string, chave: string): Promise<string | null> {
    const apelido = await this.prisma.assetModelAlias.findFirst({
      where: { organizationId, alias: chave },
      select: { assetModelId: true },
    });

    if (apelido) return apelido.assetModelId;

    return this.adotarCadastroAntigo(organizationId, chave);
  }

  /**
   * O modelo que já existia antes de o dicionário existir.
   *
   * Mesma escolha do fabricante: a migração não carregou dado nenhum,
   * porque reduzir nome a chave é função de `packages/shared` e
   * reescrevê-la em SQL daria uma segunda verdade que envelhece sozinha.
   * O cadastro antigo é adotado na primeira consulta que o encontrar e
   * sai daqui com os apelidos gravados — então esta varredura acontece
   * uma vez por modelo, não uma por máquina.
   */
  private async adotarCadastroAntigo(
    organizationId: string,
    chave: string,
  ): Promise<string | null> {
    const todos = await this.prisma.assetModel.findMany({
      where: { organizationId },
      select: { id: true, name: true, manufacturer: { select: { name: true } } },
    });

    const alvo = todos.find((m) =>
      DicionarioDeModelo.chavesDe(m.name, m.manufacturer?.name).includes(chave),
    );

    if (!alvo) return null;

    await this.ensinar(organizationId, alvo.id, [
      ...DicionarioDeModelo.chavesDe(alvo.name, alvo.manufacturer?.name),
      chave,
    ]);

    return alvo.id;
  }
}
