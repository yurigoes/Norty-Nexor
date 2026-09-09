import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';

/** A marca é uma linha só; o id é fixo para não haver a segunda. */
const ID = 'unica';

/** SVG e PNG bastam. Um logo é arte vetorial ou bitmap com transparência. */
const TIPOS_ACEITOS = ['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'];

/** Logo é arquivo pequeno. Acima disso é imagem que alguém não otimizou. */
const TAMANHO_MAXIMO = 512 * 1024;

export type MarcaPublica = {
  productName: string;
  tagline: string | null;
  /** Nulo significa usar a marca embutida no aplicativo. */
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
};

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
  ) {}

  private async linha() {
    return this.prisma.brand.upsert({
      where: { id: ID },
      create: { id: ID },
      update: {},
    });
  }

  /**
   * O que a tela de entrada lê, **sem autenticação**.
   *
   * A marca aparece antes do login, e antes do login não há token nem
   * organização. Por isso este endpoint é público — e por isso ele não
   * devolve nada além da marca.
   */
  async publica(): Promise<MarcaPublica> {
    const marca = await this.linha();
    const prefixo = process.env.API_PREFIX ?? 'v1';

    return {
      productName: marca.productName,
      tagline: marca.tagline,
      // A versão entra na URL: sem ela o navegador serve a logo antiga
      // do cache depois da troca, e o operador jura que o upload falhou.
      logoUrl: marca.logoKey ? `/${prefixo}/brand/logo?v=${marca.version}` : null,
      faviconUrl: marca.faviconKey ? `/${prefixo}/brand/favicon?v=${marca.version}` : null,
      version: marca.version,
    };
  }

  async editar(dados: { productName?: string; tagline?: string | null }): Promise<MarcaPublica> {
    await this.linha();
    await this.prisma.brand.update({
      where: { id: ID },
      data: {
        ...(dados.productName ? { productName: dados.productName.trim() } : {}),
        ...(dados.tagline !== undefined ? { tagline: dados.tagline?.trim() || null } : {}),
      },
    });
    return this.publica();
  }

  async enviarImagem(
    qual: 'logo' | 'favicon',
    arquivo: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<MarcaPublica> {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Arquivo vazio.');

    if (!TIPOS_ACEITOS.includes(arquivo.mimetype)) {
      throw new BadRequestException(
        `Formato não aceito. Envie ${TIPOS_ACEITOS.join(', ')}.`,
      );
    }

    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new BadRequestException(
        `Imagem acima de ${Math.round(TAMANHO_MAXIMO / 1024)} KB. Otimize antes de subir.`,
      );
    }

    // SVG é documento executável: um `<script>` dentro dele roda na
    // origem que o serve. Ou ele vem limpo, ou não entra.
    if (arquivo.mimetype === 'image/svg+xml') {
      BrandService.exigirSvgSeguro(arquivo.buffer.toString('utf8'));
    }

    const marca = await this.linha();
    const versao = marca.version + 1;
    const chave = `marca/${qual}-${versao}`;

    await this.armazenamento.guardar(chave, arquivo.buffer, arquivo.mimetype);

    const anterior = qual === 'logo' ? marca.logoKey : marca.faviconKey;

    await this.prisma.brand.update({
      where: { id: ID },
      data: {
        version: versao,
        ...(qual === 'logo'
          ? { logoKey: chave, logoContentType: arquivo.mimetype }
          : { faviconKey: chave, faviconContentType: arquivo.mimetype }),
      },
    });

    // A imagem antiga sai depois de a nova estar gravada e apontada.
    if (anterior) await this.armazenamento.remover(anterior).catch(() => undefined);

    return this.publica();
  }

  async removerImagem(qual: 'logo' | 'favicon'): Promise<MarcaPublica> {
    const marca = await this.linha();
    const chave = qual === 'logo' ? marca.logoKey : marca.faviconKey;
    if (!chave) return this.publica();

    await this.prisma.brand.update({
      where: { id: ID },
      data: {
        version: marca.version + 1,
        ...(qual === 'logo'
          ? { logoKey: null, logoContentType: null }
          : { faviconKey: null, faviconContentType: null }),
      },
    });

    await this.armazenamento.remover(chave).catch(() => undefined);
    return this.publica();
  }

  async imagem(qual: 'logo' | 'favicon'): Promise<{ fluxo: Readable; contentType: string }> {
    const marca = await this.linha();
    const chave = qual === 'logo' ? marca.logoKey : marca.faviconKey;
    const tipo = qual === 'logo' ? marca.logoContentType : marca.faviconContentType;

    if (!chave) throw new NotFoundException('Nenhuma imagem enviada.');

    return {
      fluxo: await this.armazenamento.ler(chave),
      contentType: tipo ?? 'application/octet-stream',
    };
  }

  /**
   * Recusa SVG com script, evento embutido ou referência externa.
   *
   * Um SVG servido na origem da API é código na origem da API. A lista
   * é de negação porque a de permissão exigiria um analisador de SVG
   * inteiro — e para um arquivo de logo, negar o perigoso conhecido e
   * pedir um PNG no resto é a troca certa.
   */
  private static exigirSvgSeguro(texto: string): void {
    const perigos: [RegExp, string][] = [
      [/<\s*script/i, 'contém <script>'],
      [/<\s*foreignObject/i, 'contém <foreignObject>'],
      [/<\s*(iframe|embed|object)/i, 'contém conteúdo embutido'],
      [/\son\w+\s*=/i, 'tem atributo de evento (onload, onclick…)'],
      [/javascript:/i, 'tem URL javascript:'],
      [/<!ENTITY/i, 'declara entidade (risco de expansão)'],
      [/xlink:href\s*=\s*["']\s*(?!#)/i, 'referencia recurso externo'],
    ];

    for (const [padrao, motivo] of perigos) {
      if (padrao.test(texto)) {
        throw new BadRequestException(
          `Este SVG ${motivo} e não pode ser usado como logo. ` +
            'Exporte sem script e sem interatividade, ou envie um PNG.',
        );
      }
    }
  }
}
