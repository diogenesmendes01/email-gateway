import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { LoadingSpinner, ErrorMessage } from '../components/ui/LoadingSpinner';

interface CompanyProfile {
  id: string;
  name: string;
  email: string;
  status: {
    isApproved: boolean;
    isActive: boolean;
    isSuspended: boolean;
    approvedAt: Date | null;
    suspensionReason: string | null;
  };
  limits: {
    dailyEmailLimit: number;
    monthlyEmailLimit: number | null;
    emailsSentToday: number;
    emailsSentThisMonth: number;
  };
  metrics: {
    bounceRate: number;
    complaintRate: number;
    totalEmailsSent: number;
    lastMetricsUpdate: Date | null;
  };
  config: {
    defaultFromAddress: string | null;
    defaultFromName: string | null;
    domainId: string | null;
  };
  apiKey: {
    prefix: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const fetchProfile = async (): Promise<CompanyProfile> => {
  const response = await axios.get('/v1/company/profile');
  return response.data;
};

const updateProfile = async (data: { name?: string; defaultFromAddress?: string; defaultFromName?: string }) => {
  const response = await axios.put('/v1/company/profile', data);
  return response.data;
};

const regenerateApiKey = async (currentPassword: string) => {
  const response = await axios.post('/v1/company/profile/regenerate-api-key', { currentPassword });
  return response.data;
};

const StatusBadge: React.FC<{ status: CompanyProfile['status'] }> = ({ status }) => {
  if (status.isSuspended) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
        🚫 Suspenso
      </span>
    );
  }
  if (status.isApproved) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
        ✓ Aprovado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
      ⏳ Pendente
    </span>
  );
};

