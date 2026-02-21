import { useEffect, useState, useRef } from 'react';
import { orgUnitsApi, budgetsApi, actualsApi } from '../api/client';
import type { OrgUnit, Budget, Actual } from '../types';
import { formatMonth } from '../utils/format';
import Card from './ui/Card';
import Select from './ui/Select';

const generateMonths = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`);

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface EditableCellProps {
  value: number;
  onSave: (val: number) => Promise<void>;
  placeholder?: string;
}

function EditableCell({ value, onSave, placeholder = '0,00' }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setText(value ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const save = async () => {
    const parsed = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0 && parsed !== value) {
      setSaving(true);
      try {
        await onSave(parsed);
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="w-40 px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`w-40 px-2 py-1 text-right text-sm rounded cursor-pointer transition-colors
        ${value > 0
          ? 'text-gray-900 hover:bg-blue-50 hover:text-blue-700'
          : 'text-gray-400 hover:bg-gray-100 italic'
        }`}
      title="Clique para editar"
    >
      {value > 0 ? formatBRL(value) : placeholder}
    </button>
  );
}

export default function BudgetManager() {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [loading, setLoading] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  const saveBudget = async (month: string, val: number) => {
    await budgetsApi.create(selectedOrgUnit, { month, approved_amount: val });
    await loadData();
  };

  const saveActual = async (month: string, val: number) => {
    await actualsApi.create(selectedOrgUnit, { month, amount: val });
    await loadData();
  };

  const getBudgetValue = (month: string) => {
    const b = budgets.find((x) => x.month === month);
    return b ? Number(b.approved_amount) : 0;
  };

  const getActualValue = (month: string) => {
    const a = actuals.find((x) => x.month === month);
    return a ? Number(a.amount) : 0;
  };

  // Totals
  const totalBudget = months.reduce((s, m) => s + getBudgetValue(m), 0);
  const totalActual = months.reduce((s, m) => s + getActualValue(m), 0);

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
          <p className="text-sm text-gray-500 mb-4">Clique em qualquer valor para editar.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">Mês</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Orçamento Aprovado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Realizado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => {
                  const budgetVal = getBudgetValue(month);
                  const actualVal = getActualValue(month);
                  const diff = budgetVal - actualVal;
                  return (
                    <tr key={month} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {formatMonth(month)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <EditableCell
                          value={budgetVal}
                          onSave={(val) => saveBudget(month, val)}
                          placeholder="Definir orçamento..."
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <EditableCell
                          value={actualVal}
                          onSave={(val) => saveActual(month, val)}
                          placeholder="Definir realizado..."
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        {budgetVal > 0 ? (
                          <span className={`font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diff >= 0 ? '+' : ''}{formatBRL(diff)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatBRL(totalBudget)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatBRL(totalActual)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold">
                    <span className={totalBudget - totalActual >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {totalBudget - totalActual >= 0 ? '+' : ''}{formatBRL(totalBudget - totalActual)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
