import { Injectable, Logger } from '@nestjs/common';
import { canonizarSistemaOperacional, chaveDeSistemaOperacional } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/** O que o dicionário conclui de um caption. */
export type SistemaClassificado = { produto: string | null; edicao: string | null };

const NADA: SistemaClassificado = { produto: null, edicao: null };

/**
 * De um `Win32_OperatingSystem.Caption` para produto e edição.
 *
 * O terceiro dicionário, e o que tem forma diferente dos outros dois.
 * Fabricante e modelo resolvem para uma **linha** do catálogo; aqui não
 * há linha, porque `Asset.osName`/`osVersion` são colunas por decisão
 * (ver o schema): nada consulta um sistema operacional por id, e criar
 * as três tabelas que o GLPI tem — sistema, versão, edição — seria
 * esquema para não ganhar consulta nenhuma.
 *
 * Então o alvo da regra são **dois campos**, e é isso que o GLPI chama
 * de dicionário e é de fato: reescrita na entrada.
 *
 * Duas camadas:
 *
 * 1. **`canonizarSistemaOperacional`**, que cobre o parque real —
 *    "Microsoft Windows 11 Pro" e "Windows 11 Pro" na mesma linha,
 *    "Professional" e "Pro" na mesma edição, e o build que separa o 10
 *    do 11 quando o caption erra.
 * 2. **O que a casa ensinou.** É o que nenhuma regra de texto cobre: a
 *    máquina instalada em francês diz "Microsoft Windows 10
 *    Professionnel".
 *
 * A segunda **vence** a primeira. Quem ensinou sabe mais que a regra, e
 * um dicionário que a função pudesse contradizer não serviria para
 * corrigir nada.
 */
@Injectable()
export class DicionarioDeSistemaOperacional {
  private readonly logger = new Logger(DicionarioDeSistemaOperacional.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O produto e a edição que este caption quer dizer.
   *
   * Nunca falha e nunca cria linha: o pior caso é devolver o caption
   * limpo como produto, o que é sempre melhor que perdê-lo.
   */
  async resolver(
    organizationId: string,
    caption: string | null | undefined,
    versao?: string | null,
  ): Promise<SistemaClassificado> {
    const canonico = canonizarSistemaOperacional(caption, versao);
    if (!canonico) return NADA;

    const regra = await this.prisma.operatingSystemAlias.findUnique({
      where: { organizationId_alias: { organizationId, alias: canonico.chave } },
      select: { product: true, edition: true },
    });

    if (regra) return { produto: regra.product, edicao: regra.edition };

    return { produto: canonico.produto, edicao: canonico.edicao };
  }

  /**
   * Reaplica o dicionário sobre o parque inteiro.
   *
   * Existe por duas razões que são a mesma:
   *
   * - **Ensinar um apelido não muda nada sozinho.** As máquinas já
   *   varridas estão classificadas pela regra antiga, e a próxima
   *   varredura pode demorar dias — ou nunca vir, se a máquina saiu de
   *   operação. Sem esta porta, o dicionário só valeria para o futuro.
   * - **As colunas nasceram nulas na migração.** Reduzir caption a
   *   produto é função de `packages/shared`; fazê-lo em SQL daria uma
   *   segunda verdade. Quem preenche é esta função, rodando de verdade.
   *
   * Só grava o que mudou: a varredura é do parque todo, e reescrever
   * linha idêntica é `UPDATE` que a trilha de auditoria do Postgres paga
   * sem ninguém ganhar nada.
   */
  async reclassificar(organizationId: string): Promise<{ lidos: number; mudados: number }> {
    const [maquinas, regras] = await Promise.all([
      this.prisma.asset.findMany({
        where: { organizationId, osName: { not: null } },
        select: { id: true, osName: true, osVersion: true, osProduct: true, osEdition: true },
      }),
      this.prisma.operatingSystemAlias.findMany({
        where: { organizationId },
        select: { alias: true, product: true, edition: true },
      }),
    ]);

    // As regras vêm de uma vez: uma consulta por máquina faria o parque
    // de mil equipamentos virar mil idas ao banco para ler uma tabela de
    // dez linhas.
    const porChave = new Map(regras.map((r) => [r.alias, r]));

    // Agrupado pelo destino, não uma gravação por máquina. Um parque de
    // mil equipamentos costuma ter meia dúzia de sistemas diferentes, e
    // a diferença é entre seis `UPDATE ... IN (...)` e mil idas ao banco
    // — numa função que roda a cada regra escrita.
    const porDestino = new Map<string, { produto: string | null; edicao: string | null; ids: string[] }>();

    for (const maquina of maquinas) {
      const canonico = canonizarSistemaOperacional(maquina.osName, maquina.osVersion);
      const regra = canonico ? porChave.get(canonico.chave) : undefined;

      const produto = regra ? regra.product : (canonico?.produto ?? null);
      const edicao = regra ? regra.edition : (canonico?.edicao ?? null);

      // Só o que mudou: reescrever linha idêntica é `UPDATE` que o
      // Postgres paga — nova versão da tupla, índice reescrito — sem
      // ninguém ganhar nada.
      if (produto === maquina.osProduct && edicao === maquina.osEdition) continue;

      const chave = `${produto ?? ''}\u0000${edicao ?? ''}`;
      const grupo = porDestino.get(chave);

      if (grupo) grupo.ids.push(maquina.id);
      else porDestino.set(chave, { produto, edicao, ids: [maquina.id] });
    }

    let mudados = 0;

    for (const grupo of porDestino.values()) {
      const { count } = await this.prisma.asset.updateMany({
        where: { organizationId, id: { in: grupo.ids } },
        data: { osProduct: grupo.produto, osEdition: grupo.edicao },
      });

      mudados += count;
    }

    this.logger.log(`Reclassificação de SO: ${maquinas.length} lida(s), ${mudados} mudada(s).`);

    return { lidos: maquinas.length, mudados };
  }

  /** A chave pela qual um caption é procurado. Para a tela e os testes. */
  static chaveDe(caption: string): string {
    return chaveDeSistemaOperacional(caption);
  }
}
