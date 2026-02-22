import axios from 'axios';
import type {
  User,
  OrgUnit,
  OrgUnitSummary,
  JobCatalog,
  Requisition,
  Offer,
  OfferImpactResult,
  AuditLog,
  LoginResponse,
  Budget,
  Forecast,
  Actual,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });
          
          const { access_token } = response.data;
          localStorage.setItem('access_token', access_token);
          
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch {
          // Refresh failed, redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },
  
  logout: async (): Promise<void> => {
    await api.post('/api/auth/logout');
  },
  
  me: async (): Promise<User> => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};

// Org Units
export const orgUnitsApi = {
  list: async (): Promise<OrgUnit[]> => {
    const response = await api.get('/api/org-units');
    return response.data;
  },
  
  get: async (id: string): Promise<OrgUnit> => {
    const response = await api.get(`/api/org-units/${id}`);
    return response.data;
  },
  
  getSummary: async (id: string, months = 6): Promise<OrgUnitSummary> => {
    const response = await api.get(`/api/org-units/${id}/summary`, {
      params: { months },
    });
    return response.data;
  },
  
  create: async (data: Partial<OrgUnit>): Promise<OrgUnit> => {
    const response = await api.post('/api/org-units', data);
    return response.data;
  },
  
  update: async (id: string, data: Partial<OrgUnit>): Promise<OrgUnit> => {
    const response = await api.patch(`/api/org-units/${id}`, data);
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/org-units/${id}`);
  },
};

// Budgets
export const budgetsApi = {
  list: async (orgUnitId: string): Promise<Budget[]> => {
    const response = await api.get(`/api/org-units/${orgUnitId}/budgets`);
    return response.data;
  },
  
  create: async (orgUnitId: string, data: { month: string; approved_amount: number }): Promise<Budget> => {
    const response = await api.post(`/api/org-units/${orgUnitId}/budgets`, data);
    return response.data;
  },
};

// Forecasts
export const forecastsApi = {
  list: async (orgUnitId: string): Promise<Forecast[]> => {
    const response = await api.get(`/api/org-units/${orgUnitId}/forecasts`);
    return response.data;
  },
  
  create: async (orgUnitId: string, data: { month: string; amount: number }): Promise<Forecast> => {
    const response = await api.post(`/api/org-units/${orgUnitId}/forecasts`, data);
    return response.data;
  },
};

// Actuals
export const actualsApi = {
  list: async (orgUnitId: string): Promise<Actual[]> => {
    const response = await api.get(`/api/org-units/${orgUnitId}/actuals`);
    return response.data;
  },
  
  create: async (orgUnitId: string, data: { month: string; amount: number; finalized?: boolean }): Promise<Actual> => {
    const response = await api.post(`/api/org-units/${orgUnitId}/actuals`, data);
    return response.data;
  },
};

// Job Catalog
export const jobCatalogApi = {
  list: async (params?: { active?: boolean; job_family?: string }): Promise<JobCatalog[]> => {
    const response = await api.get('/api/job-catalog', { params });
    return response.data;
  },
  
  get: async (id: string): Promise<JobCatalog> => {
    const response = await api.get(`/api/job-catalog/${id}`);
    return response.data;
  },
  
  create: async (data: Partial<JobCatalog>): Promise<JobCatalog> => {
    const response = await api.post('/api/job-catalog', data);
    return response.data;
  },
  
  update: async (id: string, data: Partial<JobCatalog>): Promise<JobCatalog> => {
    const response = await api.patch(`/api/job-catalog/${id}`, data);
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/job-catalog/${id}`);
  },
};

