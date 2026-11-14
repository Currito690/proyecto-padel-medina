import { supabase } from '../services/supabase';
import { toast, confirmDialog } from './notify';

// Borrado de la propia cuenta desde la app (obligatorio para publicar en Google
// Play). Se usa en el Perfil y en la ventana del teléfono obligatorio, para que
// nadie se quede sin poder borrar su cuenta por no querer dar el teléfono.
// El servidor (RPC eliminar_mi_cuenta) reasigna las reservas a una cuenta
// anónima para no destruir la contabilidad del club, cancela las futuras y
// borra los datos personales.
//   logout      → el de useAuth()
//   alEmpezar   → se llama justo antes de borrar (tras las dos confirmaciones)
// Devuelve true si se ha borrado; false si el jugador no confirmó. Lanza si falla.
export async function eliminarMiCuenta(logout, { alEmpezar } = {}) {
  const ok = await confirmDialog(
    'Se borrarán tu cuenta y tus datos personales: nombre, correo, teléfono y tus avisos. ' +
    'Tus reservas futuras se cancelarán y no se devuelve el importe de las que ya hayas pagado. ' +
    'El club conserva el histórico de cobros sin tus datos, porque la ley le obliga a guardar la contabilidad. ' +
    'Esto no se puede deshacer.',
    { title: '¿Eliminar tu cuenta?', okText: 'Sí, eliminar mi cuenta', cancelText: 'No, volver', danger: true }
  );
  if (!ok) return false;

  const seguro = await confirmDialog(
    'Última confirmación: al aceptar, tu cuenta se elimina de inmediato y se cierra la sesión.',
    { title: 'Confirmar para siempre', okText: 'Eliminar', cancelText: 'Cancelar', danger: true }
  );
  if (!seguro) return false;

  alEmpezar?.();
  const { error } = await supabase.rpc('eliminar_mi_cuenta');
  if (error) throw error;
  toast('Tu cuenta ha sido eliminada.', 'success');
  // La sesión ya no existe en el servidor: cerramos sesión sin depender de
  // que la llamada funcione y volvemos al login con una carga limpia.
  setTimeout(async () => {
    try { await logout(); } catch { /* el token ya no vale, da igual */ }
    window.location.replace('/login');
  }, 1200);
  return true;
}

export const MSG_ERROR_ELIMINAR = 'No se ha podido eliminar la cuenta. Inténtalo de nuevo o escribe al club.';
