import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AppException } from '../errors';

/**
 * Upper bound for `?page=`. Combined with MAX_LIMIT this caps the SQL OFFSET a
 * client can ask for. Without it, `?page=1000000000000` becomes an OFFSET in
 * the trillions: PostgreSQL still has to walk and discard every preceding row,
 * so a single well-formed request can pin the database.
 */
export const MAX_PAGE = 500;

/** Upper bound for `?limit=` (rows per page). */
export const MAX_LIMIT = 100;

/** Defence in depth for subclasses that widen MAX_PAGE or MAX_LIMIT. */
export const MAX_OFFSET = MAX_PAGE * MAX_LIMIT;

const DEFAULT_LIMIT = 20;

/** Shared `?page=&limit=` query parameters for collection endpoints. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;

  get skip(): number {
    const offset = ((this.page ?? 1) - 1) * (this.limit ?? DEFAULT_LIMIT);

    if (offset > MAX_OFFSET) {
      throw AppException.badRequest(
        'Requested page is out of range. Narrow the result with a filter instead of paging deeper.',
        { maxPage: MAX_PAGE, maxOffset: MAX_OFFSET },
      );
    }

    return offset;
  }

  get take(): number {
    return this.limit ?? DEFAULT_LIMIT;
  }
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
