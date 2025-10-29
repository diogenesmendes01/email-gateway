import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface Domain {
  id: string;
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  dkimTokens: string[];
  verificationToken: string;
  createdAt: string;
  verifiedAt?: string;
}

export const DomainsPage: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const queryClient = useQueryClient();

  const { data: domains, isLoading } = useQuery<Domain[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      const res = await axios.get('/v1/company/domains');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const addMutation = useMutation({
    mutationFn: async (domain: string) => {
      await axios.post('/v1/company/domains', { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowAddModal(false);
      setNewDomain('');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (domainId: string) => {
      await axios.post(`/v1/company/domains/${domainId}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (domainId: string) => {
      await axios.put(`/v1/domains/${domainId}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Meus Domínios</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Adicionar Domínio
        </button>
      </div>

      {domains?.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Nenhum domínio cadastrado. Adicione seu primeiro domínio para começar.
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domínio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {domains?.map((domain) => (
                <tr key={domain.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{domain.domain}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      domain.status === 'VERIFIED' ? 'bg-green-100 text-green-800' :
                      domain.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {domain.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(domain.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => setSelectedDomain(domain)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Ver DNS
                    </button>
                    {domain.status !== 'VERIFIED' && (
                      <button
                        onClick={() => verifyMutation.mutate(domain.id)}
                        className="text-green-600 hover:text-green-900"
                      >
                        Verificar
                      </button>
                    )}
                    {domain.status === 'VERIFIED' && (
                      <button
                        onClick={() => setDefaultMutation.mutate(domain.id)}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Padrão
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Adicionar Domínio</h2>
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="exemplo.com"
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => addMutation.mutate(newDomain)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDomain && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-bold mb-4">Tokens DNS - {selectedDomain.domain}</h2>
            <div className="space-y-4">
              <div>
                <label className="font-semibold block mb-2">Verificação (TXT)</label>
                <code className="block bg-gray-100 p-2 rounded text-sm break-all">
                  {selectedDomain.verificationToken}
                </code>
              </div>
              {selectedDomain.dkimTokens?.map((token, i) => (
                <div key={i}>
                  <label className="font-semibold block mb-2">DKIM {i + 1} (CNAME)</label>
                  <code className="block bg-gray-100 p-2 rounded text-sm break-all">
                    {token}
                  </code>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedDomain(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
