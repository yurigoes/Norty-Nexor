import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PosseView } from '@norty-desk/shared';
import { assinaturaInvalida } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import type { DevolverAtivoDto, EntregarAtivoDto } from './dto';

const INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AssetHoldingInclude;

type PosseComPessoa = Prisma.AssetHoldingGetPayload<{ include: typeof INCLUDE }>;

/**
 * Quem está com o equipamento, e quem esteve antes.
 *
 * ## Por que isto não é um campo no ativo
 *
 * `Asset.userId` respondia "quem está com ele hoje" e esquecia todo o
 * resto. A pergunta que aparece quando some um notebook é outra: quem
 * estava com ele, desde quando, e assinou o quê. Um `UPDATE` no campo
 * apagava a única resposta que existia.
 *
 * O campo continua, porque a listagem filtra e ordena por ele — regra 7
 * do CLAUDE.md, campo derivado que só o serviço de domínio escreve. Quem
 * escreve é este arquivo, nas duas operações, dentro da mesma transação
 * que abre ou fecha a posse. O DTO do ativo perdeu `userId`: trocar de
 * mão passou a ter uma porta só, e a porta registra.
 *
 * ## O termo de compromisso
 *
 * A entrega aceita a assinatura desenhada, igual à ordem de serviço, e
 * guarda o PNG no armazenamento — não numa coluna em base64, porque o
 * traço de um dedo em tela de celular dá dezenas de kilobytes e o
 * histórico de um ativo carregaria todos eles.
 *
 * O nome de quem assina é gravado na hora, e não lido do cadastro na
 * emissão: o termo tem de dizer o que era verdade quando foi assinado.
 *
 * Entrega **sem** termo é permitida, e fica marcada como tal. Recusá-la
 * empurraria a entrega para fora do sistema — o equipamento sai na
 * mesma, e aí some do inventário também.
 */
@Injectable()
export class PosseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  async listar(usuario: UsuarioAutenticado, assetId: string): Promise<PosseView[]> {
    await this.exigirAtivo(usuario, assetId);

    const posses = await this.prisma.assetHolding.findMany({
      where: { assetId, organizationId: usuario.organizationId },
      include: INCLUDE,
      // A aberta primeiro, e depois as encerradas da mais recente para a
      // mais antiga: é a ordem em que a pergunta é feita.
      orderBy: { startedAt: 'desc' },
    });

