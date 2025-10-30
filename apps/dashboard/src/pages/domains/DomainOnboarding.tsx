import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Key,
  Globe,
  Shield,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'dns' | 'dkim' | 'spf' | 'dmarc' | 'verification' | 'approval';
  lastChecked?: string;
  errorMessage?: string;
  instructions?: string[];
  autoCheckable: boolean;
}

interface OnboardingStatus {
  status: string;
  progress: {
    percentage: number;
    completed: number;
    total: number;
  };
  checklist: ChecklistItem[];
  lastChecked?: string;
  nextCheck?: string;
}

interface DKIMResponse {
  status: 'success' | 'error';
  domainId: string;
  selector: string;
  dnsRecord: {
    type: string;
    name: string;
    value: string;
    ttl: number;
  };
  instructions: {
    title: string;
    description: string;
    steps: string[];
  };
}

const DomainOnboarding: React.FC = () => {
  const { domainId } = useParams<{ domainId: string }>();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dkimData, setDkimData] = useState<DKIMResponse | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (domainId) {
      loadOnboardingStatus();
    }
  }, [domainId]);

  const loadOnboardingStatus = async () => {
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/onboarding/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        throw new Error('Failed to load onboarding status');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load domain onboarding status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const startOnboarding = async () => {
    setActionLoading('start');
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/onboarding/start`, {
        method: 'POST',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Domain onboarding process started',
        });
        await loadOnboardingStatus();
      } else {
        throw new Error('Failed to start onboarding');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start domain onboarding',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const generateDKIM = async () => {
    setActionLoading('dkim');
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/onboarding/generate-dkim`, {
        method: 'POST',
      });

      if (response.ok) {
        const data: DKIMResponse = await response.json();
        setDkimData(data);
        toast({
          title: 'Success',
          description: 'DKIM keys generated successfully',
        });
        await loadOnboardingStatus();
      } else {
        throw new Error('Failed to generate DKIM keys');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate DKIM keys',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const verifyDNS = async () => {
    setActionLoading('verify');
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/onboarding/verify`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: data.success ? 'Success' : 'Warning',
          description: data.success
            ? 'All DNS records verified successfully'
            : 'Some DNS records failed verification',
          variant: data.success ? 'default' : 'destructive',
        });
        await loadOnboardingStatus();
      } else {
        throw new Error('Failed to verify DNS');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify DNS records',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'dkim':
        return <Key className="h-4 w-4" />;
      case 'dns':
        return <Globe className="h-4 w-4" />;
      case 'verification':
        return <Shield className="h-4 w-4" />;
      case 'approval':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <BarChart3 className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'border-red-500';
      case 'high':
        return 'border-orange-500';
      case 'medium':
        return 'border-yellow-500';
      default:
        return 'border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center">
        <p className="text-gray-500">Failed to load onboarding status</p>
        <Button onClick={loadOnboardingStatus} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Domain Onboarding</h1>
          <p className="text-gray-600">Configure your domain for email sending</p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className={getStatusColor(status.status)}>
            {status.status.replace('_', ' ').toUpperCase()}
          </Badge>
          <span className="text-sm text-gray-500">
            {status.progress.completed}/{status.progress.total} completed
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-gray-500">{status.progress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${status.progress.percentage}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* DKIM Generation Alert */}
      {dkimData && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>DKIM Keys Generated!</strong> Add this DNS record to enable email signing:
            <div className="mt-2 p-3 bg-gray-100 rounded font-mono text-sm">
              <div><strong>Type:</strong> {dkimData.dnsRecord.type}</div>
              <div><strong>Name:</strong> {dkimData.dnsRecord.name}</div>
              <div><strong>Value:</strong> {dkimData.dnsRecord.value}</div>
              <div><strong>TTL:</strong> {dkimData.dnsRecord.ttl}</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Checklist */}
      <div className="grid gap-4">
        {status.checklist.map((item) => (
          <Card key={item.id} className={`border-l-4 ${getPriorityColor(item.priority)}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(item.status)}
                  {getCategoryIcon(item.category)}
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className={getStatusColor(item.status)}>
                    {item.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline">
                    {item.priority}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">{item.description}</p>

              {/* Instructions */}
              {item.instructions && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Instructions:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                    {item.instructions.map((instruction, index) => (
                      <li key={index}>{instruction}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Error Message */}
              {item.errorMessage && (
                <Alert className="mb-4" variant="destructive">
                  <AlertDescription>{item.errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2">
                {item.id === 'dkim-generate' && item.status === 'pending' && (
                  <Button
                    onClick={generateDKIM}
                    disabled={actionLoading === 'dkim'}
                  >
                    {actionLoading === 'dkim' ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Generate DKIM
                  </Button>
                )}

                {item.id === 'verify-dns' && (
                  <Button
                    onClick={verifyDNS}
                    disabled={actionLoading === 'verify'}
                    variant="outline"
                  >
                    {actionLoading === 'verify' ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    Verify DNS
                  </Button>
                )}

                {item.lastChecked && (
                  <span className="text-xs text-gray-500 ml-auto">
                    Last checked: {new Date(item.lastChecked).toLocaleString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Start Onboarding Button (if not started) */}
      {status.status === 'DNS_PENDING' && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Ready to start onboarding?</h3>
              <p className="text-gray-600 mb-4">
                This will initialize the domain onboarding process and create a checklist of required steps.
              </p>
              <Button
                onClick={startOnboarding}
                disabled={actionLoading === 'start'}
                size="lg"
              >
                {actionLoading === 'start' ? (
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                ) : null}
                Start Domain Onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DomainOnboarding;
