import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/LoadingSpinner';

interface EmailDetail {
  id: string;
  outboxId: string;
  externalId?: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: any;
  tags: string[];
  status: string;
  sesMessageId?: string;
  errorCode?: string;
  errorReason?: string;
  attempts: number;
  durationMs?: number;
  requestId?: string;
  createdAt: string;
  sentAt?: string;
  failedAt?: string;
  companyId: string;
  recipient?: {
    id: string;
    externalId?: string;
    cpfCnpjHash?: string;
    razaoSocial?: string;
    nome?: string;
    email: string;
  };
  events: Array<{
    id: string;
    type: string;
    metadata?: any;
    createdAt: string;
  }>;
}

const fetchEmailDetail = async (id: string): Promise<EmailDetail> => {
  const response = await axios.get(`/v1/dashboard/emails/${id}`);
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

export const EmailDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data: email, isLoading, error, refetch } = useQuery({
    queryKey: ['email', id],
    queryFn: () => fetchEmailDetail(id!),
    enabled: !!id,
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
        message="Failed to load email details. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!email) {
    return (
      <EmptyState
        title="Email not found"
        description="The requested email could not be found."
        action={{
          label: 'Go Back',
          onClick: () => window.history.back(),
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
            Email Details
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Email ID: {email.id}
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Email Info */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Email Information</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Detailed information about this email
          </p>
        </div>
        <div className="border-t border-gray-200">
          <dl>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Subject</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {email.subject}
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">To</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {email.to}
              </dd>
            </div>
            {email.cc.length > 0 && (
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">CC</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {email.cc.join(', ')}
                </dd>
              </div>
            )}
            {email.bcc.length > 0 && (
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">BCC</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {email.bcc.join(', ')}
                </dd>
              </div>
            )}
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(email.status)}`}>
                  {email.status}
                </span>
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Created At</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {new Date(email.createdAt).toLocaleString()}
              </dd>
            </div>
            {email.sentAt && (
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Sent At</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {new Date(email.sentAt).toLocaleString()}
                </dd>
              </div>
            )}
            {email.failedAt && (
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Failed At</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {new Date(email.failedAt).toLocaleString()}
                </dd>
              </div>
            )}
            {email.durationMs && (
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Duration</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {email.durationMs}ms
                </dd>
              </div>
            )}
            {email.attempts > 0 && (
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Attempts</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {email.attempts}
                </dd>
              </div>
            )}
            {email.errorCode && (
              <div className="bg-red-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-red-500">Error Code</dt>
                <dd className="mt-1 text-sm text-red-900 sm:mt-0 sm:col-span-2">
                  {email.errorCode}
                </dd>
              </div>
            )}
            {email.errorReason && (
              <div className="bg-red-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-red-500">Error Reason</dt>
                <dd className="mt-1 text-sm text-red-900 sm:mt-0 sm:col-span-2">
                  {email.errorReason}
                </dd>
              </div>
            )}
            {email.sesMessageId && (
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">SES Message ID</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">
                  {email.sesMessageId}
                </dd>
              </div>
            )}
            {email.requestId && (
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Request ID</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">
                  {email.requestId}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Recipient Info */}
      {email.recipient && (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Recipient Information</h3>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {email.recipient.email}
                </dd>
              </div>
              {email.recipient.nome && (
                <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {email.recipient.nome}
                  </dd>
                </div>
              )}
              {email.recipient.razaoSocial && (
                <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">Company Name</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {email.recipient.razaoSocial}
                  </dd>
                </div>
              )}
              {email.recipient.externalId && (
                <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">External ID</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {email.recipient.externalId}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* Events Timeline */}
      {email.events.length > 0 && (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Event Timeline</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Chronological events for this email
            </p>
          </div>
          <div className="border-t border-gray-200">
            <ul className="divide-y divide-gray-200">
              {email.events.map((event, index) => (
                <li key={event.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-sm text-gray-500">#{index + 1}</span>
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{event.type}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {event.metadata && (
                        <div className="mt-1">
                          <pre className="text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
