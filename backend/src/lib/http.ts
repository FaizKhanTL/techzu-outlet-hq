export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export const page = <T>(data: T[], meta: PageMeta) => ({ data, meta });