    return posses.map(PosseService.paraView);
  }

  /**
   * Entrega o equipamento a alguém.
   *
   * A posse anterior é encerrada junto, na mesma transação. Sem isso
   * sobrariam duas abertas — e o banco recusaria a segunda, com um erro
   * de constraint que não explica nada a quem está na tela.
   */
  async entregar(
    usuario: UsuarioAutenticado,
    assetId: string,
    dto: EntregarAtivoDto,
  ): Promise<PosseView[]> {
    const ativo = await this.exigirAtivo(usuario, assetId);
    const pessoa = await this.exigirPessoa(usuario, dto.userId);

    const aberta = await this.prisma.assetHolding.findFirst({
      where: { assetId, endedAt: null },
      select: { id: true, userId: true },
    });

    if (aberta?.userId === dto.userId) {
      throw new ConflictException(`${pessoa.name} já está com este equipamento.`);
    }

    const chave = dto.signature ? await this.guardarAssinatura(ativo, dto.signature) : null;

    // Sem nome de quem assina não há termo: a imagem sozinha não diz de
    // quem é. Cair para o nome de quem recebe é o certo — é ela que
    // assina o termo de compromisso do próprio equipamento.
    const assinante = chave ? (dto.signedByName?.trim() || pessoa.name) : null;
    const agora = new Date();

    await this.prisma.$transaction([
      ...(aberta
        ? [
            this.prisma.assetHolding.update({
              where: { id: aberta.id },
              data: { endedAt: agora, returnedTo: 'EM_USO', notes: 'Passou direto a outra pessoa.' },
            }),
          ]
        : []),
      this.prisma.assetHolding.create({
        data: {
          organizationId: usuario.organizationId,
          assetId,
          userId: dto.userId,
          startedAt: agora,
          notes: dto.notes?.trim() || null,
          signatureKey: chave,
          signedByName: assinante,
          signedAt: chave ? agora : null,
        },
      }),
      // O ponteiro do ativo anda junto, na mesma transação. É o que
      // impede a listagem de discordar do histórico.
      this.prisma.asset.update({
        where: { id: assetId },
        data: { userId: dto.userId, status: 'EM_USO' },
      }),
    ]);

    return this.listar(usuario, assetId);
  }

  /**
   * O equipamento volta.
   *
   * `returnedTo` diz para onde: guardar ou descarte. Ele fica gravado na
   * posse, e não só no ativo — o ativo baixado hoje pode ter voltado
   * para o estoque na época, e o histórico tem de dizer o que era
   * verdade quando aconteceu.
   */
  async devolver(
    usuario: UsuarioAutenticado,
    assetId: string,
    dto: DevolverAtivoDto,
  ): Promise<PosseView[]> {
    await this.exigirAtivo(usuario, assetId);

    const aberta = await this.prisma.assetHolding.findFirst({
      where: { assetId, endedAt: null },
      select: { id: true },
    });

    if (!aberta) throw new ConflictException('Este equipamento não está com ninguém.');

    await this.prisma.$transaction([
      this.prisma.assetHolding.update({
        where: { id: aberta.id },
        data: {
          endedAt: new Date(),
          returnedTo: dto.returnedTo,
          notes: dto.notes?.trim() || null,
        },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { userId: null, status: dto.returnedTo },
      }),
    ]);

    return this.listar(usuario, assetId);
  }

  /** O PNG do termo assinado, para quem for imprimir ou conferir. */
  async assinatura(usuario: UsuarioAutenticado, holdingId: string): Promise<Buffer> {
    const posse = await this.prisma.assetHolding.findFirst({
      where: { id: holdingId, organizationId: usuario.organizationId },
      select: { signatureKey: true },
    });

    if (!posse?.signatureKey) throw new NotFoundException('Esta posse não tem termo assinado.');

    const fluxo = await this.armazenamento.ler(posse.signatureKey);
    const pedacos: Buffer[] = [];
    for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));
    return Buffer.concat(pedacos);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async guardarAssinatura(
    ativo: { id: string; organizationId: string },
    assinatura: string,
  ): Promise<string> {
    const problema = assinaturaInvalida(assinatura);
    if (problema) throw new BadRequestException(problema);

    const png = Buffer.from(assinatura.slice('data:image/png;base64,'.length), 'base64');
    const chave = `${ativo.organizationId}/termos/${ativo.id}/${randomUUID()}.png`;
    await this.armazenamento.guardar(chave, png, 'image/png');
    return chave;
  }

  private async exigirAtivo(usuario: UsuarioAutenticado, assetId: string) {
    const ativo = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: usuario.organizationId },
      select: { id: true, organizationId: true },
    });

    if (!ativo) throw new NotFoundException('Ativo não encontrado.');
    return ativo;
  }

  /**
   * A pessoa que vai ficar com o equipamento.
   *
   * Não precisa entrar na central: o cadastro de uso existe justamente
   * para quem assina o termo e não abre chamado. O que se exige é o
   * vínculo com a organização — um id vindo do corpo da requisição não
   * prova nada, e sem esta conferência dava para entregar o equipamento
   * a alguém de outra empresa e ler o nome dela no histórico.
   */
  private async exigirPessoa(usuario: UsuarioAutenticado, userId: string) {
    const pessoa = await this.prisma.user.findFirst({
      where: { id: userId, memberships: { some: { organizationId: usuario.organizationId } } },
      select: { id: true, name: true },
    });

    if (!pessoa) throw new BadRequestException('Pessoa não encontrada nesta organização.');
    return pessoa;
  }

  private static paraView(posse: PosseComPessoa): PosseView {
    return {
      id: posse.id,
      user: {
        kind: 'USER',
        id: posse.user.id,
        name: posse.user.name,
        email: posse.user.email,
      },
      startedAt: posse.startedAt.toISOString(),
      endedAt: posse.endedAt?.toISOString() ?? null,
      isCurrent: posse.endedAt === null,
      returnedTo: posse.returnedTo,
      notes: posse.notes,
      signedByName: posse.signedByName,
      signedAt: posse.signedAt?.toISOString() ?? null,
      hasSignature: posse.signatureKey !== null,
    };
  }
}
