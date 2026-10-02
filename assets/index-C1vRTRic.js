const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/BookingDashboard-Cfrvj0Ky.js","assets/pdf-vendor-Dw8VLciX.js","assets/rolldown-runtime-km5iIlDX.js","assets/supabase-vendor-DzZbqjtm.js","assets/react-vendor-D1tGIDv5.js","assets/schedule-BFLRVecB.js","assets/supabase-W-NFtADY.js","assets/notify-KNkcmvlb.js","assets/MyBookings-C_jckBVv.js","assets/Profile-DnaGPsBM.js","assets/AdminDashboard-1p65Wwcs.js","assets/vendor-drJjT9YC.js","assets/names-B8S8TWSr.js","assets/Login-BfcWCa-u.js","assets/utils-vendor-DdvYbYg2.js","assets/legal-DvhevlLf.js","assets/PaymentGateway-C4uClI9D.js","assets/TournamentRegistration-BF6AW_s4.js","assets/TournamentBracket-DqC3Rxzm.js","assets/Cart-D3CGCksk.js","assets/SharedPayment-_RgqCWBe.js","assets/PrivacyPolicy-Cz9YzN14.js","assets/LegalPage-CE-cAu3x.js","assets/LegalNotice-B_uxcWmf.js","assets/DeleteAccount-apmaVqaI.js","assets/Tournaments-CNMn2QmS.js","assets/ResetPassword-D3vsXPqW.js","assets/MonitorView-7RppHupV.js"])))=>i.map(i=>d[i]);
import{r as B}from"./rolldown-runtime-km5iIlDX.js";import{a as V,c as H,f as U,i as I,n as $,o as u,p as Y,r as _,s as Q,t as J}from"./react-vendor-D1tGIDv5.js";import{a as x,i as P}from"./pdf-vendor-Dw8VLciX.js";import"./supabase-vendor-DzZbqjtm.js";import{t as f}from"./supabase-W-NFtADY.js";(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const l of n)if(l.type==="childList")for(const p of l.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&a(p)}).observe(document,{childList:!0,subtree:!0});function i(n){const l={};return n.integrity&&(l.integrity=n.integrity),n.referrerPolicy&&(l.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?l.credentials="include":n.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function a(n){if(n.ep)return;n.ep=!0;const l=i(n);fetch(n.href,l)}})();var G=U(),o=B(Y(),1),X=["lolo@padelmedina.com","play-review-monitor@padelmedina.com"],e=J(),O=(0,o.createContext)(),q=["admin@padelmedina.com"],L=(t,r)=>({id:t.id,email:t.email,name:t.user_metadata?.name||t.email.split("@")[0],role:X.includes(t.email)?"monitor":r||(q.includes(t.email)?"admin":"client")}),K=async t=>{try{const r=new AbortController,i=setTimeout(()=>r.abort(),2500),{data:a}=await f.from("profiles").select("role").eq("id",t).abortSignal(r.signal).maybeSingle();return clearTimeout(i),a?.role||null}catch{return null}};function Z({children:t}){const[r,i]=(0,o.useState)(null),[a,n]=(0,o.useState)(!0);(0,o.useEffect)(()=>{let s=!1;const c=v=>{if(!v){s||i(null);return}s||i(L(v,null)),K(v.id).then(y=>{s||!y||i(j=>j&&j.id===v.id?L(v,y):j)})},h=setTimeout(()=>{s||n(!1)},5e3);f.auth.getSession().then(({data:{session:v}})=>{clearTimeout(h);const y=v?.user;c(y?.email_confirmed_at?y:null),s||n(!1)}).catch(()=>{clearTimeout(h),s||(i(null),n(!1))});const{data:{subscription:S}}=f.auth.onAuthStateChange((v,y)=>{if(v==="INITIAL_SESSION")return;const j=y?.user;if(j&&!j.email_confirmed_at){s||i(null);return}c(j||null)});return()=>{s=!0,clearTimeout(h),S.unsubscribe()}},[]);const l=async()=>{await f.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})},p=async(s,c)=>{const{error:h}=await f.auth.signInWithPassword({email:s,password:c});if(h)throw h},g=async(s,c,h,S,v)=>{const{error:y}=await f.auth.signUp({email:s,password:c,options:{data:{name:h||"",phone:S||"",...v?.aceptadoAt?{legal_aceptado_at:v.aceptadoAt,legal_version:v.version}:{}},emailRedirectTo:window.location.origin}});if(y)throw y},w=async(s,c)=>{const{error:h}=await f.auth.verifyOtp({email:s,token:c,type:"signup"});if(h)throw h},b=async s=>{const{error:c}=await f.auth.resetPasswordForEmail(s,{redirectTo:`${window.location.origin}/reset-password`});if(c)throw c},d=async s=>{const{error:c}=await f.auth.updateUser({password:s});if(c)throw c},m=async()=>{await f.auth.signOut(),i(null)};return a?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC"},children:(0,e.jsxs)("div",{style:{textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid #DCFCE7",borderTopColor:"#16A34A",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}),(0,e.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"}),(0,e.jsx)("p",{style:{color:"#94A3B8",fontWeight:600,margin:0},children:"Cargando..."})]})}):(0,e.jsx)(O.Provider,{value:{user:r,loginWithGoogle:l,loginWithPassword:p,signupWithEmail:g,verifySignupOtp:w,resetPassword:b,updatePassword:d,logout:m,loading:a},children:t})}var ee=()=>(0,o.useContext)(O),te="BPy2fyS_zj3l1gFvsxHUYDuQrfXZX1eQ2Q_FOtd2XRtO0UQ7YCcFfCdtvvkaerL8CybPsWveFjtnxiiC7IGPda8";function re(t){const r=(t+"=".repeat((4-t.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"),i=atob(r);return Uint8Array.from(i,a=>a.charCodeAt(0))}async function ae(t,r){if(!("serviceWorker"in navigator)||!("PushManager"in window)||Notification.permission==="denied")return null;try{const i=await navigator.serviceWorker.register("/sw.js",{scope:"/"}),a=await i.pushManager.getSubscription();if(a&&await a.unsubscribe(),await Notification.requestPermission()!=="granted")return null;const n=await i.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:re(te)}),l=n.toJSON();return await t.from("push_subscriptions").upsert({user_id:r,endpoint:l.endpoint,subscription:l},{onConflict:"endpoint"}),n}catch(i){return console.warn("Push subscription error:",i),null}}var M=(0,o.createContext)(),R="padelmedina_cart",A=300*1e3,N=(t,r)=>t.addedAt?r-t.addedAt>=A:!1,ne=({children:t})=>{const[r,i]=(0,o.useState)(()=>{try{const d=localStorage.getItem(R),m=d?JSON.parse(d):[],s=Date.now();return m.map(c=>c.addedAt?c:{...c,addedAt:s}).filter(c=>!N(c,s))}catch{return[]}}),[,a]=(0,o.useState)(0);(0,o.useEffect)(()=>{try{localStorage.setItem(R,JSON.stringify(r))}catch{}},[r]),(0,o.useEffect)(()=>{const d=setInterval(()=>{const m=Date.now();i(s=>{const c=s.filter(h=>!N(h,m));return c.length===s.length?s:c}),a(s=>(s+1)%1e3)},1e3);return()=>clearInterval(d)},[]);const n=d=>`${d.courtId}-${d.date}-${d.timeSlot}`,l=d=>{i(m=>{const s=n(d);return m.some(c=>c.cartId===s)?m:[...m,{...d,cartId:s,addedAt:Date.now()}]})},p=d=>{i(m=>m.filter(s=>s.cartId!==d))},g=()=>i([]),w=r.reduce((d,m)=>d+(Number(m.price)||0),0),b=d=>d?.addedAt?Math.max(0,d.addedAt+A-Date.now()):A;return(0,e.jsx)(M.Provider,{value:{items:r,addItem:l,removeItem:p,clearCart:g,total:w,count:r.length,getRemainingMs:b},children:t})},ie=()=>{const t=(0,o.useContext)(M);if(!t)throw new Error("useCart must be used within CartProvider");return t};function oe(){const t=H(),{count:r}=ie(),i=a=>t.pathname===a;return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsx)("nav",{className:"bottom-nav",children:[{path:"/",label:"Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),(0,e.jsx)("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),(0,e.jsx)("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),(0,e.jsx)("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]})},{path:"/torneos",label:"Torneos",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6"}),(0,e.jsx)("path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18"}),(0,e.jsx)("path",{d:"M4 22h16"}),(0,e.jsx)("path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"}),(0,e.jsx)("path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"}),(0,e.jsx)("path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2z"})]})},{path:"/carrito",label:"Carrito",badge:r,icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("circle",{cx:"9",cy:"21",r:"1"}),(0,e.jsx)("circle",{cx:"20",cy:"21",r:"1"}),(0,e.jsx)("path",{d:"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"})]})},{path:"/mis-reservas",label:"Mis Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),(0,e.jsx)("polyline",{points:"14 2 14 8 20 8"}),(0,e.jsx)("line",{x1:"16",y1:"13",x2:"8",y2:"13"}),(0,e.jsx)("line",{x1:"16",y1:"17",x2:"8",y2:"17"})]})},{path:"/perfil",label:"Perfil",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}),(0,e.jsx)("circle",{cx:"12",cy:"7",r:"4"})]})}].map(({path:a,label:n,icon:l,badge:p})=>{const g=i(a);return(0,e.jsxs)(_,{to:a,className:`nav-link ${g?"nav-link-active":"nav-link-inactive"}`,children:[g&&(0,e.jsx)("span",{className:"nav-active-pill"}),(0,e.jsxs)("span",{className:"nav-icon-wrap",children:[l(g),p>0&&(0,e.jsx)("span",{className:"nav-badge",children:p>99?"99+":p})]}),(0,e.jsx)("span",{className:"nav-label",children:n})]},a)})})]})}var se=()=>(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsxs)("div",{className:"main-layout",children:[(0,e.jsx)("header",{className:"top-header",children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",className:"top-header-logo-img"})}),(0,e.jsxs)("main",{className:"main-content",children:[(0,e.jsx)(V,{}),(0,e.jsxs)("footer",{style:{textAlign:"center",padding:"1rem 1rem 0.5rem",color:"var(--color-text-muted)",fontSize:"0.7rem",fontWeight:500},children:["© ",new Date().getFullYear()," Padel Medina ·"," ",(0,e.jsx)(_,{to:"/aviso-legal",style:{color:"inherit",textDecoration:"underline"},children:"Aviso legal"})," ","·"," ",(0,e.jsx)(_,{to:"/privacidad",style:{color:"inherit",textDecoration:"underline"},children:"Privacidad"})," ","·"," ",(0,e.jsx)(_,{to:"/eliminar-cuenta",style:{color:"inherit",textDecoration:"underline"},children:"Eliminar cuenta"})," ","· Diseñada por"," ",(0,e.jsx)("a",{href:"https://astoraweb.es",target:"_blank",rel:"noopener noreferrer",style:{color:"var(--color-accent)",fontWeight:700,textDecoration:"none"},children:"Astora"})]})]}),(0,e.jsx)(oe,{})]})]}),le=class extends o.Component{constructor(t){super(t),P(this,"handleReload",()=>{window.location.reload()}),P(this,"handleHome",()=>{window.location.href="/"}),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,r){console.error("UI ErrorBoundary caught:",t,r)}render(){return this.state.hasError?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC",padding:"1.5rem"},children:(0,e.jsxs)("div",{style:{background:"white",borderRadius:"1.25rem",boxShadow:"0 20px 50px rgba(0,0,0,0.08)",maxWidth:"460px",width:"100%",padding:"2rem",textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"64px",height:"64px",borderRadius:"50%",backgroundColor:"#FEE2E2",color:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",fontSize:"1.8rem",fontWeight:800},children:"!"}),(0,e.jsx)("h1",{style:{margin:"0 0 0.5rem",fontSize:"1.4rem",fontWeight:900,color:"#0F172A"},children:"Algo no fue bien"}),(0,e.jsxs)("p",{style:{margin:"0 0 1.5rem",color:"#475569",fontSize:"0.95rem",lineHeight:1.5},children:["Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a ",(0,e.jsx)("a",{href:"mailto:info@padelmedina.com",style:{color:"#2563EB"},children:"info@padelmedina.com"}),"."]}),this.state.error?.message&&(0,e.jsx)("pre",{style:{background:"#F1F5F9",color:"#475569",padding:"0.6rem 0.75rem",borderRadius:"0.5rem",fontSize:"0.75rem",textAlign:"left",overflowX:"auto",marginBottom:"1.25rem"},children:String(this.state.error.message).slice(0,280)}),(0,e.jsxs)("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"},children:[(0,e.jsx)("button",{onClick:this.handleReload,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"none",background:"#0F172A",color:"white",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Recargar página"}),(0,e.jsx)("button",{onClick:this.handleHome,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"1.5px solid #CBD5E1",background:"white",color:"#475569",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Volver al inicio"})]})]})}):this.props.children}},k="pwa_install_dismissed_at",ce=14;function de(){const[t,r]=(0,o.useState)(null),[i,a]=(0,o.useState)(!1),[n,l]=(0,o.useState)(!1);(0,o.useEffect)(()=>{if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===!0)return;const w=Number(localStorage.getItem(k)||0);if(w&&Date.now()-w<ce*864e5)return;const b=navigator.userAgent||"",d=/iphone|ipad|ipod/i.test(b)&&!/crios|fxios|edgios/i.test(b),m=/android/i.test(b);if(d){l(!0);const h=setTimeout(()=>a(!0),2500);return()=>clearTimeout(h)}const s=h=>{h.preventDefault(),r(h),m&&a(!0)},c=()=>{a(!1),localStorage.setItem(k,String(Date.now()))};return window.addEventListener("beforeinstallprompt",s),window.addEventListener("appinstalled",c),()=>{window.removeEventListener("beforeinstallprompt",s),window.removeEventListener("appinstalled",c)}},[]);const p=()=>{a(!1),localStorage.setItem(k,String(Date.now()))},g=async()=>{if(t){t.prompt();try{await t.userChoice}catch{}r(null),p()}};return i?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        @keyframes a2hs-up { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}),(0,e.jsxs)("div",{role:"dialog","aria-label":"Instalar aplicación",style:{position:"fixed",left:"50%",transform:"translateX(-50%)",bottom:"calc(72px + env(safe-area-inset-bottom) + 12px)",width:"calc(100% - 24px)",maxWidth:460,background:"#fff",border:"1px solid #E2E8F0",borderRadius:"1rem",boxShadow:"0 12px 40px rgba(15,23,42,0.18)",padding:"0.9rem 1rem",zIndex:200,display:"flex",alignItems:"center",gap:"0.85rem",animation:"a2hs-up 0.35s ease",boxSizing:"border-box"},children:[(0,e.jsx)("img",{src:"/favicon-192.png",alt:"Padel Medina",style:{width:46,height:46,borderRadius:"0.7rem",flexShrink:0}}),(0,e.jsxs)("div",{style:{flex:1,minWidth:0},children:[(0,e.jsx)("p",{style:{margin:"0 0 2px",fontWeight:800,color:"#0F172A",fontSize:"0.92rem"},children:"Instala Padel Medina"}),n?(0,e.jsxs)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:["Pulsa ",(0,e.jsx)("span",{style:{display:"inline-flex",verticalAlign:"middle"},children:(0,e.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"#1B3A6E",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M12 16V4"}),(0,e.jsx)("polyline",{points:"8 8 12 4 16 8"}),(0,e.jsx)("path",{d:"M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"})]})})," Compartir y luego ",(0,e.jsx)("strong",{children:'"Añadir a pantalla de inicio"'}),"."]}):(0,e.jsx)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:"Añádela a tu pantalla de inicio para abrirla como una app, sin navegador."})]}),!n&&(0,e.jsx)("button",{onClick:g,style:{flexShrink:0,background:"#16A34A",color:"#fff",border:"none",borderRadius:"0.6rem",fontWeight:700,fontSize:"0.85rem",padding:"0.6rem 0.95rem",cursor:"pointer",fontFamily:"inherit"},children:"Instalar"}),(0,e.jsx)("button",{onClick:p,"aria-label":"Cerrar",style:{flexShrink:0,background:"transparent",border:"none",color:"#94A3B8",cursor:"pointer",padding:4,lineHeight:0},children:(0,e.jsxs)("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",children:[(0,e.jsx)("line",{x1:"18",y1:"6",x2:"6",y2:"18"}),(0,e.jsx)("line",{x1:"6",y1:"6",x2:"18",y2:"18"})]})})]})]}):null}var pe=(0,o.lazy)(()=>x(()=>import("./BookingDashboard-Cfrvj0Ky.js"),__vite__mapDeps([0,1,2,3,4,5,6,7]))),ue=(0,o.lazy)(()=>x(()=>import("./MyBookings-C_jckBVv.js"),__vite__mapDeps([8,1,2,3,4,6,7]))),he=(0,o.lazy)(()=>x(()=>import("./Profile-DnaGPsBM.js"),__vite__mapDeps([9,1,2,3,4,6,7]))),me=(0,o.lazy)(()=>x(()=>import("./AdminDashboard-1p65Wwcs.js"),__vite__mapDeps([10,1,2,11,3,4,5,6,12,7]))),xe=(0,o.lazy)(()=>x(()=>import("./Login-BfcWCa-u.js"),__vite__mapDeps([13,1,2,3,14,4,6,15]))),ge=(0,o.lazy)(()=>x(()=>import("./PaymentGateway-C4uClI9D.js"),__vite__mapDeps([16,1,2,3,4,6,7]))),fe=(0,o.lazy)(()=>x(()=>import("./TournamentRegistration-BF6AW_s4.js"),__vite__mapDeps([17,1,2,3,4,6,12,7]))),ve=(0,o.lazy)(()=>x(()=>import("./TournamentBracket-DqC3Rxzm.js"),__vite__mapDeps([18,1,2,3,4,6]))),ye=(0,o.lazy)(()=>x(()=>import("./Cart-D3CGCksk.js"),__vite__mapDeps([19,1,2,4]))),be=(0,o.lazy)(()=>x(()=>import("./SharedPayment-_RgqCWBe.js"),__vite__mapDeps([20,1,2,3,4,6,7]))),we=(0,o.lazy)(()=>x(()=>import("./PrivacyPolicy-Cz9YzN14.js"),__vite__mapDeps([21,1,2,4,22,15]))),je=(0,o.lazy)(()=>x(()=>import("./LegalNotice-B_uxcWmf.js"),__vite__mapDeps([23,1,2,4,22,15]))),_e=(0,o.lazy)(()=>x(()=>import("./DeleteAccount-apmaVqaI.js"),__vite__mapDeps([24,1,2,4,22,15]))),Se=(0,o.lazy)(()=>x(()=>import("./Tournaments-CNMn2QmS.js"),__vite__mapDeps([25,1,2,3,4,6]))),Ie=(0,o.lazy)(()=>x(()=>import("./ResetPassword-D3vsXPqW.js"),__vite__mapDeps([26,1,2,3,4,6]))),ke=(0,o.lazy)(()=>x(()=>import("./MonitorView-7RppHupV.js"),__vite__mapDeps([27,1,2,3,4,6,7]))),Ae=()=>(0,e.jsxs)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid var(--color-bg-elevated)",borderTopColor:"var(--color-primary)",borderRadius:"50%",animation:"spin 1s linear infinite"}}),(0,e.jsx)("style",{children:"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"})]});function Ee(){const{user:t,loading:r}=ee(),[i,a]=(0,o.useState)(""),[n,l]=(0,o.useState)(!1),[p,g]=(0,o.useState)(!1),[w,b]=(0,o.useState)(!1);return(0,o.useEffect)(()=>{if(t?.role!=="admin")return;ae(f,t.id);const d=async(s,c)=>{await f.functions.invoke("send-push",{body:{title:s,body:c,url:"/admin"},headers:{apikey:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4OTQ2NDc4LCJleHAiOjIxMDQzMDY0Nzh9.Q2kFRLprwGpBHuQCRIBu0Oaa6ybQS-ngRxjUmwuCAxA"}})},m=f.channel("admin-push-channel").on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings"},()=>{d("Nueva reserva","Se ha realizado una nueva reserva")}).subscribe();return()=>{f.removeChannel(m)}},[t]),r?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:(0,e.jsx)("p",{style:{color:"var(--color-text-secondary)"},children:"Cargando..."})}):(0,e.jsxs)("div",{className:"app-container",children:[(0,e.jsx)(le,{children:(0,e.jsx)(o.Suspense,{fallback:(0,e.jsx)(Ae,{}),children:(0,e.jsxs)(Q,{children:[(0,e.jsx)(u,{path:"/login",element:t?(0,e.jsx)(I,{to:"/",replace:!0}):(0,e.jsx)(xe,{})}),(0,e.jsx)(u,{path:"/torneos/:id",element:(0,e.jsx)(fe,{})}),(0,e.jsx)(u,{path:"/torneos/:id/cuadro",element:(0,e.jsx)(ve,{})}),(0,e.jsx)(u,{path:"/pago-compartido",element:(0,e.jsx)(be,{})}),(0,e.jsx)(u,{path:"/privacidad",element:(0,e.jsx)(we,{})}),(0,e.jsx)(u,{path:"/aviso-legal",element:(0,e.jsx)(je,{})}),(0,e.jsx)(u,{path:"/eliminar-cuenta",element:(0,e.jsx)(_e,{})}),(0,e.jsx)(u,{path:"/reset-password",element:(0,e.jsx)(Ie,{})}),t?.role==="admin"&&(0,e.jsx)(u,{path:"/*",element:(0,e.jsx)(me,{})}),t?.role==="monitor"&&(0,e.jsx)(u,{path:"/*",element:(0,e.jsx)(ke,{})}),t?.role==="client"&&(0,e.jsx)(u,{path:"/checkout",element:(0,e.jsx)(ge,{})}),t?.role==="client"&&(0,e.jsxs)(u,{element:(0,e.jsx)(se,{}),children:[(0,e.jsx)(u,{path:"/",element:(0,e.jsx)(pe,{})}),(0,e.jsx)(u,{path:"/torneos",element:(0,e.jsx)(Se,{})}),(0,e.jsx)(u,{path:"/carrito",element:(0,e.jsx)(ye,{})}),(0,e.jsx)(u,{path:"/mis-reservas",element:(0,e.jsx)(ue,{})}),(0,e.jsx)(u,{path:"/perfil",element:(0,e.jsx)(he,{})}),(0,e.jsx)(u,{path:"*",element:(0,e.jsx)(I,{to:"/",replace:!0})})]}),!t&&(0,e.jsx)(u,{path:"*",element:(0,e.jsx)(I,{to:"/login",replace:!0})})]})})}),(0,e.jsx)(de,{})]})}var Ce="https://padelmedina.com/supabase",De="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4OTQ2NDc4LCJleHAiOjIxMDQzMDY0Nzh9.Q2kFRLprwGpBHuQCRIBu0Oaa6ybQS-ngRxjUmwuCAxA",D=0,F=!1,E=new Set,T=async()=>{try{const t=Date.now(),r=await fetch(`${Ce}/auth/v1/health`,{method:"GET",headers:{apikey:De}}),i=Date.now(),a=r.headers.get("Date");if(!a)return;const n=new Date(a).getTime();if(!Number.isFinite(n))return;D=n-(t+i)/2,F=!0,E.forEach(l=>{try{l()}catch{}})}catch(t){console.warn("syncServerTime failed:",t?.message||t)}},z=null,Pe=()=>{z||(T(),z=setInterval(T,1800*1e3))},C=()=>new Date(Date.now()+D),Fe=()=>Date.now()+D,We=()=>F,Be=()=>{const t=C();return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`},Ve=(t=3e4)=>{const[r,i]=(0,o.useState)(()=>C());return(0,o.useEffect)(()=>{const a=()=>i(C()),n=setInterval(a,t);return E.add(a),()=>{clearInterval(n),E.delete(a)}},[t]),r},He=t=>{const r=t instanceof Date?t:new Date(t),i=["dom","lun","mar","mié","jue","vie","sáb"],a=String(r.getDate()).padStart(2,"0"),n=String(r.getMonth()+1).padStart(2,"0"),l=String(r.getHours()).padStart(2,"0"),p=String(r.getMinutes()).padStart(2,"0");return`${i[r.getDay()]} ${a}/${n} · ${l}:${p}`},W="gps_nativo",Le="com.padelmedina.app";function Re(){try{new URLSearchParams(window.location.search).get("gpsnativo")==="1"&&localStorage.setItem(W,"1")}catch{}}function Ue(){if(!/android/i.test(navigator.userAgent||""))return!1;try{return localStorage.getItem(W)==="1"}catch{return!1}}function $e(){const t=`${window.location.origin}${window.location.pathname}?gpsnativo=1&firmar=1`,r=`intent://ubicacion#Intent;scheme=padelmedina;package=${Le};S.volver=${encodeURIComponent(t)};end`;return new Promise(i=>{let a=!1;const n=p=>{a||(a=!0,i(p))},l=()=>{document.visibilityState==="hidden"&&n(!0)};document.addEventListener("visibilitychange",l,{once:!0}),setTimeout(()=>{document.removeEventListener("visibilitychange",l),n(!1)},2500);try{window.location.href=r}catch{n(!1)}})}function Ye(){const t=new URLSearchParams(window.location.search),r=t.get("gps"),i=t.get("firmar")==="1";if(r===null&&!i)return null;t.delete("gps"),t.delete("firmar");const a=t.toString();try{window.history.replaceState(null,"",window.location.pathname+(a?`?${a}`:""))}catch{}if(!r)return{firmar:i,pos:null,error:null};if(r.startsWith("err:"))return{firmar:i,pos:null,error:r.slice(4)};const[n,l,p,g]=r.split(",").map(Number);return!Number.isFinite(n)||!Number.isFinite(l)?{firmar:i,pos:null,error:"formato"}:{firmar:i,pos:{lat:n,lng:l,precision_m:Number.isFinite(p)?p:null,captada:Number.isFinite(g)&&g>0?g:Date.now()},error:null}}Pe();Re();if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js").then(r=>{document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&r.update().catch(()=>{})})}).catch(console.warn);let t=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{t||(t=!0,window.location.reload())})}(0,G.createRoot)(document.getElementById("root")).render((0,e.jsx)(o.StrictMode,{children:(0,e.jsx)($,{children:(0,e.jsx)(Z,{children:(0,e.jsx)(ne,{children:(0,e.jsx)(Ee,{})})})})}));requestAnimationFrame(()=>{requestAnimationFrame(()=>{const t=document.getElementById("initial-loader");t&&(t.style.transition="opacity 0.15s",t.style.opacity="0",setTimeout(()=>t.remove(),150))})});export{We as a,Be as c,ee as d,X as f,He as i,Ve as l,Ye as n,C as o,$e as r,Fe as s,Ue as t,ie as u};
