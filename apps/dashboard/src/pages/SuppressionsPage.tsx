import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Plus,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SuppressionEntry {
  id: string;
  email: string;
  domain: string;
  reason: string;
  source: string;
  suppressedAt: string;
  expiresAt?: string;
}

interface SuppressionsData {
  suppressions: SuppressionEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

const SuppressionsPage: React.FC = () => {
  const [data, setData] = useState<SuppressionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('MANUAL');
  const [checkingEmail, setCheckingEmail] = useState('');
  const [checkResult, setCheckResult] = useState<{ suppressed: boolean; reason?: string } | null>(null);
  const { toast } = useToast();

  const itemsPerPage = 50;

  useEffect(() => {
    loadSuppressions();
  }, [currentPage, reasonFilter]);

  const loadSuppressions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        ...(reasonFilter !== 'all' && { reason: reasonFilter }),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`/api/v1/suppressions?${params}`);
      if (response.ok) {
        const suppressionsData = await response.json();
        setData(suppressionsData);
      } else {
        throw new Error('Failed to load suppressions');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load suppression list',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addSuppression = async () => {
    if (!newEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/v1/suppressions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          reason: newReason,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${newEmail} added to suppression list`,
        });
        setNewEmail('');
        setShowAddForm(false);
        await loadSuppressions();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add suppression');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add email to suppression list',
        variant: 'destructive',
      });
    }
  };

  const removeSuppression = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from the suppression list?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/suppressions/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${email} removed from suppression list`,
        });
        await loadSuppressions();
      } else {
        throw new Error('Failed to remove suppression');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove email from suppression list',
        variant: 'destructive',
      });
    }
  };

  const checkEmailSuppression = async () => {
    if (!checkingEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an email address to check',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/v1/suppressions/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: checkingEmail.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setCheckResult(result);
      } else {
        throw new Error('Failed to check email suppression');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check email suppression status',
        variant: 'destructive',
      });
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadSuppressions();
  };

  const getReasonBadgeColor = (reason: string) => {
    const colors: Record<string, string> = {
      HARD_BOUNCE: 'bg-red-100 text-red-800',
      SOFT_BOUNCE: 'bg-orange-100 text-orange-800',
      SPAM_COMPLAINT: 'bg-purple-100 text-purple-800',
      UNSUBSCRIBE: 'bg-blue-100 text-blue-800',
      ROLE_ACCOUNT: 'bg-gray-100 text-gray-800',
      BAD_DOMAIN: 'bg-yellow-100 text-yellow-800',
      MANUAL: 'bg-green-100 text-green-800',
    };

    return colors[reason] || 'bg-gray-100 text-gray-800';
  };

  const getReasonDisplayName = (reason: string) => {
    const names: Record<string, string> = {
      HARD_BOUNCE: 'Hard Bounce',
      SOFT_BOUNCE: 'Soft Bounce',
      SPAM_COMPLAINT: 'Spam Complaint',
      UNSUBSCRIBE: 'Unsubscribe',
      ROLE_ACCOUNT: 'Role Account',
      BAD_DOMAIN: 'Bad Domain',
      MANUAL: 'Manual',
    };

    return names[reason] || reason;
  };

  const exportSuppressions = () => {
    if (!data?.suppressions.length) {
      toast({
        title: 'No data',
        description: 'No suppressions to export',
        variant: 'destructive',
      });
      return;
    }

    const csvContent = [
      'Email,Domain,Reason,Source,Suppressed At,Expires At',
      ...data.suppressions.map(s =>
        `"${s.email}","${s.domain}","${s.reason}","${s.source}","${s.suppressedAt}","${s.expiresAt || ''}"`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppressions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Success',
      description: 'Suppressions exported to CSV',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Suppressions</h1>
          <p className="text-gray-600">Manage emails that should not receive marketing messages</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Email
          </Button>
          <Button onClick={exportSuppressions} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={loadSuppressions} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.pagination.total}</div>
              <p className="text-sm text-gray-600">Total Suppressed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {data.suppressions.filter(s => s.reason === 'HARD_BOUNCE').length}
              </div>
              <p className="text-sm text-gray-600">Hard Bounces</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">
                {data.suppressions.filter(s => s.reason === 'SPAM_COMPLAINT').length}
              </div>
              <p className="text-sm text-gray-600">Spam Complaints</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {data.suppressions.filter(s => s.reason === 'UNSUBSCRIBE').length}
              </div>
              <p className="text-sm text-gray-600">Unsubscribes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Email Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add Email to Suppression List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <Input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  type="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <Select value={newReason} onValueChange={setNewReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                    <SelectItem value="HARD_BOUNCE">Hard Bounce</SelectItem>
                    <SelectItem value="SOFT_BOUNCE">Soft Bounce</SelectItem>
                    <SelectItem value="SPAM_COMPLAINT">Spam Complaint</SelectItem>
                    <SelectItem value="UNSUBSCRIBE">Unsubscribe</SelectItem>
                    <SelectItem value="BAD_DOMAIN">Bad Domain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button onClick={addSuppression} disabled={!newEmail.trim()}>
                Add to Suppression List
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Check Tool */}
      <Card>
        <CardHeader>
          <CardTitle>Check Email Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <Input
              value={checkingEmail}
              onChange={(e) => setCheckingEmail(e.target.value)}
              placeholder="Enter email to check..."
              className="flex-1"
            />
            <Button onClick={checkEmailSuppression} disabled={!checkingEmail.trim()}>
              Check
            </Button>
          </div>

          {checkResult && (
            <div className="mt-4 p-4 border rounded-lg">
              <div className="flex items-center space-x-2">
                {checkResult.suppressed ? (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="font-medium text-red-700">
                      Email is suppressed
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-700">
                      Email is not suppressed
                    </span>
                  </>
                )}
              </div>
              {checkResult.reason && (
                <div className="mt-2 text-sm text-gray-600">
                  Reason: {getReasonDisplayName(checkResult.reason)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by email or domain..."
                  className="pl-10"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>

            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                <SelectItem value="HARD_BOUNCE">Hard Bounce</SelectItem>
                <SelectItem value="SOFT_BOUNCE">Soft Bounce</SelectItem>
                <SelectItem value="SPAM_COMPLAINT">Spam Complaint</SelectItem>
                <SelectItem value="UNSUBSCRIBE">Unsubscribe</SelectItem>
                <SelectItem value="ROLE_ACCOUNT">Role Account</SelectItem>
                <SelectItem value="BAD_DOMAIN">Bad Domain</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleSearch}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suppressions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Suppressed Emails</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : data?.suppressions.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No suppressed emails</h3>
              <p className="text-gray-600">
                Emails that bounce or complain will be automatically added here.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Suppressed At</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.suppressions.map((suppression) => (
                    <TableRow key={suppression.id}>
                      <TableCell className="font-medium">
                        {suppression.email}
                      </TableCell>
                      <TableCell>{suppression.domain}</TableCell>
                      <TableCell>
                        <Badge className={getReasonBadgeColor(suppression.reason)}>
                          {getReasonDisplayName(suppression.reason)}
                        </Badge>
                      </TableCell>
                      <TableCell>{suppression.source}</TableCell>
                      <TableCell>
                        {new Date(suppression.suppressedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {suppression.expiresAt
                          ? new Date(suppression.expiresAt).toLocaleDateString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeSuppression(suppression.id, suppression.email)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                    {Math.min(currentPage * itemsPerPage, data.pagination.total)} of{' '}
                    {data.pagination.total} entries
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>

                    <span className="text-sm">
                      Page {currentPage} of {data.pagination.totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === data.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuppressionsPage;
