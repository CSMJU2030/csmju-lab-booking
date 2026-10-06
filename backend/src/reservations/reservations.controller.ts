import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';
import { ReservationsService } from './reservations.service';

@Controller('v1/reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @RequirePermissions(Permission.RESERVATION_CREATE_OWN)
  create(@CurrentUser() user: CoreHubIdentity, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user, dto);
  }

  @Get()
  @RequirePermissions(Permission.RESERVATION_READ_OWN, Permission.RESERVATION_READ_ANY)
  async findAll(
    @CurrentUser() user: CoreHubIdentity,
    @Query() query: QueryReservationsDto,
  ) {
    const { items, total } = await this.reservationsService.list(user, query);
    return new CollectionResult(
      items,
      buildPaginationMeta(total, query.page ?? 1, query.take),
    );
  }

  @Delete(':id')
  @RequirePermissions(Permission.RESERVATION_DELETE_OWN, Permission.RESERVATION_DELETE_ANY)
  remove(
    @CurrentUser() user: CoreHubIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservationsService.remove(user, id);
  }
}
