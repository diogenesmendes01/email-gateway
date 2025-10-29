/**
 * @email-gateway/dashboard - Register Page
 *
 * TASK-036: Página de registro de empresas
 */

import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    fromAddress: '',
    fromName: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const calculatePasswordStrength = (password: string): PasswordStrength => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { score, label: 'Fraca', color: 'bg-red-500' };
    if (score === 3) return { score, label: 'Média', color: 'bg-yellow-500' };
    if (score === 4) return { score, label: 'Boa', color: 'bg-blue-500' };
    return { score, label: 'Forte', color: 'bg-green-500' };
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  const validateForm = (): boolean => {
    if (!formData.name || formData.name.length < 3) {
      setError('Nome da empresa deve ter no mínimo 3 caracteres');
      return false;
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Email inválido');
      return false;
    }

    if (!formData.password || formData.password.length < 8) {
      setError('Senha deve ter no mínimo 8 caracteres');
      return false;
    }

    if (!/[A-Z]/.test(formData.password)) {
      setError('Senha deve conter pelo menos 1 letra maiúscula');
      return false;
    }

    if (!/\d/.test(formData.password)) {
      setError('Senha deve conter pelo menos 1 número');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem');
      return false;
    }

    if (formData.fromAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.fromAddress)) {
      setError('From Address inválido');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      const response = await axios.post('/v1/auth/register', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        fromAddress: formData.fromAddress || undefined,
        fromName: formData.fromName || undefined,
      });

      setApiKey(response.data.apiKey);
      setShowApiKeyModal(true);

      // Redirect para login após 10 segundos
      setTimeout(() => {
        navigate('/login');
      }, 10000);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Erro ao registrar empresa. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      alert('API Key copiada para área de transferência!');
    }
  };

  if (showApiKeyModal && apiKey) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Registro Realizado com Sucesso!
            </h2>
            <p className="text-gray-600">
              Sua conta foi criada e está em análise. Você receberá aprovação em até 7 dias.
            </p>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  IMPORTANTE: Guarde sua API Key
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Esta é a <strong>única vez</strong> que sua API Key será exibida. Copie e guarde em local seguro!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sua API Key:
            </label>
            <div className="flex items-center space-x-2">
              <code className="flex-1 bg-gray-100 p-3 rounded text-sm break-all font-mono border border-gray-300">
                {apiKey}
              </code>
              <button
                onClick={copyApiKey}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0"
              >
                Copiar
              </button>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-800 mb-2">
              Status da Conta: Sandbox Mode
            </h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Limite inicial: 100 emails/dia</li>
              <li>• Após aprovação: 5.000 emails/dia</li>
              <li>• Tempo de aprovação: até 7 dias</li>
            </ul>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
            >
              Ir para Login
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Você será redirecionado automaticamente em 10 segundos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📧 Email Gateway
          </h1>
          <p className="text-gray-600">Crie sua conta para começar</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Registrar Empresa</h2>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da Empresa *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Empresa Exemplo LTDA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="contato@empresa.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número"
              />
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">Força da senha:</span>
                    <span className={`font-medium ${passwordStrength.score <= 2 ? 'text-red-600' : passwordStrength.score === 3 ? 'text-yellow-600' : passwordStrength.score === 4 ? 'text-blue-600' : 'text-green-600'}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar Senha *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Digite a senha novamente"
              />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-3">Campos Opcionais:</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Address (Remetente)
                  </label>
                  <input
                    type="email"
                    name="fromAddress"
                    value={formData.fromAddress}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="noreply@empresa.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Name (Nome do Remetente)
                  </label>
                  <input
                    type="text"
                    name="fromName"
                    value={formData.fromName}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Empresa Exemplo"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Registrando...' : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Já tem uma conta?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Fazer Login
              </button>
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          Ao criar uma conta, você concorda com nossos Termos de Uso
        </p>
      </div>
    </div>
  );
};
