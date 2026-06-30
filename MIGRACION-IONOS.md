# Migración del frontend a IONOS / Plesk

Mover **solo el frontend** (React/Vite) de Vercel a IONOS/Plesk.
**Supabase (BD, login, Storage, Edge Functions, pagos Redsys, emails Resend) NO se mueve.**

- Despliegue elegido: **Git automático en Plesk** (compila al hacer `git push`).
- DNS elegido: **Camino B** — mover el DNS entero a IONOS (salida total de Vercel).
- Dominio registrado en **IONOS**. Hoy sus nameservers están delegados a Vercel
  (`ns1/ns2.vercel-dns.com`).

---

## ⚠️ Registros DNS actuales (en Vercel) — recrear en IONOS antes de cambiar nameservers

> La lista 100% completa está en el panel de Vercel (Domains → padelmedina.com →
> DNS Records). Esto es lo detectado desde fuera; **cruzar con el panel de Vercel**
> por si hay algún registro extra (verificaciones, etc.).

### WEB (estos CAMBIAN a la IP del servidor Plesk de IONOS)
| Tipo | Nombre | Valor actual (Vercel) | Valor nuevo (IONOS) |
|------|--------|-----------------------|---------------------|
| A | @ (raíz) | 64.29.17.65 / 64.29.17.1 | **IP del hosting Plesk** |
| A | www | (Vercel) | **IP del hosting Plesk** |

### EMAIL (Resend) — COPIAR EXACTO, **no cambiar nada**
Si falta alguno, dejan de salir los emails (confirmaciones, recuperar contraseña…).

| Tipo | Nombre | Valor |
|------|--------|-------|
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` (prioridad 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdfr1n07iz8mR87THCuGK4wpklTWVxLQN+K7stJY0ZI5tzQuGPPdc6teQRpAlVJMqm6AA90rIUYfcVZ+SP4FnEAzwrjyQNV2Ocxb/lg4AW80b6TaafoJK5s/heidHfMOFrhhlfpdB+ai5poXYivzKCdiiaA52kc/9E1nTq15TVowIDAQAB` |

- No hay registro **DMARC** (`_dmarc`) ni **SPF en la raíz** → no añadir nada nuevo, solo preservar lo que existe.

---

## Orden correcto (el cambio de DNS es lo ÚLTIMO)

1. **Montar el frontend en IONOS/Plesk** con Git autobuild y probarlo en una **URL temporal** (la web de Vercel sigue viva). → ver guía de Plesk.
2. **Inventariar** todos los registros DNS desde el panel de Vercel (cruzar con la tabla de arriba).
3. En **IONOS → dominio → DNS**: cambiar a **nameservers de IONOS** y **recrear todos los registros** (A/www a la IP de Plesk + los 3 de email tal cual).
4. **Bajar el TTL** antes del cambio para que propague rápido.
5. **Switch**: confirmar nameservers de IONOS. Mantener Vercel vivo hasta que propague (durante la propagación, unos visitantes van a Vercel y otros a IONOS; ambos sirven la web).
6. **SSL**: en Plesk, emitir Let's Encrypt para `padelmedina.com` + `www` y forzar HTTPS (cuando el dominio ya resuelva a IONOS).
7. **Verificar**: web (/, /tienda, /reset-password recargando) **y enviar un email de prueba** (que SPF/DKIM sigan validando).
8. Cuando todo OK: **quitar el dominio de Vercel** / dar de baja el proyecto.

## No olvidar
- `padelmedina.com` debe seguir siendo el dominio → Redsys (`APP_URL`), Supabase
  Auth (Site URL + Redirect URLs incl. `/reset-password`) y los emails no cambian.
- Se pierde el `middleware.js` (rate-limit de Vercel). Opcional: Cloudflare delante.
