import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MINIMO_PARA_BUSCAR_EMPRESA,
  SEMELHANCA_MINIMA_DO_NOME,
  documentoInvalido,
  nomeDeEmpresaNormalizado,
  normalizarProtocolo,
  validarRespostas,
  pareceDocumento,
  soDigitos,
  type AberturaPublicaResposta,
  type AttachmentView,
  type CategoriaPublica,
  type EmpresaPublica,
  type FormSchema,
  type ModeloDeChamado,
} from '@norty-desk/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ThrottleService } from '../../common/throttle/throttle.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { FormulariosService } from '../formularios/formularios.service';
import { TicketsService } from '../tickets/tickets.service';
import type { AbrirPublicoDto } from './dto';

/**
 * Quantas empresas a busca devolve.
 *
 * Cinco é o bastante para a pessoa reconhecer a dela e pouco o bastante
 * para não virar listagem da carteira: esta porta não tem sessão, e
 * quem digita três letras não provou ser ninguém.
 */
const QUANTAS_SUGESTOES = 5;

/**
 * Quantos observadores a abertura sem login aceita.
 *
 * Três é o time que acompanha junto; trinta é lista de distribuição, e
 * uma lista de distribuição montada por quem não tem conta é a forma
 * mais barata de usar o Desk para mandar e-mail não solicitado.
 */
const MAXIMO_DE_OBSERVADORES = 3;

/**
 * Teto de arquivos por chamado aberto sem login.
 *
 * O protocolo é a credencial, e credencial que dá disco ilimitado é
 * disco de graça para quem a tiver. Cinco cobre foto do erro, foto da
 * etiqueta e um log; quem precisa de mais responde pelo e-mail do
 * chamado, que passa pelos limites de canal.
 */
const MAXIMO_DE_ANEXOS_PUBLICOS = 5;

/** Menor que o interno: 25 MB sem sessão nenhuma é generoso demais. */
const TAMANHO_MAXIMO_PUBLICO = 10 * 1024 * 1024;

/**
 * Abertura de chamado sem login.
 *
 * O primeiro passo é dizer de qual empresa se trata, e é ele que
 * governa o desenho:
 *
 * - **Documento é busca exata**, por dígitos. "12.345.678/0001-90" e
 *   "12345678000190" acham a mesma empresa, porque a comparação é feita
 *   numa coluna gerada que guarda só os números.
 * - **Nome é busca por semelhança**, tolerante a erro de digitação e a
 *   acento. "Empreza do Joao" acha "Empresa do João".
 *
 * O que sai daqui é o mínimo: id e nome. Nem documento, nem contato,
 * nem quantos chamados a empresa tem. E a escada de bloqueio por IP
 * vale aqui como vale na consulta por protocolo — sem atrito, esta
 * busca vira uma forma de baixar a carteira de clientes da Norty.
 */
