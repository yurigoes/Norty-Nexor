import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ContextoDoTermo,
  ModeloDeTermoView,
  TermKind,
  TermoView,
} from '@norty-desk/shared';
import {
  ROTULO_ATIVO,
  ROTULO_ATIVO_STATUS,
  SEM_DADO_NO_TERMO,
  TERM_KINDS,
  TEXTO_PADRAO_DO_TERMO,
  marcadoresInvalidosDoTermo,
  preencherTermo,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/** O que o termo precisa saber sobre o equipamento e quem o recebe. */
export type DadosDoTermo = {
  pessoa: { name: string };
  ativo: {
    name: string;
    kind: keyof typeof ROTULO_ATIVO;
    tag: string | null;
    serialNumber: string | null;
    manufacturer: { name: string } | null;
    assetModel: { name: string } | null;
    client: { name: string; document: string | null } | null;
  };
  organizacao: { name: string };
  /** Só no termo de quebra: o que aconteceu e para onde o equipamento foi. */
  ocorrencia?: { descricao: string; destino: keyof typeof ROTULO_ATIVO_STATUS };
};

/**
 * O texto dos termos.
 *
 * ## O modelo é editável, o termo assinado não
 *
 * `TermTemplate` guarda a redação que a casa usa hoje. Quando alguém
 * assina, o texto é **renderizado e congelado** em `AssetTerm.body` —
 * marcadores já trocados, como estava no papel que a pessoa pegou na
 * mão. Editar o modelo depois vale para o próximo termo e não mexe em
 * nenhum dos anteriores.
 *
 * Sem isso, ajustar uma cláusula reescreveria retroativamente o que
 * todo mundo assinou, e o histórico deixaria de valer como prova.
 *
 * ## Marcador desconhecido é recusado na edição, não no papel
 *
 * `marcadoresInvalidosDoTermo` roda ao salvar o modelo. Errar na hora de
 * salvar é barato; descobrir o erro no termo impresso, com a pessoa
 * esperando para assinar, não é.
 */
@Injectable()
export class TermosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Os dois textos da casa — os de fábrica enquanto ninguém editou. */
  async modelos(usuario: UsuarioAutenticado): Promise<ModeloDeTermoView[]> {
    const salvos = await this.prisma.termTemplate.findMany({
      where: { organizationId: usuario.organizationId },
    });

    return TERM_KINDS.map((kind) => {
      const salvo = salvos.find((m) => m.kind === kind);
      return {
        kind,
        body: salvo?.body ?? TEXTO_PADRAO_DO_TERMO[kind],
        padrao: !salvo,
        updatedAt: salvo?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async salvarModelo(
    usuario: UsuarioAutenticado,
    kind: TermKind,
    body: string,
  ): Promise<ModeloDeTermoView[]> {
    const texto = body.trim();
    if (texto.length < 40) {
      throw new BadRequestException('O texto do termo está curto demais para valer como termo.');
    }

    const inventados = marcadoresInvalidosDoTermo(texto);
    if (inventados.length > 0) {
      throw new BadRequestException(
        `Estes marcadores não existem: ${inventados.join(', ')}. ` +
          'Eles sairiam no papel do jeito que estão, sem virar o dado.',
      );
    }

    await this.prisma.termTemplate.upsert({
      where: { organizationId_kind: { organizationId: usuario.organizationId, kind } },
      create: { organizationId: usuario.organizationId, kind, body: texto },
      update: { body: texto },
    });

    return this.modelos(usuario);
  }

  /** Volta ao texto de fábrica: some a linha, e o padrão reaparece. */
  async restaurarModelo(
    usuario: UsuarioAutenticado,
    kind: TermKind,
  ): Promise<ModeloDeTermoView[]> {
    await this.prisma.termTemplate
      .delete({ where: { organizationId_kind: { organizationId: usuario.organizationId, kind } } })
      .catch(() => undefined);

    return this.modelos(usuario);
  }

  /**
   * O texto pronto para assinar, com os marcadores trocados.
   *
   * Roda no momento da assinatura, e o resultado é o que fica gravado.
   */
  async renderizar(
    organizationId: string,
    kind: TermKind,
    dados: DadosDoTermo,
    agora: Date,
  ): Promise<string> {
    const modelo = await this.prisma.termTemplate.findUnique({
      where: { organizationId_kind: { organizationId, kind } },
    });

    return preencherTermo(modelo?.body ?? TEXTO_PADRAO_DO_TERMO[kind], contexto(dados, agora));
  }

  static paraView(termo: {
    id: string;
    kind: TermKind;
    body: string;
    signedByName: string;
    signedAt: Date;
    signatureKey: string | null;
  }): TermoView {
    return {
      id: termo.id,
      kind: termo.kind,
      body: termo.body,
      signedByName: termo.signedByName,
      signedAt: termo.signedAt.toISOString(),
      hasSignature: termo.signatureKey !== null,
    };
  }
}

/** O que o Prisma precisa trazer para `DadosDoTermo` ficar completo. */
export const SELECT_DO_ATIVO = {
  name: true,
  kind: true,
  tag: true,
  serialNumber: true,
  manufacturer: { select: { name: true } },
  assetModel: { select: { name: true } },
  client: { select: { name: true, document: true } },
} satisfies Prisma.AssetSelect;

/**
 * Data por extenso curta, no fuso de Brasília.
 *
 * O documento é assinado aqui, e `DateTime` no banco é UTC: sem o fuso,
 * um termo assinado às 21h de São Paulo sairia datado do dia seguinte.
 */
function data(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

function contexto(dados: DadosDoTermo, agora: Date): ContextoDoTermo {
  const { ativo } = dados;

  return {
    'pessoa.nome': dados.pessoa.name,
    // Equipamento da casa não tem empresa-cliente: quem entrega é a
    // própria organização, e é o nome dela que vai no papel.
    'empresa.nome': ativo.client?.name ?? dados.organizacao.name,
    'empresa.documento': ativo.client?.document ?? SEM_DADO_NO_TERMO,
    'equipamento.nome': ativo.name,
    'equipamento.tipo': ROTULO_ATIVO[ativo.kind],
    'equipamento.patrimonio': ativo.tag ?? SEM_DADO_NO_TERMO,
    'equipamento.serie': ativo.serialNumber ?? SEM_DADO_NO_TERMO,
    'equipamento.fabricante': ativo.manufacturer?.name ?? SEM_DADO_NO_TERMO,
    'equipamento.modelo': ativo.assetModel?.name ?? SEM_DADO_NO_TERMO,
    'equipamento.destino': dados.ocorrencia
      ? ROTULO_ATIVO_STATUS[dados.ocorrencia.destino]
      : SEM_DADO_NO_TERMO,
    'ocorrencia.descricao': dados.ocorrencia?.descricao ?? SEM_DADO_NO_TERMO,
    'organizacao.nome': dados.organizacao.name,
    'termo.data': data(agora),
  };
}
