const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/BookingDashboard-iyz3eqJp.js","assets/pdf-vendor-Dw8VLciX.js","assets/rolldown-runtime-km5iIlDX.js","assets/supabase-vendor-DzZbqjtm.js","assets/react-vendor-D1tGIDv5.js","assets/schedule-BFLRVecB.js","assets/supabase-BhMSj0Ru.js","assets/notify-KNkcmvlb.js","assets/MyBookings-CeZ_PbMd.js","assets/Profile-CJ4xiB_W.js","assets/AdminDashboard-C-dJPuCd.js","assets/vendor-drJjT9YC.js","assets/names-B8S8TWSr.js","assets/Login-D6SDF2sD.js","assets/utils-vendor-DdvYbYg2.js","assets/PaymentGateway-Bc-moyQg.js","assets/TournamentRegistration-BPhdntyD.js","assets/TournamentBracket-DvQ-hACj.js","assets/Cart-B_byzLhj.js","assets/SharedPayment-DsooMuEo.js","assets/PrivacyPolicy-DqRiR-Cw.js","assets/Tournaments-DLz6cbim.js","assets/ResetPassword-FXhaVzAn.js","assets/MonitorView-C1QVOwbZ.js"])))=>i.map(i=>d[i]);
import{r as B}from"./rolldown-runtime-km5iIlDX.js";import{a as W,c as F,f as V,i as S,n as H,o as m,p as U,r as $,s as K,t as q}from"./react-vendor-D1tGIDv5.js";import{a as g,i as P}from"./pdf-vendor-Dw8VLciX.js";import"./supabase-vendor-DzZbqjtm.js";import{t as x}from"./supabase-BhMSj0Ru.js";(function(){const a=document.createElement("link").relList;if(a&&a.supports&&a.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))r(i);new MutationObserver(i=>{for(const c of i)if(c.type==="childList")for(const p of c.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&r(p)}).observe(document,{childList:!0,subtree:!0});function s(i){const c={};return i.integrity&&(c.integrity=i.integrity),i.referrerPolicy&&(c.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?c.credentials="include":i.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function r(i){if(i.ep)return;i.ep=!0;const c=s(i);fetch(i.href,c)}})();var Y=V(),n=B(U(),1),X=["lolo@padelmedina.com"],e=q(),z=(0,n.createContext)(),G=["admin@padelmedina.com"],T=(t,a)=>({id:t.id,email:t.email,name:t.user_metadata?.name||t.email.split("@")[0],role:X.includes(t.email)?"monitor":a||(G.includes(t.email)?"admin":"client")}),Z=async t=>{try{const a=new AbortController,s=setTimeout(()=>a.abort(),2500),{data:r}=await x.from("profiles").select("role").eq("id",t).abortSignal(a.signal).maybeSingle();return clearTimeout(s),r?.role||null}catch{return null}};function J({children:t}){const[a,s]=(0,n.useState)(null),[r,i]=(0,n.useState)(!0);(0,n.useEffect)(()=>{let o=!1;const l=f=>{if(!f){o||s(null);return}o||s(T(f,null)),Z(f.id).then(w=>{o||!w||s(j=>j&&j.id===f.id?T(f,w):j)})},u=setTimeout(()=>{o||i(!1)},5e3);x.auth.getSession().then(({data:{session:f}})=>{clearTimeout(u);const w=f?.user;l(w?.email_confirmed_at?w:null),o||i(!1)}).catch(()=>{clearTimeout(u),o||(s(null),i(!1))});const{data:{subscription:_}}=x.auth.onAuthStateChange((f,w)=>{if(f==="INITIAL_SESSION")return;const j=w?.user;if(j&&!j.email_confirmed_at){o||s(null);return}l(j||null)});return()=>{o=!0,clearTimeout(u),_.unsubscribe()}},[]);const c=async()=>{await x.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})},p=async(o,l)=>{const{error:u}=await x.auth.signInWithPassword({email:o,password:l});if(u)throw u},v=async(o,l,u,_)=>{const{error:f}=await x.auth.signUp({email:o,password:l,options:{data:{name:u||"",phone:_||""},emailRedirectTo:window.location.origin}});if(f)throw f},b=async(o,l)=>{const{error:u}=await x.auth.verifyOtp({email:o,token:l,type:"signup"});if(u)throw u},y=async o=>{const{error:l}=await x.auth.resetPasswordForEmail(o,{redirectTo:`${window.location.origin}/reset-password`});if(l)throw l},d=async o=>{const{error:l}=await x.auth.updateUser({password:o});if(l)throw l},h=async()=>{await x.auth.signOut(),s(null)};return r?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC"},children:(0,e.jsxs)("div",{style:{textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid #DCFCE7",borderTopColor:"#16A34A",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}),(0,e.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"}),(0,e.jsx)("p",{style:{color:"#94A3B8",fontWeight:600,margin:0},children:"Cargando..."})]})}):(0,e.jsx)(z.Provider,{value:{user:a,loginWithGoogle:c,loginWithPassword:p,signupWithEmail:v,verifySignupOtp:b,resetPassword:y,updatePassword:d,logout:h,loading:r},children:t})}var Q=()=>(0,n.useContext)(z),ee="BPkGxuT7mSIsUrU2X2rOuyRWZCSBZorYr5ZfIaMmrmdQrXTQRAEX15k9v3JQ4Zfcad5Oq13Q5ThPRkCVcgPKAgU";function te(t){const a=(t+"=".repeat((4-t.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"),s=atob(a);return Uint8Array.from(s,r=>r.charCodeAt(0))}async function re(t,a){if(!("serviceWorker"in navigator)||!("PushManager"in window)||Notification.permission==="denied")return null;try{const s=await navigator.serviceWorker.register("/sw.js",{scope:"/"}),r=await s.pushManager.getSubscription();if(r&&await r.unsubscribe(),await Notification.requestPermission()!=="granted")return null;const i=await s.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:te(ee)}),c=i.toJSON();return await t.from("push_subscriptions").upsert({user_id:a,endpoint:c.endpoint,subscription:c},{onConflict:"endpoint"}),i}catch(s){return console.warn("Push subscription error:",s),null}}var N=(0,n.createContext)(),D="padelmedina_cart",E=300*1e3,L=(t,a)=>t.addedAt?a-t.addedAt>=E:!1,ae=({children:t})=>{const[a,s]=(0,n.useState)(()=>{try{const d=localStorage.getItem(D),h=d?JSON.parse(d):[],o=Date.now();return h.map(l=>l.addedAt?l:{...l,addedAt:o}).filter(l=>!L(l,o))}catch{return[]}}),[,r]=(0,n.useState)(0);(0,n.useEffect)(()=>{try{localStorage.setItem(D,JSON.stringify(a))}catch{}},[a]),(0,n.useEffect)(()=>{const d=setInterval(()=>{const h=Date.now();s(o=>{const l=o.filter(u=>!L(u,h));return l.length===o.length?o:l}),r(o=>(o+1)%1e3)},1e3);return()=>clearInterval(d)},[]);const i=d=>`${d.courtId}-${d.date}-${d.timeSlot}`,c=d=>{s(h=>{const o=i(d);return h.some(l=>l.cartId===o)?h:[...h,{...d,cartId:o,addedAt:Date.now()}]})},p=d=>{s(h=>h.filter(o=>o.cartId!==d))},v=()=>s([]),b=a.reduce((d,h)=>d+(Number(h.price)||0),0),y=d=>d?.addedAt?Math.max(0,d.addedAt+E-Date.now()):E;return(0,e.jsx)(N.Provider,{value:{items:a,addItem:c,removeItem:p,clearCart:v,total:b,count:a.length,getRemainingMs:y},children:t})},ne=()=>{const t=(0,n.useContext)(N);if(!t)throw new Error("useCart must be used within CartProvider");return t};function ie(){const t=F(),{count:a}=ne(),s=r=>t.pathname===r;return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsx)("nav",{className:"bottom-nav",children:[{path:"/",label:"Reservas",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),(0,e.jsx)("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),(0,e.jsx)("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),(0,e.jsx)("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]})},{path:"/torneos",label:"Torneos",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6"}),(0,e.jsx)("path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18"}),(0,e.jsx)("path",{d:"M4 22h16"}),(0,e.jsx)("path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"}),(0,e.jsx)("path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"}),(0,e.jsx)("path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2z"})]})},{path:"/carrito",label:"Carrito",badge:a,icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("circle",{cx:"9",cy:"21",r:"1"}),(0,e.jsx)("circle",{cx:"20",cy:"21",r:"1"}),(0,e.jsx)("path",{d:"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"})]})},{path:"/mis-reservas",label:"Mis Reservas",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),(0,e.jsx)("polyline",{points:"14 2 14 8 20 8"}),(0,e.jsx)("line",{x1:"16",y1:"13",x2:"8",y2:"13"}),(0,e.jsx)("line",{x1:"16",y1:"17",x2:"8",y2:"17"})]})},{path:"/perfil",label:"Perfil",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}),(0,e.jsx)("circle",{cx:"12",cy:"7",r:"4"})]})}].map(({path:r,label:i,icon:c,badge:p})=>{const v=s(r);return(0,e.jsxs)($,{to:r,className:`nav-link ${v?"nav-link-active":"nav-link-inactive"}`,children:[v&&(0,e.jsx)("span",{className:"nav-active-pill"}),(0,e.jsxs)("span",{className:"nav-icon-wrap",children:[c(v),p>0&&(0,e.jsx)("span",{className:"nav-badge",children:p>99?"99+":p})]}),(0,e.jsx)("span",{className:"nav-label",children:i})]},r)})})]})}var oe=()=>(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsxs)("div",{className:"main-layout",children:[(0,e.jsx)("header",{className:"top-header",children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",className:"top-header-logo-img"})}),(0,e.jsxs)("main",{className:"main-content",children:[(0,e.jsx)(W,{}),(0,e.jsxs)("footer",{style:{textAlign:"center",padding:"1rem 1rem 0.5rem",color:"var(--color-text-muted)",fontSize:"0.7rem",fontWeight:500},children:["© ",new Date().getFullYear()," Padel Medina · Diseñada por"," ",(0,e.jsx)("a",{href:"https://astoraweb.es",target:"_blank",rel:"noopener noreferrer",style:{color:"var(--color-accent)",fontWeight:700,textDecoration:"none"},children:"Astora"})]})]}),(0,e.jsx)(ie,{})]})]}),se=class extends n.Component{constructor(t){super(t),P(this,"handleReload",()=>{window.location.reload()}),P(this,"handleHome",()=>{window.location.href="/"}),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,a){console.error("UI ErrorBoundary caught:",t,a)}render(){return this.state.hasError?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC",padding:"1.5rem"},children:(0,e.jsxs)("div",{style:{background:"white",borderRadius:"1.25rem",boxShadow:"0 20px 50px rgba(0,0,0,0.08)",maxWidth:"460px",width:"100%",padding:"2rem",textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"64px",height:"64px",borderRadius:"50%",backgroundColor:"#FEE2E2",color:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",fontSize:"1.8rem",fontWeight:800},children:"!"}),(0,e.jsx)("h1",{style:{margin:"0 0 0.5rem",fontSize:"1.4rem",fontWeight:900,color:"#0F172A"},children:"Algo no fue bien"}),(0,e.jsxs)("p",{style:{margin:"0 0 1.5rem",color:"#475569",fontSize:"0.95rem",lineHeight:1.5},children:["Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a ",(0,e.jsx)("a",{href:"mailto:info@padelmedina.com",style:{color:"#2563EB"},children:"info@padelmedina.com"}),"."]}),this.state.error?.message&&(0,e.jsx)("pre",{style:{background:"#F1F5F9",color:"#475569",padding:"0.6rem 0.75rem",borderRadius:"0.5rem",fontSize:"0.75rem",textAlign:"left",overflowX:"auto",marginBottom:"1.25rem"},children:String(this.state.error.message).slice(0,280)}),(0,e.jsxs)("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"},children:[(0,e.jsx)("button",{onClick:this.handleReload,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"none",background:"#0F172A",color:"white",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Recargar página"}),(0,e.jsx)("button",{onClick:this.handleHome,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"1.5px solid #CBD5E1",background:"white",color:"#475569",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Volver al inicio"})]})]})}):this.props.children}},k="pwa_install_dismissed_at",le=14;function ce(){const[t,a]=(0,n.useState)(null),[s,r]=(0,n.useState)(!1),[i,c]=(0,n.useState)(!1);(0,n.useEffect)(()=>{if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===!0)return;const b=Number(localStorage.getItem(k)||0);if(b&&Date.now()-b<le*864e5)return;const y=navigator.userAgent||"",d=/iphone|ipad|ipod/i.test(y)&&!/crios|fxios|edgios/i.test(y),h=/android/i.test(y);if(d){c(!0);const u=setTimeout(()=>r(!0),2500);return()=>clearTimeout(u)}const o=u=>{u.preventDefault(),a(u),h&&r(!0)},l=()=>{r(!1),localStorage.setItem(k,String(Date.now()))};return window.addEventListener("beforeinstallprompt",o),window.addEventListener("appinstalled",l),()=>{window.removeEventListener("beforeinstallprompt",o),window.removeEventListener("appinstalled",l)}},[]);const p=()=>{r(!1),localStorage.setItem(k,String(Date.now()))},v=async()=>{if(t){t.prompt();try{await t.userChoice}catch{}a(null),p()}};return s?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        @keyframes a2hs-up { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}),(0,e.jsxs)("div",{role:"dialog","aria-label":"Instalar aplicación",style:{position:"fixed",left:"50%",transform:"translateX(-50%)",bottom:"calc(72px + env(safe-area-inset-bottom) + 12px)",width:"calc(100% - 24px)",maxWidth:460,background:"#fff",border:"1px solid #E2E8F0",borderRadius:"1rem",boxShadow:"0 12px 40px rgba(15,23,42,0.18)",padding:"0.9rem 1rem",zIndex:200,display:"flex",alignItems:"center",gap:"0.85rem",animation:"a2hs-up 0.35s ease",boxSizing:"border-box"},children:[(0,e.jsx)("img",{src:"/favicon-192.png",alt:"Padel Medina",style:{width:46,height:46,borderRadius:"0.7rem",flexShrink:0}}),(0,e.jsxs)("div",{style:{flex:1,minWidth:0},children:[(0,e.jsx)("p",{style:{margin:"0 0 2px",fontWeight:800,color:"#0F172A",fontSize:"0.92rem"},children:"Instala Padel Medina"}),i?(0,e.jsxs)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:["Pulsa ",(0,e.jsx)("span",{style:{display:"inline-flex",verticalAlign:"middle"},children:(0,e.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"#1B3A6E",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M12 16V4"}),(0,e.jsx)("polyline",{points:"8 8 12 4 16 8"}),(0,e.jsx)("path",{d:"M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"})]})})," Compartir y luego ",(0,e.jsx)("strong",{children:'"Añadir a pantalla de inicio"'}),"."]}):(0,e.jsx)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:"Añádela a tu pantalla de inicio para abrirla como una app, sin navegador."})]}),!i&&(0,e.jsx)("button",{onClick:v,style:{flexShrink:0,background:"#16A34A",color:"#fff",border:"none",borderRadius:"0.6rem",fontWeight:700,fontSize:"0.85rem",padding:"0.6rem 0.95rem",cursor:"pointer",fontFamily:"inherit"},children:"Instalar"}),(0,e.jsx)("button",{onClick:p,"aria-label":"Cerrar",style:{flexShrink:0,background:"transparent",border:"none",color:"#94A3B8",cursor:"pointer",padding:4,lineHeight:0},children:(0,e.jsxs)("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",children:[(0,e.jsx)("line",{x1:"18",y1:"6",x2:"6",y2:"18"}),(0,e.jsx)("line",{x1:"6",y1:"6",x2:"18",y2:"18"})]})})]})]}):null}var de=(0,n.lazy)(()=>g(()=>import("./BookingDashboard-iyz3eqJp.js"),__vite__mapDeps([0,1,2,3,4,5,6,7]))),pe=(0,n.lazy)(()=>g(()=>import("./MyBookings-CeZ_PbMd.js"),__vite__mapDeps([8,1,2,3,4,6,7]))),ue=(0,n.lazy)(()=>g(()=>import("./Profile-CJ4xiB_W.js"),__vite__mapDeps([9,1,2,3,4,6]))),he=(0,n.lazy)(()=>g(()=>import("./AdminDashboard-C-dJPuCd.js"),__vite__mapDeps([10,1,2,11,3,4,5,6,12,7]))),me=(0,n.lazy)(()=>g(()=>import("./Login-D6SDF2sD.js"),__vite__mapDeps([13,1,2,3,14,4,6]))),xe=(0,n.lazy)(()=>g(()=>import("./PaymentGateway-Bc-moyQg.js"),__vite__mapDeps([15,1,2,3,4,6,7]))),ge=(0,n.lazy)(()=>g(()=>import("./TournamentRegistration-BPhdntyD.js"),__vite__mapDeps([16,1,2,3,4,6,12,7]))),fe=(0,n.lazy)(()=>g(()=>import("./TournamentBracket-DvQ-hACj.js"),__vite__mapDeps([17,1,2,3,4,6]))),ve=(0,n.lazy)(()=>g(()=>import("./Cart-B_byzLhj.js"),__vite__mapDeps([18,1,2,4]))),ye=(0,n.lazy)(()=>g(()=>import("./SharedPayment-DsooMuEo.js"),__vite__mapDeps([19,1,2,3,4,6,7]))),be=(0,n.lazy)(()=>g(()=>import("./PrivacyPolicy-DqRiR-Cw.js"),__vite__mapDeps([20,1,2,4]))),we=(0,n.lazy)(()=>g(()=>import("./Tournaments-DLz6cbim.js"),__vite__mapDeps([21,1,2,3,4,6]))),je=(0,n.lazy)(()=>g(()=>import("./ResetPassword-FXhaVzAn.js"),__vite__mapDeps([22,1,2,3,4,6]))),_e=(0,n.lazy)(()=>g(()=>import("./MonitorView-C1QVOwbZ.js"),__vite__mapDeps([23,1,2,3,4,6,7]))),Se=()=>(0,e.jsxs)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid var(--color-bg-elevated)",borderTopColor:"var(--color-primary)",borderRadius:"50%",animation:"spin 1s linear infinite"}}),(0,e.jsx)("style",{children:"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"})]});function ke(){const{user:t,loading:a}=Q(),[s,r]=(0,n.useState)(""),[i,c]=(0,n.useState)(!1),[p,v]=(0,n.useState)(!1),[b,y]=(0,n.useState)(!1);return(0,n.useEffect)(()=>{if(t?.role!=="admin")return;re(x,t.id);const d=async(o,l)=>{await x.functions.invoke("send-push",{body:{title:o,body:l,url:"/admin"},headers:{apikey:"sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ"}})},h=x.channel("admin-push-channel").on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings"},()=>{d("Nueva reserva","Se ha realizado una nueva reserva")}).subscribe();return()=>{x.removeChannel(h)}},[t]),a?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:(0,e.jsx)("p",{style:{color:"var(--color-text-secondary)"},children:"Cargando..."})}):(0,e.jsxs)("div",{className:"app-container",children:[(0,e.jsx)(se,{children:(0,e.jsx)(n.Suspense,{fallback:(0,e.jsx)(Se,{}),children:(0,e.jsxs)(K,{children:[(0,e.jsx)(m,{path:"/login",element:t?(0,e.jsx)(S,{to:"/",replace:!0}):(0,e.jsx)(me,{})}),(0,e.jsx)(m,{path:"/torneos/:id",element:(0,e.jsx)(ge,{})}),(0,e.jsx)(m,{path:"/torneos/:id/cuadro",element:(0,e.jsx)(fe,{})}),(0,e.jsx)(m,{path:"/pago-compartido",element:(0,e.jsx)(ye,{})}),(0,e.jsx)(m,{path:"/privacidad",element:(0,e.jsx)(be,{})}),(0,e.jsx)(m,{path:"/reset-password",element:(0,e.jsx)(je,{})}),t?.role==="admin"&&(0,e.jsx)(m,{path:"/*",element:(0,e.jsx)(he,{})}),t?.role==="monitor"&&(0,e.jsx)(m,{path:"/*",element:(0,e.jsx)(_e,{})}),t?.role==="client"&&(0,e.jsx)(m,{path:"/checkout",element:(0,e.jsx)(xe,{})}),t?.role==="client"&&(0,e.jsxs)(m,{element:(0,e.jsx)(oe,{}),children:[(0,e.jsx)(m,{path:"/",element:(0,e.jsx)(de,{})}),(0,e.jsx)(m,{path:"/torneos",element:(0,e.jsx)(we,{})}),(0,e.jsx)(m,{path:"/carrito",element:(0,e.jsx)(ve,{})}),(0,e.jsx)(m,{path:"/mis-reservas",element:(0,e.jsx)(pe,{})}),(0,e.jsx)(m,{path:"/perfil",element:(0,e.jsx)(ue,{})}),(0,e.jsx)(m,{path:"*",element:(0,e.jsx)(S,{to:"/",replace:!0})})]}),!t&&(0,e.jsx)(m,{path:"*",element:(0,e.jsx)(S,{to:"/login",replace:!0})})]})})}),(0,e.jsx)(ce,{})]})}var Ee="https://iquibawtbpamhaottlbr.supabase.co",Ae="sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ",C=0,O=!1,A=new Set,R=async()=>{try{const t=Date.now(),a=await fetch(`${Ee}/auth/v1/health`,{method:"GET",headers:{apikey:Ae}}),s=Date.now(),r=a.headers.get("Date");if(!r)return;const i=new Date(r).getTime();if(!Number.isFinite(i))return;C=i-(t+s)/2,O=!0,A.forEach(c=>{try{c()}catch{}})}catch(t){console.warn("syncServerTime failed:",t?.message||t)}},M=null,Ie=()=>{M||(R(),M=setInterval(R,1800*1e3))},I=()=>new Date(Date.now()+C),Re=()=>Date.now()+C,Me=()=>O,ze=()=>{const t=I();return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`},Ne=(t=3e4)=>{const[a,s]=(0,n.useState)(()=>I());return(0,n.useEffect)(()=>{const r=()=>s(I()),i=setInterval(r,t);return A.add(r),()=>{clearInterval(i),A.delete(r)}},[t]),a},Oe=t=>{const a=t instanceof Date?t:new Date(t),s=["dom","lun","mar","mié","jue","vie","sáb"],r=String(a.getDate()).padStart(2,"0"),i=String(a.getMonth()+1).padStart(2,"0"),c=String(a.getHours()).padStart(2,"0"),p=String(a.getMinutes()).padStart(2,"0");return`${s[a.getDay()]} ${r}/${i} · ${c}:${p}`};Ie();if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js").then(a=>{document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&a.update().catch(()=>{})})}).catch(console.warn);let t=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{t||(t=!0,window.location.reload())})}(0,Y.createRoot)(document.getElementById("root")).render((0,e.jsx)(n.StrictMode,{children:(0,e.jsx)(H,{children:(0,e.jsx)(J,{children:(0,e.jsx)(ae,{children:(0,e.jsx)(ke,{})})})})}));requestAnimationFrame(()=>{requestAnimationFrame(()=>{const t=document.getElementById("initial-loader");t&&(t.style.transition="opacity 0.15s",t.style.opacity="0",setTimeout(()=>t.remove(),150))})});export{ze as a,Q as c,Re as i,X as l,Me as n,Ne as o,I as r,ne as s,Oe as t};