const ProgressBar: React.FC<{ value: number; max: number; color?: string }> = ({
  value,
  max,
  color = 'bg-blue-500'
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const isWarning = percentage > 80;
  const isDanger = percentage > 95;

  const barColor = isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : color;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{value.toLocaleString()} / {max.toLocaleString()}</span>
        <span>{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const MetricIndicator: React.FC<{ label: string; value: number; thresholds: [number, number] }> = ({
  label,
  value,
  thresholds
}) => {
  const [good, warning] = thresholds;
  const isGood = value <= good;
  const isWarning = value > good && value <= warning;
  const isDanger = value > warning;

  const color = isGood ? 'text-green-600' : isWarning ? 'text-yellow-600' : 'text-red-600';
  const bgColor = isGood ? 'bg-green-50' : isWarning ? 'bg-yellow-50' : 'bg-red-50';
  const icon = isGood ? '✓' : isWarning ? '⚠' : '✗';

  return (
    <div className={`p-4 rounded-lg ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value.toFixed(2)}%</p>
        </div>
        <span className={`text-3xl ${color}`}>{icon}</span>
      </div>
    </div>
  );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
    >
      {copied ? '✓ Copiado' : '📋 Copiar'}
    </button>
  );
};

const RegenerateApiKeyModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  isLoading: boolean;
}> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(password);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <span className="text-2xl">🔑</span>
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Regenerar API Key
                  </h3>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Esta ação irá invalidar sua API Key atual imediatamente. Certifique-se de atualizar todos os sistemas que a utilizam.
                    </p>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Digite sua senha para confirmar:
                    </label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Senha atual"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isLoading || !password}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Regenerando...' : 'Regenerar API Key'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const ApiKeySuccessModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  expiresAt: Date;
}> = ({ isOpen, onClose, apiKey, expiresAt }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                <span className="text-2xl">✓</span>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  API Key Regenerada com Sucesso!
                </h3>
                <div className="mt-4">
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <span className="text-yellow-400">⚠️</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          <strong>ATENÇÃO:</strong> Esta é a única vez que a API Key será mostrada.
                          Guarde-a em local seguro!
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-md border border-gray-200 break-all font-mono text-sm">
                    {apiKey}
                  </div>

                  <button
                    onClick={handleCopy}
                    className={`mt-3 w-full px-4 py-2 rounded-md font-medium transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {copied ? '✓ Copiado!' : '📋 Copiar API Key'}
                  </button>

                  <p className="mt-3 text-xs text-gray-500">
                    Expira em: {new Date(expiresAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<{ apiKey: string; expiresAt: Date } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    defaultFromAddress: '',
    defaultFromName: '',
  });

  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ['company-profile'],
    queryFn: fetchProfile,
    onSuccess: (data) => {
      setFormData({
        name: data.name,
        defaultFromAddress: data.config.defaultFromAddress || '',
        defaultFromName: data.config.defaultFromName || '',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      setIsEditing(false);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: regenerateApiKey,
    onSuccess: (data) => {
      setIsRegenerateModalOpen(false);
      setNewApiKey({ apiKey: data.apiKey, expiresAt: data.expiresAt });
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleRegenerateApiKey = (password: string) => {
    regenerateMutation.mutate(password);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        message="Falha ao carregar perfil. Tente novamente."
        onRetry={() => refetch()}
      />
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Perfil da Empresa
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie informações, configurações e API Key da sua empresa
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Informações da Empresa */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Informações da Empresa</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{profile.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-sm text-gray-900">{profile.email}</p>
              <p className="text-xs text-gray-500">Email não pode ser alterado</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">ID da Empresa</label>
              <div className="flex items-center">
                <code className="mt-1 text-sm text-gray-900 bg-gray-50 px-2 py-1 rounded">{profile.id}</code>
                <CopyButton text={profile.id} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Criado em</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(profile.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Status da Conta */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Status da Conta</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status Atual</label>
              <StatusBadge status={profile.status} />
            </div>
            {profile.status.approvedAt && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Aprovado em</label>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(profile.status.approvedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
            {profile.status.isSuspended && profile.status.suspensionReason && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm font-medium text-red-800">Motivo da Suspensão:</p>
                <p className="text-sm text-red-700 mt-1">{profile.status.suspensionReason}</p>
              </div>
            )}
            {!profile.status.isApproved && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  Sua conta está em modo sandbox. Aguardando aprovação para remover limites.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Limites de Envio */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Limites de Envio</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uso Diário ({profile.limits.dailyEmailLimit.toLocaleString()} emails/dia)
              </label>
              <ProgressBar
                value={profile.limits.emailsSentToday}
                max={profile.limits.dailyEmailLimit}
              />
            </div>
            {profile.limits.monthlyEmailLimit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Uso Mensal ({profile.limits.monthlyEmailLimit.toLocaleString()} emails/mês)
                </label>
                <ProgressBar
                  value={profile.limits.emailsSentThisMonth}
                  max={profile.limits.monthlyEmailLimit}
                />
              </div>
            )}
          </div>
        </div>

        {/* Métricas de Qualidade */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Métricas de Qualidade</h3>
          <div className="space-y-4">
            <MetricIndicator
              label="Bounce Rate"
              value={profile.metrics.bounceRate}
              thresholds={[2, 5]}
            />
            <MetricIndicator
              label="Complaint Rate"
              value={profile.metrics.complaintRate}
              thresholds={[0.1, 0.5]}
            />
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">Total de Emails Enviados</p>
              <p className="text-2xl font-bold text-gray-900">{profile.metrics.totalEmailsSent.toLocaleString()}</p>
            </div>
            {profile.metrics.lastMetricsUpdate && (
              <p className="text-xs text-gray-500">
                Última atualização: {new Date(profile.metrics.lastMetricsUpdate).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        </div>

        {/* Configurações de Envio */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Configurações de Envio</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">From Address</label>
              {isEditing ? (
                <input
                  type="email"
                  value={formData.defaultFromAddress}
                  onChange={(e) => setFormData({ ...formData, defaultFromAddress: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{profile.config.defaultFromAddress || 'Não configurado'}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">From Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.defaultFromName}
                  onChange={(e) => setFormData({ ...formData, defaultFromName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{profile.config.defaultFromName || 'Não configurado'}</p>
              )}
            </div>
          </div>
        </div>

        {/* API Key Management */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">API Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">API Key Prefix</label>
              <div className="flex items-center">
                <code className="mt-1 text-sm text-gray-900 bg-gray-50 px-2 py-1 rounded font-mono">
                  {profile.apiKey.prefix}
                </code>
                <CopyButton text={profile.apiKey.prefix} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Criada em</label>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(profile.apiKey.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expira em</label>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(profile.apiKey.expiresAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            {profile.apiKey.lastUsedAt && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Último uso</label>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(profile.apiKey.lastUsedAt).toLocaleString('pt-BR')}
                </p>
              </div>
            )}
            <button
              onClick={() => setIsRegenerateModalOpen(true)}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              🔑 Regenerar API Key
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            {updateMutation.isError && (
              <p className="text-sm text-red-600">
                Erro ao atualizar perfil. Tente novamente.
              </p>
            )}
            {updateMutation.isSuccess && (
              <p className="text-sm text-green-600">
                Perfil atualizado com sucesso!
              </p>
            )}
          </div>
          <div className="flex space-x-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData({
                      name: profile.name,
                      defaultFromAddress: profile.config.defaultFromAddress || '',
                      defaultFromName: profile.config.defaultFromName || '',
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {updateMutation.isLoading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Editar Perfil
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <RegenerateApiKeyModal
        isOpen={isRegenerateModalOpen}
        onClose={() => setIsRegenerateModalOpen(false)}
        onConfirm={handleRegenerateApiKey}
        isLoading={regenerateMutation.isLoading}
      />

      {newApiKey && (
        <ApiKeySuccessModal
          isOpen={!!newApiKey}
          onClose={() => setNewApiKey(null)}
          apiKey={newApiKey.apiKey}
          expiresAt={newApiKey.expiresAt}
        />
      )}
    </div>
  );
};
