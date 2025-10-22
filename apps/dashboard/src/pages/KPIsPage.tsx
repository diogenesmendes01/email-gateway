import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/LoadingSpinner';

interface KPIData {
  totalEnviados: number;
  totalEnviadosPeriodoAnterior: number;
  taxaSucesso: number;
  taxaSucessoPeriodoAnterior: number;
  totalErros: number;
  totalErrosPeriodoAnterior: number;
  dlqCount: number;
  latenciaMedia: number;
  latenciaP95: number;
  latenciaP99: number;
  periodo: string;
  comparacao: {
    enviados: number;
    sucesso: number;
    erros: number;
  };
}

const fetchKPIs = async (period?: string, companyId?: string): Promise<KPIData> => {
  const params = new URLSearchParams();
  if (period) params.append('period', period);
  if (companyId) params.append('companyId', companyId);
  
  const response = await axios.get(`/v1/dashboard/kpis?${params.toString()}`);
  return response.data;
};

const KPICard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: string;
  className?: string;
}> = ({ title, value, change, icon, className = '' }) => {
  const changeColor = change === undefined ? '' : change >= 0 ? 'text-green-600' : 'text-red-600';
  const changeIcon = change === undefined ? '' : change >= 0 ? '↗' : '↘';

  return (
    <div className={`bg-white overflow-hidden shadow rounded-lg ${className}`}>
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <span className="text-2xl">{icon}</span>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">{value}</div>
                {change !== undefined && (
                  <div className={`ml-2 flex items-baseline text-sm font-semibold ${changeColor}`}>
                    <span>{changeIcon}</span>
                    <span className="ml-1">{Math.abs(change)}%</span>
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KPIsPage: React.FC = () => {
  const [period, setPeriod] = useState('today');
  const [companyId, setCompanyId] = useState('');

  const { data: kpis, isLoading, error, refetch } = useQuery({
    queryKey: ['kpis', period, companyId],
    queryFn: () => fetchKPIs(period, companyId || undefined),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

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
        message="Failed to load KPIs. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!kpis) {
    return (
      <EmptyState
        title="No KPIs available"
        description="Unable to load KPI data at this time."
        action={{
          label: 'Refresh',
          onClick: () => refetch(),
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Key Performance Indicators
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor email delivery performance and system health
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="mr-2 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="hour">Last Hour</option>
            <option value="day">Last 24 Hours</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="today">Today</option>
          </select>
          <input
            type="text"
            placeholder="Company ID (optional)"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Emails Sent"
          value={kpis.totalEnviados.toLocaleString()}
          change={kpis.comparacao.enviados}
          icon="📧"
        />
        <KPICard
          title="Success Rate"
          value={`${kpis.taxaSucesso.toFixed(1)}%`}
          change={kpis.comparacao.sucesso}
          icon="✅"
        />
        <KPICard
          title="Total Errors"
          value={kpis.totalErros.toLocaleString()}
          change={kpis.comparacao.erros}
          icon="❌"
        />
        <KPICard
          title="DLQ Count"
          value={kpis.dlqCount.toLocaleString()}
          icon="⚠️"
        />
      </div>

      {/* Latency Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <KPICard
          title="Average Latency"
          value={`${kpis.latenciaMedia}ms`}
          icon="⏱️"
        />
        <KPICard
          title="P95 Latency"
          value={`${kpis.latenciaP95}ms`}
          icon="📊"
        />
        <KPICard
          title="P99 Latency"
          value={`${kpis.latenciaP99}ms`}
          icon="📈"
        />
      </div>

      {/* Period Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-blue-400">ℹ️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Period: {kpis.periodo}
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Data shown for the selected period. Comparison values show percentage change 
                from the previous period.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
