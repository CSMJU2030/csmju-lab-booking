import { Controller } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

/** No public routes yet: bookings are created through ReservationsService. */
@Controller('v1/reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}
}
