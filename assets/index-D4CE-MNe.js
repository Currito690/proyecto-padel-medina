const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/pushNotifications-Do4VQmIV.js","assets/rolldown-runtime-km5iIlDX.js","assets/supabase-W-NFtADY.js","assets/supabase-vendor-DzZbqjtm.js","assets/BookingDashboard-DPgnoqzB.js","assets/pdf-vendor-CcZKRWo-.js","assets/react-vendor-5-kJuc0W.js","assets/schedule-BzHyF-rB.js","assets/notify-DJjF7kiX.js","assets/MyBookings-DvD7ERqA.js","assets/Profile-DINpA6HO.js","assets/AdminDashboard-2B6p_66R.js","assets/vendor-VW-dUZNH.js","assets/names-Ckfh9KDG.js","assets/Login-D-CX-n0r.js","assets/utils-vendor-DP0mq0mv.js","assets/legal-DkTLKqS1.js","assets/PaymentGateway-CbtuV5_-.js","assets/TournamentRegistration-BeNwilYR.js","assets/TournamentBracket-hatSeJQM.js","assets/Cart-CyEJxKA3.js","assets/SharedPayment-DlnJsgrZ.js","assets/PrivacyPolicy-D5hC0AhR.js","assets/LegalPage-BXlS3YC1.js","assets/LegalNotice-wTJesLVr.js","assets/DeleteAccount-DsMERURS.js","assets/Tournaments-Dd--sE_Y.js","assets/ResetPassword-CNtPMcvC.js","assets/MonitorView-Czr1XrQ4.js"])))=>i.map(i=>d[i]);
import{r as H}from"./rolldown-runtime-km5iIlDX.js";import{a as $,c as U,f as Y,i as I,n as G,o as h,p as q,r as S,s as X,t as J}from"./react-vendor-5-kJuc0W.js";import{a as x,i as T}from"./pdf-vendor-CcZKRWo-.js";import"./supabase-vendor-DzZbqjtm.js";import{t as w}from"./supabase-W-NFtADY.js";import{n as Q}from"./pushNotifications-Do4VQmIV.js";(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const c of n)if(c.type==="childList")for(const d of c.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&a(d)}).observe(document,{childList:!0,subtree:!0});function s(n){const c={};return n.integrity&&(c.integrity=n.integrity),n.referrerPolicy&&(c.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?c.credentials="include":n.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function a(n){if(n.ep)return;n.ep=!0;const c=s(n);fetch(n.href,c)}})();var K=Y(),o=H(q(),1),Z=["lolo@padelmedina.com","play-review-monitor@padelmedina.com"],e=J(),F=(0,o.createContext)(),ee=["admin@padelmedina.com"],k=(t,r)=>({id:t.id,email:t.email,name:t.user_metadata?.name||t.email.split("@")[0],role:Z.includes(t.email)?"monitor":r||(ee.includes(t.email)?"admin":"client")}),te=async t=>{try{const r=new AbortController,s=setTimeout(()=>r.abort(),2500),{data:a}=await w.from("profiles").select("role").eq("id",t).abortSignal(r.signal).maybeSingle();return clearTimeout(s),a?.role||null}catch{return null}};function re({children:t}){const[r,s]=(0,o.useState)(null),[a,n]=(0,o.useState)(!0);(0,o.useEffect)(()=>{let i=!1;const l=v=>{if(!v){i||s(null);return}i||s(u=>{if(u&&u.id===v.id){const g=k(v,u.role);return u.role===g.role&&u.email===g.email&&u.name===g.name?u:g}return k(v,null)}),te(v.id).then(u=>{i||!u||s(g=>g&&g.id===v.id&&g.role!==u?k(v,u):g)})},b=setTimeout(()=>{i||n(!1)},5e3);w.auth.getSession().then(({data:{session:v}})=>{clearTimeout(b);const u=v?.user;l(u?.email_confirmed_at?u:null),i||n(!1)}).catch(()=>{clearTimeout(b),i||(s(null),n(!1))});const{data:{subscription:E}}=w.auth.onAuthStateChange((v,u)=>{if(v==="INITIAL_SESSION")return;const g=u?.user;if(g&&!g.email_confirmed_at){i||s(null);return}l(g||null)});return()=>{i=!0,clearTimeout(b),E.unsubscribe()}},[]);const c=async()=>{await w.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})},d=async(i,l)=>{const{error:b}=await w.auth.signInWithPassword({email:i,password:l});if(b)throw b},y=async(i,l,b,E,v)=>{const{data:u,error:g}=await w.auth.signUp({email:i,password:l,options:{data:{name:b||"",phone:E||"",...v?.aceptadoAt?{legal_aceptado_at:v.aceptadoAt,legal_version:v.version}:{}},emailRedirectTo:window.location.origin}});if(g)throw g;if(u?.user&&Array.isArray(u.user.identities)&&u.user.identities.length===0){const R=new Error("Este correo ya está registrado. Entra con tu contraseña o recupérala.");throw R.code="user_already_exists",R}},_=async i=>{const{error:l}=await w.auth.resend({type:"signup",email:i});if(l)throw l},j=async(i,l)=>{const{error:b}=await w.auth.verifyOtp({email:i,token:l,type:"signup"});if(b)throw b},p=async i=>{const{error:l}=await w.auth.resetPasswordForEmail(i,{redirectTo:`${window.location.origin}/reset-password`});if(l)throw l},f=async i=>{const{error:l}=await w.auth.updateUser({password:i});if(l)throw l},m=async()=>{try{const i=await x(()=>import("./pushNotifications-Do4VQmIV.js").then(l=>l.t),__vite__mapDeps([0,1,2,3]));i.unsubscribeFromPush&&await i.unsubscribeFromPush()}catch{}try{await w.auth.signOut({scope:"local"})}catch{}try{for(let i=localStorage.length-1;i>=0;i--){const l=localStorage.key(i);l&&l.startsWith("sb-")&&l.endsWith("-auth-token")&&localStorage.removeItem(l)}}catch{}s(null)};return a?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC"},children:(0,e.jsxs)("div",{style:{textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid #DCFCE7",borderTopColor:"#16A34A",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}),(0,e.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"}),(0,e.jsx)("p",{style:{color:"#94A3B8",fontWeight:600,margin:0},children:"Cargando..."})]})}):(0,e.jsx)(F.Provider,{value:{user:r,loginWithGoogle:c,loginWithPassword:d,signupWithEmail:y,verifySignupOtp:j,resendSignupCode:_,resetPassword:p,updatePassword:f,logout:m,loading:a},children:t})}var ae=()=>(0,o.useContext)(F),W=(0,o.createContext)(),N="padelmedina_cart",D=300*1e3,z=(t,r)=>t.addedAt?r-t.addedAt>=D:!1,ne=({children:t})=>{const[r,s]=(0,o.useState)(()=>{try{const p=localStorage.getItem(N),f=p?JSON.parse(p):[],m=Date.now();return f.map(i=>i.addedAt?i:{...i,addedAt:m}).filter(i=>!z(i,m))}catch{return[]}}),[,a]=(0,o.useState)(0);(0,o.useEffect)(()=>{try{localStorage.setItem(N,JSON.stringify(r))}catch{}},[r]),(0,o.useEffect)(()=>{const p=setInterval(()=>{const f=Date.now();s(m=>{const i=m.filter(l=>!z(l,f));return i.length===m.length?m:i}),a(m=>(m+1)%1e3)},1e3);return()=>clearInterval(p)},[]);const n=p=>`${p.courtId}-${p.date}-${p.timeSlot}`,c=p=>{s(f=>{const m=n(p);return f.some(i=>i.cartId===m)?f:[...f,{...p,cartId:m,addedAt:Date.now()}]})},d=p=>{s(f=>f.filter(m=>m.cartId!==p))},y=()=>s([]),_=r.reduce((p,f)=>p+(Number(f.price)||0),0),j=p=>p?.addedAt?Math.max(0,p.addedAt+D-Date.now()):D;return(0,e.jsx)(W.Provider,{value:{items:r,addItem:c,removeItem:d,clearCart:y,total:_,count:r.length,getRemainingMs:j},children:t})},ie=()=>{const t=(0,o.useContext)(W);if(!t)throw new Error("useCart must be used within CartProvider");return t};function oe(){const t=U(),{count:r}=ie(),s=a=>t.pathname===a;return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        .bottom-nav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(226,232,240,0.8);
          display: flex;
          justify-content: space-around;
          align-items: stretch;
          height: 72px;
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -2px 16px rgba(0,0,0,0.06);
          z-index: 100;
        }
        .nav-link {
          flex: 1;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: color 0.2s;
          position: relative;
          padding: 10px 6px 8px;
          min-width: 0;
        }
        .nav-link-active { color: var(--color-accent); }
        .nav-link-inactive { color: var(--color-text-muted); }
        .nav-active-pill {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 40px;
          height: 30px;
          background: var(--color-accent-light);
          border-radius: 9px;
        }
        .nav-label {
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .nav-icon-wrap {
          position: relative;
          display: inline-flex;
          z-index: 1;
        }
        .nav-badge {
          position: absolute;
          top: -5px;
          right: -8px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: #DC2626;
          color: white;
          font-size: 0.62rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid white;
          box-sizing: border-box;
        }

        @media (min-width: 640px) {
          .bottom-nav { height: 76px; }
          .nav-label { font-size: 0.62rem; }
          .nav-link { padding: 12px 4px 8px; gap: 5px; }
          .nav-active-pill { width: 44px; height: 32px; }
        }

        @media (min-width: 1024px) {
          .bottom-nav {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 1rem 1rem 0 0;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
        }
      `}),(0,e.jsx)("nav",{className:"bottom-nav",children:[{path:"/",label:"Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),(0,e.jsx)("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),(0,e.jsx)("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),(0,e.jsx)("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]})},{path:"/torneos",label:"Torneos",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6"}),(0,e.jsx)("path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18"}),(0,e.jsx)("path",{d:"M4 22h16"}),(0,e.jsx)("path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"}),(0,e.jsx)("path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"}),(0,e.jsx)("path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2z"})]})},{path:"/carrito",label:"Carrito",badge:r,icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("circle",{cx:"9",cy:"21",r:"1"}),(0,e.jsx)("circle",{cx:"20",cy:"21",r:"1"}),(0,e.jsx)("path",{d:"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"})]})},{path:"/mis-reservas",label:"Mis Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),(0,e.jsx)("polyline",{points:"14 2 14 8 20 8"}),(0,e.jsx)("line",{x1:"16",y1:"13",x2:"8",y2:"13"}),(0,e.jsx)("line",{x1:"16",y1:"17",x2:"8",y2:"17"})]})},{path:"/perfil",label:"Perfil",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}),(0,e.jsx)("circle",{cx:"12",cy:"7",r:"4"})]})}].map(({path:a,label:n,icon:c,badge:d})=>{const y=s(a);return(0,e.jsxs)(S,{to:a,className:`nav-link ${y?"nav-link-active":"nav-link-inactive"}`,children:[y&&(0,e.jsx)("span",{className:"nav-active-pill"}),(0,e.jsxs)("span",{className:"nav-icon-wrap",children:[c(y),d>0&&(0,e.jsx)("span",{className:"nav-badge",children:d>99?"99+":d})]}),(0,e.jsx)("span",{className:"nav-label",children:n})]},a)})})]})}var se=()=>(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        .main-layout {
          display: flex;
          flex-direction: column;
          background: var(--color-bg-secondary);
        }

        /* ── Top header bar ── */
        .top-header {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: calc(56px + env(safe-area-inset-top));
          padding-top: env(safe-area-inset-top);
          padding-left: calc(1.25rem + env(safe-area-inset-left));
          padding-right: calc(1.25rem + env(safe-area-inset-right));
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(226,232,240,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 12px rgba(0,0,0,0.06);
          z-index: 100;
        }
        .top-header-logo-img {
          height: 36px;
          width: auto;
          object-fit: contain;
          display: block;
        }
        /* Filo de marca bajo la cabecera (navy → verde) */
        .top-header::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -1px;
          height: 2.5px;
          background: linear-gradient(90deg, #1B3A6E 0%, #16A34A 60%, #4ADE80 100%);
          opacity: 0.85;
        }

        .main-content {
          padding-top: calc(56px + env(safe-area-inset-top));
          padding-bottom: 0;
        }

        @media (min-width: 1024px) {
          .top-header {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 0 0 1rem 1rem;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
        }
      `}),(0,e.jsxs)("div",{className:"main-layout",children:[(0,e.jsx)("header",{className:"top-header",children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",className:"top-header-logo-img"})}),(0,e.jsxs)("main",{className:"main-content",children:[(0,e.jsx)($,{}),(0,e.jsxs)("footer",{style:{textAlign:"center",padding:"1rem 1rem 0.5rem",color:"var(--color-text-muted)",fontSize:"0.7rem",fontWeight:500},children:["© ",new Date().getFullYear()," Padel Medina ·"," ",(0,e.jsx)(S,{to:"/aviso-legal",style:{color:"inherit",textDecoration:"underline"},children:"Aviso legal"})," ","·"," ",(0,e.jsx)(S,{to:"/privacidad",style:{color:"inherit",textDecoration:"underline"},children:"Privacidad"})," ","·"," ",(0,e.jsx)(S,{to:"/eliminar-cuenta",style:{color:"inherit",textDecoration:"underline"},children:"Eliminar cuenta"})," ","· Diseñada por"," ",(0,e.jsx)("a",{href:"https://astoraweb.es",target:"_blank",rel:"noopener noreferrer",style:{color:"var(--color-accent)",fontWeight:700,textDecoration:"none"},children:"Astora"})]})]}),(0,e.jsx)(oe,{})]})]}),le=class extends o.Component{constructor(t){super(t),T(this,"handleReload",()=>{window.location.reload()}),T(this,"handleHome",()=>{window.location.href="/"}),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,r){console.error("UI ErrorBoundary caught:",t,r)}render(){return this.state.hasError?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC",padding:"1.5rem"},children:(0,e.jsxs)("div",{style:{background:"white",borderRadius:"1.25rem",boxShadow:"0 20px 50px rgba(0,0,0,0.08)",maxWidth:"460px",width:"100%",padding:"2rem",textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"64px",height:"64px",borderRadius:"50%",backgroundColor:"#FEE2E2",color:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",fontSize:"1.8rem",fontWeight:800},children:"!"}),(0,e.jsx)("h1",{style:{margin:"0 0 0.5rem",fontSize:"1.4rem",fontWeight:900,color:"#0F172A"},children:"Algo no fue bien"}),(0,e.jsxs)("p",{style:{margin:"0 0 1.5rem",color:"#475569",fontSize:"0.95rem",lineHeight:1.5},children:["Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a ",(0,e.jsx)("a",{href:"mailto:info@padelmedina.com",style:{color:"#2563EB"},children:"info@padelmedina.com"}),"."]}),this.state.error?.message&&(0,e.jsx)("pre",{style:{background:"#F1F5F9",color:"#475569",padding:"0.6rem 0.75rem",borderRadius:"0.5rem",fontSize:"0.75rem",textAlign:"left",overflowX:"auto",marginBottom:"1.25rem"},children:String(this.state.error.message).slice(0,280)}),(0,e.jsxs)("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"},children:[(0,e.jsx)("button",{onClick:this.handleReload,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"none",background:"#0F172A",color:"white",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Recargar página"}),(0,e.jsx)("button",{onClick:this.handleHome,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"1.5px solid #CBD5E1",background:"white",color:"#475569",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Volver al inicio"})]})]})}):this.props.children}},A="pwa_install_dismissed_at",ce=14;function de(){const[t,r]=(0,o.useState)(null),[s,a]=(0,o.useState)(!1),[n,c]=(0,o.useState)(!1);(0,o.useEffect)(()=>{if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===!0)return;const _=Number(localStorage.getItem(A)||0);if(_&&Date.now()-_<ce*864e5)return;const j=navigator.userAgent||"",p=/iphone|ipad|ipod/i.test(j)&&!/crios|fxios|edgios/i.test(j),f=/android/i.test(j);if(p){c(!0);const l=setTimeout(()=>a(!0),2500);return()=>clearTimeout(l)}const m=l=>{l.preventDefault(),r(l),f&&a(!0)},i=()=>{a(!1),localStorage.setItem(A,String(Date.now()))};return window.addEventListener("beforeinstallprompt",m),window.addEventListener("appinstalled",i),()=>{window.removeEventListener("beforeinstallprompt",m),window.removeEventListener("appinstalled",i)}},[]);const d=()=>{a(!1),localStorage.setItem(A,String(Date.now()))},y=async()=>{if(t){t.prompt();try{await t.userChoice}catch{}r(null),d()}};return s?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        @keyframes a2hs-up { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}),(0,e.jsxs)("div",{role:"dialog","aria-label":"Instalar aplicación",style:{position:"fixed",left:"50%",transform:"translateX(-50%)",bottom:"calc(72px + env(safe-area-inset-bottom) + 12px)",width:"calc(100% - 24px)",maxWidth:460,background:"#fff",border:"1px solid #E2E8F0",borderRadius:"1rem",boxShadow:"0 12px 40px rgba(15,23,42,0.18)",padding:"0.9rem 1rem",zIndex:200,display:"flex",alignItems:"center",gap:"0.85rem",animation:"a2hs-up 0.35s ease",boxSizing:"border-box"},children:[(0,e.jsx)("img",{src:"/favicon-192.png",alt:"Padel Medina",style:{width:46,height:46,borderRadius:"0.7rem",flexShrink:0}}),(0,e.jsxs)("div",{style:{flex:1,minWidth:0},children:[(0,e.jsx)("p",{style:{margin:"0 0 2px",fontWeight:800,color:"#0F172A",fontSize:"0.92rem"},children:"Instala Padel Medina"}),n?(0,e.jsxs)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:["Pulsa ",(0,e.jsx)("span",{style:{display:"inline-flex",verticalAlign:"middle"},children:(0,e.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"#1B3A6E",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M12 16V4"}),(0,e.jsx)("polyline",{points:"8 8 12 4 16 8"}),(0,e.jsx)("path",{d:"M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"})]})})," Compartir y luego ",(0,e.jsx)("strong",{children:'"Añadir a pantalla de inicio"'}),"."]}):(0,e.jsx)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:"Añádela a tu pantalla de inicio para abrirla como una app, sin navegador."})]}),!n&&(0,e.jsx)("button",{onClick:y,style:{flexShrink:0,background:"#16A34A",color:"#fff",border:"none",borderRadius:"0.6rem",fontWeight:700,fontSize:"0.85rem",padding:"0.6rem 0.95rem",cursor:"pointer",fontFamily:"inherit"},children:"Instalar"}),(0,e.jsx)("button",{onClick:d,"aria-label":"Cerrar",style:{flexShrink:0,background:"transparent",border:"none",color:"#94A3B8",cursor:"pointer",padding:4,lineHeight:0},children:(0,e.jsxs)("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",children:[(0,e.jsx)("line",{x1:"18",y1:"6",x2:"6",y2:"18"}),(0,e.jsx)("line",{x1:"6",y1:"6",x2:"18",y2:"18"})]})})]})]}):null}var pe=(0,o.lazy)(()=>x(()=>import("./BookingDashboard-DPgnoqzB.js"),__vite__mapDeps([4,5,1,3,6,7,2,8]))),ue=(0,o.lazy)(()=>x(()=>import("./MyBookings-DvD7ERqA.js"),__vite__mapDeps([9,5,1,3,6,2,8]))),he=(0,o.lazy)(()=>x(()=>import("./Profile-DINpA6HO.js"),__vite__mapDeps([10,5,1,3,6,2,8]))),me=(0,o.lazy)(()=>x(()=>import("./AdminDashboard-2B6p_66R.js"),__vite__mapDeps([11,5,1,12,3,6,7,2,13,8]))),xe=(0,o.lazy)(()=>x(()=>import("./Login-D-CX-n0r.js"),__vite__mapDeps([14,5,1,3,15,6,2,16]))),ge=(0,o.lazy)(()=>x(()=>import("./PaymentGateway-CbtuV5_-.js"),__vite__mapDeps([17,5,1,3,6,2,8]))),fe=(0,o.lazy)(()=>x(()=>import("./TournamentRegistration-BeNwilYR.js"),__vite__mapDeps([18,5,1,3,6,2,13,8]))),ve=(0,o.lazy)(()=>x(()=>import("./TournamentBracket-hatSeJQM.js"),__vite__mapDeps([19,5,1,3,6,2]))),ye=(0,o.lazy)(()=>x(()=>import("./Cart-CyEJxKA3.js"),__vite__mapDeps([20,5,1,6]))),we=(0,o.lazy)(()=>x(()=>import("./SharedPayment-DlnJsgrZ.js"),__vite__mapDeps([21,5,1,3,6,2,8]))),be=(0,o.lazy)(()=>x(()=>import("./PrivacyPolicy-D5hC0AhR.js"),__vite__mapDeps([22,5,1,6,23,16]))),je=(0,o.lazy)(()=>x(()=>import("./LegalNotice-wTJesLVr.js"),__vite__mapDeps([24,5,1,6,23,16]))),_e=(0,o.lazy)(()=>x(()=>import("./DeleteAccount-DsMERURS.js"),__vite__mapDeps([25,5,1,6,23,16]))),Se=(0,o.lazy)(()=>x(()=>import("./Tournaments-Dd--sE_Y.js"),__vite__mapDeps([26,5,1,3,6,2]))),Ee=(0,o.lazy)(()=>x(()=>import("./ResetPassword-CNtPMcvC.js"),__vite__mapDeps([27,5,1,3,6,2]))),Ie=(0,o.lazy)(()=>x(()=>import("./MonitorView-Czr1XrQ4.js"),__vite__mapDeps([28,5,1,3,6,2,8]))),ke=()=>(0,e.jsxs)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid var(--color-bg-elevated)",borderTopColor:"var(--color-primary)",borderRadius:"50%",animation:"spin 1s linear infinite"}}),(0,e.jsx)("style",{children:"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"})]});function Ae(){const{user:t,loading:r}=ae(),[s,a]=(0,o.useState)(""),[n,c]=(0,o.useState)(!1),[d,y]=(0,o.useState)(!1),[_,j]=(0,o.useState)(!1);return(0,o.useEffect)(()=>{t?.role==="admin"&&Q(w,t.id)},[t?.id]),r?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:(0,e.jsx)("p",{style:{color:"var(--color-text-secondary)"},children:"Cargando..."})}):(0,e.jsxs)("div",{className:"app-container",children:[(0,e.jsx)(le,{children:(0,e.jsx)(o.Suspense,{fallback:(0,e.jsx)(ke,{}),children:(0,e.jsxs)(X,{children:[(0,e.jsx)(h,{path:"/login",element:t?(0,e.jsx)(I,{to:"/",replace:!0}):(0,e.jsx)(xe,{})}),(0,e.jsx)(h,{path:"/torneos/:id",element:(0,e.jsx)(fe,{})}),(0,e.jsx)(h,{path:"/torneos/:id/cuadro",element:(0,e.jsx)(ve,{})}),(0,e.jsx)(h,{path:"/pago-compartido",element:(0,e.jsx)(we,{})}),(0,e.jsx)(h,{path:"/privacidad",element:(0,e.jsx)(be,{})}),(0,e.jsx)(h,{path:"/aviso-legal",element:(0,e.jsx)(je,{})}),(0,e.jsx)(h,{path:"/eliminar-cuenta",element:(0,e.jsx)(_e,{})}),(0,e.jsx)(h,{path:"/reset-password",element:(0,e.jsx)(Ee,{})}),t?.role==="admin"&&(0,e.jsx)(h,{path:"/*",element:(0,e.jsx)(me,{})}),t?.role==="monitor"&&(0,e.jsx)(h,{path:"/*",element:(0,e.jsx)(Ie,{})}),t?.role==="client"&&(0,e.jsx)(h,{path:"/checkout",element:(0,e.jsx)(ge,{})}),t?.role==="client"&&(0,e.jsxs)(h,{element:(0,e.jsx)(se,{}),children:[(0,e.jsx)(h,{path:"/",element:(0,e.jsx)(pe,{})}),(0,e.jsx)(h,{path:"/torneos",element:(0,e.jsx)(Se,{})}),(0,e.jsx)(h,{path:"/carrito",element:(0,e.jsx)(ye,{})}),(0,e.jsx)(h,{path:"/mis-reservas",element:(0,e.jsx)(ue,{})}),(0,e.jsx)(h,{path:"/perfil",element:(0,e.jsx)(he,{})}),(0,e.jsx)(h,{path:"*",element:(0,e.jsx)(I,{to:"/",replace:!0})})]}),!t&&(0,e.jsx)(h,{path:"*",element:(0,e.jsx)(I,{to:"/login",replace:!0})})]})})}),(0,e.jsx)(de,{})]})}var De="https://padelmedina.com/supabase",Ce="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4OTQ2NDc4LCJleHAiOjIxMDQzMDY0Nzh9.Q2kFRLprwGpBHuQCRIBu0Oaa6ybQS-ngRxjUmwuCAxA",P=0,B=!1,C=new Set,M=async()=>{try{const t=Date.now(),r=await fetch(`${De}/auth/v1/health`,{method:"GET",headers:{apikey:Ce}}),s=Date.now(),a=r.headers.get("Date");if(!a)return;const n=new Date(a).getTime();if(!Number.isFinite(n))return;P=n-(t+s)/2,B=!0,C.forEach(c=>{try{c()}catch{}})}catch(t){console.warn("syncServerTime failed:",t?.message||t)}},O=null,Le=()=>{O||(M(),O=setInterval(M,1800*1e3))},L=()=>new Date(Date.now()+P),We=()=>Date.now()+P,Be=()=>B,Ve=()=>{const t=L();return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`},He=(t=3e4)=>{const[r,s]=(0,o.useState)(()=>L());return(0,o.useEffect)(()=>{const a=()=>s(L()),n=setInterval(a,t);return C.add(a),()=>{clearInterval(n),C.delete(a)}},[t]),r},$e=t=>{const r=t instanceof Date?t:new Date(t),s=["dom","lun","mar","mié","jue","vie","sáb"],a=String(r.getDate()).padStart(2,"0"),n=String(r.getMonth()+1).padStart(2,"0"),c=String(r.getHours()).padStart(2,"0"),d=String(r.getMinutes()).padStart(2,"0");return`${s[r.getDay()]} ${a}/${n} · ${c}:${d}`},V="gps_nativo",Pe="com.padelmedina.app";function Re(){try{new URLSearchParams(window.location.search).get("gpsnativo")==="1"&&localStorage.setItem(V,"1")}catch{}}function Ue(){if(!/android/i.test(navigator.userAgent||""))return!1;try{return localStorage.getItem(V)==="1"}catch{return!1}}function Ye(){const t=`${window.location.origin}${window.location.pathname}?gpsnativo=1&firmar=1`,r=`intent://ubicacion#Intent;scheme=padelmedina;package=${Pe};S.volver=${encodeURIComponent(t)};end`;return new Promise(s=>{let a=!1;const n=d=>{a||(a=!0,s(d))},c=()=>{document.visibilityState==="hidden"&&n(!0)};document.addEventListener("visibilitychange",c,{once:!0}),setTimeout(()=>{document.removeEventListener("visibilitychange",c),n(!1)},2500);try{window.location.href=r}catch{n(!1)}})}function Ge(){const t=new URLSearchParams(window.location.search),r=t.get("gps"),s=t.get("firmar")==="1";if(r===null&&!s)return null;t.delete("gps"),t.delete("firmar");const a=t.toString();try{window.history.replaceState(null,"",window.location.pathname+(a?`?${a}`:""))}catch{}if(!r)return{firmar:s,pos:null,error:null};if(r.startsWith("err:"))return{firmar:s,pos:null,error:r.slice(4)};const[n,c,d,y]=r.split(",").map(Number);return!Number.isFinite(n)||!Number.isFinite(c)?{firmar:s,pos:null,error:"formato"}:{firmar:s,pos:{lat:n,lng:c,precision_m:Number.isFinite(d)?d:null,captada:Number.isFinite(y)&&y>0?y:Date.now()},error:null}}try{const t=window.location.hash||"";window.__pmAuthHash={recovery:/type=recovery/.test(t)&&/access_token=/.test(t),error:/[#&?]error(_code)?=/.test(t)}}catch{}Le();Re();if("serviceWorker"in navigator){const t=!!navigator.serviceWorker.controller;navigator.serviceWorker.register("/sw.js").then(s=>{document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&s.update().catch(()=>{})})}).catch(console.warn);let r=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{t&&(r||(r=!0,window.location.reload()))})}(0,K.createRoot)(document.getElementById("root")).render((0,e.jsx)(o.StrictMode,{children:(0,e.jsx)(G,{children:(0,e.jsx)(re,{children:(0,e.jsx)(ne,{children:(0,e.jsx)(Ae,{})})})})}));requestAnimationFrame(()=>{requestAnimationFrame(()=>{const t=document.getElementById("initial-loader");t&&(t.style.transition="opacity 0.15s",t.style.opacity="0",setTimeout(()=>t.remove(),150))})});export{Be as a,Ve as c,ae as d,Z as f,$e as i,He as l,Ge as n,L as o,Ye as r,We as s,Ue as t,ie as u};
