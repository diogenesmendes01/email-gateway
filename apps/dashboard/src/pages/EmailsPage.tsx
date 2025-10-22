import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/LoadingSpinner';

interface Email {
  id: string;
  externalId?: string;
  to: string;
  subject: string;
  status: string;
  createdAt: string;
  sentAt?: string;
  failedAt?: string;
  errorCode?: string;
  errorReason?: string;
  attempts: number;
  durationMs?: number;
  companyId: string;
  recipient?: {
    id: string;
    externalId?: string;
    cpfCnpjHash?: string;
    razaoSocial?: string;
    nome?: string;
    email: string;
  };
}

interface EmailsResponse {
  emails: Email[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const fetchEmails = async (filters: any): Promise<EmailsResponse> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, value.toString());
    }
  });
  
  const response = await axios.get(`/v1/dashboard/emails?${params.toString()}`);
  return response.data;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'SENT':
      return 'bg-green-100 text-green-800';
    case 'FAILED':
      return 'bg-red-100 text-red-800';
    case 'PENDING':
    case 'ENQUEUED':
      return 'bg-yellow-100 text-yellow-800';
    case 'RETRYING':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const EmailsPage: React.FC = () => {
  const [filters, setFilters] = useState({
    externalId: '',
    emailHash: '',
    cpfCnpjHash: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    companyId: '',
    page: 1,
    limit: 50,
  });

  const { data: emailsData, isLoading, error, refetch } = useQuery({
    queryKey: ['emails', filters],
    queryFn: () => fetchEmails(filters),
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
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
        message="Failed to load emails. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!emailsData) {
    return (
      <EmptyState
        title="No emails found"
        description="Unable to load email data at this time."
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
            Email Logs
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            View and filter email delivery logs
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">External ID</label>
            <input
              type="text"
              value={filters.externalId}
              onChange={(e) => handleFilterChange('externalId', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="External ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Hash</label>
            <input
              type="text"
              value={filters.emailHash}
              onChange={(e) => handleFilterChange('emailHash', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Email hash"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">CPF/CNPJ Hash</label>
            <input
              type="text"
              value={filters.cpfCnpjHash}
              onChange={(e) => handleFilterChange('cpfCnpjHash', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="CPF/CNPJ hash"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="ENQUEUED">Enqueued</option>
              <option value="RETRYING">Retrying</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company ID</label>
            <input
              type="text"
              value={filters.companyId}
              onChange={(e) => handleFilterChange('companyId', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Company ID"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Email Logs ({emailsData.total.toLocaleString()} total)
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Showing {emailsData.emails.length} of {emailsData.total} emails
          </p>
        </div>
        
        {emailsData.emails.length === 0 ? (
          <EmptyState
            title="No emails found"
            description="Try adjusting your filters to see more results."
            className="py-12"
          />
        ) : (
          <ul className="divide-y divide-gray-200">
            {emailsData.emails.map((email) => (
              <li key={email.id}>
                <Link
                  to={`/dashboard/emails/${email.id}`}
                  className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-sm text-gray-500">📧</span>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-blue-600 truncate">
                            {email.subject}
                          </p>
                          <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(email.status)}`}>
                            {email.status}
                          </span>
                        </div>
                        <div className="mt-1">
                          <p className="text-sm text-gray-500">
                            To: {email.to}
                          </p>
                          {email.recipient && (
                            <p className="text-sm text-gray-500">
                              Recipient: {email.recipient.nome || email.recipient.razaoSocial || 'N/A'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <div className="text-right">
                        <p>{new Date(email.createdAt).toLocaleString()}</p>
                        {email.durationMs && (
                          <p className="text-xs">{email.durationMs}ms</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {emailsData.total > filters.limit && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(filters.page - 1)}
                disabled={filters.page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(filters.page + 1)}
                disabled={!emailsData.hasMore}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">{(filters.page - 1) * filters.limit + 1}</span>
                  {' '}to{' '}
                  <span className="font-medium">
                    {Math.min(filters.page * filters.limit, emailsData.total)}
                  </span>
                  {' '}of{' '}
                  <span className="font-medium">{emailsData.total}</span>
                  {' '}results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handlePageChange(filters.page - 1)}
                    disabled={filters.page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(filters.page + 1)}
                    disabled={!emailsData.hasMore}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
