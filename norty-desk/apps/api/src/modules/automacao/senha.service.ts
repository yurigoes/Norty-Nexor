import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ConviteDeSenha } from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ThrottleService } from '../../common/throttle/throttle.service';
import { AuthService } from '../auth/auth.service';
import { AutomacaoService } from './automacao.service';

/**
 * A troca de senha pelo link.
 *
 * É a terceira porta sem sessão do produto, junto do PIN da carteira e
 * da consulta por protocolo — e a mais valiosa das três, porque quem a
 * atravessa entra como a pessoa. Por isso ela carrega as mesmas
 * proteções e mais uma.
 *
 * O que o token consegue: **trocar a senha daquela pessoa, uma vez, em
 * quinze minutos**. Não lê chamado, não diz quem é a pessoa antes da
 * hora (o nome só volta quando o token confere) e não sobrevive ao uso.
 */
@Injectable()
export class SenhaService {
  private readonly logger = new Logger(SenhaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: ThrottleService,
  ) {}

  /**
   * O convite ainda vale?
   *
   * Uma resposta só para expirado, já usado e inexistente. Distinguir
   * os três contaria a quem tem o link o que aconteceu com ele — e quem
   * tem o link pode não ser o dono. "Não vale mais" basta para a pessoa
   * certa saber que precisa pedir outro.
   */
  async convite(token: string, ip: string): Promise<ConviteDeSenha> {
    const barrado = await this.throttle.segundosBarrados([ThrottleService.chaveDeIp(ip)]);
    if (barrado > 0) return { valido: false, nome: null };

    const linha = await this.buscar(token);

    if (!linha) {
      await this.contarSeForChute(token, ip);
      return { valido: false, nome: null };
    }

    return { valido: true, nome: linha.user.name };
  }

  /**
   * Troca a senha e queima o link.
   *
   * Tudo numa transação: marcar o uso e gravar a senha nova têm de
   * acontecer juntos. Separados, um erro no meio deixaria a senha
   * trocada com o link ainda válido — ou o link queimado com a senha
   * velha, que é o caso em que a pessoa fica de fora.
   */
  async definir(token: string, nova: string, ip: string): Promise<void> {
    const barrado = await this.throttle.segundosBarrados([ThrottleService.chaveDeIp(ip)]);
    if (barrado > 0) {
      throw new BadRequestException(`Muitas tentativas. Tente de novo em ${barrado} segundos.`);
    }

    const linha = await this.buscar(token);

    if (!linha) {
      await this.contarSeForChute(token, ip);
      throw new BadRequestException(
        'Este link não vale mais. Peça outro pelo chamado de troca de senha.',
      );
    }

    const passwordHash = await AuthService.hashDeSenha(nova);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: linha.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: linha.userId },
        // `mustChangePassword: false`: a pessoa acabou de escolher a
        // senha dela. Pedir para trocar de novo no primeiro login seria
        // não ter entendido o que acabou de acontecer.
        data: { passwordHash, mustChangePassword: false },
      }),
      // Toda sessão aberta cai. Se a troca aconteceu porque alguém
      // entrou na conta, manter a sessão dele viva anularia a troca.
      this.prisma.refreshToken.updateMany({
        where: { userId: linha.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.throttle.limpar([ThrottleService.chaveDeIp(ip)]);
    this.logger.log(`Senha trocada pelo link (usuário ${linha.userId}).`);
  }

  /**
   * Conta a tentativa **só quando o token nunca existiu**.
   *
   * Sem a escada, a porta aceita tentativa ilimitada de adivinhar 32
   * bytes — não é um espaço que se varra, mas a escada custa uma
   * consulta. Com ela contando também o link expirado, a pessoa certa
   * que clica duas vezes num link velho e pede outro fica bloqueada
   * pelo próprio sistema. Expirado e já usado são erros de quem tem o
   * link; só o token desconhecido é chute.
   */
  private async contarSeForChute(token: string, ip: string): Promise<void> {
    const existe = await this.prisma.passwordResetToken.count({
      where: { tokenHash: AutomacaoService.hash(token.trim()) },
    });
    if (existe === 0) await this.throttle.registrarFalha([ThrottleService.chaveDeIp(ip)]);
  }

  /** O token que confere, não expirou e não foi usado. */
  private async buscar(token: string) {
    const texto = token.trim();
    if (texto.length < 16) return null;

    const linha = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: AutomacaoService.hash(texto) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { name: true, isActive: true } },
      },
    });

    if (!linha) return null;
    if (linha.usedAt) return null;
    if (linha.expiresAt <= new Date()) return null;
    // A conta pode ter sido desativada entre o envio e o clique.
    if (!linha.user.isActive) return null;

    return linha;
  }
}
