import { useEffect, useState } from 'react';
import { requisitionsApi, orgUnitsApi, jobCatalogApi } from '../api/client';
import type { Requisition, OrgUnit, JobCatalog } from '../types';
import {
  formatCurrency,
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

export default function Requisitions() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [jobs, setJobs] = useState<JobCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requisition | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  
  // Form state
  const [formData, setFormData] = useState({
    org_unit_id: '',
    job_catalog_id: '',
    title: '',
    priority: 'P2',
    target_start_month: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadRequisitions();
  }, [statusFilter, priorityFilter]);

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
      }
    } catch (error) {
      console.error('Failed to load data:', error);
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
      priority: 'P2',
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
      priority: req.priority,
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

  const pipelinePotential = requisitions
    .filter((r) => ['OPEN', 'INTERVIEWING'].includes(r.status))
    .reduce((sum, r) => sum + (r.estimated_monthly_cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Requisitions</h1>
        <Button onClick={() => { resetForm(); setEditingReq(null); setIsModalOpen(true); }}>
          <PlusIcon className="w-4 h-4 mr-2" />
          New Requisition
        </Button>
      </div>

      {/* Filters & Summary */}
      <div className="flex flex-wrap gap-4 items-center">
        <Select
          options={[
            { value: '', label: 'All Status' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'OPEN', label: 'Open' },
            { value: 'INTERVIEWING', label: 'Interviewing' },
            { value: 'OFFER_PENDING', label: 'Offer Pending' },
            { value: 'FILLED', label: 'Filled' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        />
        <Select
          options={[
            { value: '', label: 'All Priority' },
            { value: 'P0', label: 'P0' },
            { value: 'P1', label: 'P1' },
            { value: 'P2', label: 'P2' },
            { value: 'P3', label: 'P3' },
          ]}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-32"
        />
        <div className="ml-auto text-sm text-gray-500">
          Pipeline Potential: <span className="font-medium text-gray-900">{formatCurrency(pipelinePotential)}</span>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Cost</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Candidate?</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requisitions.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{req.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{req.job_catalog?.title}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={getPriorityColor(req.priority)}>{req.priority}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={getRequisitionStatusColor(req.status)}>{req.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{req.target_start_month || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {req.estimated_monthly_cost ? formatCurrency(req.estimated_monthly_cost) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-lg">
                      {req.has_candidate_ready ? '✅' : '❌'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(req)}>
                        Edit
                      </Button>
                      {req.status === 'DRAFT' && (
                        <Button size="sm" variant="secondary" onClick={() => handleTransition(req.id, 'OPEN')}>
                          Open
                        </Button>
                      )}
                      {req.status === 'OPEN' && (
                        <Button size="sm" variant="secondary" onClick={() => handleTransition(req.id, 'INTERVIEWING')}>
                          Start Interviews
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingReq(null); }}
        title={editingReq ? 'Edit Requisition' : 'New Requisition'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Org Unit"
            options={orgUnits.map((ou) => ({ value: ou.id, label: ou.name }))}
            value={formData.org_unit_id}
            onChange={(e) => setFormData({ ...formData, org_unit_id: e.target.value })}
            required
          />
          
          <Select
            label="Job"
            options={[
              { value: '', label: 'Select a job...' },
              ...jobs.map((j) => ({ value: j.id, label: `${j.title} - ${formatCurrency(j.monthly_cost)}` })),
            ]}
            value={formData.job_catalog_id}
            onChange={(e) => setFormData({ ...formData, job_catalog_id: e.target.value })}
            required
          />
          
          <Input
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Senior Backend Engineer"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priority"
              options={[
                { value: 'P0', label: 'P0 - Critical' },
                { value: 'P1', label: 'P1 - High' },
                { value: 'P2', label: 'P2 - Medium' },
                { value: 'P3', label: 'P3 - Low' },
              ]}
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            />
            
            <Input
              label="Target Start Month"
              type="month"
              value={formData.target_start_month}
              onChange={(e) => setFormData({ ...formData, target_start_month: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2 text-sm"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingReq ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
