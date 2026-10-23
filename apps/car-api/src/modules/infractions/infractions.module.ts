import { Module } from '@nestjs/common';
import { InfractionsController } from './infractions.controller';
import { InfractionsService } from './infractions.service';

@Module({ controllers: [InfractionsController], providers: [InfractionsService] })
export class InfractionsModule {}
