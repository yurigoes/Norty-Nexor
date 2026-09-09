import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * A porta de armazenamento.
 *
 * Existe para o resto do sistema não saber se o arquivo está no MinIO
 * do CT 102 ou no disco da máquina de quem desenvolve. Quem sabe é a
 * fábrica, uma vez, na subida.
 *
 * `urlAssinada` devolve `null` quando o driver não sabe assinar — aí o
 * controller transmite o conteúdo ele mesmo. É o caso do disco.
 */
export interface PortaDeArmazenamento {
  guardar(chave: string, conteudo: Buffer, contentType: string): Promise<void>;
  urlAssinada(chave: string, validadeSegundos: number): Promise<string | null>;
  ler(chave: string): Promise<Readable>;
  remover(chave: string): Promise<void>;
}

export const PORTA_DE_ARMAZENAMENTO = Symbol('PortaDeArmazenamento');

/**
 * Driver de disco, para desenvolvimento e para a suíte.
 *
 * Não assina URL: o conteúdo sai pela própria API, já autorizado.
 */
@Injectable()
export class ArmazenamentoEmDisco implements PortaDeArmazenamento {
  private readonly raiz: string;

  constructor(raiz: string) {
    this.raiz = resolve(raiz);
  }

  /**
   * A chave vem de dado do usuário (nome de arquivo entra nela), então
   * ela é tratada como hostil: qualquer coisa que escape da raiz é
   * recusada antes de tocar o disco.
   */
  private caminho(chave: string): string {
    const destino = resolve(join(this.raiz, normalize(chave)));
    if (destino !== this.raiz && !destino.startsWith(this.raiz + sep)) {
      throw new Error(`Chave de armazenamento fora da raiz: ${chave}`);
    }
    return destino;
  }

  async guardar(chave: string, conteudo: Buffer): Promise<void> {
    const destino = this.caminho(chave);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, conteudo);
  }

  async urlAssinada(): Promise<string | null> {
    return null;
  }

  async ler(chave: string): Promise<Readable> {
    return createReadStream(this.caminho(chave));
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminho(chave), { force: true });
  }
}

/** Driver do MinIO do CT 102 Yggdrasil (`docs/11-infra.md`, seção 2). */
@Injectable()
export class ArmazenamentoNoMinio implements PortaDeArmazenamento {
  private readonly logger = new Logger(ArmazenamentoNoMinio.name);
  private cliente: import('minio').Client | null = null;

  constructor(
    private readonly config: {
      endPoint: string;
      port: number;
      useSSL: boolean;
      accessKey: string;
      secretKey: string;
      bucket: string;
    },
  ) {}

  /** O cliente é criado na primeira chamada: subir a API não deve
      depender de o MinIO estar de pé. */
  private async obterCliente(): Promise<import('minio').Client> {
    if (this.cliente) return this.cliente;

    const { Client } = await import('minio');
    this.cliente = new Client({
      endPoint: this.config.endPoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });

    if (!(await this.cliente.bucketExists(this.config.bucket))) {
      await this.cliente.makeBucket(this.config.bucket);
      this.logger.log(`Bucket ${this.config.bucket} criado.`);
    }

    return this.cliente;
  }

  async guardar(chave: string, conteudo: Buffer, contentType: string): Promise<void> {
    const cliente = await this.obterCliente();
    await cliente.putObject(this.config.bucket, chave, conteudo, conteudo.length, {
      'Content-Type': contentType,
    });
  }

  async urlAssinada(chave: string, validadeSegundos: number): Promise<string> {
    const cliente = await this.obterCliente();
    return cliente.presignedGetObject(this.config.bucket, chave, validadeSegundos);
  }

  async ler(chave: string): Promise<Readable> {
    const cliente = await this.obterCliente();
    return cliente.getObject(this.config.bucket, chave);
  }

  async remover(chave: string): Promise<void> {
    const cliente = await this.obterCliente();
    await cliente.removeObject(this.config.bucket, chave);
  }
}

/**
 * Escolhe o driver pela configuração.
 *
 * `ARMAZENAMENTO=disco` em desenvolvimento e na suíte; `minio` em
 * produção. Um valor desconhecido derruba a subida em vez de cair num
 * padrão silencioso — guardar anexo no lugar errado só se descobre
 * quando alguém precisa dele de volta.
 */
export function criarArmazenamento(config: ConfigService): PortaDeArmazenamento {
  const tipo = config.get<string>('ARMAZENAMENTO') ?? 'minio';

  if (tipo === 'disco') {
    return new ArmazenamentoEmDisco(
      config.get<string>('ARMAZENAMENTO_DIR') ?? '/tmp/norty-desk-anexos',
    );
  }

  if (tipo === 'minio') {
    const obrigatorio = (chave: string): string => {
      const valor = config.get<string>(chave);
      if (!valor) throw new Error(`${chave} é obrigatório quando ARMAZENAMENTO=minio.`);
      return valor;
    };

    return new ArmazenamentoNoMinio({
      endPoint: obrigatorio('MINIO_ENDPOINT'),
      port: Number(config.get<string>('MINIO_PORT') ?? 9000),
      useSSL: config.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: obrigatorio('MINIO_ACCESS_KEY'),
      secretKey: obrigatorio('MINIO_SECRET_KEY'),
      bucket: config.get<string>('MINIO_BUCKET') ?? 'norty-desk',
    });
  }

  throw new Error(`ARMAZENAMENTO desconhecido: "${tipo}". Use "disco" ou "minio".`);
}

/** Açúcar para injetar a porta sem repetir o símbolo. */
export const InjetarArmazenamento = () => Inject(PORTA_DE_ARMAZENAMENTO);
