/**
 * @email-gateway/dashboard - Admin Curation Page
 *
 * TASK-035: Interface para curadoria de empresas
 * Permite aprovar, rejeitar, suspender e reativar empresas
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface Company {
  id: string;
  name: string;
  createdAt: string;
  bounceRate: number;
  complaintRate: number;
  dailyEmailLimit: number;
  _count: {
    emailOutbox: number;
  };
}

interface ActionModalProps {
  show: boolean;
  title: string;
  company: Company | null;
  onClose: () => void;
  onConfirm: (data: any) => void;
  type: 'approve' | 'reject' | 'suspend' | 'reactivate';
  loading: boolean;
}

const ActionModal: React.FC<ActionModalProps> = ({
  show,
  title,
  company,
  onClose,
  onConfirm,
  type,
  loading,
}) => {
  const [adminToken, setAdminToken] = useState('');
  const [reason, setReason] = useState('');
  const [dailyLimit, setDailyLimit] = useState(5000);

  if (!show || !company) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (type === 'approve') {
      onConfirm({
        adminUsername: adminToken,
        dailyEmailLimit: dailyLimit,
      });
    } else if (type === 'reject' || type === 'suspend') {
      onConfirm({ reason });
    } else {
      onConfirm({});
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">{title}</h2>

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm font-medium text-gray-700">{company.name}</p>
          <p className="text-xs text-gray-500 mt-1">ID: {company.id}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'approve' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Token *
                </label>
                <input
                  type="text"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  required
                  placeholder="seu-token-admin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Limite Diário de Emails
                </label>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  min={100}
                  max={50000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Padrão: 5000 emails/dia
                </p>
              </div>
            </>
          )}

          {(type === 'reject' || type === 'suspend') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                placeholder={
                  type === 'reject'
                    ? 'Ex: Alto bounce rate, atividade suspeita'
                    : 'Ex: Violação temporária das políticas'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          )}

          {type === 'reactivate' && (
            <p className="text-sm text-gray-600">
              Tem certeza que deseja reativar esta empresa?
            </p>
          )}

          <div className="flex justify-end space-x-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-white rounded-md disabled:opacity-50 ${
                type === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : type === 'reject'
                  ? 'bg-red-600 hover:bg-red-700'
                  : type === 'suspend'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminPage: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [actionType, setActionType] = useState<
    'approve' | 'reject' | 'suspend' | 'reactivate' | null
  >(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'bounceRate' | 'complaintRate'>(
    'createdAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const queryClient = useQueryClient();

  // Fetch pending companies
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ['admin', 'pending-companies'],
    queryFn: async () => {
      const res = await axios.get('/v1/admin/companies/pending');
      return res.data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: async ({
      companyId,
      data,
    }: {
      companyId: string;
      data: { adminUsername: string; dailyEmailLimit: number };
    }) => {
      await axios.post(`/v1/admin/companies/${companyId}/approve`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-companies'] });
      setSuccessMessage('Empresa aprovada com sucesso!');
      closeModal();
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: (error: any) => {
      setErrorMessage(
        error.response?.data?.message || 'Erro ao aprovar empresa'
      );
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      companyId,
      data,
    }: {
      companyId: string;
      data: { reason: string };
    }) => {
      await axios.post(`/v1/admin/companies/${companyId}/reject`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-companies'] });
      setSuccessMessage('Empresa rejeitada');
      closeModal();
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: (error: any) => {
      setErrorMessage(
        error.response?.data?.message || 'Erro ao rejeitar empresa'
      );
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({
      companyId,
      data,
    }: {
      companyId: string;
      data: { reason: string };
    }) => {
      await axios.post(`/v1/admin/companies/${companyId}/suspend`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-companies'] });
      setSuccessMessage('Empresa suspensa');
      closeModal();
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: (error: any) => {
      setErrorMessage(
        error.response?.data?.message || 'Erro ao suspender empresa'
      );
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      await axios.post(`/v1/admin/companies/${companyId}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-companies'] });
      setSuccessMessage('Empresa reativada com sucesso!');
      closeModal();
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: (error: any) => {
      setErrorMessage(
        error.response?.data?.message || 'Erro ao reativar empresa'
      );
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  const closeModal = () => {
    setSelectedCompany(null);
    setActionType(null);
  };

  const handleAction = (company: Company, type: typeof actionType) => {
    setSelectedCompany(company);
    setActionType(type);
  };

  const handleConfirm = (data: any) => {
    if (!selectedCompany) return;

    if (actionType === 'approve') {
      approveMutation.mutate({ companyId: selectedCompany.id, data });
    } else if (actionType === 'reject') {
      rejectMutation.mutate({ companyId: selectedCompany.id, data });
    } else if (actionType === 'suspend') {
      suspendMutation.mutate({ companyId: selectedCompany.id, data });
    } else if (actionType === 'reactivate') {
      reactivateMutation.mutate({ companyId: selectedCompany.id });
    }
  };

  // Sort companies
  const sortedCompanies = companies
    ? [...companies].sort((a, b) => {
        let compareValue = 0;

        if (sortBy === 'createdAt') {
          compareValue =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        } else if (sortBy === 'bounceRate') {
          compareValue = a.bounceRate - b.bounceRate;
        } else if (sortBy === 'complaintRate') {
          compareValue = a.complaintRate - b.complaintRate;
        }

        return sortOrder === 'asc' ? compareValue : -compareValue;
      })
    : [];

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const isLoading2 =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    suspendMutation.isPending ||
    reactivateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Curadoria de Empresas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {companies?.length || 0} empresas pendentes de aprovação
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 border border-green-200">
          <p className="text-green-800 font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-red-800">{errorMessage}</p>
        </div>
      )}

      {sortedCompanies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">
            Nenhuma empresa pendente de aprovação no momento.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Empresa
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('createdAt')}
                  >
                    Criado em {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Emails Enviados
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('bounceRate')}
                  >
                    Bounce Rate {sortBy === 'bounceRate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('complaintRate')}
                  >
                    Complaint Rate{' '}
                    {sortBy === 'complaintRate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedCompanies.map((company) => {
                  const daysOld = Math.floor(
                    (Date.now() - new Date(company.createdAt).getTime()) /
                      (24 * 60 * 60 * 1000)
                  );
                  const eligible =
                    daysOld >= 7 &&
                    company._count.emailOutbox >= 50 &&
                    company.bounceRate < 2.0 &&
                    company.complaintRate < 0.05;

                  return (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {company.name}
                          </p>
                          <p className="text-xs text-gray-500">{company.id}</p>
                          {eligible && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                              Elegível para auto-aprovação
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(company.createdAt).toLocaleDateString()}
                        <br />
                        <span className="text-xs text-gray-400">
                          ({daysOld} dias)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {company._count.emailOutbox}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            company.bounceRate < 2.0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {company.bounceRate.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            company.complaintRate < 0.05
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {company.complaintRate.toFixed(4)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleAction(company, 'approve')}
                          className="text-green-600 hover:text-green-900"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleAction(company, 'reject')}
                          className="text-red-600 hover:text-red-900"
                        >
                          Rejeitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActionModal
        show={!!actionType}
        title={
          actionType === 'approve'
            ? 'Aprovar Empresa'
            : actionType === 'reject'
            ? 'Rejeitar Empresa'
            : actionType === 'suspend'
            ? 'Suspender Empresa'
            : 'Reativar Empresa'
        }
        company={selectedCompany}
        onClose={closeModal}
        onConfirm={handleConfirm}
        type={actionType!}
        loading={isLoading2}
      />
    </div>
  );
};
