import { Injectable, Logger } from '@nestjs/common';
import { JANELA_DE_FALHAS_SEGUNDOS, bloqueioProgressivo } from '@norty-desk/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Bloqueio progressivo por chave.
 *
 * Existe por causa do PIN de seis dígitos da carteira de clientes: um
 * milhão de combinações cai em minutos contra uma porta que não tranca
 * (`docs/13-carteira-e-campo.md`). A mesma escada serve à consulta
 * pública por protocolo, que é a outra porta sem sessão do produto.
 *
 * Conta **por conta e por IP**, separadamente. Só por conta, mil contas
 * seriam sondadas em paralelo sem nunca barrar ninguém; só por IP, um
 * ataque distribuído passa. As duas juntas fecham os dois caminhos.
 *
 * O estado mora no banco, e não em memória, porque a API roda em mais
 * de um processo: contagem em memória zera a cada reinício e não é
 * vista pelo processo vizinho — que é o mesmo que não contar.
 */
@Injectable()
export class ThrottleService {
  private readonly logger = new Logger(ThrottleService.name);

  constructor(private readonly prisma: PrismaService) {}

  static chaveDeConta(identificador: string): string {
    return `CONTA:${identificador.toLowerCase().trim()}`;
  }

  static chaveDeIp(ip: string): string {
    return `IP:${ip}`;
  }

  /** Segundos que faltam para liberar, ou 0 se está liberado. */
  async segundosBarrados(chaves: string[], agora = new Date()): Promise<number> {
    if (chaves.length === 0) return 0;

    const registros = await this.prisma.loginThrottle.findMany({
      where: { chave: { in: chaves }, bloqueadoAte: { gt: agora } },
      select: { bloqueadoAte: true },
    });

    let maior = 0;
    for (const r of registros) {
      if (!r.bloqueadoAte) continue;
      maior = Math.max(maior, Math.ceil((r.bloqueadoAte.getTime() - agora.getTime()) / 1000));
    }
    return maior;
  }

  /**
   * Registra uma falha em cada chave e devolve o maior bloqueio.
   *
   * A contagem recomeça depois de `JANELA_DE_FALHAS_SEGUNDOS` sem erro:
   * quem erra três vezes hoje e três daqui a um mês não é ataque, e
   * somar as seis o trataria como se fosse.
   */
  async registrarFalha(chaves: string[], agora = new Date()): Promise<number> {
    let maior = 0;

    for (const chave of chaves) {
      const atual = await this.prisma.loginThrottle.findUnique({ where: { chave } });

      const expirou =
        atual && agora.getTime() - atual.ultimaEm.getTime() > JANELA_DE_FALHAS_SEGUNDOS * 1000;
      const falhas = expirou || !atual ? 1 : atual.falhas + 1;

      const segundos = bloqueioProgressivo(falhas);
      const bloqueadoAte = segundos > 0 ? new Date(agora.getTime() + segundos * 1000) : null;

      await this.prisma.loginThrottle.upsert({
        where: { chave },
        create: { chave, falhas, ultimaEm: agora, bloqueadoAte },
        update: { falhas, ultimaEm: agora, bloqueadoAte },
      });

      if (segundos > 0) {
        this.logger.warn(`Chave ${chave} barrada por ${segundos}s após ${falhas} falhas.`);
      }
      maior = Math.max(maior, segundos);
    }

    return maior;
  }

  /** Acerto limpa a contagem: a escada é sobre erro seguido, não sobre uso. */
  async limpar(chaves: string[]): Promise<void> {
    if (chaves.length === 0) return;
    await this.prisma.loginThrottle.deleteMany({ where: { chave: { in: chaves } } });
  }
}
