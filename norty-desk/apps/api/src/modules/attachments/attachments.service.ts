import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { podeRemoverAnexo, type AttachmentView } from '@norty-desk/shared';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from './armazenamento';

/** 25 MB no web e no e-mail; o WhatsApp tem limite próprio, menor. */
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

/** A URL assinada vive o suficiente para o navegador buscar o arquivo. */
const VALIDADE_URL = 15 * 60;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  /**
   * O nome do arquivo vem do usuário e entra na chave do objeto.
   *
   * Tudo que não for letra, número, ponto, traço ou sublinhado sai. Sem
   * isso, um nome com `../` escaparia da pasta do chamado — e um com
   * caractere de controle quebraria o cabeçalho `Content-Disposition`.
   */
  private static sanear(nome: string): string {
    const limpo = nome
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 120);

    return limpo || 'arquivo';
  }

  private async exigirChamadoVisivel(usuario: UsuarioAutenticado, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, status: true, organizationId: true, originChannel: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  async enviar(
    usuario: UsuarioAutenticado,
    ticketId: string,
    arquivo: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    eventId?: string,
  ): Promise<AttachmentView> {
    const chamado = await this.exigirChamadoVisivel(usuario, ticketId);

    if (chamado.status === 'FECHADO') {
      throw new BadRequestException('Chamado fechado. Reabra antes de anexar.');
    }

    if (!arquivo?.buffer?.length) throw new BadRequestException('Arquivo vazio.');
    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new BadRequestException(
        `Arquivo acima do limite de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB.`,
      );
    }

    const nome = AttachmentsService.sanear(arquivo.originalname);
    const checksum = createHash('sha256').update(arquivo.buffer).digest('hex');
    const storageKey = `${chamado.organizationId}/${ticketId}/${randomUUID()}-${nome}`;

    await this.armazenamento.guardar(storageKey, arquivo.buffer, arquivo.mimetype);

    // Anexar é um evento na timeline: sem isso o arquivo apareceria no
    // chamado sem que a conversa registrasse quando e por quem
    // (`docs/02-gap-analysis.md`, item 16).
    const evento =
      eventId ??
      (
        await this.prisma.ticketEvent.create({
          data: {
            ticketId,
            type: 'ANEXO',
            visibility: 'PUBLICA',
            authorId: usuario.userId,
            channel: chamado.originChannel,
            body: nome,
          },
          select: { id: true },
        })
      ).id;

    const anexo = await this.prisma.attachment.create({
      data: {
        ticketId,
        eventId: evento,
        filename: nome,
        contentType: arquivo.mimetype || 'application/octet-stream',
        sizeBytes: arquivo.size,
        storageKey,
        checksum: `sha256:${checksum}`,
        uploadedById: usuario.userId,
      },
    });

    return this.paraVista(anexo);
  }

  async listar(usuario: UsuarioAutenticado, ticketId: string): Promise<AttachmentView[]> {
    await this.exigirChamadoVisivel(usuario, ticketId);
    const anexos = await this.prisma.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return anexos.map((a) => this.paraVista(a));
  }

  /**
   * Resolve o anexo para leitura.
   *
   * Devolve URL assinada quando o driver sabe assinar (MinIO) e um fluxo
   * quando não sabe (disco). Nos dois casos a autorização já aconteceu
   * aqui: o bucket não é público, e a URL vale 15 minutos.
   */
  async paraLeitura(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<
    | { tipo: 'url'; url: string }
    | { tipo: 'fluxo'; fluxo: Readable; filename: string; contentType: string }
  > {
    const anexo = await this.prisma.attachment.findFirst({
      where: { id, ticket: escopoDeLeitura(usuario) },
    });

    if (!anexo) throw new NotFoundException('Anexo não encontrado.');

    const url = await this.armazenamento.urlAssinada(anexo.storageKey, VALIDADE_URL);
    if (url) return { tipo: 'url', url };

    return {
      tipo: 'fluxo',
      fluxo: await this.armazenamento.ler(anexo.storageKey),
      filename: anexo.filename,
      contentType: anexo.contentType,
    };
  }

  /**
   * Retira o anexo, e deixa dito na linha do tempo que ele saiu.
   *
   * Quem tem `anexo:remover` retira qualquer um; quem tem só
   * `anexo:remover:proprio` retira o que ele mesmo anexou. A decisão é
   * de `podeRemoverAnexo`, em `packages/shared` — a mesma função que o
   * aplicativo lê para decidir se desenha o botão.
   */
  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const anexo = await this.prisma.attachment.findFirst({
      where: { id, ticket: escopoDeLeitura(usuario) },
      include: { ticket: { select: { status: true, originChannel: true } } },
    });

    // O `where` filtra por `ticket`, então a relação existe; o `if` é
    // para o TypeScript, que só sabe que a coluna é nula em anexo de
    // problema ou de mudança — e esses esta rota não retira.
    if (!anexo?.ticket) throw new NotFoundException('Anexo não encontrado.');

    if (!podeRemoverAnexo(usuario.role, usuario.userId, anexo)) {
      throw new ForbiddenException('Este anexo foi enviado por outra pessoa.');
    }

    // Mesma regra do envio: chamado fechado não muda. Sem isso, o
    // anexo poderia sair de um chamado já encerrado — e o registro do
    // atendimento mudaria depois de dado por terminado.
    if (anexo.ticket.status === 'FECHADO') {
      throw new BadRequestException('Chamado fechado. Reabra antes de retirar o anexo.');
    }

    // O evento nasce antes da exclusão: se o `delete` falhar, sobra um
    // evento a mais na linha do tempo, que é honesto. Na ordem inversa
    // sobraria um arquivo apagado sem registro de quem o apagou.
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: anexo.ticketId,
        type: 'ANEXO_REMOVIDO',
        visibility: 'PUBLICA',
        authorId: usuario.userId,
        channel: anexo.ticket.originChannel,
        body: anexo.filename,
      },
    });

    // O registro sai primeiro: um arquivo órfão no bucket é lixo; um
    // registro apontando para arquivo que não existe é erro na tela.
    await this.prisma.attachment.delete({ where: { id } });
    await this.armazenamento.remover(anexo.storageKey).catch(() => undefined);
  }

  private paraVista(a: {
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
    eventId: string | null;
    uploadedById: string | null;
    createdAt: Date;
  }): AttachmentView {
    return {
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      checksum: a.checksum,
      eventId: a.eventId,
      uploadedById: a.uploadedById,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