@Injectable()
export class AberturaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: ThrottleService,
    private readonly tickets: TicketsService,
    private readonly formularios: FormulariosService,
    private readonly anexos: AttachmentsService,
  ) {}

  /**
   * Os tipos de chamado que a abertura sem login oferece.
   *
   * Só os marcados como públicos. A organização vem do cliente
   * escolhido, nunca do corpo: sem isso, qualquer um listaria a
   * taxonomia de qualquer organização passando um id.
   */
  async tiposPublicos(clientId: string): Promise<CategoriaPublica[]> {
    const cliente = await this.prisma.client.findFirst({
      where: { id: clientId, isActive: true },
      select: { organizationId: true },
    });
    if (!cliente) return [];

    return this.prisma.category.findMany({
      where: { organizationId: cliente.organizationId, isActive: true, isPublic: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Os modelos que valem na abertura sem login. Mesma regra de escopo. */
  async modelosPublicos(clientId: string): Promise<ModeloDeChamado[]> {
    const cliente = await this.prisma.client.findFirst({
      where: { id: clientId, isActive: true },
      select: { organizationId: true },
    });
    if (!cliente) return [];

    return this.formularios.modelos(cliente.organizationId, true);
  }

  private async exigirLiberado(ip: string, prefixo: string): Promise<string[]> {
    const chaves = [ThrottleService.chaveDeIp(`${prefixo}:${ip}`)];
    const faltam = await this.throttle.segundosBarrados(chaves);

    if (faltam > 0) {
      throw new HttpException(
        `Muitas tentativas. Tente de novo em ${Math.ceil(faltam / 60)} minuto(s).`,
        429,
      );
    }
    return chaves;
  }

  /**
   * As empresas que casam com o que a pessoa digitou.
   *
   * Devolve lista, e não a empresa: a tela mostra os nomes parecidos e
   * quem abre escolhe. Escolher sozinho pelo mais parecido poria o
   * chamado na empresa errada sem ninguém perceber — e num sistema de
   * chamados isso é o cliente A lendo o problema do cliente B.
   */
  async buscarEmpresas(digitado: string, ip: string): Promise<EmpresaPublica[]> {
    const termo = digitado.trim();
    if (termo.length < MINIMO_PARA_BUSCAR_EMPRESA) return [];

    const chaves = await this.exigirLiberado(ip, 'EMPRESA');

    const achadas = pareceDocumento(termo)
      ? await this.porDocumento(termo)
      : await this.porNome(termo);

    // Tentativa que não acha nada conta como erro. Sem isso, varrer a
    // carteira sairia de graça: é justamente a busca que não acha que o
    // varredor repete.
    if (achadas.length === 0) await this.throttle.registrarFalha(chaves);
    else await this.throttle.limpar(chaves);

    return achadas;
  }

  /**
   * Por documento: exato, sobre os dígitos.
   *
   * A pontuação some dos dois lados — do que a pessoa digitou aqui, e
   * do que está gravado pela coluna gerada. É o que faz o mesmo número
   * ser achado escrito de qualquer jeito.
   */
  private async porDocumento(termo: string): Promise<EmpresaPublica[]> {
    const digitos = soDigitos(termo);

    const linhas = await this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT c."id", c."name"
      FROM "clients" c
      WHERE c."isActive" = true
        AND c."documentoDigitos" = ${digitos}
      LIMIT ${QUANTAS_SUGESTOES}
    `;

    return linhas;
  }

  /**
   * Por nome: semelhança de trigramas sobre a forma normalizada.
   *
   * `word_similarity` e não `similarity`: esta compara o termo com o
   * **melhor trecho** do nome, e a outra com o nome inteiro. Medido:
   * "empresa" contra "Empresa do João Comércio de Materiais LTDA" dá
   * 0,19 em `similarity` — abaixo de qualquer limiar — e 1,0 em
   * `word_similarity`. Quem digita parte do nome não acharia nada com
   * a primeira.
   *
   * **O limiar precisa de transação de verdade.** A primeira versão
   * punha o `set_config` num CTE ao lado do `SELECT`, e não funcionava:
   * a ordem de avaliação entre um CTE e o resto da consulta não é
   * garantida, e o `<%` acabava usando o padrão do Postgres (0,6) em
   * vez de 0,5. O defeito era invisível — a busca simplesmente deixava
   * de achar os nomes na faixa entre os dois valores, e nenhum erro
   * aparecia. Medido: "emprza" casa 0,571 com "empresa do joão…" e
   * voltava zero.
   *
   * `SET LOCAL` dentro de uma transação interativa resolve as duas
   * coisas: roda antes do `SELECT`, na mesma conexão, e morre no fim da
   * transação — sem vazar configuração para a próxima requisição que
   * pegar essa conexão do pool.
   */
  private async porNome(termo: string): Promise<EmpresaPublica[]> {
    const normalizado = nomeDeEmpresaNormalizado(termo);
    if (!normalizado) return [];

    return this.prisma.$transaction(async (tx) => {
      // `SET LOCAL` não aceita parâmetro; o valor é uma constante nossa,
      // e `Number` fecha a porta para qualquer coisa que não seja número.
      const limiar = Number(SEMELHANCA_MINIMA_DO_NOME);
      await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${limiar}`);

      return tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT c."id", c."name"
        FROM "clients" c
        WHERE c."isActive" = true
          AND ${normalizado} <% c."buscaNome"
        ORDER BY word_similarity(${normalizado}, c."buscaNome") DESC, c."name" ASC
        LIMIT ${QUANTAS_SUGESTOES}
      `;
    });
  }

  /**
   * Abre o chamado.
   *
   * A organização vem do cliente, nunca do corpo da requisição: é o que
   * impede alguém de abrir chamado numa organização que não é a dona da
   * empresa que escolheu (CLAUDE.md, regra 3).
   */
  async abrir(dto: AbrirPublicoDto, ip: string): Promise<AberturaPublicaResposta> {
    const chaves = await this.exigirLiberado(ip, 'ABERTURA');

    const cliente = await this.prisma.client.findFirst({
      where: { id: dto.clientId, isActive: true },
      select: { id: true, organizationId: true },
    });

    if (!cliente) {
      await this.throttle.registrarFalha(chaves);
      throw new NotFoundException('Empresa não encontrada.');
    }

    const email = dto.requesterEmail?.trim().toLowerCase() || null;
    const telefone = dto.requesterPhone?.trim() || null;

    // Uma das duas é obrigatória: chamado sem forma de retorno é
    // chamado que ninguém consegue responder.
    if (!email && !telefone) {
      throw new BadRequestException('Informe um e-mail ou um WhatsApp para retorno.');
    }

    const contato = await this.resolverContato(cliente.organizationId, {
      name: dto.requesterName.trim(),
      email,
      phone: telefone,
    });

    // Categoria e modelo vêm do corpo, então não se confia neles: têm
    // de ser da organização do cliente **e** estar marcados como
    // públicos. Sem isso, quem soubesse um id usaria a tela sem login
    // para abrir chamado numa categoria interna.
    const categoria = await this.validarCategoria(cliente.organizationId, dto.categoryId);
    const { formId, customFields } = await this.validarModelo(
      cliente.organizationId,
      dto.formId,
      dto.customFields,
    );

    const observadores = await this.resolverObservadores(
      cliente.organizationId,
      dto.observerEmails ?? [],
      email,
    );

    const { id, number } = await this.tickets.abrirPorCanal({
      organizationId: cliente.organizationId,
      contactId: contato,
      clientId: cliente.id,
      channel: 'WEB',
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      categoryId: categoria ?? undefined,
      formId: formId ?? undefined,
      customFields,
      observerContactIds: observadores,
    });

    await this.throttle.limpar(chaves);

    const { protocol } = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      select: { protocol: true },
    });

    return { protocol, number };
  }

  /**
   * Anexa arquivo a um chamado aberto sem login.
   *
   * A credencial é o protocolo, como na consulta — e valem as mesmas
   * contenções, mais duas próprias do armazenamento: um teto de
   * arquivos por chamado e um limite de tamanho menor que o interno.
   * Sem eles, um protocolo conhecido seria disco de graça.
   */
  async anexar(
    digitado: string,
    arquivo: Express.Multer.File,
    ip: string,
  ): Promise<AttachmentView> {
    const chaves = await this.exigirLiberado(ip, 'ANEXO');

    const codigo = normalizarProtocolo(digitado);
    const chamado = codigo
      ? await this.prisma.ticket.findUnique({
          where: { protocol: codigo },
          select: {
            id: true,
            status: true,
            organizationId: true,
            originChannel: true,
            _count: { select: { attachments: true } },
          },
        })
      : null;

    if (!chamado) {
      await this.throttle.registrarFalha(chaves);
      throw new NotFoundException('Protocolo não encontrado.');
    }

    if (chamado._count.attachments >= MAXIMO_DE_ANEXOS_PUBLICOS) {
      throw new BadRequestException(
        `Este chamado já tem ${MAXIMO_DE_ANEXOS_PUBLICOS} arquivos. ` +
          'Responda pelo e-mail do chamado para mandar mais.',
      );
    }

    await this.throttle.limpar(chaves);

    return this.anexos.guardar(chamado, arquivo, null, undefined, TAMANHO_MAXIMO_PUBLICO);
  }

  /** A categoria tem de ser da organização e estar marcada como pública. */
  private async validarCategoria(
    organizationId: string,
    categoryId: string | undefined,
  ): Promise<string | null> {
    if (!categoryId) return null;

    const categoria = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId, isActive: true, isPublic: true },
      select: { id: true },
    });
    if (!categoria) throw new BadRequestException('Tipo de chamado não disponível.');
    return categoria.id;
  }

  /**
   * O modelo e as respostas dele.
   *
   * As respostas passam pelo **mesmo** `validarRespostas` da abertura
   * com login: um formulário é um formulário, e ter um validador
   * frouxo do lado de fora seria ter a porta dos fundos aberta
   * justamente onde ninguém provou ser ninguém.
   */
  private async validarModelo(
    organizationId: string,
    formId: string | undefined,
    respostas: Record<string, unknown> | undefined,
  ): Promise<{ formId: string | null; customFields: Record<string, unknown> | undefined }> {
    if (!formId) return { formId: null, customFields: undefined };

    const modelo = await this.prisma.ticketForm.findFirst({
      where: { id: formId, organizationId, isModel: true, isPublic: true },
      select: { id: true, schema: true },
    });
    if (!modelo) throw new BadRequestException('Modelo de chamado não disponível.');

    const dadas = respostas ?? {};
    const problemas = validarRespostas(modelo.schema as unknown as FormSchema, dadas);

    if (problemas.length > 0) {
      throw new BadRequestException(problemas.map((p) => p.mensagem).join(' '));
    }

    return {
      formId: modelo.id,
      customFields: Object.keys(dadas).length > 0 ? dadas : undefined,
    };
  }

  /**
   * Quem acompanha junto, por e-mail.
   *
   * E-mail e não id: quem abre sem login não conhece id de ninguém, e
   * oferecer-lhe uma lista de pessoas entregaria o catálogo da empresa
   * a quem só digitou um nome.
   *
   * Cada observador vira um `Contact`, como o requerente. Quem já tem
   * conta com aquele e-mail não é promovido aqui — virar usuário do
   * chamado por indicação de um estranho seria deixar qualquer um
   * inscrever qualquer pessoa.
   */
  private async resolverObservadores(
    organizationId: string,
    emails: string[],
    doRequerente: string | null,
  ): Promise<string[]> {
    const limpos = [
      ...new Set(
        emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0 && e !== doRequerente),
      ),
    ].slice(0, MAXIMO_DE_OBSERVADORES);

    const ids: string[] = [];
    for (const email of limpos) {
      ids.push(await this.resolverContato(organizationId, { name: email, email, phone: null }));
    }
    return ids;
  }

  /**
   * O contato de quem abriu, criado se ainda não existe.
   *
   * É o mesmo mecanismo do e-mail e do WhatsApp: quem escreve de fora
   * entra no chamado como `Contact`, sem conta. O nome é atualizado a
   * cada abertura porque a pessoa pode ter digitado errado da primeira
   * vez, e o último que ela mesma escreveu é o melhor palpite.
   */
  private async resolverContato(
    organizationId: string,
    dados: { name: string; email: string | null; phone: string | null },
  ): Promise<string> {
    const existente = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        OR: [
          ...(dados.email ? [{ email: dados.email }] : []),
          ...(dados.phone ? [{ phone: dados.phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (existente) {
      await this.prisma.contact.update({
        where: { id: existente.id },
        data: { name: dados.name },
      });
      return existente.id;
    }

    const criado = await this.prisma.contact.create({
      data: {
        organizationId,
        name: dados.name,
        email: dados.email,
        phone: dados.phone,
      },
      select: { id: true },
    });

    return criado.id;
  }

  /** A mensagem para um documento malformado. Serve à tela, não à busca. */
  static problemaNoDocumento(digitado: string): string | null {
    return pareceDocumento(digitado) ? documentoInvalido(digitado) : null;
  }
}
