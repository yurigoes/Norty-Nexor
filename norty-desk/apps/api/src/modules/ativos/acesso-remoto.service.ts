import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  tailscaleInvalido,
  type AcessoRemotoView,
  type SenhaRevelada,
} from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { cifrar, decifrar } from '../channels/segredos';
import type { EscreverAcessoRemotoDto } from './dto-acesso';

/**
 * Como se chega na máquina.
 *
 * Tailscale, VPN e acesso remoto ficam no equipamento porque é dele que
 * a pergunta é feita: o chamado chega dizendo "o notebook do financeiro
 * não conecta", e o técnico precisa do IP e da senha agora — não de uma
 * planilha compartilhada, que é onde essa informação costuma morar, sem
 * dono e sem registro de quem a leu.
 *
 * Três decisões sustentam isto, e nenhuma é opcional:
 *
 * 1. **A senha é cifrada em repouso** (AES-256-GCM, a mesma cifragem
 *    dos segredos de canal). Em texto claro, um dump do banco entrega
 *    o acesso remoto do parque inteiro de uma vez.
 * 2. **A senha não sai em carga nenhuma.** Nem na listagem, nem no
 *    detalhe do ativo, nem no chamado. Sai por uma rota só, que existe
 *    para isso.
 * 3. **Revelar fica na auditoria.** Quem revelou, de qual máquina e
 *    quando. É o que transforma "a senha vazou" numa pergunta com
 *    resposta.
 */
@Injectable()
export class AcessoRemotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async carregar(usuario: UsuarioAutenticado, assetId: string) {
    const ativo = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: usuario.organizationId },
      select: {
        id: true,
        name: true,
        tailscaleIp: true,
        vpnNotes: true,
        remoteAccessKind: true,
        remoteAccessId: true,
        remoteAccessSecret: true,
      },
    });

    if (!ativo) throw new NotFoundException('Equipamento não encontrado.');
    return ativo;
  }

  async obter(usuario: UsuarioAutenticado, assetId: string): Promise<AcessoRemotoView> {
    return AcessoRemotoService.paraVista(await this.carregar(usuario, assetId));
  }

  async salvar(
    usuario: UsuarioAutenticado,
    assetId: string,
    dto: EscreverAcessoRemotoDto,
  ): Promise<AcessoRemotoView> {
    const antes = await this.carregar(usuario, assetId);

    if (dto.tailscaleIp) {
      const problema = tailscaleInvalido(dto.tailscaleIp);
      if (problema) throw new BadRequestException(problema);
    }

    // Omitir a senha mantém a que está lá; `null` apaga. Sem essa
    // distinção, editar o IP apagaria a senha — a tela não a mostra, e
    // portanto não tem como reenviá-la.
    const senha =
      dto.remoteAccessSecret === undefined
        ? {}
        : { remoteAccessSecret: dto.remoteAccessSecret ? cifrar(dto.remoteAccessSecret) : null };

    const depois = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(dto.tailscaleIp === undefined ? {} : { tailscaleIp: dto.tailscaleIp || null }),
        ...(dto.vpnNotes === undefined ? {} : { vpnNotes: dto.vpnNotes || null }),
        ...(dto.remoteAccessKind === undefined
          ? {}
          : { remoteAccessKind: dto.remoteAccessKind ?? null }),
        ...(dto.remoteAccessId === undefined
          ? {}
          : { remoteAccessId: dto.remoteAccessId || null }),
        ...senha,
      },
      select: {
        id: true,
        name: true,
        tailscaleIp: true,
        vpnNotes: true,
        remoteAccessKind: true,
        remoteAccessId: true,
        remoteAccessSecret: true,
      },
    });

    // O diff da auditoria guarda **se** a senha mudou, nunca o valor:
    // uma trilha que registra segredos é um segundo lugar de onde eles
    // vazam, e esse não é nem cifrado.
    await this.auditoria.registrar(usuario, {
      action: 'ativo.acesso-remoto.alterado',
      entity: 'Asset',
      entityId: assetId,
      antes: AcessoRemotoService.paraAuditoria(antes),
      depois: AcessoRemotoService.paraAuditoria(depois),
    });

    return AcessoRemotoService.paraVista(depois);
  }

  /**
   * Revela a senha, uma vez, e deixa registrado.
   *
   * É a única porta por onde ela sai. Quem chamar aqui aparece na
   * auditoria com nome, máquina e hora — e é isso que transforma "a
   * senha vazou" numa pergunta que tem resposta.
   */
  async revelar(usuario: UsuarioAutenticado, assetId: string): Promise<SenhaRevelada> {
    const ativo = await this.carregar(usuario, assetId);

    if (!ativo.remoteAccessSecret) {
      throw new NotFoundException('Este equipamento não tem senha de acesso remoto guardada.');
    }

    await this.auditoria.registrar(usuario, {
      action: 'ativo.acesso-remoto.revelado',
      entity: 'Asset',
      entityId: assetId,
      // Sem `antes`/`depois`: nada mudou. O que importa registrar é
      // que aconteceu, e em qual máquina.
      depois: { equipamento: ativo.name },
    });

    try {
      return { secret: decifrar(ativo.remoteAccessSecret) };
    } catch {
      // Chave trocada ou ausente. Dizer "senha errada" mandaria o
      // técnico redigitar a senha da máquina; o problema é de
      // configuração do servidor, e a mensagem tem de dizer isso.
      throw new BadRequestException(
        'A senha está guardada mas não pôde ser decifrada. ' +
          'Confira a chave de segredos do servidor (CHANNEL_SECRET_KEY).',
      );
    }
  }

  private static paraVista(a: {
    tailscaleIp: string | null;
    vpnNotes: string | null;
    remoteAccessKind: string | null;
    remoteAccessId: string | null;
    remoteAccessSecret: string | null;
  }): AcessoRemotoView {
    return {
      tailscaleIp: a.tailscaleIp,
      vpnNotes: a.vpnNotes,
      remoteAccessKind: a.remoteAccessKind as AcessoRemotoView['remoteAccessKind'],
      remoteAccessId: a.remoteAccessId,
      temSenha: a.remoteAccessSecret !== null,
    };
  }

  /** O que a trilha guarda: tudo menos o segredo. */
  private static paraAuditoria(a: {
    tailscaleIp: string | null;
    vpnNotes: string | null;
    remoteAccessKind: string | null;
    remoteAccessId: string | null;
    remoteAccessSecret: string | null;
  }): Record<string, unknown> {
    return {
      tailscaleIp: a.tailscaleIp,
      vpnNotes: a.vpnNotes,
      remoteAccessKind: a.remoteAccessKind,
      remoteAccessId: a.remoteAccessId,
      temSenha: a.remoteAccessSecret !== null,
    };
  }
}
