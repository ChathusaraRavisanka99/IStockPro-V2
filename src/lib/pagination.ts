export const PAGE_SIZES = [10, 25, 50, 100] as const;

export function parsePage(value?: string) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parsePageSize(value?: string) {
  const pageSize = Number(value || 25);
  return PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number]) ? pageSize : 25;
}
