export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER';
  org_unit_id: string | null;
  org_unit: OrgUnit | null;
  job_catalog_id: string | null;
  job_catalog: { id: string; title: string; level: string; hierarchy_level: number } | null;
  active: boolean;
  created_at: string;
}

export interface OrgUnit {
  id: string;
  name: string;
  currency: string;
  active: boolean;
  created_at: string;
}

export interface Budget {
  id: string;
  org_unit_id: string;
  month: string;
  approved_amount: number;
  currency: string;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Forecast {
  id: string;
  org_unit_id: string;
  month: string;
  amount: number;
  currency: string;
  source: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Actual {
  id: string;
  org_unit_id: string;
  month: string;
  amount: number;
  currency: string;
  finalized: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MonthHealth {
  month: string;
  approved: number;
  baseline: number;
  baseline_source: 'actual' | 'forecast' | 'none';
  committed: number;
  pipeline_potential: number;
  remaining: number;
  status: 'green' | 'yellow' | 'red';
}

export interface OrgUnitSummary {
  org_unit: OrgUnit;
  months: MonthHealth[];
}

export interface JobCatalog {
  id: string;
  job_family: string;
  level: string;
  title: string;
  monthly_cost: number;
  hierarchy_level: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Requisition {
  id: string;
  org_unit_id: string;
  org_unit: { id: string; name: string } | null;
  job_catalog_id: string;
  job_catalog: JobCatalog | null;
  title: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'DRAFT' | 'OPEN' | 'INTERVIEWING' | 'OFFER_PENDING' | 'FILLED' | 'CANCELLED';
  target_start_month: string | null;
  estimated_monthly_cost: number | null;
  has_candidate_ready: boolean;
  owner_id: string;
  owner: { id: string; name: string; email: string } | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: string;
  requisition_id: string;
  requisition: { id: string; title: string; priority: string } | null;
  candidate_name: string;
  status: 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'HOLD' | 'CANCELLED';
  proposed_monthly_cost: number;
  final_monthly_cost: number | null;
  currency: string;
  start_date: string | null;
  hold_reason: string | null;
  hold_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthImpact {
  month: string;
  remaining_before: number;
  remaining_after: number;
  delta: number;
  status_before: 'green' | 'yellow' | 'red';
  status_after: 'green' | 'yellow' | 'red';
  is_bottleneck: boolean;
}

export interface OfferImpactResult {
  impacts: Record<string, MonthImpact>;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}
