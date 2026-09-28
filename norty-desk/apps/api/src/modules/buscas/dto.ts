import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { COMPARTILHAMENTOS, type Compartilhamento } from '@norty-desk/shared';

import { FiltroSalvavelDto } from '../tickets/dto';

/**
 * Uma busca salva.
 *
 * O filtro entra como objeto aninhado, validado pelo **mesmo** DTO que a
 * fila usa (`FiltroSalvavelDto`). Duas consequências que são a razão de
 * ser assim:
 *
 * 1. Status inventado, prioridade fora da escala, uuid que não é uuid:
 *    tudo é 400 na hora de salvar, e não uma aba que abre vazia meses
 *    depois sem ninguém entender por quê.
 * 2. Com `forbidNonWhitelisted`, campo desconhecido dentro do filtro
 *    também é 400. Uma versão nova da tela que mande um campo que a API
 *    ainda não conhece falha alto, em vez de gravar algo que a fila
 *    ignora em silêncio.
 */
export class CriarBuscaSalvaDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => FiltroSalvavelDto)
  filtro!: FiltroSalvavelDto;

  /** Se esta passa a ser a que a fila abre — de quem está salvando. */
  @IsOptional() @IsBoolean() isDefault?: boolean;

  /**
   * Com quem ela é compartilhada. Ausente é `PRIVADA`.
   *
   * Quem pode cada alcance é decidido no serviço, não aqui: a pergunta
   * "é gerente deste time?" precisa do banco.
   */
  @IsOptional() @IsIn(COMPARTILHAMENTOS) shareKind?: Compartilhamento;

  /** Obrigatório quando `shareKind` é `TIME`; recusado nos outros. */
  @IsOptional() @IsUUID() teamId?: string | null;
}

/** Tudo opcional: renomear não obriga a remandar o filtro. */
export class AtualizarBuscaSalvaDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FiltroSalvavelDto)
  filtro?: FiltroSalvavelDto;

  @IsOptional() @IsBoolean() isDefault?: boolean;

  @IsOptional() @IsIn(COMPARTILHAMENTOS) shareKind?: Compartilhamento;
  @IsOptional() @IsUUID() teamId?: string | null;
}

/**
 * A nova ordem das abas, inteira.
 *
 * A lista completa, e não "mova esta para a posição 3": posição relativa
 * exige que o servidor reescreva as vizinhas, e duas pessoas arrastando
 * ao mesmo tempo deixariam buracos. Mandar a lista toda torna a operação
 * idempotente — o que chegou é o que fica.
 */
export class ReordenarBuscasDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID(undefined, { each: true }) ids!: string[];
}
