import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PosseView, TermKind, TrocaResponse } from '@norty-desk/shared';
import { assinaturaInvalida, deClientesDiferentes } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { DevolverAtivoDto, EntregarAtivoDto, TrocarAtivoDto } from './dto';
import { SELECT_DO_ATIVO, TermosService, type DadosDoTermo } from './termos.service';

const INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  terms: { orderBy: { signedAt: 'asc' } },
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
 * ## Os papéis
 *
 * A entrega gera o **termo de compromisso**; a devolução com dano gera
 * o **termo de quebra**. Os dois nascem com o texto já renderizado e
 * congelado (ver `TermosService`): o que a pessoa assinou não muda
 * quando a casa edita a redação.
 *
 * A assinatura desenhada segue o caminho da ordem de serviço — o PNG
 * vai para o armazenamento, não para uma coluna em base64, porque o
 * traço de um dedo em tela de celular dá dezenas de kilobytes e o
 * histórico de um ativo carregaria todos eles.
 *
 * Entrega **sem** termo é permitida, e fica marcada como tal. Recusá-la
 * empurraria a entrega para fora do sistema — o equipamento sai na
 * mesma, e aí some do inventário também.
 */
@Injectable()
export class PosseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly termos: TermosService,
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
    const pessoa = await this.exigirPessoa(usuario, dto.userId, ativo.clientId);

    const aberta = await this.prisma.assetHolding.findFirst({
      where: { assetId, endedAt: null },
      select: { id: true, userId: true },
    });

    if (aberta?.userId === dto.userId) {
      throw new ConflictException(`${pessoa.name} já está com este equipamento.`);
    }

    const agora = new Date();
    const chave = dto.signature ? await this.guardarAssinatura(ativo, dto.signature) : null;

    // Sem nome de quem assina não há termo: a imagem sozinha não diz de
    // quem é. Cair para o nome de quem recebe é o certo — é ela que
    // assina o compromisso do próprio equipamento.
    const assinante = chave ? dto.signedByName?.trim() || pessoa.name : null;

    // O texto sai renderizado **antes** da transação: é uma leitura, e
    // do lado de dentro ficaria esperando um cadeado que a própria
    // transação segura.
    const texto = assinante
      ? await this.termos.renderizar(
          usuario.organizationId,
          'COMPROMISSO',
          await this.dadosDoTermo(usuario, assetId, pessoa.name),
          agora,
        )
      : null;

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
          ...(texto && assinante
            ? {
                terms: {
                  create: {
                    organizationId: usuario.organizationId,
                    kind: 'COMPROMISSO' as const,
                    body: texto,
                    signatureKey: chave,
                    signedByName: assinante,
                    signedAt: agora,
                  },
                },
              }
            : {}),
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
    const ativo = await this.exigirAtivo(usuario, assetId);

    const aberta = await this.prisma.assetHolding.findFirst({
      where: { assetId, endedAt: null },
      select: { id: true, user: { select: { name: true } } },
    });

    if (!aberta) throw new ConflictException('Este equipamento não está com ninguém.');

    const agora = new Date();
    const notas = dto.notes?.trim() || null;

    // O termo de quebra descreve o que aconteceu, e o que aconteceu está
    // nas observações da devolução. Sem elas o papel diria "—" no lugar
    // do fato, e um termo de ocorrência sem a ocorrência não serve.
    if (dto.comQuebra && !notas) {
      throw new BadRequestException(
        'Descreva o que aconteceu nas observações: é esse texto que entra no termo de quebra.',
      );
    }

    const chave =
      dto.comQuebra && dto.signature ? await this.guardarAssinatura(ativo, dto.signature) : null;
    const assinante = chave ? dto.signedByName?.trim() || aberta.user.name : null;

    const texto =
      dto.comQuebra && assinante && notas
        ? await this.termos.renderizar(
            usuario.organizationId,
            'QUEBRA',
            {
              ...(await this.dadosDoTermo(usuario, assetId, aberta.user.name)),
              ocorrencia: { descricao: notas, destino: dto.returnedTo },
            },
            agora,
          )
        : null;

    await this.prisma.$transaction([
      this.prisma.assetHolding.update({
        where: { id: aberta.id },
        data: {
          endedAt: agora,
          returnedTo: dto.returnedTo,
          notes: notas,
          ...(texto && assinante
            ? {
                terms: {
                  create: {
                    organizationId: usuario.organizationId,
                    kind: 'QUEBRA' as const,
                    body: texto,
                    signatureKey: chave,
                    signedByName: assinante,
                    signedAt: agora,
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { userId: null, status: dto.returnedTo },
      }),
    ]);

    return this.listar(usuario, assetId);
  }

  /** O que o texto do termo precisa saber, numa consulta. */
  private async dadosDoTermo(
    usuario: UsuarioAutenticado,
    assetId: string,
    nomeDaPessoa: string,
  ): Promise<DadosDoTermo> {
    const [ativo, organizacao] = await Promise.all([
      this.prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: SELECT_DO_ATIVO }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: usuario.organizationId },
        select: { name: true },
      }),
    ]);

    return { pessoa: { name: nomeDaPessoa }, ativo, organizacao };
  }

  // -------------------------------------------------------------------
  // Troca
  // -------------------------------------------------------------------

  /**
   * Sai um equipamento, entra outro — pelo chamado.
   *
   * ## Por que é uma operação, e não duas chamadas da tela
   *
   * A tela poderia devolver um e entregar o outro. O que ela não
   * consegue é fazer as duas caberem numa transação: se a entrega
   * falhasse depois da devolução — porque alguém pegou o equipamento de
   * reserva no meio —, a pessoa ficaria sem nada e o chamado sem
   * registro do porquê. Aqui as duas são um `$transaction` só: ou o
   * equipamento trocou de mão, ou nada aconteceu.
   *
   * ## A pessoa é a mesma dos dois lados
   *
   * Trocar para outra pessoa não é troca — são uma devolução e uma
   * entrega, que já existem separadas. O serviço recusa em vez de
   * adivinhar qual das duas leituras era a intenção.
   *
   * ## O que fica no chamado
   *
   * Um evento **público** com o que saiu, o que entrou e para onde o
   * antigo foi. Nota interna deixaria o histórico dizendo que nada
   * aconteceu, num atendimento em que a coisa mais concreta que existe
   * é a máquina que trocou de mão.
   */
  async trocar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: TrocarAtivoDto,
  ): Promise<TrocaResponse> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    if (dto.saiAssetId === dto.entraAssetId) {
      throw new BadRequestException('O equipamento que sai e o que entra são o mesmo.');
    }

    const notas = dto.notes?.trim() || null;
    if (dto.comQuebra && !notas) {
      throw new BadRequestException(
        'Descreva o que aconteceu nas observações: é esse texto que entra no termo de quebra.',
      );
    }

    const [sai, entra] = await Promise.all([
      this.exigirAtivo(usuario, dto.saiAssetId),
      this.exigirAtivo(usuario, dto.entraAssetId),
    ]);

    const posseAberta = await this.prisma.assetHolding.findFirst({
      where: { assetId: sai.id, endedAt: null },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });

    if (!posseAberta) {
      throw new ConflictException(
        'O equipamento que sai não está com ninguém. Sem posse aberta não há troca — ' +
          'é uma entrega.',
      );
    }

    const jaOcupado = await this.prisma.assetHolding.findFirst({
      where: { assetId: entra.id, endedAt: null },
      select: { user: { select: { name: true } } },
    });

    if (jaOcupado) {
      throw new ConflictException(
        `O equipamento que entra já está com ${jaOcupado.user.name}. ` +
          'Registre a devolução dele primeiro.',
      );
    }

    // A mesma cerca da entrega: o equipamento de um cliente não vai
    // para o funcionário de outro. Conferida antes de qualquer escrita.
    await this.exigirPessoa(usuario, posseAberta.userId, entra.clientId);

    const agora = new Date();

    // O arquivo vai para o armazenamento **antes** da transação: é
    // efeito de fora do banco, e dentro dela ele não teria como voltar
    // atrás. Uma assinatura órfã no bucket é lixo barato; meia troca
    // gravada, não.
    const chave = dto.signature ? await this.guardarAssinatura(entra, dto.signature) : null;
    const assinante = chave ? dto.signedByName?.trim() || posseAberta.user.name : null;

    const [textoDaEntrega, textoDaQuebra] = await Promise.all([
      assinante
        ? this.termos.renderizar(
            usuario.organizationId,
            'COMPROMISSO',
            await this.dadosDoTermo(usuario, entra.id, posseAberta.user.name),
            agora,
          )
        : Promise.resolve(null),
      assinante && dto.comQuebra && notas
        ? this.termos.renderizar(
            usuario.organizationId,
            'QUEBRA',
            {
              ...(await this.dadosDoTermo(usuario, sai.id, posseAberta.user.name)),
              ocorrencia: { descricao: notas, destino: dto.returnedTo },
            },
            agora,
          )
        : Promise.resolve(null),
    ]);

    const dadosDosAtivos = await this.prisma.asset.findMany({
      where: { id: { in: [sai.id, entra.id] } },
      select: { id: true, name: true, tag: true },
    });

    const resumo = (id: string) => {
      const ativo = dadosDosAtivos.find((a) => a.id === id)!;
      return { id: ativo.id, nome: ativo.name, patrimonio: ativo.tag };
    };

    await this.prisma.$transaction([
      // --- Sai ---------------------------------------------------------
      this.prisma.assetHolding.update({
        where: { id: posseAberta.id },
        data: {
          endedAt: agora,
          returnedTo: dto.returnedTo,
          notes: notas,
          ...(textoDaQuebra && assinante
            ? {
                terms: {
                  create: {
                    organizationId: usuario.organizationId,
                    kind: 'QUEBRA' as const,
                    body: textoDaQuebra,
                    signatureKey: chave,
                    signedByName: assinante,
                    signedAt: agora,
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.asset.update({
        where: { id: sai.id },
        data: { userId: null, status: dto.returnedTo },
      }),

      // --- Entra -------------------------------------------------------
      this.prisma.assetHolding.create({
        data: {
          organizationId: usuario.organizationId,
          assetId: entra.id,
          userId: posseAberta.userId,
          startedAt: agora,
          notes: notas,
          ...(textoDaEntrega && assinante
            ? {
                terms: {
                  create: {
                    organizationId: usuario.organizationId,
                    kind: 'COMPROMISSO' as const,
                    body: textoDaEntrega,
                    signatureKey: chave,
                    signedByName: assinante,
                    signedAt: agora,
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.asset.update({
        where: { id: entra.id },
        data: { userId: posseAberta.userId, status: 'EM_USO' },
      }),

      // --- O chamado ---------------------------------------------------
      //
      // Os dois equipamentos ficam amarrados ao chamado: é por ele que
      // se responde "quando foi que esta máquina entrou?".
      this.prisma.ticketAsset.createMany({
        data: [
          { ticketId, assetId: sai.id },
          { ticketId, assetId: entra.id },
        ],
        skipDuplicates: true,
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: 'TROCA_DE_ATIVO',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: {
            type: 'TROCA_DE_ATIVO',
            saiu: resumo(sai.id),
            entrou: resumo(entra.id),
            destino: dto.returnedTo,
            comQuebra: Boolean(dto.comQuebra),
          },
        },
      }),
    ]);

    const [saiu, entrou] = await Promise.all([
      this.listar(usuario, sai.id),
      this.listar(usuario, entra.id),
    ]);

    return { saiu, entrou };
  }

  /**
   * O termo, com o texto e o traço, pronto para imprimir.
   *
   * Devolve os dois: o texto congelado e o PNG da assinatura, quando há.
   * Quem monta o PDF é o controller — este serviço não conhece papel.
   */
  async termo(
    usuario: UsuarioAutenticado,
    termId: string,
  ): Promise<{
    kind: TermKind;
    body: string;
    signedByName: string;
    signedAt: Date;
    assinatura: Buffer | null;
    ativo: { name: string; tag: string | null };
    organizacao: { name: string };
  }> {
    const termo = await this.prisma.assetTerm.findFirst({
      where: { id: termId, organizationId: usuario.organizationId },
      select: {
        kind: true,
        body: true,
        signedByName: true,
        signedAt: true,
        signatureKey: true,
        holding: { select: { asset: { select: { name: true, tag: true } } } },
        organization: { select: { name: true } },
      },
    });

    if (!termo) throw new NotFoundException('Termo não encontrado.');

    return {
      kind: termo.kind,
      body: termo.body,
      signedByName: termo.signedByName,
      signedAt: termo.signedAt,
      assinatura: await this.lerAssinatura(termo.signatureKey),
      ativo: termo.holding.asset,
      organizacao: termo.organization,
    };
  }

  /**
   * O traço, se ainda estiver no armazenamento.
   *
   * Assinatura que sumiu do bucket não impede emitir o documento: o
   * texto continua sendo o que a pessoa assinou, e um papel sem o traço
   * é melhor que erro na tela de quem foi imprimir. É a mesma escolha
   * da ordem de serviço.
   */
  private async lerAssinatura(chave: string | null): Promise<Buffer | null> {
    if (!chave) return null;

    try {
      const fluxo = await this.armazenamento.ler(chave);
      const pedacos: Buffer[] = [];
      for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));
      return Buffer.concat(pedacos);
    } catch {
      return null;
    }
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
      select: { id: true, organizationId: true, clientId: true },
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
   * a alguém de outra organização e ler o nome dela no histórico.
   *
   * E, dentro da organização, a pessoa não pode ser de **outra
   * empresa-cliente**: entregar a máquina da empresa do João ao
   * funcionário da empresa da Maria põe o nome de uma no histórico da
   * outra, e nenhuma das duas contagens de parque fecha.
   *
   * Quem é da casa segura equipamento de qualquer cliente — é o técnico
   * que levou a máquina para o conserto —, e equipamento da casa vai
   * para qualquer pessoa, que é o notebook de empréstimo. Só a
   * combinação "cliente A x cliente B" é recusada.
   */
  private async exigirPessoa(
    usuario: UsuarioAutenticado,
    userId: string,
    clienteDoAtivo: string | null,
  ) {
    const pessoa = await this.prisma.user.findFirst({
      where: { id: userId, memberships: { some: { organizationId: usuario.organizationId } } },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { organizationId: usuario.organizationId },
          select: { clientId: true },
        },
      },
    });

    if (!pessoa) throw new BadRequestException('Pessoa não encontrada nesta organização.');

    const clientes = pessoa.memberships.map((m) => m.clientId);
    const daCasa = clientes.some((c) => c === null);

    if (!daCasa && clientes.every((c) => deClientesDiferentes(clienteDoAtivo, c))) {
      throw new BadRequestException(
        `${pessoa.name} é de outra empresa. O equipamento de um cliente não vai ` +
          'para o funcionário de outro.',
      );
    }

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
      terms: posse.terms.map(TermosService.paraView),
    };
  }
}
