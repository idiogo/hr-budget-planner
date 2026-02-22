import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, jobCatalogApi, orgUnitsApi } from '../api/client';
import { useAuthStore } from '../stores/auth';
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
  const currentUser = useAuthStore((s) => s.user);
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
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgUnit | null>(null);
  
  // Forms
  const [orgForm, setOrgForm] = useState({
    name: '',
    currency: 'BRL',
    overhead_multiplier: '1.00',
  });
  const [jobForm, setJobForm] = useState({
    job_family: '',
    level: '',
    title: '',
    monthly_cost: '',
    hierarchy_level: '100',
  });
  const [userForm, setUserForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'MANAGER',
    org_unit_id: '',
    job_catalog_id: '',
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
          const jobsForUsers = await jobCatalogApi.list();
          setJobs(jobsForUsers);
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
        hierarchy_level: parseInt(jobForm.hierarchy_level) || 100,
      };
      
      if (editingJob) {
        await jobCatalogApi.update(editingJob.id, data);
      } else {
        await jobCatalogApi.create(data);
      }
      
      setIsJobModalOpen(false);
      setEditingJob(null);
      setJobForm({ job_family: '', level: '', title: '', monthly_cost: '', hierarchy_level: '100' });
      loadData();
    } catch (error) {
      console.error('Failed to save job:', error);
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cargo?')) return;
    
    try {
      await jobCatalogApi.delete(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      await adminApi.deleteUser(id);
      loadData();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Erro ao excluir usuário');
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
          job_catalog_id: userForm.job_catalog_id || null,
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
          job_catalog_id: userForm.job_catalog_id || undefined,
        });
      }
      
      setIsUserModalOpen(false);
      setEditingUser(null);
      setUserForm({ email: '', name: '', password: '', role: 'MANAGER', org_unit_id: '', job_catalog_id: '' });
      loadData();
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        name: orgForm.name,
        currency: orgForm.currency,
        overhead_multiplier: parseFloat(orgForm.overhead_multiplier),
      };
      if (editingOrg) {
        await orgUnitsApi.update(editingOrg.id, data);
      } else {
        await orgUnitsApi.create(data);
      }
      setIsOrgModalOpen(false);
      setEditingOrg(null);
      setOrgForm({ name: '', currency: 'BRL', overhead_multiplier: '1.00' });
      loadData();
    } catch (error) {
      console.error('Failed to save org unit:', error);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta área? Todos os dados vinculados serão afetados.')) return;
    try {
      await orgUnitsApi.delete(id);
      loadData();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Erro ao excluir área');
    }
  };

  const openEditOrg = (org: OrgUnit) => {
    setEditingOrg(org);
    setOrgForm({
      name: org.name,
      currency: org.currency,
      overhead_multiplier: org.overhead_multiplier?.toString() || '1.00',
    });
    setIsOrgModalOpen(true);
  };

  const openEditJob = (job: JobCatalog) => {
    setEditingJob(job);
    setJobForm({
      job_family: job.job_family,
      level: job.level,
      title: job.title,
      monthly_cost: job.monthly_cost.toString(),
      hierarchy_level: job.hierarchy_level?.toString() || '100',
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
      job_catalog_id: user.job_catalog_id || '',
    });
    setIsUserModalOpen(true);
  };

  const tabs = [
    { id: 'budget' as Tab, label: 'Orçamento' },
    { id: 'catalog' as Tab, label: 'Cargos e Salários' },
    { id: 'users' as Tab, label: 'Usuários' },
    { id: 'org-units' as Tab, label: 'Áreas' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Configuração</h1>
        <Link to="/admin/audit">
          <Button variant="secondary">Ver Logs de Auditoria</Button>
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
          title="Cargos e Salários"
          action={
            <Button size="sm" onClick={() => { setEditingJob(null); setJobForm({ job_family: '', level: '', title: '', monthly_cost: '' }); setIsJobModalOpen(true); }}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Novo Cargo
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Família</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nível</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo Mensal</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nível Hierárquico</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{job.job_family}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{job.level}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{job.title}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(job.monthly_cost)}</td>
                      <td className="px-4 py-3 text-sm text-center text-gray-500">{job.hierarchy_level}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={job.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {job.active ? 'Ativo' : 'Inativo'}
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
          title="Usuários"
          action={
            <Button size="sm" onClick={() => { setEditingUser(null); setUserForm({ email: '', name: '', password: '', role: 'MANAGER', org_unit_id: '' }); setIsUserModalOpen(true); }}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Novo Usuário
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Perfil</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Área</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
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
                      <td className="px-4 py-3 text-sm text-gray-500">{user.job_catalog ? `${user.job_catalog.title} (${user.job_catalog.level})` : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={user.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {user.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditUser(user)}>
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteUser(user.id)}>
                            <TrashIcon className="w-4 h-4 text-red-500" />
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
      )}

      {/* Org Units Tab */}
      {activeTab === 'org-units' && (
        <Card
          title="Áreas"
          action={
            <Button size="sm" onClick={() => { setEditingOrg(null); setOrgForm({ name: '', currency: 'BRL', overhead_multiplier: '1.00' }); setIsOrgModalOpen(true); }}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Nova Área
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Moeda</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Multiplicador Overhead</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
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
                          {ou.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(ou.created_at)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditOrg(ou)}>
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteOrg(ou.id)}>
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

      {/* Job Modal */}
      <Modal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} title={editingJob ? 'Editar Cargo' : 'Novo Cargo'}>
        <form onSubmit={handleSaveJob} className="space-y-4">
          <Input
            label="Família"
            value={jobForm.job_family}
            onChange={(e) => setJobForm({ ...jobForm, job_family: e.target.value })}
            placeholder="ex: Engenharia"
            required
          />
          <Input
            label="Nível"
            value={jobForm.level}
            onChange={(e) => setJobForm({ ...jobForm, level: e.target.value })}
            placeholder="ex: Sênior"
            required
          />
          <Input
            label="Título"
            value={jobForm.title}
            onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
            placeholder="ex: Engenheiro de Software Sênior"
            required
          />
          <Input
            label="Custo Mensal"
            type="number"
            value={jobForm.monthly_cost}
            onChange={(e) => setJobForm({ ...jobForm, monthly_cost: e.target.value })}
            required
          />
          <Input
            label="Nível Hierárquico"
            type="number"
            value={jobForm.hierarchy_level}
            onChange={(e) => setJobForm({ ...jobForm, hierarchy_level: e.target.value })}
            placeholder="100 = mais alto, 10 = mais baixo"
            required
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsJobModalOpen(false)}>Cancelar</Button>
            <Button type="submit">{editingJob ? 'Atualizar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>

      {/* Org Unit Modal */}
      <Modal isOpen={isOrgModalOpen} onClose={() => setIsOrgModalOpen(false)} title={editingOrg ? 'Editar Área' : 'Nova Área'}>
        <form onSubmit={handleSaveOrg} className="space-y-4">
          <Input
            label="Nome"
            value={orgForm.name}
            onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
            placeholder="ex: Engenharia"
            required
          />
          <Input
            label="Moeda"
            value={orgForm.currency}
            onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })}
            placeholder="BRL"
            maxLength={3}
          />
          <Input
            label="Multiplicador Overhead"
            type="number"
            step="0.01"
            value={orgForm.overhead_multiplier}
            onChange={(e) => setOrgForm({ ...orgForm, overhead_multiplier: e.target.value })}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsOrgModalOpen(false)}>Cancelar</Button>
            <Button type="submit">{editingOrg ? 'Atualizar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>

      {/* User Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={editingUser ? 'Editar Usuário' : 'Novo Usuário'}>
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Input
            label="Nome"
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
            label={editingUser ? 'Senha (deixe em branco para manter)' : 'Senha'}
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            required={!editingUser}
          />
          <Select
            label="Perfil"
            options={[
              { value: 'MANAGER', label: 'Gestor' },
              { value: 'ADMIN', label: 'Administrador' },
            ]}
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
          />
          <Select
            label="Área"
            options={[
              { value: '', label: 'Nenhuma' },
              ...orgUnits.map((ou) => ({ value: ou.id, label: ou.name })),
            ]}
            value={userForm.org_unit_id}
            onChange={(e) => setUserForm({ ...userForm, org_unit_id: e.target.value })}
          />
          <Select
            label="Cargo"
            options={[
              { value: '', label: 'Nenhum' },
              ...jobs.map((j) => ({ value: j.id, label: `${j.title} (${j.level}) — Nível ${j.hierarchy_level}` })),
            ]}
            value={userForm.job_catalog_id}
            onChange={(e) => setUserForm({ ...userForm, job_catalog_id: e.target.value })}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
            <Button type="submit">{editingUser ? 'Atualizar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
