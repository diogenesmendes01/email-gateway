import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  username: string;
  role: 'admin' | 'readonly';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated (stored in localStorage)
    const storedUser = localStorage.getItem('dashboard_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        localStorage.removeItem('dashboard_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      // Create basic auth header
      const credentials = btoa(`${username}:${password}`);
      
      // Test authentication with a simple request
      const response = await axios.get('/v1/dashboard/overview', {
        headers: {
          'Authorization': `Basic ${credentials}`,
        },
      });

      // If successful, store user info
      const userInfo: User = {
        username,
        role: response.data.user?.role || 'readonly', // Default to readonly for security
      };

      setUser(userInfo);
      localStorage.setItem('dashboard_user', JSON.stringify(userInfo));
      
      // Set default authorization header for future requests
      axios.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
    } catch (error) {
      throw new Error('Invalid credentials');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('dashboard_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
