import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Page } from '@myhome/shared';

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  // O teto existe para que ninguém peça `pageSize=100000` e derrube a API.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  pageSize = DEFAULT_PAGE_SIZE;

  @IsOptional() @IsString() @MaxLength(120)
  q?: string;

  @IsOptional() @IsString() @MaxLength(40)
  sort?: string;

  @IsOptional() @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}

export function paginated<T>(items: T[], total: number, query: PageQueryDto): Page<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
