import { Injectable } from '@nestjs/common';
import { canonizarFabricante } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * De um nome escrito de qualquer jeito para o fabricante do catálogo.
 *
 * O agente de inventário manda o que o SMBIOS tiver: "Dell Inc." numa
 * máquina, "DELL" na outra, "Hewlett-Packard" na de 2014 e "HP" na de
 * 2020. Sem dicionário isso vira uma linha por grafia, e o relatório de
 * parque por fabricante — que é a razão de o campo existir — conta a
 * mesma empresa quatro vezes. O agente é justamente quem produziria a
 * sujeira mais rápido: uma linha por máquina varrida.
 *
 * Três camadas, nesta ordem:
 *
 * 1. **A chave do texto.** `chaveDeFabricante` tira caixa, acento,
 *    pontuação e forma jurídica. Resolve sozinha a maior parte.
 * 2. **A lista de fabricantes conhecidos**, em `packages/shared`. É o
 *    que nenhuma regra de texto descobre: que "Hewlett-Packard" é HP.
 * 3. **O que a casa ensinou**, na tabela. Entra por junção de cadastros
 *    duplicados e pelo apelido que alguém acrescenta na tela.
 *
 * Fica separado do CRUD do catálogo porque o inventário depende dele e
 * não do CRUD — e um serviço que só lê e resolve não precisa arrastar a
 * auditoria e as regras de remoção junto.
 */
@Injectable()
export class DicionarioDeFabricante {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O fabricante que este texto quer dizer, criando-o se não existir.
   *
   * `null` quando o texto não tem chave nenhuma — nome que era só
   * pontuação não é fabricante, e criar uma linha para ele seria
   * sujeira com outro nome.
   */
  async resolver(organizationId: string, texto: string | null | undefined): Promise<string | null> {
    const canonico = canonizarFabricante(texto ?? '');
    if (!canonico) return null;

    const achado = await this.procurar(organizationId, canonico.chave, canonico.chaveCanonica);
    if (achado) return achado;

    try {
      const criado = await this.prisma.manufacturer.create({
        data: { organizationId, name: canonico.nome },
        select: { id: true },
      });

      await this.ensinar(organizationId, criado.id, [canonico.chave, canonico.chaveCanonica]);
      return criado.id;
    } catch {
      // Duas máquinas varrendo ao mesmo tempo: as duas leem "não
      // existe" e as duas criam. A segunda bate no índice único, e a
      // resposta certa é procurar de novo — não falhar a varredura por
      // causa do nome de um fabricante.
      return this.procurar(organizationId, canonico.chave, canonico.chaveCanonica);
    }
  }

  /**
   * O fabricante já cadastrado que responde por este texto.
   *
   * Sem criar nada: é o que a tela consulta antes de aceitar um
   * cadastro novo, para recusar "Hewlett-Packard" dizendo que ele já se
   * chama HP aqui.
   */
  async procurarPorTexto(organizationId: string, texto: string): Promise<string | null> {
    const canonico = canonizarFabricante(texto);
    if (!canonico) return null;

    return this.procurar(organizationId, canonico.chave, canonico.chaveCanonica);
  }

  /**
   * Grava apelidos, ignorando os que já são de alguém.
   *
   * Ignorar e não falhar é deliberado: a chave já pertencer a outro
   * fabricante é informação para a tela de junção, não motivo para
   * derrubar a varredura que estava só passando por aqui.
   */
  async ensinar(
    organizationId: string,
    manufacturerId: string,
    chaves: readonly string[],
  ): Promise<void> {
    const limpas = [...new Set(chaves.filter(Boolean))];
    if (limpas.length === 0) return;

    await this.prisma.manufacturerAlias.createMany({
      data: limpas.map((alias) => ({ organizationId, manufacturerId, alias })),
      skipDuplicates: true,
    });
  }

  /** As chaves que um fabricante com este nome reivindica. */
  static chavesDe(nome: string): string[] {
    const canonico = canonizarFabricante(nome);
    if (!canonico) return [];
    return [...new Set([canonico.chave, canonico.chaveCanonica])];
  }

  // -------------------------------------------------------------------

  private async procurar(
    organizationId: string,
    chave: string,
    chaveCanonica: string,
  ): Promise<string | null> {
    const chaves = [...new Set([chave, chaveCanonica])];

    const apelido = await this.prisma.manufacturerAlias.findFirst({
      where: { organizationId, alias: { in: chaves } },
      select: { manufacturerId: true },
    });

    if (apelido) return apelido.manufacturerId;

    return this.adotarCadastroAntigo(organizationId, chaves);
  }

  /**
   * O fabricante que já existia antes de o dicionário existir.
   *
   * A migração não carregou dado nenhum de propósito: reduzir nome a
   * chave é a função de `packages/shared`, e reescrevê-la em SQL daria
   * uma segunda verdade que envelhece sozinha. Em vez disso o cadastro
   * antigo é adotado na primeira consulta que o encontrar, e sai daqui
   * com os apelidos gravados — então esta varredura da lista acontece
   * uma vez por fabricante, não uma por máquina.
   *
   * A lista é dezenas de linhas por organização. Se um dia for milhares,
   * o lugar da chave é uma coluna derivada no fabricante, não um índice
   * a mais aqui.
   */
  private async adotarCadastroAntigo(
    organizationId: string,
    chaves: string[],
  ): Promise<string | null> {
    const todos = await this.prisma.manufacturer.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });

    const alvo = todos.find((f) => {
      const canonico = canonizarFabricante(f.name);
      if (!canonico) return false;
      return chaves.includes(canonico.chave) || chaves.includes(canonico.chaveCanonica);
    });

    if (!alvo) return null;

    await this.ensinar(organizationId, alvo.id, [
      ...DicionarioDeFabricante.chavesDe(alvo.name),
      ...chaves,
    ]);

    return alvo.id;
  }
}
