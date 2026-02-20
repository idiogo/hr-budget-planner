import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, jobCatalogApi, orgUnitsApi } from '../api/client';
import type { User, JobCatalog, OrgUnit } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import BudgetManager from '../components/BudgetManager';

type Tab = 'budget' | 'catalog' | 'users' | 'org-units';

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>('budget');
  const [jobs, setJobs] = useState<JobCatalog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobCatalog | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Forms
  const [jobForm, setJobForm] = useState({
    job_family: '',
    level: '',
    title: '',
    monthly_cost: '',
  });
  const [userForm, setUserForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'MANAGER',
    org_unit_id: '',
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'catalog':
          const jobData = await jobCatalogApi.list();
          setJobs(jobData);
          break;
        case 'users':
          const userData = await adminApi.listUsers();
          setUsers(userData);
          const orgs = await orgUnitsApi.list();
          setOrgUnits(orgs);
          break;
        case 'org-units':
          const orgData = await orgUnitsApi.list();
          setOrgUnits(orgData);
          break;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        job_family: jobForm.job_family,
        level: jobForm.level,
        title: jobForm.title,
        monthly_cost: parseFloat(jobForm.monthly_cost),
      };
      
      if (editingJob) {
        await jobCatalogApi.update(editingJob.id, data);
      } else {
        await jobCatalogApi.create(data);
      }
      
      setIsJobModalOpen(false);
      setEditingJob(null);
      setJobForm({ job_family: '', level: '', title: '', monthly_cost: '' });
      loadData();
    } catch (error) {
      console.error('Failed to save job:', error);
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;
    
    try {
      await jobCatalogApi.delete(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const updateData: Partial<User & { password?: string }> = {
          email: userForm.email,
          name: userForm.name,
          role: userForm.role as 'ADMIN' | 'MANAGER',
          org_unit_id: userForm.org_unit_id || null,
        };
        if (userForm.password) {
          updateData.password = userForm.password;
        }
        await adminApi.updateUser(editingUser.id, updateData);
      } else {
        await adminApi.createUser({
          email: userForm.email,
          name: userForm.name,
          password: userForm.password,
          role: userForm.role,
          org_unit_id: userForm.org_unit_id || undefined,
        });
      }
      
      setIsUserModalOpen(false);
      setEditingUser(null);
      setUserForm({ email: '', name: '', password: '', role: 'MANAGER', org_unit_id: '' });
      loadData();
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const openEditJob = (job: JobCatalog) => {
    setEditingJob(job);
    setJobForm({
      job_family: job.job_family,
      level: job.level,
      title: job.title,
      monthly_cost: job.monthly_cost.toString(),
    });
    setIsJobModalOpen(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      org_unit_id: user.org_unit_id || '',
    });
    setIsUserModalOpen(true);
  };

  const tabs = [
    { id: 'budget' as Tab, label: 'Orçamento' },
    { id: 'catalog' as Tab, label: 'Job Catalog' },
    { id: 'users' as Tab, label: 'Users' },
    { id: 'org-units' as Tab, label: 'Org Units' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <Link to="/admin/audit">
          <Button variant="secondary">View Audit Logs</Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Budget Tab */}
      {activeTab === 'budget' && <BudgetManager />}

      {/* Job Catalog Tab */}
      {activeTab === 'catalog' && (
        <Card
          title="Job Catalog"
          action={
            <Button size="sm" onClick={() => { setEditingJob(null); setJobForm({ job_family: '', level: '', title: '', monthly_cost: '' }); setIsJobModalOpen(true); }}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Add Job
            </Button>
          }
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Family</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Cost</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{job.job_family}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{job.level}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{job.title}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(job.monthly_cost)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={job.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {job.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditJob(job)}>
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteJob(job.id)}>
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <Card
          title="Users"
          action={
            <Button size="sm" onClick={() => { setEditingUser(null); setUserForm({ email: '', name: '', password: '', role: 'MANAGER', org_unit_id: '' }); setIsUserModalOpen(true); }}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Add User
            </Button>
          }
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Org Unit</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{user.org_unit?.name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={user.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {user.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEditUser(user)}>
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Org Units Tab */}
      {activeTab === 'org-units' && (
        <Card title="Organization Units">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overhead Multiplier</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orgUnits.map((ou) => (
                    <tr key={ou.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{ou.name}</td>
                      <td className="px-4 py-3 text-sm text-center text-gray-500">{ou.currency}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{ou.overhead_multiplier}x</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={ou.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {ou.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(ou.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Job Modal */}
      <Modal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} title={editingJob ? 'Edit Job' : 'New Job'}>
        <form onSubmit={handleSaveJob} className="space-y-4">
          <Input
            label="Job Family"
            value={jobForm.job_family}
            onChange={(e) => setJobForm({ ...jobForm, job_family: e.target.value })}
            placeholder="e.g., Engineering"
            required
          />
          <Input
            label="Level"
            value={jobForm.level}
            onChange={(e) => setJobForm({ ...jobForm, level: e.target.value })}
            placeholder="e.g., Senior"
            required
          />
          <Input
            label="Title"
            value={jobForm.title}
            onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
            placeholder="e.g., Senior Software Engineer"
            required
          />
          <Input
            label="Monthly Cost"
            type="number"
            value={jobForm.monthly_cost}
            onChange={(e) => setJobForm({ ...jobForm, monthly_cost: e.target.value })}
            required
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsJobModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editingJob ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      {/* User Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={editingUser ? 'Edit User' : 'New User'}>
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Input
            label="Name"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            required
          />
          <Input
            label={editingUser ? 'Password (leave blank to keep)' : 'Password'}
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            required={!editingUser}
          />
          <Select
            label="Role"
            options={[
              { value: 'MANAGER', label: 'Manager' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
          />
          <Select
            label="Org Unit"
            options={[
              { value: '', label: 'None' },
              ...orgUnits.map((ou) => ({ value: ou.id, label: ou.name })),
            ]}
            value={userForm.org_unit_id}
            onChange={(e) => setUserForm({ ...userForm, org_unit_id: e.target.value })}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editingUser ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
