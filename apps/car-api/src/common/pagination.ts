import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Paginated } from '@nortycar/shared';

/** Query padrão de listagem: página, tamanho, busca e ordenação. */
export class PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export function pageArgs(query: { page?: number; pageSize?: number }): { skip: number; take: number; page: number; pageSize: number } {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Ordenação só por campos de uma lista permitida — nada de campo arbitrário vindo da URL. */
export function orderBy(query: { sort?: string; order?: 'asc' | 'desc' }, allowed: string[], fallback: Record<string, 'asc' | 'desc'>): Record<string, 'asc' | 'desc'> {
  if (query.sort && allowed.includes(query.sort)) return { [query.sort]: query.order ?? 'asc' };
  return fallback;
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize };
}

/** Converte "true"/"false" de query string. */
export const ToBool = () => Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined));
export const ToNumber = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)));
