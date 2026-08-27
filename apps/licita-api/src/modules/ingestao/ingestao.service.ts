/* =========================================================
   LICITA+ API — Ingestão do PNCP
   ---------------------------------------------------------
   Duas etapas separadas de propósito:

   1. **Coletar** — consulta o PNCP e grava as contratações numa
      tabela pública, compartilhada por todas as empresas. É
      idempotente pelo `numeroControlePncp`: rodar duas vezes
      atualiza, não duplica.

   2. **Avaliar** — para cada empresa, cruza o que foi coletado
      com o perfil dela usando o mesmo motor de triagem que o
      radar de linha de comando usa. O mesmo código, os mesmos
      81 testes.

   Separar importa porque as duas mudam por motivos diferentes: o
   PNCP publica contratação nova; a empresa muda o perfil. Uma
   troca de linha de fornecimento reavalia sem reconsultar a API
   pública.
   ========================================================= */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ClientePncp,
  normalizarLote,
  paraFormatoPncp,
  somarDias,
  triar,
  type Oportunidade,
  type PerfilEmpresa,
} from '@nexor/licitacoes-shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { carregarConfig } from '../../config/env';

const config = carregarConfig();

export interface ResumoIngestao {
  consultadas: number;
  novas: number;
  atualizadas: number;
  avaliacoes: number;
  falhas: { modalidade: number; erro: string }[];
}

