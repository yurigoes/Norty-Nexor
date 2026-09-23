import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AI_PROVIDERS, COPILOT_INTENCOES, LIMITE_DO_RASCUNHO } from '@norty-desk/shared';

export class PedirAoCopilotoDto {
  @IsIn(COPILOT_INTENCOES) intencao!: (typeof COPILOT_INTENCOES)[number];

  /**
   * O que o técnico quer dizer, do jeito que ele escreveu.
   *
   * Presente, o REDIGIR reescreve isto em vez de inventar uma resposta
   * a partir do chamado. É o caso comum: quem atende sabe a resposta e
   * quer a forma.
   */
  @IsOptional() @IsString() @MaxLength(LIMITE_DO_RASCUNHO) rascunho?: string;
}

export class EscreverAiConfigDto {
  @IsIn(AI_PROVIDERS) provider!: (typeof AI_PROVIDERS)[number];
  @IsString() @MinLength(2) @MaxLength(120) model!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /**
   * A chave do provedor.
   *
   * Omitida, mantém a que está guardada — assim dá para mexer no modelo
   * sem redigitar a chave. String vazia apaga, que é como se desliga
   * sem perder o resto da configuração.
   */
  @IsOptional() @IsString() @MaxLength(400) apiKey?: string;
}
