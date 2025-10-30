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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  AlertTriangle,
  Globe,
  Key,
  Shield,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DNSRecord {
  id: string;
  recordType: 'TXT' | 'CNAME' | 'MX' | 'A' | 'AAAA';
  name: string;
  value: string;
  priority?: number;
  isVerified: boolean;
  lastChecked?: string;
  createdAt: string;
  updatedAt: string;
}

interface DNSRecordsData {
  domainId: string;
  domain: string;
  records: DNSRecord[];
  summary: {
    total: number;
    verified: number;
    pending: number;
    failed: number;
  };
}

const DNSRecordsManager: React.FC = () => {
  const { domainId } = useParams<{ domainId: string }>();
  const [data, setData] = useState<DNSRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRecord, setNewRecord] = useState({
    recordType: 'TXT' as DNSRecord['recordType'],
    name: '',
    value: '',
    priority: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    if (domainId) {
      loadDNSRecords();
    }
  }, [domainId]);

  const loadDNSRecords = async () => {
    try {
      const response = await fetch(`/api/v1/domains/${domainId}/dns-records`);
      if (response.ok) {
        const recordsData = await response.json();
        setData(recordsData);
      } else {
        throw new Error('Failed to load DNS records');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load DNS records',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    setVerifying(recordId);
    try {
      // This would call a verification endpoint
      const response = await fetch(`/api/v1/domains/${domainId}/dns-records/${recordId}/verify`, {
        method: 'POST',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'DNS record verification completed',
        });
        await loadDNSRecords();
      } else {
        throw new Error('Failed to verify DNS record');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify DNS record',
        variant: 'destructive',
      });
    } finally {
      setVerifying(null);
    }
  };

  const addRecord = async () => {
    try {
      const recordData = {
        recordType: newRecord.recordType,
        name: newRecord.name,
        value: newRecord.value,
        ...(newRecord.priority && { priority: parseInt(newRecord.priority) }),
      };

      const response = await fetch(`/api/v1/domains/${domainId}/dns-records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordData),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'DNS record added successfully',
        });
        setShowAddForm(false);
        setNewRecord({
          recordType: 'TXT',
          name: '',
          value: '',
          priority: '',
        });
        await loadDNSRecords();
      } else {
        throw new Error('Failed to add DNS record');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add DNS record',
        variant: 'destructive',
      });
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this DNS record?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/domains/${domainId}/dns-records/${recordId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'DNS record deleted successfully',
        });
        await loadDNSRecords();
      } else {
        throw new Error('Failed to delete DNS record');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete DNS record',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied!',
        description: 'Value copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (isVerified: boolean, lastChecked?: string) => {
    if (isVerified) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }

    if (lastChecked) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }

    return <Clock className="h-5 w-5 text-gray-400" />;
  };

  const getStatusBadge = (isVerified: boolean, lastChecked?: string) => {
    if (isVerified) {
      return <Badge className="bg-green-100 text-green-800">Verified</Badge>;
    }

    if (lastChecked) {
      return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
    }

    return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>;
  };

  const getRecordTypeIcon = (type: string) => {
    switch (type) {
      case 'TXT':
        return <Key className="h-4 w-4" />;
      case 'CNAME':
        return <Globe className="h-4 w-4" />;
      case 'MX':
        return <Mail className="h-4 w-4" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
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
        <p className="text-gray-500">Failed to load DNS records</p>
        <Button onClick={loadDNSRecords} className="mt-4">
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
          <h1 className="text-3xl font-bold">DNS Records Manager</h1>
          <p className="text-gray-600">Manage DNS records for {data.domain}</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Record
          </Button>
          <Button onClick={loadDNSRecords} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Globe className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl font-bold">{data.summary.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Verified</p>
                <p className="text-2xl font-bold text-green-600">{data.summary.verified}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{data.summary.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{data.summary.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Record Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add DNS Record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="recordType">Record Type</Label>
                <Select
                  value={newRecord.recordType}
                  onValueChange={(value: DNSRecord['recordType']) =>
                    setNewRecord({ ...newRecord, recordType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TXT">TXT</SelectItem>
                    <SelectItem value="CNAME">CNAME</SelectItem>
                    <SelectItem value="MX">MX</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="AAAA">AAAA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newRecord.name}
                  onChange={(e) => setNewRecord({ ...newRecord, name: e.target.value })}
                  placeholder="subdomain.example.com"
                />
              </div>

              <div className={newRecord.recordType === 'MX' ? 'md:col-span-1' : 'md:col-span-2'}>
                <Label htmlFor="value">Value</Label>
                <Input
                  id="value"
                  value={newRecord.value}
                  onChange={(e) => setNewRecord({ ...newRecord, value: e.target.value })}
                  placeholder="Record value"
                />
              </div>

              {newRecord.recordType === 'MX' && (
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={newRecord.priority}
                    onChange={(e) => setNewRecord({ ...newRecord, priority: e.target.value })}
                    placeholder="10"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button onClick={addRecord} disabled={!newRecord.name || !newRecord.value}>
                Add Record
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DNS Records List */}
      <Card>
        <CardHeader>
          <CardTitle>DNS Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.records.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No DNS records</h3>
                <p className="text-gray-600 mb-4">
                  Add your first DNS record to get started with domain configuration.
                </p>
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Record
                </Button>
              </div>
            ) : (
              data.records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(record.isVerified, record.lastChecked)}
                    {getRecordTypeIcon(record.recordType)}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{record.name}</span>
                        <Badge variant="outline">{record.recordType}</Badge>
                        {getStatusBadge(record.isVerified, record.lastChecked)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {record.value}
                        {record.priority && ` (Priority: ${record.priority})`}
                      </div>
                      {record.lastChecked && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last checked: {new Date(record.lastChecked).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(record.value)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyRecord(record.id)}
                      disabled={verifying === record.id}
                    >
                      {verifying === record.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRecord(record.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>DNS Configuration Help</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Common Record Types</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>TXT:</strong> Used for DKIM, SPF, and domain verification
                </div>
                <div>
                  <strong>CNAME:</strong> Alias for another domain (used for tracking domains)
                </div>
                <div>
                  <strong>MX:</strong> Mail exchange servers (not typically managed here)
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Important Notes</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div>• DNS changes can take up to 24 hours to propagate</div>
                <div>• Always verify records after making changes</div>
                <div>• Some DNS providers have specific formatting requirements</div>
                <div>• Contact support if you need help with DNS configuration</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DNSRecordsManager;
