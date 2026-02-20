import { useEffect, useState } from 'react';
import { orgUnitsApi, budgetsApi, actualsApi } from '../api/client';
import type { OrgUnit, Budget, Actual } from '../types';
import { formatMonth } from '../utils/format';
import Card from './ui/Card';
import Button from './ui/Button';
import Select from './ui/Select';
import Input from './ui/Input';
import { CheckIcon, PencilIcon } from '@heroicons/react/24/outline';

const generateMonths = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`);

export default function BudgetManager() {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Editable state: month -> { budget, actual }
  const [editBudget, setEditBudget] = useState<Record<string, string>>({});
  const [editActual, setEditActual] = useState<Record<string, string>>({});

  const year = 2026;
  const months = generateMonths(year);

  useEffect(() => {
    orgUnitsApi.list().then((data) => {
      setOrgUnits(data);
      if (data.length > 0) setSelectedOrgUnit(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedOrgUnit) loadData();
  }, [selectedOrgUnit]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        budgetsApi.list(selectedOrgUnit),
        actualsApi.list(selectedOrgUnit),
      ]);
      setBudgets(b);
      setActuals(a);
      // Init edit state
      const bMap: Record<string, string> = {};
      const aMap: Record<string, string> = {};
      months.forEach((m) => {
        const budget = b.find((x: Budget) => x.month === m);
        const actual = a.find((x: Actual) => x.month === m);
        bMap[m] = budget ? String(budget.approved_amount) : '';
        aMap[m] = actual ? String(actual.amount) : '';
      });
      setEditBudget(bMap);
      setEditActual(aMap);
    } finally {
      setLoading(false);
    }
  };

  const saveBudget = async (month: string) => {
    const val = parseFloat(editBudget[month]);
    if (isNaN(val) || val <= 0) return;
    setSaving(`budget-${month}`);
    try {
      await budgetsApi.create(selectedOrgUnit, { month, approved_amount: val });
      await loadData();
    } catch (e: any) {
      // If already exists, try update via PATCH or just reload
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  const saveActual = async (month: string) => {
    const val = parseFloat(editActual[month]);
    if (isNaN(val) || val <= 0) return;
    setSaving(`actual-${month}`);
    try {
      await actualsApi.create(selectedOrgUnit, { month, amount: val });
      await loadData();
    } catch (e: any) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select
          label="Área"
          options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
          value={selectedOrgUnit}
          onChange={(e) => setSelectedOrgUnit(e.target.value)}
          className="w-64"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <Card title="Orçamento e Realizado — Mês a Mês">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orçamento Aprovado (R$)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Realizado (R$)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {months.map((month) => {
                  const hasBudget = budgets.some((b) => b.month === month);
                  const hasActual = actuals.some((a) => a.month === month);
                  return (
                    <tr key={month} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatMonth(month)}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          value={editBudget[month] || ''}
                          onChange={(e) =>
                            setEditBudget({ ...editBudget, [month]: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-48"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant={hasBudget ? 'secondary' : 'primary'}
                          onClick={() => saveBudget(month)}
                          loading={saving === `budget-${month}`}
                          disabled={!editBudget[month]}
                        >
                          {hasBudget ? <PencilIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          value={editActual[month] || ''}
                          onChange={(e) =>
                            setEditActual({ ...editActual, [month]: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-48"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant={hasActual ? 'secondary' : 'primary'}
                          onClick={() => saveActual(month)}
                          loading={saving === `actual-${month}`}
                          disabled={!editActual[month]}
                        >
                          {hasActual ? <PencilIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
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
    </div>
  );
}
