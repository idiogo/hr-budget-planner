import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/client';
import type { AuditLog } from '../types';
import { formatDateTime } from '../utils/format';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  
  // Filters
  const [entityType, setEntityType] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadLogs();
  }, [entityType, limit]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit };
      if (entityType) params.entity_type = entityType;
      
      const data = await adminApi.listAuditLogs(params);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-800';
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-800';
      case 'APPROVE':
        return 'bg-emerald-100 text-emerald-800';
      case 'TRANSITION':
        return 'bg-yellow-100 text-yellow-800';
      case 'HOLD':
        return 'bg-orange-100 text-orange-800';
      case 'ACCEPT':
        return 'bg-teal-100 text-teal-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const entityTypes = [
    { value: '', label: 'All Types' },
    { value: 'user', label: 'User' },
    { value: 'org_unit', label: 'Org Unit' },
    { value: 'budget', label: 'Budget' },
    { value: 'forecast', label: 'Forecast' },
    { value: 'actual', label: 'Actual' },
    { value: 'job_catalog', label: 'Job Catalog' },
    { value: 'requisition', label: 'Requisition' },
    { value: 'offer', label: 'Offer' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Admin
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Select
          options={entityTypes}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="w-40"
        />
        <Select
          options={[
            { value: '50', label: 'Last 50' },
            { value: '100', label: 'Last 100' },
            { value: '250', label: 'Last 250' },
            { value: '500', label: 'Last 500' },
          ]}
          value={limit.toString()}
          onChange={(e) => setLimit(parseInt(e.target.value))}
          className="w-32"
        />
        <Button variant="secondary" onClick={loadLogs}>
          Refresh
        </Button>
      </div>

      {/* Logs Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No audit logs found</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="border rounded-lg">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center space-x-4">
                    {expandedLog === log.id ? (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-500 w-36">{formatDateTime(log.created_at)}</span>
                    <Badge color={getActionColor(log.action)}>{log.action}</Badge>
                    <span className="text-sm font-medium text-gray-900">{log.entity_type}</span>
                    <span className="text-xs text-gray-400 font-mono">{log.entity_id.slice(0, 8)}...</span>
                  </div>
                  <span className="text-xs text-gray-400">{log.ip_address}</span>
                </div>
                
                {expandedLog === log.id && log.changes && (
                  <div className="px-4 pb-3 border-t bg-gray-50">
                    <pre className="text-xs text-gray-600 overflow-x-auto p-2 mt-2 bg-white rounded border">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
