import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';
import { CondominiumId, CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CreateProfessionalDto, CreateReviewDto, CreateServiceRequestDto } from './dto';
import type { RequestUser } from '../../common/types';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Get()
  @RequirePermission('professionals.view')
  list(
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('category') category?: string,
    @Query('recommended') recommended?: string,
    @Query('emergency') emergency?: string,
    @Query('sort') sort?: 'relevancia' | 'nota' | 'trabalhos' | 'preco',
  ) {
    return this.professionals.list(condominiumId, query, {
      category,
      recommended: recommended === 'true',
      emergency: emergency === 'true',
      sort,
    });
  }

  @Get('categories')
  @RequirePermission('professionals.view')
  categories(@CondominiumId() condominiumId: string) {
    return this.professionals.categories(condominiumId);
  }

  @Get('requests')
  @RequirePermission('professionals.view')
  requests(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.professionals.requests(user, condominiumId, query);
  }

  @Get(':id')
  @RequirePermission('professionals.view')
  detail(@CondominiumId() condominiumId: string, @Param('id') id: string) {
    return this.professionals.detail(condominiumId, id);
  }

  @Post('requests')
  @RequirePermission('professionals.view')
  requestQuote(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateServiceRequestDto,
  ) {
    return this.professionals.requestQuote(user, condominiumId, dto);
  }

  @Post(':id/reviews')
  @RequirePermission('professionals.view')
  review(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.professionals.review(user, condominiumId, id, dto);
  }

  @Post()
  @RequirePermission('professionals.manage')
  create(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateProfessionalDto,
  ) {
    return this.professionals.create(user, condominiumId, dto);
  }
}