// Requisitions
export const requisitionsApi = {
  list: async (params?: {
    org_unit_id?: string;
    status?: string;
    priority?: string;
    owner_id?: string;
    has_candidate_ready?: boolean;
  }): Promise<Requisition[]> => {
    const response = await api.get('/api/requisitions', { params });
    return response.data;
  },
  
  get: async (id: string): Promise<Requisition> => {
    const response = await api.get(`/api/requisitions/${id}`);
    return response.data;
  },
  
  create: async (data: Partial<Requisition>): Promise<Requisition> => {
    const response = await api.post('/api/requisitions', data);
    return response.data;
  },
  
  update: async (id: string, data: Partial<Requisition>): Promise<Requisition> => {
    const response = await api.patch(`/api/requisitions/${id}`, data);
    return response.data;
  },
  
  transition: async (id: string, status: string): Promise<Requisition> => {
    const response = await api.post(`/api/requisitions/${id}/transition`, { status });
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/requisitions/${id}`);
  },
};

// Offers
export const offersApi = {
  list: async (params?: {
    status?: string;
    org_unit_id?: string;
    requisition_id?: string;
  }): Promise<Offer[]> => {
    const response = await api.get('/api/offers', { params });
    return response.data;
  },
  
  get: async (id: string): Promise<Offer> => {
    const response = await api.get(`/api/offers/${id}`);
    return response.data;
  },
  
  create: async (data: Partial<Offer>): Promise<Offer> => {
    const response = await api.post('/api/offers', data);
    return response.data;
  },
  
  update: async (id: string, data: Partial<Offer>): Promise<Offer> => {
    const response = await api.patch(`/api/offers/${id}`, data);
    return response.data;
  },
  
  previewImpact: async (offerIds: string[], monthsAhead = 6): Promise<OfferImpactResult> => {
    const response = await api.post('/api/offers/preview-impact', {
      offer_ids: offerIds,
      months_ahead: monthsAhead,
    });
    return response.data;
  },
  
  previewNewPositions: async (
    orgUnitId: string,
    positions: Array<{ job_catalog_id: string; monthly_cost: number; start_date: string }>,
    monthsAhead = 6
  ): Promise<OfferImpactResult> => {
    const response = await api.post('/api/offers/preview-new-positions', {
      org_unit_id: orgUnitId,
      positions,
      months_ahead: monthsAhead,
    });
    return response.data;
  },
  
  approve: async (id: string): Promise<Offer> => {
    const response = await api.post(`/api/offers/${id}/approve`);
    return response.data;
  },
  
  send: async (id: string): Promise<Offer> => {
    const response = await api.post(`/api/offers/${id}/send`);
    return response.data;
  },
  
  hold: async (id: string, reason: string, untilDate?: string): Promise<Offer> => {
    const response = await api.post(`/api/offers/${id}/hold`, {
      reason,
      until_date: untilDate,
    });
    return response.data;
  },
  
  accept: async (id: string, data?: { final_monthly_cost?: number; start_date?: string }): Promise<Offer> => {
    const response = await api.post(`/api/offers/${id}/accept`, data || {});
    return response.data;
  },
  
  changeStartDate: async (id: string, newStartDate: string, notes?: string): Promise<Offer> => {
    const response = await api.post(`/api/offers/${id}/change-start-date`, {
      new_start_date: newStartDate,
      notes,
    });
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/offers/${id}`);
  },
};

// Data Exchange
export const dataExchangeApi = {
  exportCsv: async (entity: string, orgUnitId?: string) => {
    const path = orgUnitId ? `/api/export/${entity}/${orgUnitId}` : `/api/export/${entity}`;
    const response = await api.get(path, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const disposition = response.headers['content-disposition'];
    const filename = disposition?.match(/filename="(.+)"/)?.[1] || `${entity}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  
  importCsv: async (entity: string, file: File, orgUnitId?: string): Promise<{ created: number; updated: number; note?: string }> => {
    const path = orgUnitId ? `/api/import/${entity}/${orgUnitId}` : `/api/import/${entity}`;
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// Admin
export const adminApi = {
  listUsers: async (): Promise<User[]> => {
    const response = await api.get('/api/admin/users');
    return response.data;
  },
  
  getUser: async (id: string): Promise<User> => {
    const response = await api.get(`/api/admin/users/${id}`);
    return response.data;
  },
  
  createUser: async (data: { email: string; name: string; password: string; role: string; org_unit_id?: string; job_catalog_id?: string }): Promise<User> => {
    const response = await api.post('/api/admin/users', data);
    return response.data;
  },
  
  updateUser: async (id: string, data: Partial<User & { password?: string }>): Promise<User> => {
    const response = await api.patch(`/api/admin/users/${id}`, data);
    return response.data;
  },
  
  deleteUser: async (id: string): Promise<void> => {
    await api.delete(`/api/admin/users/${id}`);
  },
  
  listAuditLogs: async (params?: {
    entity_type?: string;
    entity_id?: string;
    user_id?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditLog[]> => {
    const response = await api.get('/api/admin/audit-logs', { params });
    return response.data;
  },
};

export default api;
