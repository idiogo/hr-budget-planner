import { useEffect, useState, useMemo } from 'react';
import { offersApi, orgUnitsApi, requisitionsApi, jobCatalogApi, budgetsApi, actualsApi } from '../api/client';
import type { Offer, OrgUnit, OfferImpactResult, MonthImpact, Requisition, JobCatalog, Budget, Actual } from '../types';
import {
  formatCurrency,
  formatMonth,
  formatDate,
  getOfferStatusColor,
  getStatusColor,
  getStatusEmoji,
  getPriorityColor,
} from '../utils/format';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useAuthStore } from '../stores/auth';
import {
  CheckCircleIcon,
  ClockIcon,

  PlusIcon,
  CalendarIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
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

export default function OfferGate() {
  const { user } = useAuthStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [jobs, setJobs] = useState<JobCatalog[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>('');
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set());
  
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [openReqs, setOpenReqs] = useState<Requisition[]>([]);
  const [selectedReqIds, setSelectedReqIds] = useState<Set<string>>(new Set());
  const [selectedOrgUnitData, setSelectedOrgUnitData] = useState<OrgUnit | null>(null);
  const [loading, setLoading] = useState(true);
  
  
  // Quick offer from requisition
  const [isQuickOfferOpen, setIsQuickOfferOpen] = useState(false);
  const [quickOfferReq, setQuickOfferReq] = useState<Requisition | null>(null);
  const [quickOfferForm, setQuickOfferForm] = useState({
    candidate_name: '',
    proposed_monthly_cost: '',
    start_date: '',
  });
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isWhatIfModalOpen, setIsWhatIfModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  
  // Form states
  const [createForm, setCreateForm] = useState({
    requisition_id: '',
    candidate_name: '',
    proposed_monthly_cost: '',
    start_date: '',
  });
  const [holdReason, setHoldReason] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [whatIfPositions, setWhatIfPositions] = useState<Array<{
    job_catalog_id: string;
    monthly_cost: number;
    start_date: string;
  }>>([]);
  const [whatIfResult, setWhatIfResult] = useState<OfferImpactResult | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedOrgUnit) {
      loadOffers();
      loadRequisitions();
      loadBudgetData();
    }
  }, [selectedOrgUnit]);

  // Chart updates reactively via useMemo - no need for separate preview loading

  const loadInitialData = async () => {
    try {
      const [orgs, jobList] = await Promise.all([
        orgUnitsApi.list(),
        jobCatalogApi.list({ active: true }),
      ]);
      setOrgUnits(orgs);
      setJobs(jobList);
      if (orgs.length > 0) {
        setSelectedOrgUnit(orgs[0].id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadOffers = async () => {
    setLoading(true);
    try {
      const data = await offersApi.list({ org_unit_id: selectedOrgUnit });
      setOffers(data);
    } catch (error) {
      console.error('Failed to load offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRequisitions = async () => {
    try {
      const data = await requisitionsApi.list({
        org_unit_id: selectedOrgUnit,
      });
      setRequisitions(data);
      setOpenReqs(data.filter((r) => ['OPEN', 'INTERVIEWING'].includes(r.status)));
    } catch (error) {
      console.error('Failed to load requisitions:', error);
    }
  };

  const loadBudgetData = async () => {
    if (!selectedOrgUnit) return;
    try {
      const [budgetData, actualData] = await Promise.all([
        budgetsApi.list(selectedOrgUnit),
        actualsApi.list(selectedOrgUnit),
      ]);
      setBudgets(budgetData);
      setActuals(actualData);
      const org = orgUnits.find((o) => o.id === selectedOrgUnit);
      setSelectedOrgUnitData(org || null);
    } catch (error) {
      console.error('Failed to load budget data:', error);
    }
  };

  const toggleOfferSelection = (offerId: string) => {
    const newSelection = new Set(selectedOffers);
    if (newSelection.has(offerId)) {
      newSelection.delete(offerId);
    } else {
      newSelection.add(offerId);
    }
    setSelectedOffers(newSelection);
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await offersApi.create({
        requisition_id: createForm.requisition_id,
        candidate_name: createForm.candidate_name,
        proposed_monthly_cost: parseFloat(createForm.proposed_monthly_cost),
        start_date: createForm.start_date || undefined,
      });
      setIsCreateModalOpen(false);
      setCreateForm({ requisition_id: '', candidate_name: '', proposed_monthly_cost: '', start_date: '' });
      loadOffers();
    } catch (error) {
      console.error('Failed to create offer:', error);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedOffers.size === 0) return;
    
    try {
      for (const offerId of selectedOffers) {
        const offer = offers.find((o) => o.id === offerId);
        if (offer?.status === 'PROPOSED') {
          await offersApi.approve(offerId);
        }
      }
      setSelectedOffers(new Set());
      loadOffers();
    } catch (error) {
      console.error('Failed to approve offers:', error);
    }
  };

  const handleHold = async () => {
    if (!selectedOffer) return;
    
    try {
      await offersApi.hold(selectedOffer.id, holdReason);
      setIsHoldModalOpen(false);
      setSelectedOffer(null);
      setHoldReason('');
      loadOffers();
    } catch (error) {
      console.error('Failed to hold offer:', error);
    }
  };

  const handleChangeStartDate = async () => {
    if (!selectedOffer) return;
    
    try {
      await offersApi.changeStartDate(selectedOffer.id, newStartDate);
      setIsDateModalOpen(false);
      setSelectedOffer(null);
      setNewStartDate('');
      loadOffers();
      // Chart updates reactively
    } catch (error) {
      console.error('Failed to change start date:', error);
    }
  };

  const handleWhatIf = async () => {
    if (whatIfPositions.length === 0) return;
    
    try {
      const result = await offersApi.previewNewPositions(selectedOrgUnit, whatIfPositions);
      setWhatIfResult(result);
    } catch (error) {
      console.error('Failed to run what-if:', error);
    }
  };

  const addWhatIfPosition = () => {
    setWhatIfPositions([
      ...whatIfPositions,
      { job_catalog_id: jobs[0]?.id || '', monthly_cost: 0, start_date: '' },
    ]);
  };

  const toggleReqSelection = (reqId: string) => {
    const newSet = new Set(selectedReqIds);
    if (newSet.has(reqId)) newSet.delete(reqId);
    else newSet.add(reqId);
    setSelectedReqIds(newSet);
  };

  const toggleAllReqs = () => {
    if (selectedReqIds.size === openReqs.length) {
      setSelectedReqIds(new Set());
    } else {
      setSelectedReqIds(new Set(openReqs.map((r) => r.id)));
    }
  };

  // Quick offer handler
  const handleQuickOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickOfferReq) return;
    try {
      const defaultCost = Number(quickOfferReq.estimated_monthly_cost || quickOfferReq.job_catalog?.monthly_cost || 0);
      const costStr = quickOfferForm.proposed_monthly_cost.replace(',', '.');
      const cost = parseFloat(costStr) || defaultCost;
      let startDate = quickOfferForm.start_date || undefined;
      // Convert YYYY-MM to YYYY-MM-01 if needed
      if (startDate && /^\d{4}-\d{2}$/.test(startDate)) {
        startDate = `${startDate}-01`;
      }
      
      await offersApi.create({
        requisition_id: quickOfferReq.id,
        candidate_name: quickOfferForm.candidate_name,
        proposed_monthly_cost: cost,
        start_date: startDate,
      });
      setIsQuickOfferOpen(false);
      setQuickOfferReq(null);
      setQuickOfferForm({ candidate_name: '', proposed_monthly_cost: '', start_date: '' });
      loadOffers();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Erro ao criar proposta';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const openQuickOffer = (req: Requisition) => {
    setQuickOfferReq(req);
    const defaultCost = req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0;
    setQuickOfferForm({
      candidate_name: '',
      proposed_monthly_cost: defaultCost.toString(),
      start_date: req.target_start_month || '',
    });
    setIsQuickOfferOpen(true);
  };

  // Chart data
  const overheadMultiplier = selectedOrgUnitData?.overhead_multiplier || 1.8;
  
  const months = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const m = (i + 1).toString().padStart(2, '0');
      return `${year}-${m}`;
    });
  }, []);

  const selectedReqs = openReqs.filter((r) => selectedReqIds.has(r.id));

  const chartData = useMemo(() => {
    const selectedOffersList = offers.filter((o) => selectedOffers.has(o.id));
    
    return months.map((month) => {
      const budget = budgets.find((b) => b.month === month);
      const actual = actuals.find((a) => a.month === month);
      const budgetAmount = budget?.approved_amount || 0;
      const alocadoAmount = actual?.amount || 0;

      // Impact of selected offers
      const offerAmount = selectedOffersList.reduce((sum, offer) => {
        if (offer.start_date && offer.start_date.substring(0, 7) <= month) {
          return sum + Number(offer.proposed_monthly_cost || 0) * overheadMultiplier;
        }
        return sum;
      }, 0);

      // Impact of selected requisitions (vagas sendo trabalhadas)
      const reqAmount = selectedReqs.reduce((sum, req) => {
        // If no target_start_month, assume it impacts all months
        const startMonth = req.target_start_month || '2000-01';
        if (startMonth <= month) {
          const baseCost = Number(req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0);
          return sum + baseCost * overheadMultiplier;
        }
        return sum;
      }, 0);

      const selectedAmount = offerAmount + reqAmount;

      const alocadoDisplay = Math.min(alocadoAmount, budgetAmount);
      const alocadoExcess = Math.max(0, alocadoAmount - budgetAmount);
      const remainingAfterAlocado = Math.max(0, budgetAmount - alocadoAmount);
      const selectedWithinBudget = Math.min(selectedAmount, remainingAfterAlocado);
      const naoAlocado = Math.max(0, budgetAmount - alocadoAmount - selectedWithinBudget);
      const excedente = alocadoExcess + Math.max(0, selectedAmount - selectedWithinBudget);

      return {
        month,
        monthLabel: formatMonth(month),
        budget: budgetAmount,
        alocado: alocadoDisplay,
        naoAlocado,
        selecionadas: selectedWithinBudget,
        excedente,
      };
    });
  }, [months, budgets, actuals, offers, selectedOffers, selectedReqs, overheadMultiplier]);

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          <p className="text-sm text-gray-600">Budget: <span className="font-medium">{formatCurrency(data.budget)}</span></p>
          <p className="text-sm text-green-600">Alocado: <span className="font-medium">{formatCurrency(data.alocado)}</span></p>
          <p className="text-sm text-purple-600">Ofertas Selecionadas: <span className="font-medium">{formatCurrency(data.selecionadas)}</span></p>
          <p className="text-sm text-blue-600">Não Alocado: <span className="font-medium">{formatCurrency(data.naoAlocado)}</span></p>
          {data.excedente > 0 && (
            <p className="text-sm text-red-600 font-bold">⚠️ Excedente: <span>{formatCurrency(data.excedente)}</span></p>
          )}
        </div>
      );
    }
    return null;
  };

  const proposedOffers = offers.filter((o) => o.status === 'PROPOSED');
  const otherOffers = offers.filter((o) => o.status !== 'PROPOSED');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Priorização de Propostas</h1>
          <p className="text-gray-500 mt-1">Decida quais propostas aprovar com impacto orçamentário em tempo real</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select
            options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
            value={selectedOrgUnit}
            onChange={(e) => { setSelectedOrgUnit(e.target.value); setSelectedOffers(new Set()); }}
            className="w-48"
          />
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Nova Proposta
          </Button>
        </div>
      </div>

      {/* Impact Chart */}
      <Card title={`📊 Impacto Orçamentário ${selectedOffers.size + selectedReqIds.size > 0 ? `(${selectedReqIds.size > 0 ? `${selectedReqIds.size} vaga(s)` : ''}${selectedOffers.size > 0 && selectedReqIds.size > 0 ? ' + ' : ''}${selectedOffers.size > 0 ? `${selectedOffers.size} proposta(s)` : ''})` : ''}`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(v)} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="alocado" name="Alocado" stackId="a" fill="#22c55e" />
              <Bar dataKey="selecionadas" name="Ofertas Selecionadas" stackId="a" fill="#a855f7" />
              <Bar dataKey="naoAlocado" name="Não Alocado" stackId="a" fill="#3b82f6" />
              <Bar dataKey="excedente" name="Excedente (acima do orçamento)" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Open Requisitions - Vagas Sendo Trabalhadas */}
      {openReqs.length > 0 && (
        <Card
          title={`🔍 Vagas Sendo Trabalhadas (${openReqs.length})${selectedReqIds.size > 0 ? ` — ${selectedReqIds.size} selecionada(s)` : ''}`}
          action={
            selectedReqIds.size > 0 && (
              <span className="text-sm font-medium text-purple-600">
                Custo mensal: {formatCurrency(selectedReqs.reduce((sum, r) => sum + (r.estimated_monthly_cost || r.job_catalog?.monthly_cost || 0) * overheadMultiplier, 0))}
              </span>
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedReqIds.size === openReqs.length && openReqs.length > 0}
                      onChange={toggleAllReqs}
                      className="rounded border-gray-300 text-primary-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo c/ Overhead</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Candidato?</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {openReqs.map((req) => {
                  const cost = (req.estimated_monthly_cost || req.job_catalog?.monthly_cost || 0) * overheadMultiplier;
                  const isSelected = selectedReqIds.has(req.id);
                  return (
                    <tr key={req.id} className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-purple-50' : ''}`} onClick={() => toggleReqSelection(req.id)}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReqSelection(req.id)}
                          className="rounded border-gray-300 text-primary-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{req.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{req.job_catalog?.title}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={getPriorityColor(req.priority)}>{req.priority}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={req.status === 'INTERVIEWING' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
                          {req.status === 'INTERVIEWING' ? 'Entrevistas' : 'Aberta'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(cost)}</td>
                      <td className="px-4 py-3 text-center text-lg">{req.has_candidate_ready ? '✅' : '❌'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => openQuickOffer(req)}>
                          Criar Proposta
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
          {/* Proposed Offers - Main Action Area */}
          <Card
            title={`📋 Propostas Pendentes (${proposedOffers.length})`}
            action={
              selectedOffers.size > 0 && user?.role === 'ADMIN' && (
                <Button size="sm" onClick={handleApproveSelected}>
                  <CheckCircleIcon className="w-4 h-4 mr-1" />
                  Aprovar Selecionadas ({selectedOffers.size})
                </Button>
              )
            }
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : proposedOffers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhuma proposta pendente</p>
            ) : (
              <div className="space-y-3">
                {proposedOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                      selectedOffers.has(offer.id)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleOfferSelection(offer.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedOffers.has(offer.id)}
                          onChange={() => toggleOfferSelection(offer.id)}
                          className="mt-1 h-4 w-4 text-primary-600 rounded border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <h4 className="font-medium text-gray-900">{offer.candidate_name}</h4>
                          <p className="text-sm text-gray-500">{offer.requisition?.title}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge color={getPriorityColor(offer.requisition?.priority || 'P2')}>
                              {offer.requisition?.priority}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(offer.proposed_monthly_cost)}/mo
                            </span>
                            {offer.start_date && (
                              <span className="text-sm text-gray-500">
                                Início: {formatDate(offer.start_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedOffer(offer);
                            setNewStartDate(offer.start_date || '');
                            setIsDateModalOpen(true);
                          }}
                        >
                          <CalendarIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedOffer(offer);
                            setIsHoldModalOpen(true);
                          }}
                        >
                          <ClockIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`Deletar proposta de ${offer.candidate_name}?`)) return;
                            try {
                              await offersApi.delete(offer.id);
                              loadOffers();
                            } catch (error: any) {
                              alert(error?.response?.data?.detail || 'Erro ao deletar proposta');
                            }
                          }}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Other Offers */}
          <Card title="📁 Outras Propostas">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Candidato</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requisição</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Custo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {otherOffers.map((offer) => (
                    <tr key={offer.id}>
                      <td className="px-3 py-2 text-sm text-gray-900">{offer.candidate_name}</td>
                      <td className="px-3 py-2 text-sm text-gray-500">{offer.requisition?.title}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge color={getOfferStatusColor(offer.status)}>{offer.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-sm text-right text-gray-900">
                        {formatCurrency(offer.final_monthly_cost || offer.proposed_monthly_cost)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-500">
                        {offer.start_date ? formatDate(offer.start_date) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`Deletar proposta de ${offer.candidate_name}?`)) return;
                            try {
                              await offersApi.delete(offer.id);
                              loadOffers();
                            } catch (error: any) {
                              alert(error?.response?.data?.detail || 'Erro ao deletar proposta');
                            }
                          }}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

      </div>

      {/* Create Offer Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nova Proposta" size="lg">
        <form onSubmit={handleCreateOffer} className="space-y-4">
          <Select
            label="Requisição"
            options={[
              { value: '', label: 'Selecione a requisição...' },
              ...requisitions.map((r) => ({ value: r.id, label: r.title })),
            ]}
            value={createForm.requisition_id}
            onChange={(e) => setCreateForm({ ...createForm, requisition_id: e.target.value })}
            required
          />
          <Input
            label="Nome do Candidato"
            value={createForm.candidate_name}
            onChange={(e) => setCreateForm({ ...createForm, candidate_name: e.target.value })}
            required
          />
          <Input
            label="Custo Mensal Proposto"
            type="number"
            value={createForm.proposed_monthly_cost}
            onChange={(e) => setCreateForm({ ...createForm, proposed_monthly_cost: e.target.value })}
            required
          />
          <Input
            label="Data de Início"
            type="date"
            value={createForm.start_date}
            onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar e Propor</Button>
          </div>
        </form>
      </Modal>

      {/* Hold Modal */}
      <Modal isOpen={isHoldModalOpen} onClose={() => setIsHoldModalOpen(false)} title="Colocar em Espera">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Colocando <strong>{selectedOffer?.candidate_name}</strong> em espera.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <textarea
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2 text-sm"
              rows={3}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="Restrições orçamentárias, timing, etc."
              required
            />
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsHoldModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleHold} disabled={!holdReason}>
              Colocar em Espera
            </Button>
          </div>
        </div>
      </Modal>

      {/* Change Start Date Modal */}
      <Modal isOpen={isDateModalOpen} onClose={() => setIsDateModalOpen(false)} title="Alterar Data de Início">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Alterar data de início para <strong>{selectedOffer?.candidate_name}</strong>.
          </p>
          <Input
            label="Nova Data de Início"
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            required
          />
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="secondary" onClick={() => setIsDateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangeStartDate} disabled={!newStartDate}>
              Atualizar Data
            </Button>
          </div>
        </div>
      </Modal>

      {/* What-If Modal */}
      <Modal isOpen={isWhatIfModalOpen} onClose={() => setIsWhatIfModalOpen(false)} title="Simulação What-If" size="xl">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Adicione cargos hipotéticos para simular o impacto no orçamento.</p>
          
          {whatIfPositions.map((pos, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-3">
              <Select
                options={jobs.map((j) => ({ value: j.id, label: j.title }))}
                value={pos.job_catalog_id}
                onChange={(e) => {
                  const job = jobs.find((j) => j.id === e.target.value);
                  const newPositions = [...whatIfPositions];
                  newPositions[idx] = {
                    ...pos,
                    job_catalog_id: e.target.value,
                    monthly_cost: job?.monthly_cost || 0,
                  };
                  setWhatIfPositions(newPositions);
                }}
              />
              <Input
                type="number"
                value={pos.monthly_cost || ''}
                onChange={(e) => {
                  const newPositions = [...whatIfPositions];
                  newPositions[idx].monthly_cost = parseFloat(e.target.value) || 0;
                  setWhatIfPositions(newPositions);
                }}
                placeholder="Custo mensal"
              />
              <Input
                type="date"
                value={pos.start_date}
                onChange={(e) => {
                  const newPositions = [...whatIfPositions];
                  newPositions[idx].start_date = e.target.value;
                  setWhatIfPositions(newPositions);
                }}
              />
            </div>
          ))}
          
          <Button variant="secondary" size="sm" onClick={addWhatIfPosition}>
            <PlusIcon className="w-4 h-4 mr-1" />
            Adicionar Cargo
          </Button>

          {whatIfResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-3">Resultados da Simulação</h4>
              <div className="space-y-2">
                {Object.values(whatIfResult.impacts).map((impact: MonthImpact) => (
                  <div key={impact.month} className="flex items-center justify-between text-sm">
                    <span>{formatMonth(impact.month)}</span>
                    <span className={getStatusColor(impact.status_after)}>
                      {getStatusEmoji(impact.status_after)} {formatCurrency(impact.remaining_after)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsWhatIfModalOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleWhatIf} disabled={whatIfPositions.length === 0}>
              Executar Simulação
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Offer from Requisition */}
      <Modal isOpen={isQuickOfferOpen} onClose={() => setIsQuickOfferOpen(false)} title={`Criar Proposta — ${quickOfferReq?.title || ''}`}>
        <form onSubmit={handleQuickOffer} className="space-y-4">
          {quickOfferReq && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <p><strong>Cargo:</strong> {quickOfferReq.job_catalog?.title}</p>
              <p><strong>Custo padrão:</strong> {formatCurrency(quickOfferReq.estimated_monthly_cost || quickOfferReq.job_catalog?.monthly_cost || 0)}</p>
            </div>
          )}
          <Input
            label="Nome do Candidato"
            value={quickOfferForm.candidate_name}
            onChange={(e) => setQuickOfferForm({ ...quickOfferForm, candidate_name: e.target.value })}
            required
          />
          <Input
            label="Custo Mensal (deixe o padrão ou ajuste)"
            type="number"
            value={quickOfferForm.proposed_monthly_cost}
            onChange={(e) => setQuickOfferForm({ ...quickOfferForm, proposed_monthly_cost: e.target.value })}
            required
          />
          <Input
            label="Data de Início"
            type="date"
            value={quickOfferForm.start_date}
            onChange={(e) => setQuickOfferForm({ ...quickOfferForm, start_date: e.target.value })}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsQuickOfferOpen(false)}>Cancelar</Button>
            <Button type="submit">Criar Proposta</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
