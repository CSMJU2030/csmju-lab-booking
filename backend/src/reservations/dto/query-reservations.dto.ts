import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryReservationsDto extends PaginationQueryDto {
  /** `mine` (ค่าเริ่มต้น) = เฉพาะของตัวเอง · `all` = ของทุกคน (ต้องมี reservation:read:any) */
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all' = 'mine';
}
