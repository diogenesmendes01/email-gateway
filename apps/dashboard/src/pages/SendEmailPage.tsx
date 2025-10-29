import React, { useState } from 'react';
import axios from 'axios';

export const SendEmailPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'individual' | 'batch'>('individual');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Individual form
  const [formData, setFormData] = useState({
    cpfCnpj: '',
    razaoSocial: '',
    nome: '',
    email: '',
    subject: '',
    html: '',
  });

  // Batch form
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [batchSubject, setBatchSubject] = useState('');
  const [batchHtml, setBatchHtml] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleIndividualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await axios.post('/v1/email/send', {
        recipient: {
          cpfCnpj: formData.cpfCnpj,
          razaoSocial: formData.razaoSocial,
          nome: formData.nome,
          email: formData.email,
        },
        subject: formData.subject,
        html: formData.html,
      });

      setSuccess('Email enviado com sucesso!');
      setFormData({ cpfCnpj: '', razaoSocial: '', nome: '', email: '', subject: '', html: '' });
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao enviar email');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const text = await file.text();
    const allLines = text.split('\n').filter(l => l.trim());

    // Validação: máximo 1000 linhas (excluindo header)
    if (allLines.length > 1001) {
      setError('CSV excede o limite de 1000 destinatários');
      setCsvFile(null);
      setPreview([]);
      setTotalLines(0);
      return;
    }

    // Validação: formato do header
    const headers = allLines[0].split(',').map(h => h.trim());
    const requiredHeaders = ['email'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      setError(`CSV inválido: faltam colunas obrigatórias: ${missingHeaders.join(', ')}`);
      setCsvFile(null);
      setPreview([]);
      setTotalLines(0);
      return;
    }

    setCsvFile(file);
    setTotalLines(allLines.length - 1); // Excluindo header

    // Preview dos primeiros 5
    const previewLines = allLines.slice(0, 6); // Header + 5 linhas
    const rows = previewLines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((obj: any, header, i) => {
        obj[header] = values[i]?.trim();
        return obj;
      }, {});
    });

    setPreview(rows);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      setError('Selecione um arquivo CSV');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('subject', batchSubject);
      formData.append('html', batchHtml);

      const res = await axios.post('/v1/email/batch/csv', formData);
      setBatchId(res.data.batchId);
      setSuccess(`Batch criado com sucesso! ${res.data.totalEmails} emails enfileirados`);
      setCsvFile(null);
      setBatchSubject('');
      setBatchHtml('');
      setPreview([]);
      setTotalLines(0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao criar batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Enviar Email</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('individual')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'individual'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Envio Individual
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'batch'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Envio em Massa
          </button>
        </nav>
      </div>

      {success && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 border border-green-200">
          <p className="text-green-800 font-medium">{success}</p>
          {batchId && (
            <div className="mt-3">
              <p className="text-sm text-green-700">
                Batch ID: <code className="bg-green-100 px-2 py-1 rounded">{batchId}</code>
              </p>
              <p className="text-sm text-green-600 mt-2">
                Acompanhe o status dos emails em{' '}
                <a href="/dashboard/emails" className="underline font-medium hover:text-green-800">
                  Lista de Emails
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {activeTab === 'individual' && (
        <form onSubmit={handleIndividualSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CPF/CNPJ</label>
              <input
                type="text"
                name="cpfCnpj"
                value={formData.cpfCnpj}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
            <input
              type="text"
              name="razaoSocial"
              value={formData.razaoSocial}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assunto *</label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">HTML *</label>
            <textarea
              name="html"
              value={formData.html}
              onChange={handleChange}
              required
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar Email'}
          </button>
        </form>
      )}

      {activeTab === 'batch' && (
        <form onSubmit={handleBatchSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV *</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-2 text-sm text-gray-500">
              Formato: email,nome,cpfCnpj,razaoSocial (máx 1000 linhas)
            </p>
            {totalLines > 0 && (
              <p className="mt-2 text-sm font-semibold text-blue-600">
                ✓ {totalLines} destinatários carregados
              </p>
            )}
          </div>

          {preview.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Preview (primeiros {preview.length} de {totalLines}):
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Nome</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">CPF/CNPJ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{row.email}</td>
                        <td className="px-3 py-2">{row.nome}</td>
                        <td className="px-3 py-2">{row.cpfCnpj}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assunto (para todos) *</label>
            <input
              type="text"
              value={batchSubject}
              onChange={(e) => setBatchSubject(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">HTML (para todos) *</label>
            <textarea
              value={batchHtml}
              onChange={(e) => setBatchHtml(e.target.value)}
              required
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar Batch'}
          </button>
        </form>
      )}
    </div>
  );
};
