import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  MAX_LIMIT,
  MAX_OFFSET,
  MAX_PAGE,
  PaginationQueryDto,
  buildPaginationMeta,
} from './pagination.dto';

function validate(query: Record<string, unknown>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  return { dto, errors: validateSync(dto) };
}

describe('PaginationQueryDto', () => {
  it('defaults to the first page with 20 rows', () => {
    const dto = new PaginationQueryDto();
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(20);
  });

  it('computes skip from page and limit', () => {
    const { dto, errors } = validate({ page: 3, limit: 25 });
    expect(errors).toHaveLength(0);
    expect(dto.skip).toBe(50);
    expect(dto.take).toBe(25);
  });

  it('accepts the highest page and limit still inside the range', () => {
    const { dto, errors } = validate({ page: MAX_PAGE, limit: MAX_LIMIT });
    expect(errors).toHaveLength(0);
    expect(dto.skip).toBe((MAX_PAGE - 1) * MAX_LIMIT);
  });

  // Regression: `page` used to carry only @Min(1). `?page=1000000000000`
  // became an OFFSET in the trillions, which PostgreSQL answers by walking and
  // discarding every preceding row.
  it.each([MAX_PAGE + 1, 10_000, 1_000_000_000_000])('rejects page %s as out of range', (page) => {
    const { errors } = validate({ page, limit: MAX_LIMIT });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('still rejects an oversized limit', () => {
    const { errors } = validate({ limit: MAX_LIMIT + 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('rejects page and limit below one', () => {
    expect(validate({ page: 0 }).errors).toHaveLength(1);
    expect(validate({ limit: 0 }).errors).toHaveLength(1);
  });

  // Defence in depth for a subclass that widens MAX_PAGE or MAX_LIMIT: the
  // offset ceiling is enforced again at the point of use.
  it('throws a 400 when the computed offset exceeds the ceiling', () => {
    const dto = new PaginationQueryDto();
    dto.page = MAX_PAGE * 10;
    dto.limit = MAX_LIMIT;

    // Sanity check on the fixture: this page really is past the ceiling.
    expect((dto.page - 1) * dto.limit).toBeGreaterThan(MAX_OFFSET);

    expect(() => dto.skip).toThrow(/out of range/i);

    const error = (() => {
      try {
        void dto.skip;
        return undefined;
      } catch (thrown) {
        return thrown as { getStatus(): number };
      }
    })();

    expect(error).toBeDefined();
    expect(error?.getStatus()).toBe(400);
  });
});

describe('buildPaginationMeta', () => {
  it('reports the page count for the given limit', () => {
    expect(buildPaginationMeta(45, 2, 20)).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
    });
  });

  it('never divides by zero', () => {
    expect(buildPaginationMeta(10, 1, 0)).toMatchObject({ totalPages: 0 });
  });
});
