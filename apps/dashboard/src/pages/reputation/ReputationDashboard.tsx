import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  RefreshCw,
  Calendar,
  Mail,
  Users,
  Target,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReputationMetrics {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  bouncedHard: number;
  bouncedSoft: number;
  complained: number;
  opened: number;
  clicked: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  reputationScore: number;
}

interface ReputationData {
  companyId?: string;
  domainId?: string;
  current: ReputationMetrics;
  history: ReputationMetrics[];
  alerts: ReputationAlert[];
  status: 'good' | 'warning' | 'critical';
}

interface ReputationAlert {
  id: string;
  type: 'high_bounce_rate' | 'high_complaint_rate' | 'low_reputation' | 'volume_drop';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  resolved: boolean;
}

const ReputationDashboard: React.FC = () => {
  const [data, setData] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const { toast } = useToast();

  useEffect(() => {
    loadReputationData();
  }, [timeRange]);

  const loadReputationData = async () => {
    try {
      const response = await fetch(`/api/v1/reputation?range=${timeRange}`);
      if (response.ok) {
        const reputationData = await response.json();
        setData(reputationData);
      } else {
        throw new Error('Failed to load reputation data');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load reputation metrics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadReputationData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <BarChart3 className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatRate = (rate: number, decimals: number = 2) => {
    return `${(rate * 100).toFixed(decimals)}%`;
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (current < previous) {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center">
        <p className="text-gray-500">Failed to load reputation data</p>
        <Button onClick={loadReputationData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const activeAlerts = data.alerts.filter(alert => !alert.resolved);
  const previousMetrics = data.history[data.history.length - 2];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Reputation Dashboard</h1>
          <p className="text-gray-600">Monitor your email sending reputation and performance</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <Button
            onClick={refreshData}
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
        </div>
      </div>

      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            {getStatusIcon(data.status)}
            <span>Overall Status</span>
            <Badge className={getStatusColor(data.status)}>
              {data.status.toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {data.current.reputationScore.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600">Reputation Score</div>
              <div className="mt-2">
                {previousMetrics && getTrendIcon(
                  data.current.reputationScore,
                  previousMetrics.reputationScore
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {formatRate(data.current.delivered / Math.max(data.current.sent, 1))}
              </div>
              <div className="text-sm text-gray-600">Delivery Rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {data.current.sent.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Emails Sent</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-900">
              <AlertTriangle className="h-5 w-5" />
              <span>Active Alerts</span>
              <Badge variant="destructive">{activeAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className={`h-5 w-5 ${
                      alert.severity === 'critical' ? 'text-red-500' :
                      alert.severity === 'high' ? 'text-orange-500' :
                      'text-yellow-500'
                    }`} />
                    <div>
                      <div className="font-medium">{alert.message}</div>
                      <div className="text-sm text-gray-600">
                        Value: {formatRate(alert.value)} | Threshold: {formatRate(alert.threshold)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Bounce Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Bounce Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatRate(data.current.bounceRate)}
                </div>
                <div className="text-xs text-gray-500">
                  Hard: {data.current.bouncedHard} | Soft: {data.current.bouncedSoft}
                </div>
              </div>
              {previousMetrics && getTrendIcon(data.current.bounceRate, previousMetrics.bounceRate)}
            </div>
            <Progress
              value={Math.min(data.current.bounceRate * 1000, 100)}
              className="mt-3"
            />
            <div className="text-xs text-gray-500 mt-1">
              Target: < 2%
            </div>
          </CardContent>
        </Card>

        {/* Complaint Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Complaint Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatRate(data.current.complaintRate)}
                </div>
                <div className="text-xs text-gray-500">
                  {data.current.complained} complaints
                </div>
              </div>
              {previousMetrics && getTrendIcon(data.current.complaintRate, previousMetrics.complaintRate)}
            </div>
            <Progress
              value={Math.min(data.current.complaintRate * 10000, 100)}
              className="mt-3"
            />
            <div className="text-xs text-gray-500 mt-1">
              Target: < 0.1%
            </div>
          </CardContent>
        </Card>

        {/* Open Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Open Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatRate(data.current.openRate)}
                </div>
                <div className="text-xs text-gray-500">
                  {data.current.opened} opens
                </div>
              </div>
              {previousMetrics && getTrendIcon(data.current.openRate, previousMetrics.openRate)}
            </div>
            <Progress value={data.current.openRate * 100} className="mt-3" />
          </CardContent>
        </Card>

        {/* Click Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Click Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatRate(data.current.clickRate)}
                </div>
                <div className="text-xs text-gray-500">
                  {data.current.clicked} clicks
                </div>
              </div>
              {previousMetrics && getTrendIcon(data.current.clickRate, previousMetrics.clickRate)}
            </div>
            <Progress value={data.current.clickRate * 100} className="mt-3" />
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="delivers">Deliverability</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Send Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Sent</span>
                    <span className="font-medium">{data.current.sent.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivered</span>
                    <span className="font-medium text-green-600">
                      {data.current.delivered.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bounced</span>
                    <span className="font-medium text-red-600">
                      {data.current.bounced.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Complaints</span>
                    <span className="font-medium text-orange-600">
                      {data.current.complained.toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Opens</span>
                    <span className="font-medium">{data.current.opened.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clicks</span>
                    <span className="font-medium">{data.current.clicked.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Open Rate</span>
                    <span className="font-medium">{formatRate(data.current.openRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Click Rate</span>
                    <span className="font-medium">{formatRate(data.current.clickRate)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="delivers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Deliverability Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Delivery Rate</span>
                    <span>{formatRate(data.current.delivered / Math.max(data.current.sent, 1))}</span>
                  </div>
                  <Progress value={(data.current.delivered / Math.max(data.current.sent, 1)) * 100} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded">
                    <div className="text-2xl font-bold text-green-600">
                      {formatRate(data.current.delivered / Math.max(data.current.sent, 1))}
                    </div>
                    <div className="text-sm text-gray-600">Delivered</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded">
                    <div className="text-2xl font-bold text-red-600">
                      {formatRate(data.current.bounced / Math.max(data.current.sent, 1))}
                    </div>
                    <div className="text-sm text-gray-600">Bounced</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Bounce Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Hard Bounces: {data.current.bouncedHard}</div>
                    <div>Soft Bounces: {data.current.bouncedSoft}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Engagement Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Open Rate</span>
                      <span>{formatRate(data.current.openRate)}</span>
                    </div>
                    <Progress value={data.current.openRate * 100} />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Click Rate</span>
                      <span>{formatRate(data.current.clickRate)}</span>
                    </div>
                    <Progress value={data.current.clickRate * 100} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded">
                    <Mail className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{data.current.sent.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Sent</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded">
                    <Users className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{data.current.opened.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Opens</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded">
                    <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{data.current.clicked.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Clicks</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Metrics History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.history.slice(-10).reverse().map((metric, index) => (
                  <div key={metric.date} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center space-x-4">
                      <div className="font-medium">
                        {new Date(metric.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        Sent: {metric.sent.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm">
                      <div>Delivery: {formatRate(metric.delivered / Math.max(metric.sent, 1))}</div>
                      <div>Bounce: {formatRate(metric.bounceRate)}</div>
                      <div>Open: {formatRate(metric.openRate)}</div>
                      <div>Score: {metric.reputationScore.toFixed(1)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReputationDashboard;
