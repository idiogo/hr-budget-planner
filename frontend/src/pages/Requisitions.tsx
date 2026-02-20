import { useEffect, useState, useMemo } from 'react';
import { requisitionsApi, orgUnitsApi, jobCatalogApi, budgetsApi, actualsApi } from '../api/client';
import type { Requisition, OrgUnit, JobCatalog, Budget, Actual } from '../types';
import {
  formatCurrency,
  formatMonth,
  getPriorityColor,
  getRequisitionStatusColor,
} from '../utils/format';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChartData {
  month: string;
  monthLabel: string;
  budget: number;
  alocado: number;
  naoAlocado: number;
  selecionadas: number;
}

// Generate all months for a year
const generateMonths = (year: number) => {
  return Array.from({ length: 12 }, (_, i) => {
    const month = (i + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  });
};

export default function Requisitions() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [jobs, setJobs] = useState<JobCatalog[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requisition | null>(null);

  // Selected org unit for budget context
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>('');
  const [selectedOrgUnitData, setSelectedOrgUnitData] = useState<OrgUnit | null>(null);

  // Selected requisitions for prioritization
  const [selectedReqIds, setSelectedReqIds] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState<{
    org_unit_id: string;
    job_catalog_id: string;
    title: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    target_start_month: string;
    notes: string;
  }>({
    org_unit_id: '',
    job_catalog_id: '',
    title: '',
    priority: 'P2',
    target_start_month: '',
    notes: '',
  });

  const currentYear = 2026;
  const months = generateMonths(currentYear);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadRequisitions();
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    if (selectedOrgUnit) {
      loadBudgetData(selectedOrgUnit);
    }
  }, [selectedOrgUnit]);

  const loadData = async () => {
    try {
      const [orgs, jobList] = await Promise.all([
        orgUnitsApi.list(),
        jobCatalogApi.list({ active: true }),
      ]);
      setOrgUnits(orgs);
      setJobs(jobList);
      if (orgs.length > 0) {
        setFormData((prev) => ({ ...prev, org_unit_id: orgs[0].id }));
        setSelectedOrgUnit(orgs[0].id);
        setSelectedOrgUnitData(orgs[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadBudgetData = async (orgUnitId: string) => {
    try {
      const [budgetsData, actualsData, orgData] = await Promise.all([
        budgetsApi.list(orgUnitId),
        actualsApi.list(orgUnitId),
        orgUnitsApi.get(orgUnitId),
      ]);
      setBudgets(budgetsData);
      setActuals(actualsData);
      setSelectedOrgUnitData(orgData);
    } catch (error) {
      console.error('Failed to load budget data:', error);
    }
  };

  const loadRequisitions = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;

      const data = await requisitionsApi.list(params);
      setRequisitions(data);
    } catch (error) {
      console.error('Failed to load requisitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingReq) {
        await requisitionsApi.update(editingReq.id, formData);
      } else {
        await requisitionsApi.create(formData);
      }
      setIsModalOpen(false);
      setEditingReq(null);
      resetForm();
      loadRequisitions();
    } catch (error) {
      console.error('Failed to save requisition:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      org_unit_id: orgUnits[0]?.id || '',
      job_catalog_id: '',
      title: '',
      priority: 'P2' as const,
      target_start_month: '',
      notes: '',
    });
  };

  const openEditModal = (req: Requisition) => {
    setEditingReq(req);
    setFormData({
      org_unit_id: req.org_unit_id,
      job_catalog_id: req.job_catalog_id,
      title: req.title,
      priority: req.priority as 'P0' | 'P1' | 'P2' | 'P3',
      target_start_month: req.target_start_month || '',
      notes: req.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleTransition = async (id: string, newStatus: string) => {
    try {
      await requisitionsApi.transition(id, newStatus);
      loadRequisitions();
    } catch (error) {
      console.error('Failed to transition requisition:', error);
    }
  };

  // Toggle requisition selection
  const toggleReqSelection = (id: string) => {
    const newSelected = new Set(selectedReqIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReqIds(newSelected);
  };

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedReqIds.size === requisitions.length) {
      setSelectedReqIds(new Set());
    } else {
      setSelectedReqIds(new Set(requisitions.map((r) => r.id)));
    }
  };

  // Overhead multiplier
  const overheadMultiplier = selectedOrgUnitData?.overhead_multiplier || 1.8;

  // Selected requisitions
  const selectedReqs = useMemo(() => {
    return requisitions.filter((r) => selectedReqIds.has(r.id));
  }, [requisitions, selectedReqIds]);

  // Build chart data
  const chartData = useMemo<ChartData[]>(() => {
    return months.map((month) => {
      const budget = budgets.find((b) => b.month === month);
      const actual = actuals.find((a) => a.month === month);

      const budgetAmount = budget?.approved_amount || 0;
      const alocadoAmount = actual?.amount || 0;

      // Calculate selected requisitions impact for this month
      const selectedAmount = selectedReqs.reduce((sum, req) => {
        if (req.target_start_month && req.target_start_month <= month) {
          const cost = req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0;
          return sum + cost * overheadMultiplier;
        }
        return sum;
      }, 0);

      const naoAlocado = Math.max(0, budgetAmount - alocadoAmount - selectedAmount);

      return {
        month,
        monthLabel: formatMonth(month),
        budget: budgetAmount,
        alocado: alocadoAmount,
        naoAlocado,
        selecionadas: selectedAmount,
      };
    });
  }, [months, budgets, actuals, selectedReqs, overheadMultiplier]);

  // Total selected cost
  const totalSelectedCost = useMemo(() => {
    return selectedReqs.reduce((sum, req) => {
      const cost = req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0;
      return sum + cost * overheadMultiplier;
    }, 0);
  }, [selectedReqs, overheadMultiplier]);

  // Pipeline potential (all open/interviewing)
  const pipelinePotential = requisitions
    .filter((r) => ['OPEN', 'INTERVIEWING'].includes(r.status))
    .reduce((sum, r) => sum + (r.estimated_monthly_cost || r.job_catalog?.monthly_cost || 0) * overheadMultiplier, 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload as ChartData;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <p className="text-sm text-gray-600">
            Budget: <span className="font-medium">{formatCurrency(data.budget)}</span>
          </p>
          <p className="text-sm text-green-600">
            Alocado: <span className="font-medium">{formatCurrency(data.alocado)}</span>
          </p>
          <p className="text-sm text-blue-600">
            Não Alocado: <span className="font-medium">{formatCurrency(data.naoAlocado)}</span>
          </p>
          <p className="text-sm text-purple-600">
            Vagas Selecionadas: <span className="font-medium">{formatCurrency(data.selecionadas)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Priorização de Vagas</h1>
        <div className="flex items-center gap-4">
          <Select
            options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
            value={selectedOrgUnit}
            onChange={(e) => setSelectedOrgUnit(e.target.value)}
            className="w-48"
          />
          <Button
            onClick={() => {
              resetForm();
              setEditingReq(null);
              setIsModalOpen(true);
            }}
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Nova Requisição
          </Button>
        </div>
      </div>

      {/* Impact Chart */}
      {selectedReqIds.size > 0 && (
        <Card
          title={`Impacto das ${selectedReqIds.size} Vaga(s) Selecionada(s)`}
          action={
            <span className="text-sm text-gray-500">
              Custo mensal: <span className="font-medium text-purple-600">{formatCurrency(totalSelectedCost)}</span>
            </span>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" />
                <YAxis
                  tickFormatter={(value) =>
                    new Intl.NumberFormat('pt-BR', {
                      notation: 'compact',
                      compactDisplay: 'short',
                    }).format(value)
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="alocado" name="Alocado" stackId="a" fill="#22c55e" />
                <Bar dataKey="selecionadas" name="Vagas Selecionadas" stackId="a" fill="#a855f7" />
                <Bar dataKey="naoAlocado" name="Não Alocado" stackId="a" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Filters & Summary */}
      <div className="flex flex-wrap gap-4 items-center">
        <Select
          options={[
            { value: '', label: 'Todos os Status' },
            { value: 'DRAFT', label: 'Rascunho' },
            { value: 'OPEN', label: 'Aberta' },
            { value: 'INTERVIEWING', label: 'Em Entrevista' },
            { value: 'OFFER_PENDING', label: 'Oferta Pendente' },
            { value: 'FILLED', label: 'Preenchida' },
            { value: 'CANCELLED', label: 'Cancelada' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        />
        <Select
          options={[
            { value: '', label: 'Todas Prioridades' },
            { value: 'P0', label: 'P0' },
            { value: 'P1', label: 'P1' },
            { value: 'P2', label: 'P2' },
            { value: 'P3', label: 'P3' },
          ]}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-40"
        />
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-500">
          <span>
            Pipeline Total:{' '}
            <span className="font-medium text-gray-900">{formatCurrency(pipelinePotential)}</span>
          </span>
          {selectedReqIds.size > 0 && (
            <span>
              Selecionadas:{' '}
              <span className="font-medium text-purple-600">{formatCurrency(totalSelectedCost)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Requisitions Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedReqIds.size === requisitions.length && requisitions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Título
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cargo
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Prioridade
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Mês Alvo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Custo c/ Overhead
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Candidato?
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requisitions.map((req) => {
                  const cost = req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0;
                  const costWithOverhead = cost * overheadMultiplier;
                  const isSelected = selectedReqIds.has(req.id);

                  return (
                    <tr
                      key={req.id}
                      className={`hover:bg-gray-50 ${isSelected ? 'bg-purple-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReqSelection(req.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {req.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {req.job_catalog?.title}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={getPriorityColor(req.priority)}>{req.priority}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={getRequisitionStatusColor(req.status)}>{req.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {req.target_start_month ? formatMonth(req.target_start_month) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(costWithOverhead)}
                      </td>
                      <td className="px-4 py-3 text-center text-lg">
                        {req.has_candidate_ready ? '✅' : '❌'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditModal(req)}>
                          Editar
                        </Button>
                        {req.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleTransition(req.id, 'OPEN')}
                          >
                            Abrir
                          </Button>
                        )}
                        {req.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleTransition(req.id, 'INTERVIEWING')}
                          >
                            Entrevistas
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReq(null);
        }}
        title={editingReq ? 'Editar Requisição' : 'Nova Requisição'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Unidade Organizacional"
            options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
            value={formData.org_unit_id}
            onChange={(e) => setFormData({ ...formData, org_unit_id: e.target.value })}
            required
          />

          <Select
            label="Cargo"
            options={[
              { value: '', label: 'Selecione um cargo...' },
              ...jobs.map((j) => ({
                value: j.id,
                label: `${j.title} - ${formatCurrency(j.monthly_cost)}`,
              })),
            ]}
            value={formData.job_catalog_id}
            onChange={(e) => setFormData({ ...formData, job_catalog_id: e.target.value })}
            required
          />

          <Input
            label="Título"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="ex: Engenheiro Backend Sênior"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Prioridade"
              options={[
                { value: 'P0', label: 'P0 - Crítica' },
                { value: 'P1', label: 'P1 - Alta' },
                { value: 'P2', label: 'P2 - Média' },
                { value: 'P3', label: 'P3 - Baixa' },
              ]}
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'P0' | 'P1' | 'P2' | 'P3' })}
            />

            <Input
              label="Mês Alvo de Início"
              type="month"
              value={formData.target_start_month}
              onChange={(e) => setFormData({ ...formData, target_start_month: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2 text-sm"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editingReq ? 'Atualizar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
