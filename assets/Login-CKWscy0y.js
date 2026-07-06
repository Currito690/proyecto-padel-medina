import{r as T}from"./rolldown-runtime-km5iIlDX.js";import{p as P,r as _,t as q}from"./react-vendor-5-kJuc0W.js";import"./pdf-vendor-CcZKRWo-.js";import"./supabase-vendor-DzZbqjtm.js";import"./supabase-BhMSj0Ru.js";import{c as I}from"./index-Ca_lCEf1.js";import{t as V}from"./utils-vendor-DP0mq0mv.js";var r=T(P(),1),c=g=>g?V.sanitize(g,{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}).trim():"",e=q(),K=()=>{const{loginWithGoogle:g,loginWithPassword:F,signupWithEmail:N,verifySignupOtp:C,resetPassword:S}=I(),[t,A]=(0,r.useState)(!0),[m,h]=(0,r.useState)(1),[u,x]=(0,r.useState)(!1),[b,E]=(0,r.useState)(""),[o,f]=(0,r.useState)(""),[v,z]=(0,r.useState)(""),[p,B]=(0,r.useState)(""),[j,y]=(0,r.useState)(""),[l,d]=(0,r.useState)(!1),[w,n]=(0,r.useState)(null),[k,s]=(0,r.useState)(""),D=async i=>{i.preventDefault(),d(!0),n(null),s("");try{t?await F(c(o),p):(await N(c(o),p,c(b),c(v)),s(`¡Cuenta creada! Hemos enviado un código de verificación a ${o}. Introdúcelo para activar tu cuenta.`),h(2))}catch(a){n(a.message||"Error al procesar la solicitud")}finally{d(!1)}},L=async i=>{i.preventDefault(),d(!0),n(null),s("");try{await S(c(o)),s(`Si existe una cuenta con ${o}, te hemos enviado un email con un enlace para restablecer tu contraseña.`)}catch(a){n(a.message||"No se pudo enviar el email de recuperación")}finally{d(!1)}},M=async i=>{i.preventDefault(),d(!0),n(null);try{await C(o,c(j))}catch{n("Código incorrecto o expirado. Revisa tu correo e inténtalo de nuevo.")}finally{d(!1)}},W=()=>(0,e.jsxs)("div",{className:"login-brand",children:[(0,e.jsx)("div",{className:"login-blob login-blob-1"}),(0,e.jsx)("div",{className:"login-blob login-blob-2"}),(0,e.jsx)("h1",{className:"login-brand-title",children:"Padel Medina"}),(0,e.jsx)("p",{className:"login-brand-sub",children:"Tu pista te espera"}),(0,e.jsx)("ul",{className:"login-features",children:["Reserva en segundos","Pistas de pádel y pickleball","Horarios de 09:00 a 22:00"].map(i=>(0,e.jsxs)("li",{className:"login-feature-item",children:[(0,e.jsx)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.9)",strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round",children:(0,e.jsx)("polyline",{points:"20 6 9 17 4 12"})}),i]},i))})]});return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        /* ── Login layout ── */
        .login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #F8FAFC;
        }

        /* Brand panel (hero) */
        .login-brand {
          background: linear-gradient(150deg, #1B3A6E 0%, #15326A 55%, #0F2550 100%);
          padding: 2.5rem 1.5rem 3rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .login-blob {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          pointer-events: none;
        }
        .login-blob-1 { width: 200px; height: 200px; top: -60px; right: -60px; }
        .login-blob-2 { width: 160px; height: 160px; bottom: -50px; left: -40px; background: rgba(255,255,255,0.05); }

        .login-logo {
          width: 68px; height: 68px; border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: 2px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1rem;
        }
        .login-brand-title {
          color: white;
          font-size: 1.875rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0 0 0.4rem;
        }
        .login-brand-sub {
          color: rgba(255,255,255,0.85);
          font-size: 1rem;
          font-weight: 500;
          margin: 0;
        }
        .login-features {
          display: none; /* hidden on mobile, shown on desktop */
          list-style: none;
          padding: 0; margin: 0;
        }
        .login-feature-item {
          display: flex; align-items: center; gap: 0.625rem;
          color: rgba(255,255,255,0.9);
          font-size: 0.95rem; font-weight: 500;
          margin-bottom: 0.75rem;
        }

        /* Form section */
        .login-form-section {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 0 1rem 2.5rem;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
          background: white;
          border-radius: 1.5rem;
          padding: 1.75rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.09);
          border: 1px solid #E2E8F0;
          margin-top: 1.5rem;
        }

        /* Tab toggle */
        .login-tabs {
          display: flex;
          background: #F1F5F9;
          border-radius: 0.75rem;
          padding: 0.25rem;
          margin-bottom: 1.5rem;
          gap: 0.25rem;
        }
        .login-tab {
          flex: 1; padding: 0.625rem;
          border: none; border-radius: 0.5rem;
          font-family: inherit; font-weight: 700; font-size: 0.875rem;
          cursor: pointer; transition: all 0.2s;
        }
        .login-tab-active {
          background: white; color: #0F172A;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        .login-tab-inactive {
          background: transparent; color: #94A3B8;
        }

        /* Input group */
        .login-input-group { margin-bottom: 1rem; }
        .login-label {
          display: block;
          font-size: 0.75rem; font-weight: 700;
          color: #475569; margin-bottom: 0.4rem;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .login-input {
          width: 100%; padding: 0.875rem 1rem;
          border-radius: 0.625rem; border: 1.5px solid #E2E8F0;
          font-size: 0.95rem; font-family: inherit;
          background: #F8FAFC; color: #0F172A;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .login-input:focus {
          outline: none;
          border-color: #1B3A6E;
          box-shadow: 0 0 0 3px rgba(27,58,110,0.15);
          background: white;
        }

        /* Error */
        .login-error {
          background: #FEF2F2; color: #DC2626;
          padding: 0.875rem 1rem; border-radius: 0.625rem;
          margin-bottom: 1rem; font-size: 0.875rem; font-weight: 500;
          border: 1px solid #FECACA;
          display: flex; align-items: center; gap: 0.5rem;
        }

        /* Submit button */
        .login-submit {
          width: 100%; padding: 1rem; margin-top: 0.25rem;
          background: linear-gradient(135deg, #1B3A6E, #152D57);
          color: white; border: none; border-radius: 0.75rem;
          font-family: inherit; font-size: 1rem; font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(27,58,110,0.35);
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          transition: all 0.2s;
        }
        .login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(27,58,110,0.45);
        }
        .login-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Divider */
        .login-divider {
          display: flex; align-items: center; gap: 1rem;
          margin: 1.25rem 0;
        }
        .login-divider hr {
          flex: 1; border: none; border-top: 1px solid #E2E8F0; margin: 0;
        }
        .login-divider span {
          font-size: 0.8rem; color: #94A3B8; font-weight: 600;
        }

        /* Google */
        .login-google {
          width: 100%; padding: 0.875rem;
          background: white; color: #0F172A;
          border: 1.5px solid #E2E8F0; border-radius: 0.625rem;
          font-family: inherit; font-size: 0.95rem; font-weight: 600;
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          cursor: pointer; transition: all 0.2s;
        }
        .login-google:hover { background: #F8FAFC; border-color: #CBD5E1; }

        /* Spin animation */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        /* ── Tablet (≥ 640px) ── */
        @media (min-width: 640px) {
          .login-brand { padding: 3rem 2rem 3.5rem; }
          .login-brand-title { font-size: 2.25rem; }
          .login-card { padding: 2.25rem; margin-top: 2rem; }
          .login-form-section { padding: 0 2rem 3rem; }
        }

        /* ── Desktop (≥ 1024px) ── */
        @media (min-width: 1024px) {
          .login-page {
            flex-direction: row;
            min-height: 100vh;
          }
          .login-brand {
            flex: 0 0 400px;
            min-height: 100vh;
            padding: 3rem;
            text-align: left;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .login-logo { margin: 0 0 1.5rem; }
          .login-brand-title { font-size: 2.5rem; }
          .login-brand-sub { font-size: 1.1rem; margin-bottom: 2.5rem; }
          .login-features { display: block; }
          .login-form-section {
            flex: 1;
            align-items: center;
            padding: 2rem;
          }
          .login-card { margin-top: 0; }
        }

        @media (min-width: 1280px) {
          .login-brand { flex: 0 0 480px; }
        }
      `}),(0,e.jsxs)("div",{className:"login-page",children:[(0,e.jsx)(W,{}),(0,e.jsx)("div",{className:"login-form-section",children:(0,e.jsxs)("div",{className:"login-card",children:[(0,e.jsx)("div",{style:{textAlign:"center",marginBottom:"1.5rem"},children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",style:{width:"160px",height:"auto",objectFit:"contain",display:"inline-block"}})}),(0,e.jsx)("div",{className:"login-tabs",children:["Entrar","Registrarse"].map((i,a)=>(0,e.jsx)("button",{onClick:()=>{A(a===0),n(null)},className:`login-tab ${a===0&&t||a===1&&!t?"login-tab-active":"login-tab-inactive"}`,children:i},i))}),(0,e.jsx)("h2",{style:{fontSize:"1.25rem",fontWeight:800,margin:"0 0 1.25rem",letterSpacing:"-0.02em"},children:m===2?"Verifica tu correo":u?"Recuperar contraseña":t?"Bienvenido de nuevo":"Crea tu cuenta"}),w&&(0,e.jsxs)("div",{className:"login-error",children:[(0,e.jsxs)("svg",{width:"16",height:"16",fill:"none",stroke:"currentColor",strokeWidth:"2",viewBox:"0 0 24 24",children:[(0,e.jsx)("circle",{cx:"12",cy:"12",r:"10"}),(0,e.jsx)("line",{x1:"12",y1:"8",x2:"12",y2:"12"}),(0,e.jsx)("line",{x1:"12",y1:"16",x2:"12.01",y2:"16"})]}),w]}),k&&(0,e.jsxs)("div",{style:{background:"#F0FDF4",color:"#15803D",padding:"0.875rem 1rem",borderRadius:"0.625rem",marginBottom:"1rem",fontSize:"0.875rem",fontWeight:500,border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:"0.5rem"},children:[(0,e.jsx)("svg",{width:"16",height:"16",fill:"none",stroke:"currentColor",strokeWidth:"2",viewBox:"0 0 24 24",children:(0,e.jsx)("polyline",{points:"20 6 9 17 4 12"})}),k]}),m===1&&u?(0,e.jsxs)("form",{onSubmit:L,children:[(0,e.jsx)("p",{style:{margin:"0 0 1rem",fontSize:"0.85rem",color:"#64748B",lineHeight:1.5},children:"Introduce tu email y te enviaremos un enlace para crear una contraseña nueva."}),(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Email"}),(0,e.jsx)("input",{className:"login-input",type:"email",value:o,onChange:i=>f(i.target.value),required:!0,placeholder:"tu@email.com"})]}),(0,e.jsx)("button",{type:"submit",disabled:l,className:"login-submit",children:l?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("svg",{className:"spin",width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:(0,e.jsx)("path",{d:"M21 12a9 9 0 11-6.219-8.56"})}),"Enviando..."]}):"Enviar enlace de recuperación"}),(0,e.jsx)("div",{style:{textAlign:"center",marginTop:"1rem"},children:(0,e.jsx)("button",{type:"button",onClick:()=>{x(!1),n(null),s("")},style:{background:"transparent",border:"none",color:"#64748B",fontSize:"0.875rem",cursor:"pointer",textDecoration:"underline"},children:"← Volver al inicio de sesión"})})]}):m===1?(0,e.jsxs)("form",{onSubmit:D,children:[!t&&(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Nombre completo"}),(0,e.jsx)("input",{className:"login-input",type:"text",value:b,onChange:i=>E(i.target.value),required:!0,placeholder:"Juan García"})]}),(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Email"}),(0,e.jsx)("input",{className:"login-input",type:"email",value:o,onChange:i=>f(i.target.value),required:!0,placeholder:"tu@email.com"})]}),!t&&(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Teléfono"}),(0,e.jsx)("input",{className:"login-input",type:"tel",value:v,onChange:i=>z(i.target.value),required:!0,placeholder:"+34 600 000 000"})]}),(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Contraseña"}),(0,e.jsx)("input",{className:"login-input",type:"password",value:p,onChange:i=>B(i.target.value),required:!0,placeholder:t?"Tu contraseña":"Mínimo 6 caracteres",minLength:6})]}),(0,e.jsx)("button",{type:"submit",disabled:l,className:"login-submit",children:l?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("svg",{className:"spin",width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:(0,e.jsx)("path",{d:"M21 12a9 9 0 11-6.219-8.56"})}),"Cargando..."]}):t?"Entrar":"Crear cuenta y verificar"}),t&&(0,e.jsx)("div",{style:{textAlign:"center",marginTop:"1rem"},children:(0,e.jsx)("button",{type:"button",onClick:()=>{x(!0),n(null),s("")},style:{background:"transparent",border:"none",color:"#1B3A6E",fontSize:"0.85rem",fontWeight:600,cursor:"pointer",textDecoration:"underline"},children:"¿Olvidaste tu contraseña?"})})]}):(0,e.jsxs)("form",{onSubmit:M,children:[(0,e.jsxs)("div",{style:{textAlign:"center",marginBottom:"1.25rem"},children:[(0,e.jsx)("div",{style:{width:"56px",height:"56px",borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 0.75rem"},children:(0,e.jsxs)("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"#2563EB",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"}),(0,e.jsx)("polyline",{points:"22,6 12,13 2,6"})]})}),(0,e.jsxs)("p",{style:{margin:0,fontSize:"0.82rem",color:"#475569"},children:["Código enviado a ",(0,e.jsx)("strong",{children:o})]}),(0,e.jsx)("p",{style:{margin:"0.25rem 0 0",fontSize:"0.75rem",color:"#94A3B8"},children:"Introduce el código de 6 dígitos para activar tu cuenta"})]}),(0,e.jsxs)("div",{className:"login-input-group",children:[(0,e.jsx)("label",{className:"login-label",children:"Código de verificación"}),(0,e.jsx)("input",{autoFocus:!0,className:"login-input",type:"text",inputMode:"numeric",pattern:"[0-9]*",maxLength:6,value:j,onChange:i=>y(i.target.value.replace(/\D/g,"")),required:!0,placeholder:"123456",style:{textAlign:"center",letterSpacing:"0.35em",fontSize:"1.5rem",fontWeight:700,padding:"1rem"}})]}),(0,e.jsx)("button",{type:"submit",disabled:l,className:"login-submit",children:l?"Verificando...":"✓ Verificar y crear cuenta"}),(0,e.jsx)("div",{style:{textAlign:"center",marginTop:"1rem"},children:(0,e.jsx)("button",{type:"button",onClick:()=>{h(1),n(null),s(""),y("")},style:{background:"transparent",border:"none",color:"#64748B",fontSize:"0.875rem",cursor:"pointer",textDecoration:"underline"},children:"← Volver"})})]}),m===1&&!u&&(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)("div",{className:"login-divider",children:[(0,e.jsx)("hr",{}),(0,e.jsx)("span",{children:"o"}),(0,e.jsx)("hr",{})]}),(0,e.jsxs)("button",{onClick:g,disabled:l,className:"login-google",children:[(0,e.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",children:[(0,e.jsx)("path",{d:"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",fill:"#4285F4"}),(0,e.jsx)("path",{d:"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",fill:"#34A853"}),(0,e.jsx)("path",{d:"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",fill:"#FBBC05"}),(0,e.jsx)("path",{d:"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",fill:"#EA4335"})]}),"Continuar con Google"]})]})]})}),(0,e.jsx)("p",{style:{textAlign:"center",marginTop:"1.5rem",fontSize:"0.75rem",color:"#94A3B8"},children:(0,e.jsx)(_,{to:"/privacidad",style:{color:"#94A3B8",textDecoration:"underline"},children:"Política de Privacidad"})})]})]})};export{K as default};
