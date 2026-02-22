import { useEffect, useState, useMemo } from 'react';
import { orgUnitsApi, budgetsApi, actualsApi, jobCatalogApi, requisitionsApi } from '../api/client';
import type { OrgUnit, Budget, Actual, JobCatalog } from '../types';
import { formatCurrency, formatMonth } from '../utils/format';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
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
import { PlusIcon, TrashIcon, DocumentPlusIcon } from '@heroicons/react/24/outline';

interface Simulation {
  id: string;
  jobCatalogId: string;
  jobTitle: string;
  startMonth: string;
  monthlyCost: number;
}

interface ChartData {
  month: string;
  monthLabel: string;
  budget: number;
  alocado: number;
  naoAlocado: number;
  simulacao: number;
  excedente: number;
}

// Generate all months for a year
const generateMonths = (year: number) => {
  return Array.from({ length: 12 }, (_, i) => {
    const month = (i + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  });
};

export default function Dashboard() {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>('');
  const [selectedOrgUnitData, setSelectedOrgUnitData] = useState<OrgUnit | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [jobs, setJobs] = useState<JobCatalog[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulator form state
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedStartMonth, setSelectedStartMonth] = useState<string>('2026-02');
  const [creatingRequisition, setCreatingRequisition] = useState(false);

  const currentYear = 2026; // The year we're working with based on seed data
  const months = generateMonths(currentYear);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedOrgUnit) {
      loadOrgUnitData(selectedOrgUnit);
    }
  }, [selectedOrgUnit]);

  const loadInitialData = async () => {
    try {
      const [orgsData, jobsData] = await Promise.all([
        orgUnitsApi.list(),
        jobCatalogApi.list({ active: true }),
      ]);
      setOrgUnits(orgsData);
      setJobs(jobsData);
      if (orgsData.length > 0) {
        setSelectedOrgUnit(orgsData[0].id);
        setSelectedOrgUnitData(orgsData[0]);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadOrgUnitData = async (orgUnitId: string) => {
    setLoading(true);
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
      console.error('Failed to load org unit data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate overhead multiplier
  const overheadMultiplier = selectedOrgUnitData?.overhead_multiplier || 1.8;

  // Find last known actual to project forward
  const lastKnownActual = useMemo(() => {
    if (actuals.length === 0) return 0;
    const sorted = [...actuals].sort((a, b) => b.month.localeCompare(a.month));
    return sorted[0].amount;
  }, [actuals]);

  // Build chart data
  const chartData = useMemo<ChartData[]>(() => {
    return months.map((month) => {
      const budget = budgets.find((b) => b.month === month);
      const actual = actuals.find((a) => a.month === month);

      const budgetAmount = budget?.approved_amount || 0;
      // Use actual if exists, otherwise project last known actual forward
      const alocadoAmount = actual?.amount || lastKnownActual;

      // Calculate simulation impact for this month
      const simulationAmount = simulations.reduce((sum, sim) => {
        if (sim.startMonth <= month) {
          return sum + sim.monthlyCost * overheadMultiplier;
        }
        return sum;
      }, 0);

      // Check if over budget
      const total = alocadoAmount + simulationAmount;
      
      // Cap alocado at budget for chart display
      const alocadoDisplay = Math.min(alocadoAmount, budgetAmount);
      const alocadoExcess = Math.max(0, alocadoAmount - budgetAmount);
      
      // Simulation within budget = simulation that fits in remaining budget after alocado
      const remainingAfterAlocado = Math.max(0, budgetAmount - alocadoAmount);
      const simulacaoWithinBudget = Math.min(simulationAmount, remainingAfterAlocado);
      
      // naoAlocado = remaining budget after alocado and simulation
      const naoAlocado = Math.max(0, budgetAmount - alocadoAmount - simulacaoWithinBudget);
      
      // Excedente = everything above budget (excess alocado + excess simulation)
      const excedente = alocadoExcess + Math.max(0, simulationAmount - simulacaoWithinBudget);

      return {
        month,
        monthLabel: formatMonth(month),
        budget: budgetAmount,
        alocado: alocadoDisplay,
        naoAlocado,
        simulacao: simulacaoWithinBudget,
        excedente,
      };
    });
  }, [months, budgets, actuals, simulations, overheadMultiplier, lastKnownActual]);

  // Get selected job details
  const selectedJobData = jobs.find((j) => j.id === selectedJob);

  // Add simulation
  const handleAddSimulation = () => {
    if (!selectedJob || !selectedStartMonth || !selectedJobData) return;

    const newSim: Simulation = {
      id: crypto.randomUUID(),
      jobCatalogId: selectedJob,
      jobTitle: selectedJobData.title,
      startMonth: selectedStartMonth,
      monthlyCost: selectedJobData.monthly_cost,
    };

    setSimulations([...simulations, newSim]);
    setSelectedJob('');
  };

  // Remove simulation
  const handleRemoveSimulation = (id: string) => {
    setSimulations(simulations.filter((s) => s.id !== id));
  };

  // Create requisition from simulation
  const handleCreateRequisition = async (simulation: Simulation) => {
    setCreatingRequisition(true);
    try {
      await requisitionsApi.create({
        org_unit_id: selectedOrgUnit,
        job_catalog_id: simulation.jobCatalogId,
        title: simulation.jobTitle,
        priority: 'P2',
        target_start_month: simulation.startMonth,
      });
      // Remove the simulation after creating requisition
      handleRemoveSimulation(simulation.id);
      alert('Requisição criada com sucesso!');
    } catch (error) {
      console.error('Failed to create requisition:', error);
      alert('Erro ao criar requisição');
    } finally {
      setCreatingRequisition(false);
    }
  };

  // Create all simulations as requisitions
  const handleCreateAllRequisitions = async () => {
    if (simulations.length === 0) return;
    
    setCreatingRequisition(true);
    try {
      await Promise.all(
        simulations.map((sim) =>
          requisitionsApi.create({
            org_unit_id: selectedOrgUnit,
            job_catalog_id: sim.jobCatalogId,
            title: sim.jobTitle,
            priority: 'P2',
            target_start_month: sim.startMonth,
          })
        )
      );
      setSimulations([]);
      alert(`${simulations.length} requisição(ões) criada(s) com sucesso!`);
    } catch (error) {
      console.error('Failed to create requisitions:', error);
      alert('Erro ao criar requisições');
    } finally {
      setCreatingRequisition(false);
    }
  };

  // Total simulation cost per month (with overhead)
  const totalSimulationCost = useMemo(() => {
    if (simulations.length === 0) return 0;
    return simulations.reduce((sum, sim) => sum + sim.monthlyCost * overheadMultiplier, 0);
  }, [simulations, overheadMultiplier]);

  // Month options for simulator
  const monthOptions = months.map((m) => ({
    value: m,
    label: formatMonth(m),
  }));

  // Job options for simulator
  const jobOptions = [
    { value: '', label: 'Selecione um cargo...' },
    ...jobs.map((j) => ({
      value: j.id,
      label: `${j.title} - ${formatCurrency(j.monthly_cost)} (c/ overhead: ${formatCurrency(j.monthly_cost * overheadMultiplier)})`,
    })),
  ];

  // Custom tooltip for chart
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
          <p className="text-sm text-yellow-600">
            Simulação: <span className="font-medium">{formatCurrency(data.simulacao)}</span>
          </p>
          {data.excedente > 0 && (
            <p className="text-sm text-red-600 font-bold">
              ⚠️ Excedente: <span>{formatCurrency(data.excedente)}</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Painel</h1>
        <Select
          options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
          value={selectedOrgUnit}
          onChange={(e) => setSelectedOrgUnit(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <div>
            <h3 className="font-medium text-gray-900">Overhead Multiplier</h3>
            <p className="text-2xl font-bold text-green-600">{overheadMultiplier}x</p>
            <p className="text-sm text-gray-500">Aplicado aos custos de cargos</p>
          </div>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <div>
            <h3 className="font-medium text-gray-900">Simulações Ativas</h3>
            <p className="text-2xl font-bold text-yellow-600">{simulations.length}</p>
            <p className="text-sm text-gray-500">
              Custo mensal: {formatCurrency(totalSimulationCost)}
            </p>
          </div>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <div>
            <h3 className="font-medium text-gray-900">Meses com Budget</h3>
            <p className="text-2xl font-bold text-blue-600">{budgets.length}</p>
            <p className="text-sm text-gray-500">
              Actuals registrados: {actuals.length}
            </p>
          </div>
        </Card>
      </div>

      {/* Stacked Bar Chart */}
      <Card title="Visão Orçamentária Anual">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="h-96">
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
                <Bar
                  dataKey="alocado"
                  name="Alocado"
                  stackId="a"
                  fill="#22c55e"
                />
                <Bar
                  dataKey="naoAlocado"
                  name="Não Alocado"
                  stackId="a"
                  fill="#3b82f6"
                />
                <Bar
                  dataKey="simulacao"
                  name="Simulação"
                  stackId="a"
                  fill="#eab308"
                />
                <Bar
                  dataKey="excedente"
                  name="Excedente (acima do orçamento)"
                  stackId="a"
                  fill="#ef4444"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Simulator */}
      <Card title="Simulador de Novas Vagas">
        <div className="space-y-4">
          {/* Add simulation form */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[250px]">
              <Select
                label="Cargo"
                options={jobOptions}
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Select
                label="Mês de Entrada"
                options={monthOptions}
                value={selectedStartMonth}
                onChange={(e) => setSelectedStartMonth(e.target.value)}
              />
            </div>
            <Button
              onClick={handleAddSimulation}
              disabled={!selectedJob || !selectedStartMonth}
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>

          {/* Selected job info */}
          {selectedJobData && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-600">Custo base: </span>
              <span className="font-medium">{formatCurrency(selectedJobData.monthly_cost)}</span>
              <span className="text-gray-600"> → Com overhead ({overheadMultiplier}x): </span>
              <span className="font-medium text-primary-600">
                {formatCurrency(selectedJobData.monthly_cost * overheadMultiplier)}
              </span>
              <span className="text-gray-500"> /mês</span>
            </div>
          )}

          {/* Simulations list */}
          {simulations.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">Simulações Ativas:</h4>
              <div className="divide-y border rounded-lg">
                {simulations.map((sim) => (
                  <div
                    key={sim.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{sim.jobTitle}</span>
                      <span className="text-gray-500 mx-2">•</span>
                      <span className="text-sm text-gray-600">
                        Início: {formatMonth(sim.startMonth)}
                      </span>
                      <span className="text-gray-500 mx-2">•</span>
                      <span className="text-sm font-medium text-primary-600">
                        {formatCurrency(sim.monthlyCost * overheadMultiplier)}/mês
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCreateRequisition(sim)}
                        disabled={creatingRequisition}
                      >
                        <DocumentPlusIcon className="w-4 h-4 mr-1" />
                        Criar Vaga
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveSimulation(sim.id)}
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Create all button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleCreateAllRequisitions}
                  disabled={creatingRequisition || simulations.length === 0}
                  loading={creatingRequisition}
                >
                  <DocumentPlusIcon className="w-4 h-4 mr-2" />
                  Registrar Todas as Vagas ({simulations.length})
                </Button>
              </div>
            </div>
          )}

          {simulations.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Adicione simulações para visualizar o impacto no gráfico acima
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
