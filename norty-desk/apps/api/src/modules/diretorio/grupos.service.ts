import { Injectable, Logger } from '@nestjs/common';
import { grupoCasa } from '@norty-desk/shared';
import type { AuthSource, Role } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

/** O que a sincronização mudou. Vira log, e é o que o teste confere. */
export type ResultadoDoMapa = {
  grupos: number;
  timesEntrou: string[];
  timesSaiu: string[];
  papel: Role | null;
  papelAnterior: Role | null;
};

/**
 * O grupo do diretório virando time e papel.
 *
 * É o `RuleRight` do GLPI, e roda **a cada login** — pelo mesmo motivo
 * que lá: o AD é a fonte da verdade sobre quem é de qual equipe, e uma
 * sincronização que só rodasse no primeiro acesso seria um retrato do
 * dia em que a pessoa entrou.
 *
 * ## O que faz isto prestar: revogar
 *
 * Conceder é fácil; o difícil é tirar. Sair do grupo no AD tem de tirar
 * do time e devolver o papel — senão o mapa vira uma catraca que só gira
 * para um lado, e a pessoa que mudou de área continua vendo a fila da
 * área antiga.
 *
 * E tirar tem um risco igual e oposto: apagar o que ninguém pediu para
 * apagar. Quem atrelou alguém a um time pela tela não quer que a próxima
 * varredura do AD desfaça aquilo.
 *
 * A saída é a mesma do inventário (`managedByAgent`): **o diretório só
 * mexe no que é dele.** `TeamMember.managedByDirectory` e
 * `Membership.roleFromDirectory` marcam o que o mapa concedeu, e é só
 * isso que o mapa retira.
 *
 * ## O que ele não faz
 *
 * Não cria time nem papel: o mapa aponta para o que já existe. Um mapa
 * cujo time foi apagado some junto (cascata), porque mapa apontando para
 * nada é regra que não casa e ninguém entende.
 */
@Injectable()
export class GruposDoDiretorioService {
  private readonly log = new Logger(GruposDoDiretorioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aplica os mapas da fonte sobre uma pessoa recém-autenticada.
   *
   * `grupos` é o que o diretório respondeu. Lista vazia é "a pessoa não
   * está em grupo nenhum" — e isso **revoga**, de propósito. Quem chama
   * só chega aqui quando a leitura deu certo; queda do diretório lança
   * antes, e aí ninguém perde time nenhum.
   */
  async aplicar(
    fonte: AuthSource,
    userId: string,
    organizationId: string,
    grupos: string[],
  ): Promise<ResultadoDoMapa | null> {
    const mapas = await this.prisma.directoryGroupMap.findMany({
      where: { authSourceId: fonte.id, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { group: true, teamId: true, isTeamManager: true, role: true },
    });

    // Fonte sem mapa nenhum não mexe em nada. É o estado de quem ainda
    // não configurou, e tratá-lo como "nenhum grupo casou" rebaixaria
    // todo mundo ao papel padrão no primeiro login depois da atualização.
    if (mapas.length === 0) return null;

    const casaram = mapas.filter((m) => grupos.some((g) => grupoCasa(m.group, g)));

    const resultado: ResultadoDoMapa = {
      grupos: grupos.length,
      timesEntrou: [],
      timesSaiu: [],
      papel: null,
      papelAnterior: null,
    };

    await this.prisma.$transaction(async (tx) => {
      // --- Times -----------------------------------------------------
      //
      // O que os mapas que casaram concedem. O mesmo time em dois mapas
      // é um time só, e basta um deles dar gerência para valer.
      const desejados = new Map<string, boolean>();
      for (const m of casaram) {
        if (!m.teamId) continue;
        desejados.set(m.teamId, (desejados.get(m.teamId) ?? false) || m.isTeamManager);
      }

      const atuais = await tx.teamMember.findMany({
        where: { userId, team: { organizationId } },
        select: { teamId: true, isManager: true, managedByDirectory: true },
      });

      const porTime = new Map(atuais.map((a) => [a.teamId, a]));

      for (const [teamId, gerente] of desejados) {
        const atual = porTime.get(teamId);

        if (!atual) {
          await tx.teamMember.create({
            data: { teamId, userId, isManager: gerente, managedByDirectory: true },
          });
          resultado.timesEntrou.push(teamId);
          continue;
        }

        // Já está no time. Se entrou à mão, o diretório **não** assume a
        // linha: assumir faria a próxima saída do grupo apagar o que
        // alguém tinha atrelado de propósito.
        if (!atual.managedByDirectory) continue;

        if (atual.isManager !== gerente) {
          await tx.teamMember.update({
            where: { teamId_userId: { teamId, userId } },
            data: { isManager: gerente },
          });
        }
      }

      // E sai dos que o diretório pôs e nenhum mapa concede mais.
      const sobrando = atuais.filter((a) => a.managedByDirectory && !desejados.has(a.teamId));

      for (const fora of sobrando) {
        await tx.teamMember.delete({
          where: { teamId_userId: { teamId: fora.teamId, userId } },
        });
        resultado.timesSaiu.push(fora.teamId);
      }

      // --- Papel -----------------------------------------------------
      //
      // Vence o primeiro mapa que casa e tem papel — ordem explícita, em
      // vez de "o papel mais forte", que exigiria inventar uma escada
      // entre papéis que não se comparam (ver o schema).
      const concedido = casaram.find((m) => m.role)?.role ?? null;

      const vinculo = await tx.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true, roleFromDirectory: true },
      });

      if (!vinculo) return;

      resultado.papelAnterior = vinculo.role;

      if (concedido) {
        resultado.papel = concedido;

        if (vinculo.role !== concedido || !vinculo.roleFromDirectory) {
          await tx.membership.update({
            where: { userId_organizationId: { userId, organizationId } },
            data: { role: concedido, roleFromDirectory: true },
          });
        }
        return;
      }

      // Nenhum mapa concede papel. O que o diretório deu, o diretório
      // devolve ao padrão da fonte; o que alguém deu à mão fica.
      if (vinculo.roleFromDirectory && vinculo.role !== fonte.defaultRole) {
        await tx.membership.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { role: fonte.defaultRole },
        });
        resultado.papel = fonte.defaultRole;
      }
    });

    if (resultado.timesEntrou.length || resultado.timesSaiu.length || resultado.papel) {
      this.log.log(
        `Mapa de grupo (${fonte.name}) em ${userId}: ${resultado.grupos} grupo(s), ` +
          `+${resultado.timesEntrou.length} time(s), -${resultado.timesSaiu.length}, ` +
          `papel ${resultado.papelAnterior} → ${resultado.papel ?? resultado.papelAnterior}.`,
      );
    }

    return resultado;
  }
}
