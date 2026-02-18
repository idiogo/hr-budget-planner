import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orgUnitsApi, offersApi } from '../api/client';
import type { OrgUnit, OrgUnitSummary, Offer } from '../types';
import { formatCurrency, formatMonth, getStatusColor, getStatusEmoji } from '../utils/format';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import {
  ExclamationTriangleIcon,
  DocumentCheckIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

export default function Dashboard() {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>('');
  const [summary, setSummary] = useState<OrgUnitSummary | null>(null);
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrgUnits();
  }, []);

  useEffect(() => {
    if (selectedOrgUnit) {
      loadSummary(selectedOrgUnit);
      loadPendingOffers(selectedOrgUnit);
    }
  }, [selectedOrgUnit]);

  const loadOrgUnits = async () => {
    try {
      const data = await orgUnitsApi.list();
      setOrgUnits(data);
      if (data.length > 0) {
        setSelectedOrgUnit(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load org units:', error);
    }
  };

  const loadSummary = async (orgUnitId: string) => {
    setLoading(true);
    try {
      const data = await orgUnitsApi.getSummary(orgUnitId);
      setSummary(data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingOffers = async (orgUnitId: string) => {
    try {
      const data = await offersApi.list({ org_unit_id: orgUnitId, status: 'PROPOSED' });
      setPendingOffers(data);
    } catch (error) {
      console.error('Failed to load offers:', error);
    }
  };

  const alertMonths = summary?.months.filter((m) => m.status !== 'green') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Select
          options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
          value={selectedOrgUnit}
          onChange={(e) => setSelectedOrgUnit(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-yellow-500">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500 mr-3" />
            <div>
              <h3 className="font-medium text-gray-900">Budget Alerts</h3>
              <p className="text-sm text-gray-500 mt-1">
                {alertMonths.length > 0
                  ? `${alertMonths.length} month(s) need attention`
                  : 'All months looking healthy'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-primary-500">
          <div className="flex items-start">
            <DocumentCheckIcon className="w-6 h-6 text-primary-500 mr-3" />
            <div>
              <h3 className="font-medium text-gray-900">Pending Offers</h3>
              <p className="text-sm text-gray-500 mt-1">
                {pendingOffers.length} offer(s) awaiting decision
              </p>
            </div>
          </div>
        </Card>

        <div className="flex space-x-2">
          <Link to="/requisitions" className="flex-1">
            <Button variant="secondary" className="w-full">
              <PlusIcon className="w-4 h-4 mr-2" />
              New Requisition
            </Button>
          </Link>
          <Link to="/offers" className="flex-1">
            <Button className="w-full">View Offer Gate</Button>
          </Link>
        </div>
      </div>

      {/* Budget Summary Table */}
      <Card title="Budget Summary by Month">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approved
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Baseline
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Committed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pipeline
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {summary?.months.map((month) => (
                  <tr key={month.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMonth(month.month)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(month.approved)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(month.baseline)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      <Badge
                        color={
                          month.baseline_source === 'actual'
                            ? 'bg-green-100 text-green-800'
                            : month.baseline_source === 'forecast'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-600'
                        }
                      >
                        {month.baseline_source}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(month.committed)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500">
                      {formatCurrency(month.pipeline_potential)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(month.remaining)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(month.status)}`}>
                        {getStatusEmoji(month.status)} {month.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
