import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your actual Supabase URL and Anon Key
// Usamos una URL simulada válida para que la app no haga crash al inicializar
const supabaseUrl = 'https://abcdefghijklmnopqrst.supabase.co';
const supabaseAnonKey = 'dummy-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
