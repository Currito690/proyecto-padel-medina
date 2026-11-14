// AuthContext de MENTIRA para el simulador: siempre hay un administrador con sesión.
const USUARIO = {
  id: '9fc542a4-0f66-4c8b-9cf8-5b04feffb5b5',
  email: 'admin@padelmedina.com',
  name: 'Administrador (simulación)',
  role: 'admin',
};

const nada = async () => {};

export function AuthProvider({ children }) {
  return children;
}

export const useAuth = () => ({
  user: USUARIO,
  loading: false,
  logout: nada,
  loginWithGoogle: nada,
  loginWithApple: nada,
  loginWithPassword: nada,
  signupWithEmail: nada,
  verifySignupOtp: nada,
  resendSignupCode: nada,
  resetPassword: nada,
  updatePassword: nada,
});
