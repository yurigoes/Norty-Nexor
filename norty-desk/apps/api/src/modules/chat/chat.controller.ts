import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  INTERVALO_DA_BATIDA,
  type EstadoDoChat,
  type EventoDoChat,
} from '@norty-desk/shared';
import type { Request, Response } from 'express';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INCLUDE_EVENTO, paraEvento } from '../tickets/tickets.serializador';
import { ChatService } from './chat.service';
import { BaterPontoDto } from './dto';

/** De quanto em quanto tempo o fluxo procura novidade no banco. */
const VOLTA_MS = 2000;

/**
 * Quanto tempo uma conexão fica aberta antes de o cliente reabri-la.
 *
 * Proxy e balanceador cortam conexão parada, e reconectar de propósito
 * a cada quinze minutos é mais previsível que descobrir o corte de cada
 * intermediário. O cliente reabre sozinho.
 */
const VIDA_DO_FLUXO_MS = 15 * 60 * 1000;

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * "Ainda estou aqui", e quem mais está.
   *
   * O aplicativo bate a cada `INTERVALO_DA_BATIDA` segundos. Não há
   * "sair da conversa": quem fecha a aba para de bater e some sozinho —
   * `beforeunload` é um evento que o navegador entrega quando quer, e
   * que não chega quando a aba morre de vez.
   */
  @Post('presenca')
  @RequirePermission('chamado:ler:proprios')
  baterPonto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: BaterPontoDto,
  ): Promise<EstadoDoChat> {
    return this.chat.baterPonto(usuario, dto);
  }

  @Get(':ticketId/presenca')
  @RequirePermission('chamado:ler:proprios')
  estado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<EstadoDoChat> {
    return this.chat.estado(usuario, ticketId);
  }

  /**
   * O fluxo do chat: mensagem nova e presença, à medida que acontecem.
   *
   * **Server-Sent Events, e não WebSocket.** O aplicativo lê com
   * `fetch` e um `ReadableStream` — não com `EventSource`, que não
   * carrega cabeçalho `Authorization` e obrigaria a pôr o token na URL,
   * onde ele cairia em log de acesso e no histórico do navegador. Com
   * `fetch`, o token vai no cabeçalho como em toda outra chamada, e o
   * mesmo guard de sempre protege a rota.
   *
   * **A fonte é uma consulta ao banco a cada volta**, e não um
   * barramento em memória. A API roda em mais de um processo: uma
   * mensagem gravada pelo processo A precisa chegar a quem está
   * escutando no processo B, e um barramento em memória não a
   * entregaria. Numa consulta indexada por chamado, a cada dois
   * segundos, isto custa pouco no tamanho deste produto — dezenas de
   * conversas simultâneas, não milhares. É **aqui** que se mexe se um
   * dia forem milhares: `LISTEN/NOTIFY` do Postgres ou o Redis que já
   * está na infraestrutura.
   */
  @Get(':ticketId/fluxo')
  @RequirePermission('chamado:ler:proprios')
  async fluxo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Req() requisicao: Request,
    @Res() resposta: Response,
  ): Promise<void> {
    await this.chat.podeEntrar(usuario, ticketId);

    resposta.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    resposta.setHeader('Cache-Control', 'no-cache, no-transform');
    resposta.setHeader('Connection', 'keep-alive');
    // O nginx guarda resposta em buffer por padrão, e um fluxo em
    // buffer não é um fluxo: nada chega até o buffer encher.
    resposta.setHeader('X-Accel-Buffering', 'no');
    resposta.flushHeaders();

    const escrever = (evento: EventoDoChat): void => {
      resposta.write(`data: ${JSON.stringify(evento)}\n\n`);
    };

    // Começa do agora: o histórico já veio pela lista de eventos, e
    // reenviá-lo duplicaria a conversa na tela.
    let marca = new Date();
    let ultimoEstado = '';
    let vivo = true;

    const encerrar = (): void => {
      vivo = false;
      clearInterval(relogio);
      clearTimeout(prazo);
      resposta.end();
    };

    requisicao.on('close', encerrar);
    const prazo = setTimeout(encerrar, VIDA_DO_FLUXO_MS);

    const volta = async (): Promise<void> => {
      if (!vivo) return;

      try {
        const novos = await this.chat.desdeEntao(usuario, ticketId, marca);

        if (novos.length > 0) {
          marca = novos[novos.length - 1]!.createdAt;

          const completos = await this.prisma.ticketEvent.findMany({
            where: { id: { in: novos.map((n) => n.id) } },
            include: INCLUDE_EVENTO,
            orderBy: { createdAt: 'asc' },
          });

          for (const evento of completos) escrever({ tipo: 'mensagem', evento: paraEvento(evento) });
        }

        const estado = await this.chat.estado(usuario, ticketId);
        const resumo = JSON.stringify(estado);

        // Só quando muda: mandar a presença a cada dois segundos faria
        // o React redesenhar a conversa inteira o tempo todo.
        if (resumo !== ultimoEstado) {
          ultimoEstado = resumo;
          escrever({ tipo: 'presenca', estado });
        }
      } catch {
        // Uma volta que falha não derruba o fluxo: o banco pode ter
        // piscado, e a volta seguinte resolve. Derrubar faria o cliente
        // reconectar — e reconectar num banco instável é pior.
        escrever({ tipo: 'batida' });
      }
    };

    const relogio = setInterval(() => void volta(), VOLTA_MS);

    // A primeira batida vai na hora: sem ela, o `fetch` do cliente fica
    // sem nenhum byte até a primeira volta, e alguns intermediários
    // fecham uma resposta que não escreveu nada.
    escrever({ tipo: 'batida' });
    void volta();

    // Mantém a conexão viva quando a conversa está parada.
    const coracao = setInterval(() => {
      if (vivo) resposta.write(`: ${INTERVALO_DA_BATIDA}\n\n`);
    }, 20_000);
    requisicao.on('close', () => clearInterval(coracao));
  }
}
