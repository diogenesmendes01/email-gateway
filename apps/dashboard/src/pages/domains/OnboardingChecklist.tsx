import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Copy,
  ExternalLink,
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

interface ChecklistResponse {
  domainId: string;
  checklist: ChecklistItem[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
  };
}

const OnboardingChecklist: React.FC = () => {
  const { domainId } = useParams<{ domainId: string }>();
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (domainId) {
      loadChecklist();
    }
  }, [domainId]);

  const loadChecklist = async () => {
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/onboarding/checklist`);
      if (response.ok) {
        const data = await response.json();
        setChecklist(data);
      } else {
        throw new Error('Failed to load checklist');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load onboarding checklist',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshChecklist = async () => {
    setRefreshing(true);
    await loadChecklist();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied!',
        description: 'Text copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
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
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-gray-100 text-gray-800',
    };

    return (
      <Badge className={colors[priority as keyof typeof colors] || colors.low}>
        {priority}
      </Badge>
    );
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      dns: 'bg-blue-50 text-blue-700 border-blue-200',
      dkim: 'bg-purple-50 text-purple-700 border-purple-200',
      spf: 'bg-green-50 text-green-700 border-green-200',
      verification: 'bg-orange-50 text-orange-700 border-orange-200',
      approval: 'bg-pink-50 text-pink-700 border-pink-200',
      dmarc: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };

    return colors[category as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="text-center">
        <p className="text-gray-500">Failed to load checklist</p>
        <Button onClick={loadChecklist} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const overallProgress = Math.round(
    (checklist.summary.completed / checklist.summary.total) * 100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Onboarding Checklist</h1>
          <p className="text-gray-600">Complete all steps to enable domain for sending</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={refreshChecklist}
            disabled={refreshing}
            variant="outline"
          >
            {refreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          <Link to={`/domains/${domainId}/onboarding`}>
            <Button>View Details</Button>
          </Link>
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progress Overview</span>
            <span className="text-2xl font-bold">{overallProgress}%</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overallProgress} className="mb-4" />
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {checklist.summary.completed}
              </div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {checklist.summary.pending}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {checklist.summary.failed}
              </div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {checklist.summary.total}
              </div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <div className="space-y-4">
        {checklist.checklist.map((item, index) => (
          <Card key={item.id} className={`border ${getStatusColor(item.status)}`}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="mt-1">{getStatusIcon(item.status)}</div>
                  <div>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <span>{item.title}</span>
                      <Badge className={getCategoryColor(item.category)}>
                        {item.category.toUpperCase()}
                      </Badge>
                      {getPriorityBadge(item.priority)}
                    </CardTitle>
                    <p className="text-gray-600 mt-1">{item.description}</p>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  {item.lastChecked && (
                    <div>Last checked: {new Date(item.lastChecked).toLocaleString()}</div>
                  )}
                  <div className="mt-1">Step {index + 1} of {checklist.summary.total}</div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* Instructions */}
              {item.instructions && item.instructions.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-gray-900">Instructions:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    {item.instructions.map((instruction, idx) => (
                      <li key={idx}>{instruction}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Error Message */}
              {item.errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-red-900">Error</h4>
                      <p className="text-red-700 text-sm">{item.errorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* DNS Records (for relevant items) */}
              {item.id.includes('dns') && item.status === 'completed' && (
                <div className="mt-4">
                  <Separator className="mb-3" />
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">
                      <strong>DNS Record Status:</strong> ✅ Configured and verified
                    </p>
                    {item.id === 'dns-dkim' && (
                      <p className="text-xs text-gray-500">
                        DKIM record provides email authentication and prevents spoofing
                      </p>
                    )}
                    {item.id === 'dns-spf' && (
                      <p className="text-xs text-gray-500">
                        SPF record authorizes CertShift servers to send emails on your behalf
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-checkable indicator */}
              {item.autoCheckable && (
                <div className="mt-3 flex items-center text-xs text-gray-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  This step can be automatically verified
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completion Message */}
      {overallProgress === 100 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-900 mb-2">
                Congratulations! 🎉
              </h3>
              <p className="text-green-700 mb-4">
                Your domain has completed all onboarding requirements and is ready for production use.
              </p>
              <div className="flex justify-center space-x-4">
                <Button asChild>
                  <Link to={`/domains/${domainId}`}>
                    View Domain Details
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/domains">
                    Manage Domains
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {overallProgress < 100 && checklist.summary.failed === 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Keep Going! 🚀
              </h3>
              <p className="text-blue-700">
                Complete the remaining steps to enable your domain for email sending.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues Detected */}
      {checklist.summary.failed > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                Issues Detected
              </h3>
              <p className="text-red-700 mb-4">
                {checklist.summary.failed} step{checklist.summary.failed > 1 ? 's' : ''} failed verification.
                Please review the errors above and fix the configuration issues.
              </p>
              <Button onClick={refreshChecklist} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-check Status
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OnboardingChecklist;
