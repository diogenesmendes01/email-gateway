import React, { useState } from 'react';
import axios from 'axios';

export const SendEmailPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    cpfCnpj: '',
    razaoSocial: '',
    nome: '',
    email: '',
    subject: '',
    html: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await axios.post('/v1/email/send', {
        recipient: {
          cpfCnpj: formData.cpfCnpj,
          razaoSocial: formData.razaoSocial,
          nome: formData.nome,
          email: formData.email,
        },
        subject: formData.subject,
        html: formData.html,
      });

      setSuccess(true);
      setFormData({
        cpfCnpj: '',
        razaoSocial: '',
        nome: '',
        email: '',
        subject: '',
        html: '',
      });

      console.log('Email enviado:', response.data);

      // Auto-hide success message
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao enviar email. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Enviar Email</h1>
        <p className="mt-2 text-sm text-gray-600">
          Preencha o formulário abaixo para enviar um email
        </p>
      </div>

      {/* Success Alert */}
      {success && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 border border-green-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-2xl">✓</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Email enviado com sucesso!</h3>
              <p className="mt-1 text-sm text-green-700">
                O email foi enfileirado e será processado em breve. Você pode acompanhar o status na página de Emails.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Erro ao enviar email</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-6 space-y-6">
          {/* Destinatário Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Destinatário</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="cpfCnpj" className="block text-sm font-medium text-gray-700 mb-2">
                  CPF/CNPJ *
                </label>
                <input
                  type="text"
                  id="cpfCnpj"
                  name="cpfCnpj"
                  required
                  value={formData.cpfCnpj}
                  onChange={handleChange}
                  placeholder="000.000.000-00"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="exemplo@email.com"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="João Silva"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="razaoSocial" className="block text-sm font-medium text-gray-700 mb-2">
                  Razão Social
                </label>
                <input
                  type="text"
                  id="razaoSocial"
                  name="razaoSocial"
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  placeholder="Empresa XYZ Ltda"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Email Content Section */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Conteúdo do Email</h2>
            <div className="space-y-6">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Assunto *
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  value={formData.subject}
                  onChange={handleChange}
                  placeholder="Boleto Vencimento 30/10/2025"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="html" className="block text-sm font-medium text-gray-700 mb-2">
                  Conteúdo (HTML) *
                </label>
                <textarea
                  id="html"
                  name="html"
                  required
                  rows={10}
                  value={formData.html}
                  onChange={handleChange}
                  placeholder="<h1>Olá!</h1><p>Segue seu boleto em anexo...</p>"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                />
                <p className="mt-2 text-xs text-gray-500">
                  💡 Dica: Você pode usar HTML para formatar o email (tags permitidas: h1, h2, p, strong, em, ul, ol, li, a, etc.)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex items-center justify-between">
          <p className="text-sm text-gray-500">
            * Campos obrigatórios
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFormData({
                cpfCnpj: '',
                razaoSocial: '',
                nome: '',
                email: '',
                subject: '',
                html: '',
              })}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Enviando...
                </span>
              ) : (
                'Enviar Email'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Info Card */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-xl">ℹ️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Como funciona?</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ol className="list-decimal list-inside space-y-1">
                <li>O email é validado e enfileirado no sistema</li>
                <li>Um worker processa a fila e envia via AWS SES</li>
                <li>Você pode acompanhar o status na página "Emails"</li>
                <li>Notificações de bounce/complaint são processadas automaticamente</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