@Injectable()
export class IngestaoService {
  private readonly logger = new Logger(IngestaoService.name);
  private rodando = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma vez por dia, de madrugada. O PNCP publica ao longo do
   * dia útil; varrer de hora em hora traria pouca novidade e
   * multiplicaria a carga na API pública sem ganho.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM, { timeZone: 'America/Bahia' })
  async varreduraDiaria(): Promise<void> {
    await this.executar().catch((erro) => {
      this.logger.error(`Varredura diária falhou: ${erro instanceof Error ? erro.message : erro}`);
    });
  }

  async executar(ufs = config.pncp.ufs): Promise<ResumoIngestao> {
    // Trava simples de processo. Duas varreduras concorrentes
    // brigariam pelos mesmos upserts sem trazer nada de novo.
    if (this.rodando) {
      this.logger.warn('Varredura já em andamento — ignorando o pedido.');
      return { consultadas: 0, novas: 0, atualizadas: 0, avaliacoes: 0, falhas: [] };
    }
    this.rodando = true;

    const execucao = await this.prisma.execucaoIngestao.create({
      data: { ufs, modalidades: MODALIDADES },
    });

    const resumo: ResumoIngestao = {
      consultadas: 0, novas: 0, atualizadas: 0, avaliacoes: 0, falhas: [],
    };

    try {
      const cliente = new ClientePncp({
        base: config.pncp.base,
        intervaloMs: config.pncp.intervaloMs,
      });
      const dataFinal = paraFormatoPncp(somarDias(new Date(), config.pncp.janelaDias));

      for (const uf of ufs) {
        const { contratacoes, falhas } = await cliente.contratacoesComPropostaAberta({
          dataFinal, modalidades: MODALIDADES, uf,
        });

        resumo.falhas.push(...falhas);
        resumo.consultadas += contratacoes.length;

        const normalizadas = normalizarLote(contratacoes);

        for (const oportunidade of normalizadas) {
          const novo = await this.gravar(oportunidade);
          if (novo) resumo.novas += 1;
          else resumo.atualizadas += 1;
        }

        // A normalização descarta registro sem identificação
        // mínima — de propósito. Mas descartar em silêncio faz
        // "consultadas 40, novas 0" parecer defeito de gravação
        // quando é o formato do que veio.
        const descartadas = contratacoes.length - normalizadas.length;
        if (descartadas > 0) {
          this.logger.warn(
            `${uf}: ${descartadas} de ${contratacoes.length} sem CNPJ, ano, sequencial ou objeto — descartadas.`,
          );
        }

        this.logger.log(`${uf}: ${contratacoes.length} contratações`);
      }

      resumo.avaliacoes = await this.avaliarTodas();

      await this.prisma.execucaoIngestao.update({
        where: { id: execucao.id },
        data: {
          concluidaEm: new Date(),
          consultadas: resumo.consultadas,
          novas: resumo.novas,
          atualizadas: resumo.atualizadas,
          avaliacoes: resumo.avaliacoes,
          erro: resumo.falhas.length
            ? resumo.falhas.map((f) => `modalidade ${f.modalidade}: ${f.erro}`).join(' | ')
            : null,
        },
      });

      // As falhas por modalidade eram gravadas em
      // `execucoes_ingestao.erro` e nunca apareciam no log — então
      // "0 contratações" ficava indistinguível de "o PNCP recusou
      // o pedido três vezes". Quem lê o log é quem precisa saber.
      for (const falha of resumo.falhas) {
        this.logger.error(`PNCP recusou a modalidade ${falha.modalidade}: ${falha.erro}`);
      }

      // Se o cliente teve de afrouxar o passo, o limite do PNCP
      // apertou durante a varredura. Vale saber antes de a
      // próxima demorar o dobro sem explicação.
      if (cliente.intervaloAtual > config.pncp.intervaloMs) {
        this.logger.warn(
          `O PNCP limitou o ritmo: ${config.pncp.intervaloMs}ms → ${cliente.intervaloAtual}ms ` +
            'entre pedidos. Para começar já nesse passo, ajuste PNCP_INTERVALO_MS.',
        );
      }

      this.logger.log(
        `Varredura concluída: ${resumo.novas} novas, ${resumo.atualizadas} atualizadas, ` +
          `${resumo.avaliacoes} avaliações` +
          (resumo.falhas.length ? ` — ${resumo.falhas.length} falha(s) acima` : ''),
      );
      return resumo;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.execucaoIngestao.update({
        where: { id: execucao.id },
        data: { concluidaEm: new Date(), erro: mensagem },
      });
      throw erro;
    } finally {
      this.rodando = false;
    }
  }

  /** Devolve `true` quando a licitação era nova. */
  private async gravar(o: Oportunidade): Promise<boolean> {
    const dados = {
      cnpjOrgao: o.cnpjOrgao,
      orgaoRazaoSocial: o.orgao.razaoSocial,
      orgaoEsfera: o.orgao.esfera || null,
      unidadeNome: o.unidade.nome,
      municipio: o.unidade.municipio,
      municipioIbge: o.unidade.municipioIbge || null,
      uf: o.unidade.uf || 'BR'.slice(0, 2),
      ano: o.ano,
      sequencial: o.sequencial,
      objeto: o.objeto,
      informacaoComplementar: o.informacaoComplementar ?? null,
      modalidadeCodigo: o.modalidadeCodigo,
      modoDisputaCodigo: o.modoDisputaCodigo,
      situacaoCodigo: o.situacaoCodigo,
      registroDePrecos: o.registroDePrecos,
      valorEstimado: o.valorEstimado,
      aberturaProposta: o.aberturaProposta ? new Date(o.aberturaProposta) : null,
      encerramentoProposta: o.encerramentoProposta ? new Date(o.encerramentoProposta) : null,
      publicacaoPncp: o.publicacao ? new Date(o.publicacao) : null,
      linkPncp: o.linkPncp,
      linkSistemaOrigem: o.linkSistemaOrigem,
      vistaEm: new Date(),
    };

    const existente = await this.prisma.licitacao.findUnique({
      where: { numeroControlePncp: o.id },
      select: { id: true },
    });

    await this.prisma.licitacao.upsert({
      where: { numeroControlePncp: o.id },
      create: { numeroControlePncp: o.id, ...dados },
      update: dados,
    });

    return !existente;
  }

  /**
   * Recalcula a compatibilidade de cada empresa ativa contra as
   * licitações com prazo em aberto.
   *
   * O descarte é gravado junto com a nota, em vez de sumir. É o
   * que permite a tela responder "por que essa não aparece?" — e
   * é o diagnóstico de perfil mal calibrado: mil descartes por
   * "não bate com nenhuma linha" é falta de palavra-chave, não
   * falta de oportunidade.
   */
  async avaliarTodas(): Promise<number> {
    const empresas = await this.prisma.empresa.findMany({
      where: { ativa: true },
      include: { linhas: true },
    });

    const agora = new Date();
    const abertas = await this.prisma.licitacao.findMany({
      where: { encerramentoProposta: { gte: agora }, situacaoCodigo: 1 },
    });

    let total = 0;

    for (const empresa of empresas) {
      if (empresa.linhas.length === 0) {
        this.logger.warn(`Empresa ${empresa.cnpj} sem linhas de fornecimento — nada a avaliar.`);
        continue;
      }

      const perfil = paraPerfil(empresa);

      for (const licitacao of abertas) {
        const { aprovada, descarte } = triar(paraOportunidade(licitacao), perfil, agora);

        await this.prisma.avaliacao.upsert({
          where: { empresaId_licitacaoId: { empresaId: empresa.id, licitacaoId: licitacao.id } },
          create: {
            empresaId: empresa.id,
            licitacaoId: licitacao.id,
            nota: aprovada?.nota ?? 0,
            motivos: (aprovada?.motivos ?? []) as never,
            alertas: (aprovada?.alertas ?? []) as never,
            linhasAtendidas: aprovada?.linhasAtendidas ?? [],
            descartadaPor: descarte?.motivo ?? null,
          },
          update: {
            nota: aprovada?.nota ?? 0,
            motivos: (aprovada?.motivos ?? []) as never,
            alertas: (aprovada?.alertas ?? []) as never,
            linhasAtendidas: aprovada?.linhasAtendidas ?? [],
            descartadaPor: descarte?.motivo ?? null,
            calculadaEm: new Date(),
          },
        });

        total += 1;
      }
    }

    return total;
  }
}

