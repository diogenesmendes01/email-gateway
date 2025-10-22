import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/LoadingSpinner';

interface ErrorBreakdown {
  totalErrors: number;
  errorsByCategory: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  errorsByCode: Array<{
    code: string;
    count: number;
    percentage: number;
  }>;
  period: string;
}

const fetchErrorBreakdown = async (period?: string, companyId?: string): Promise<ErrorBreakdown> => {
  const params = new URLSearchParams();
  if (period) params.append('period', period);
  if (companyId) params.append('companyId', companyId);
  
  const response = await axios.get(`/v1/dashboard/error-breakdown?${params.toString()}`);
  return response.data;
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'SES_ERROR':
      return 'bg-red-100 text-red-800';
    case 'VALIDATION_ERROR':
      return 'bg-yellow-100 text-yellow-800';
    case 'RATE_LIMIT_ERROR':
      return 'bg-orange-100 text-orange-800';
    case 'TIMEOUT_ERROR':
      return 'bg-purple-100 text-purple-800';
    case 'NETWORK_ERROR':
      return 'bg-blue-100 text-blue-800';
    case 'AUTH_ERROR':
      return 'bg-pink-100 text-pink-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const ErrorBreakdownPage: React.FC = () => {
  const [period, setPeriod] = useState('today');
  const [companyId, setCompanyId] = useState('');

  const { data: errorBreakdown, isLoading, error, refetch } = useQuery({
    queryKey: ['error-breakdown', period, companyId],
    queryFn: () => fetchErrorBreakdown(period, companyId || undefined),
    refetchInterval: 60000, // Refresh every minute
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
        message="Failed to load error breakdown. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!errorBreakdown) {
    return (
      <EmptyState
        title="No error data available"
        description="Unable to load error breakdown data at this time."
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
            Error Breakdown
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Analyze email delivery errors by category and code
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

      {/* Summary */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Error Summary
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-red-50 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">❌</span>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-red-500 truncate">Total Errors</dt>
                      <dd className="text-lg font-medium text-red-900">
                        {errorBreakdown.totalErrors.toLocaleString()}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">📊</span>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-blue-500 truncate">Error Categories</dt>
                      <dd className="text-lg font-medium text-blue-900">
                        {errorBreakdown.errorsByCategory.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">📅</span>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Period</dt>
                      <dd className="text-lg font-medium text-gray-900 capitalize">
                        {errorBreakdown.period}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Errors by Category */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Errors by Category
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Breakdown of errors by category type
          </p>
        </div>
        
        {errorBreakdown.errorsByCategory.length === 0 ? (
          <div className="px-4 py-5 sm:px-6">
            <EmptyState
              title="No errors found"
              description="No errors occurred in the selected period."
              className="py-8"
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {errorBreakdown.errorsByCategory.map((category) => (
              <li key={category.category} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(category.category)}`}>
                        {category.category.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {category.count.toLocaleString()} errors
                      </div>
                      <div className="text-sm text-gray-500">
                        {category.percentage.toFixed(1)}% of total errors
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${category.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Errors by Code */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Errors by Code
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Detailed breakdown of errors by specific error codes
          </p>
        </div>
        
        {errorBreakdown.errorsByCode.length === 0 ? (
          <div className="px-4 py-5 sm:px-6">
            <EmptyState
              title="No error codes found"
              description="No specific error codes recorded in the selected period."
              className="py-8"
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {errorBreakdown.errorsByCode.map((error) => (
              <li key={error.code} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-sm text-gray-500">🔍</span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900 font-mono">
                        {error.code}
                      </div>
                      <div className="text-sm text-gray-500">
                        {error.count.toLocaleString()} occurrences
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="text-sm text-gray-500 mr-4">
                      {error.percentage.toFixed(1)}%
                    </div>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-orange-600 h-2 rounded-full"
                        style={{ width: `${error.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Period Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-blue-400">ℹ️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Analysis Period: {errorBreakdown.period}
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Error breakdown data is refreshed every minute. Categories are automatically 
                grouped based on error code patterns for better analysis.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
