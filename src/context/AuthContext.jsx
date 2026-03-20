import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Inicializamos en null para que lo primero que se vea sea el Login
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const loginWithGoogle = async () => {
    setUser({
      id: '456',
      email: 'google@padelmedina.com',
      name: 'Google User',
      role: 'client'
    });
  };

  const loginWithEmail = async (email, password) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setLoading(false);
    
    setUser({
      id: 'mock-' + Date.now(),
      email,
      name: email.includes('admin') ? 'Super Admin' : 'Usuario Normal',
      role: email.includes('admin') ? 'admin' : 'client'
    });
  };

  const signupWithEmail = async (email, password, name) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setLoading(false);
    
    setUser({
      id: 'mock-' + Date.now(),
      email,
      name: name,
      role: 'client' // Por defecto, los registros son clientes
    });
  };

  const logout = async () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithEmail, signupWithEmail, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
