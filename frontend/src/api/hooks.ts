import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  AdjustmentReason,
  InventoryLine,
  MenuItem,
  Outlet,
  OutletMenuItem,
  Page,
  PaymentMethod,
  RevenueReport,
  Sale,
  TopItemsReport,
} from './types';

export interface DateRange {
  from?: string;
  to?: string;
}

const keys = {
  outlets: ['outlets'] as const,
  outlet: (id: string) => ['outlets', id] as const,
  menuItems: ['menu-items'] as const,
  outletMenu: (id: string) => ['outlet-menu', id] as const,
  inventory: (id: string) => ['inventory', id] as const,
  sales: (id: string) => ['sales', id] as const,
  reports: ['reports'] as const,
};

// Outlets ----------------------------------------------------------------------------------------------------------

export const useOutlets = (params: { search?: string; limit?: number; offset?: number } = {}) =>
  useQuery({
    queryKey: [...keys.outlets, params],
    queryFn: () => api<Page<Outlet>>('/outlets', { query: { limit: 100, ...params } }),
    placeholderData: keepPreviousData,
  });

export const useOutlet = (id: string) =>
  useQuery({
    queryKey: keys.outlet(id),
    queryFn: async () => (await api<{ data: Outlet }>(`/outlets/${id}`)).data,
  });

export function useSaveOutlet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      code?: string;
      name?: string;
      address?: string | null;
      isActive?: boolean;
    }) =>
      id
        ? api<{ data: Outlet }>(`/outlets/${id}`, { method: 'PATCH', body })
        : api<{ data: Outlet }>('/outlets', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.outlets }),
  });
}

// Master menu ------------------------------------------------------------------------------------------------------

export const useMenuItems = (
  params: { search?: string; category?: string; isActive?: boolean } = {},
) =>
  useQuery({
    queryKey: [...keys.menuItems, params],
    queryFn: () => api<Page<MenuItem>>('/menu-items', { query: { limit: 100, ...params } }),
    placeholderData: keepPreviousData,
  });

export function useSaveMenuItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      sku?: string;
      name?: string;
      description?: string | null;
      category?: string;
      basePriceCents?: number;
      isActive?: boolean;
    }) =>
      id
        ? api<{ data: MenuItem }>(`/menu-items/${id}`, { method: 'PATCH', body })
        : api<{ data: MenuItem }>('/menu-items', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.menuItems });
      queryClient.invalidateQueries({ queryKey: ['outlet-menu'] });
    },
  });
}

// Outlet menu ------------------------------------------------------------------------------------------------------

export const useOutletMenu = (outletId: string, sellable = false) =>
  useQuery({
    queryKey: [...keys.outletMenu(outletId), { sellable }],
    queryFn: async () =>
      (
        await api<{ data: OutletMenuItem[] }>(`/outlets/${outletId}/menu-items`, {
          query: { sellable },
        })
      ).data,
  });

export function useAssignItem(outletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      menuItemId,
      method,
      ...body
    }: {
      menuItemId: string;
      method: 'PUT' | 'PATCH';
      priceOverrideCents?: number | null;
      isAvailable?: boolean;
    }) =>
      api<{ data: OutletMenuItem }>(`/outlets/${outletId}/menu-items/${menuItemId}`, {
        method,
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.outletMenu(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.inventory(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.menuItems });
    },
  });
}

export function useUnassignItem(outletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (menuItemId: string) =>
      api<void>(`/outlets/${outletId}/menu-items/${menuItemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.outletMenu(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.inventory(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.menuItems });
    },
  });
}

// Inventory --------------------------------------------------------------------------------------------------------

export const useInventory = (outletId: string) =>
  useQuery({
    queryKey: keys.inventory(outletId),
    queryFn: async () =>
      (await api<{ data: InventoryLine[] }>(`/outlets/${outletId}/inventory`)).data,
  });

export function useAdjustStock(outletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      menuItemId,
      ...body
    }: {
      menuItemId: string;
      quantityDelta: number;
      reason: AdjustmentReason;
      note?: string | null;
    }) => api(`/outlets/${outletId}/inventory/${menuItemId}/adjustments`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.inventory(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.outletMenu(outletId) });
    },
  });
}

// Sales ------------------------------------------------------------------------------------------------------------

export const useSales = (outletId: string, params: DateRange & { limit: number; offset: number }) =>
  useQuery({
    queryKey: [...keys.sales(outletId), params],
    queryFn: () => api<Page<Sale>>(`/outlets/${outletId}/sales`, { query: { ...params } }),
    placeholderData: keepPreviousData,
  });

export function useCreateSale(outletId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The key is chosen once per checkout attempt, so a retry after a timeout cannot charge twice.
    mutationFn: ({
      idempotencyKey,
      ...body
    }: {
      idempotencyKey: string;
      items: { menuItemId: string; quantity: number }[];
      paymentMethod: PaymentMethod;
      note?: string | null;
    }) =>
      api<{ data: Sale }>(`/outlets/${outletId}/sales`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sales(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.reports });
    },
    // Stock and availability may have changed whether or not the sale went through (a 409 means they did).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.outletMenu(outletId) });
      queryClient.invalidateQueries({ queryKey: keys.inventory(outletId) });
    },
  });
}

// Reports ----------------------------------------------------------------------------------------------------------

export const useRevenueReport = (range: DateRange, enabled = true) =>
  useQuery({
    queryKey: [...keys.reports, 'revenue', range],
    queryFn: async () =>
      (await api<{ data: RevenueReport }>('/reports/revenue-by-outlet', { query: { ...range } }))
        .data,
    enabled,
    placeholderData: keepPreviousData,
  });

export const useTopItemsReport = (params: DateRange & { outletId?: string; limit?: number }) =>
  useQuery({
    queryKey: [...keys.reports, 'top-items', params],
    queryFn: async () =>
      (await api<{ data: TopItemsReport }>('/reports/top-items', { query: { ...params } })).data,
    placeholderData: keepPreviousData,
  });