/** Dispensa, pregão eletrônico e credenciamento — as portas de entrada. */
const MODALIDADES = [6, 8, 12];

type EmpresaComLinhas = {
  razaoSocial: string;
  cnpj: string;
  porte: string;
  uf: string;
  municipio: string | null;
  municipioIbge: string | null;
  municipiosRegiao: string[];
  valorMinimo: unknown;
  valorMaximo: unknown;
  modalidades: number[];
  diasMinimosPreparo: number;
  linhas: { nome: string; palavrasChave: string[]; palavrasExcluidas: string[] }[];
};

/** Registro do banco → perfil que o motor de triagem entende. */
function paraPerfil(empresa: EmpresaComLinhas): PerfilEmpresa {
  return {
    razaoSocial: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    porte: empresa.porte as PerfilEmpresa['porte'],
    uf: empresa.uf,
    // Sem código IBGE a triagem só não pontua o anel "mesmo
    // município"; região e UF continuam valendo.
    municipioIbge: empresa.municipioIbge ?? '',
    municipiosRegiao: empresa.municipiosRegiao,
    linhas: empresa.linhas.map((l) => ({
      nome: l.nome,
      palavrasChave: l.palavrasChave,
      palavrasExcluidas: l.palavrasExcluidas,
    })),
    valorMinimo: Number(empresa.valorMinimo),
    valorMaximo: Number(empresa.valorMaximo),
    modalidades: empresa.modalidades,
    diasMinimosPreparo: empresa.diasMinimosPreparo,
  };
}

type LicitacaoBanco = {
  numeroControlePncp: string;
  cnpjOrgao: string;
  ano: number;
  sequencial: number;
  objeto: string;
  informacaoComplementar: string | null;
  modalidadeCodigo: number;
  modoDisputaCodigo: number;
  situacaoCodigo: number;
  registroDePrecos: boolean;
  valorEstimado: unknown;
  aberturaProposta: Date | null;
  encerramentoProposta: Date | null;
  publicacaoPncp: Date | null;
  orgaoRazaoSocial: string;
  orgaoEsfera: string | null;
  unidadeNome: string | null;
  municipio: string;
  municipioIbge: string | null;
  uf: string;
  linkPncp: string;
  linkSistemaOrigem: string | null;
};

/** Registro do banco → oportunidade que o motor entende. */
function paraOportunidade(l: LicitacaoBanco): Oportunidade {
  return {
    id: l.numeroControlePncp,
    cnpjOrgao: l.cnpjOrgao,
    ano: l.ano,
    sequencial: l.sequencial,
    objeto: l.objeto,
    informacaoComplementar: l.informacaoComplementar ?? undefined,
    modalidadeCodigo: l.modalidadeCodigo,
    modoDisputaCodigo: l.modoDisputaCodigo,
    situacaoCodigo: l.situacaoCodigo,
    registroDePrecos: l.registroDePrecos,
    valorEstimado: l.valorEstimado === null ? null : Number(l.valorEstimado),
    aberturaProposta: l.aberturaProposta?.toISOString() ?? null,
    encerramentoProposta: l.encerramentoProposta?.toISOString() ?? null,
    publicacao: l.publicacaoPncp?.toISOString() ?? null,
    orgao: { cnpj: l.cnpjOrgao, razaoSocial: l.orgaoRazaoSocial, esfera: l.orgaoEsfera ?? '' },
    unidade: {
      nome: l.unidadeNome ?? '—',
      municipio: l.municipio,
      municipioIbge: l.municipioIbge ?? '',
      uf: l.uf,
    },
    linkPncp: l.linkPncp,
    linkSistemaOrigem: l.linkSistemaOrigem,
  };
}
