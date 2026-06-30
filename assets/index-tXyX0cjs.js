const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/BookingDashboard-bXQG-7Yf.js","assets/pdf-vendor-Dw8VLciX.js","assets/rolldown-runtime-km5iIlDX.js","assets/supabase-vendor-DzZbqjtm.js","assets/react-vendor-D1tGIDv5.js","assets/DateSelector-tE3x63gx.js","assets/supabase-BhMSj0Ru.js","assets/notify-CItuTaAk.js","assets/MyBookings-C-zg7uwE.js","assets/Profile-BXFFhK_4.js","assets/AdminDashboard-CSc0Uwl9.js","assets/vendor-drJjT9YC.js","assets/names-Ckfh9KDG.js","assets/Login-Ds7yzX3f.js","assets/utils-vendor-DdvYbYg2.js","assets/PaymentGateway-Hu8lbwbk.js","assets/TournamentRegistration-DAHoUV1p.js","assets/TournamentBracket-DvQ-hACj.js","assets/Cart-BGZW9FeW.js","assets/SharedPayment-CFxo6JZ-.js","assets/PrivacyPolicy-DqRiR-Cw.js","assets/Tournaments-CpXSRJuf.js","assets/ResetPassword-CNfUPP_n.js","assets/ShopLayout-pnmh0Ayb.js","assets/Tienda-5seIDC7I.js","assets/shopFormat-CHE7Ylrg.js","assets/ProductoDetalle-BYFEfTSp.js","assets/ShopCart-BDpVDVNt.js","assets/ShopCheckout-W7WaOb3q.js","assets/ShopOrderResult-C7lV7k7r.js"])))=>i.map(i=>d[i]);
import{r as B}from"./rolldown-runtime-km5iIlDX.js";import{a as W,c as F,f as H,i as k,n as U,o as p,p as $,r as K,s as q,t as G}from"./react-vendor-D1tGIDv5.js";import{a as h,i as C}from"./pdf-vendor-Dw8VLciX.js";import"./supabase-vendor-DzZbqjtm.js";import{t as f}from"./supabase-BhMSj0Ru.js";(function(){const a=document.createElement("link").relList;if(a&&a.supports&&a.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))d(r);new MutationObserver(r=>{for(const u of r)if(u.type==="childList")for(const x of u.addedNodes)x.tagName==="LINK"&&x.rel==="modulepreload"&&d(x)}).observe(document,{childList:!0,subtree:!0});function s(r){const u={};return r.integrity&&(u.integrity=r.integrity),r.referrerPolicy&&(u.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?u.credentials="include":r.crossOrigin==="anonymous"?u.credentials="omit":u.credentials="same-origin",u}function d(r){if(r.ep)return;r.ep=!0;const u=s(r);fetch(r.href,u)}})();var X=H(),n=B($(),1),e=G(),O=(0,n.createContext)(),Y=["admin@padelmedina.com"],I=(t,a)=>({id:t.id,email:t.email,name:t.user_metadata?.name||t.email.split("@")[0],role:a||(Y.includes(t.email)?"admin":"client")}),J=async t=>{try{const a=new AbortController,s=setTimeout(()=>a.abort(),2500),{data:d}=await f.from("profiles").select("role").eq("id",t).abortSignal(a.signal).maybeSingle();return clearTimeout(s),d?.role||null}catch{return null}};function Z({children:t}){const[a,s]=(0,n.useState)(null),[d,r]=(0,n.useState)(!0);(0,n.useEffect)(()=>{let o=!1;const l=g=>{if(!g){o||s(null);return}o||s(I(g,null)),J(g.id).then(b=>{o||!b||s(_=>_&&_.id===g.id?I(g,b):_)})},m=setTimeout(()=>{o||r(!1)},5e3);f.auth.getSession().then(({data:{session:g}})=>{clearTimeout(m);const b=g?.user;l(b?.email_confirmed_at?b:null),o||r(!1)}).catch(()=>{clearTimeout(m),o||(s(null),r(!1))});const{data:{subscription:j}}=f.auth.onAuthStateChange((g,b)=>{if(g==="INITIAL_SESSION")return;const _=b?.user;if(_&&!_.email_confirmed_at){o||s(null);return}l(_||null)});return()=>{o=!0,clearTimeout(m),j.unsubscribe()}},[]);const u=async()=>{await f.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})},x=async(o,l)=>{const{error:m}=await f.auth.signInWithPassword({email:o,password:l});if(m)throw m},v=async(o,l,m,j)=>{const{error:g}=await f.auth.signUp({email:o,password:l,options:{data:{name:m||"",phone:j||""},emailRedirectTo:window.location.origin}});if(g)throw g},y=async(o,l)=>{const{error:m}=await f.auth.verifyOtp({email:o,token:l,type:"signup"});if(m)throw m},w=async o=>{const{error:l}=await f.auth.resetPasswordForEmail(o,{redirectTo:`${window.location.origin}/reset-password`});if(l)throw l},i=async o=>{const{error:l}=await f.auth.updateUser({password:o});if(l)throw l},c=async()=>{await f.auth.signOut(),s(null)};return d?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC"},children:(0,e.jsxs)("div",{style:{textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid #DCFCE7",borderTopColor:"#16A34A",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}),(0,e.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"}),(0,e.jsx)("p",{style:{color:"#94A3B8",fontWeight:600,margin:0},children:"Cargando..."})]})}):(0,e.jsx)(O.Provider,{value:{user:a,loginWithGoogle:u,loginWithPassword:x,signupWithEmail:v,verifySignupOtp:y,resetPassword:w,updatePassword:i,logout:c,loading:d},children:t})}var Q=()=>(0,n.useContext)(O),ee="BPkGxuT7mSIsUrU2X2rOuyRWZCSBZorYr5ZfIaMmrmdQrXTQRAEX15k9v3JQ4Zfcad5Oq13Q5ThPRkCVcgPKAgU";function te(t){const a=(t+"=".repeat((4-t.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"),s=atob(a);return Uint8Array.from(s,d=>d.charCodeAt(0))}async function re(t,a){if(!("serviceWorker"in navigator)||!("PushManager"in window)||Notification.permission==="denied")return null;try{const s=await navigator.serviceWorker.register("/sw.js",{scope:"/"}),d=await s.pushManager.getSubscription();if(d&&await d.unsubscribe(),await Notification.requestPermission()!=="granted")return null;const r=await s.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:te(ee)}),u=r.toJSON();return await t.from("push_subscriptions").upsert({user_id:a,endpoint:u.endpoint,subscription:u},{onConflict:"endpoint"}),r}catch(s){return console.warn("Push subscription error:",s),null}}var z=(0,n.createContext)(),P="padelmedina_cart",E=300*1e3,T=(t,a)=>t.addedAt?a-t.addedAt>=E:!1,ae=({children:t})=>{const[a,s]=(0,n.useState)(()=>{try{const i=localStorage.getItem(P),c=i?JSON.parse(i):[],o=Date.now();return c.map(l=>l.addedAt?l:{...l,addedAt:o}).filter(l=>!T(l,o))}catch{return[]}}),[,d]=(0,n.useState)(0);(0,n.useEffect)(()=>{try{localStorage.setItem(P,JSON.stringify(a))}catch{}},[a]),(0,n.useEffect)(()=>{const i=setInterval(()=>{const c=Date.now();s(o=>{const l=o.filter(m=>!T(m,c));return l.length===o.length?o:l}),d(o=>(o+1)%1e3)},1e3);return()=>clearInterval(i)},[]);const r=i=>`${i.courtId}-${i.date}-${i.timeSlot}`,u=i=>{s(c=>{const o=r(i);return c.some(l=>l.cartId===o)?c:[...c,{...i,cartId:o,addedAt:Date.now()}]})},x=i=>{s(c=>c.filter(o=>o.cartId!==i))},v=()=>s([]),y=a.reduce((i,c)=>i+(Number(c.price)||0),0),w=i=>i?.addedAt?Math.max(0,i.addedAt+E-Date.now()):E;return(0,e.jsx)(z.Provider,{value:{items:a,addItem:u,removeItem:x,clearCart:v,total:y,count:a.length,getRemainingMs:w},children:t})},ne=()=>{const t=(0,n.useContext)(z);if(!t)throw new Error("useCart must be used within CartProvider");return t},oe=()=>{const t=F(),{count:a}=ne(),s=r=>t.pathname===r,d=[{path:"/",label:"Reservas",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),(0,e.jsx)("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),(0,e.jsx)("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),(0,e.jsx)("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]})},{path:"/torneos",label:"Torneos",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6"}),(0,e.jsx)("path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18"}),(0,e.jsx)("path",{d:"M4 22h16"}),(0,e.jsx)("path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"}),(0,e.jsx)("path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"}),(0,e.jsx)("path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2z"})]})},{path:"/carrito",label:"Carrito",badge:a,icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("circle",{cx:"9",cy:"21",r:"1"}),(0,e.jsx)("circle",{cx:"20",cy:"21",r:"1"}),(0,e.jsx)("path",{d:"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"})]})},{path:"/tienda",label:"Tienda",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M3 9l1.5-5h15L21 9"}),(0,e.jsx)("path",{d:"M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"}),(0,e.jsx)("path",{d:"M9 22V12h6v10"})]})},{path:"/mis-reservas",label:"Mis Reservas",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),(0,e.jsx)("polyline",{points:"14 2 14 8 20 8"}),(0,e.jsx)("line",{x1:"16",y1:"13",x2:"8",y2:"13"}),(0,e.jsx)("line",{x1:"16",y1:"17",x2:"8",y2:"17"})]})},{path:"/perfil",label:"Perfil",icon:r=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:r?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}),(0,e.jsx)("circle",{cx:"12",cy:"7",r:"4"})]})}];return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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

        .main-content {
          padding-top: calc(56px + env(safe-area-inset-top));
          padding-bottom: 0;
        }

        /* ── Bottom nav ── */
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
          .top-header {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 0 0 1rem 1rem;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
          .bottom-nav {
            max-width: 480px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 1rem 1rem 0 0;
            border-left: 1px solid rgba(226,232,240,0.8);
            border-right: 1px solid rgba(226,232,240,0.8);
          }
        }
      `}),(0,e.jsxs)("div",{className:"main-layout",children:[(0,e.jsx)("header",{className:"top-header",children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",className:"top-header-logo-img"})}),(0,e.jsxs)("main",{className:"main-content",children:[(0,e.jsx)(W,{}),(0,e.jsxs)("footer",{style:{textAlign:"center",padding:"1rem 1rem 0.5rem",color:"var(--color-text-muted)",fontSize:"0.7rem",fontWeight:500},children:["© ",new Date().getFullYear()," Dimana STUDIO"]})]}),(0,e.jsx)("nav",{className:"bottom-nav",children:d.map(({path:r,label:u,icon:x,badge:v})=>{const y=s(r);return(0,e.jsxs)(K,{to:r,className:`nav-link ${y?"nav-link-active":"nav-link-inactive"}`,children:[y&&(0,e.jsx)("span",{className:"nav-active-pill"}),(0,e.jsxs)("span",{className:"nav-icon-wrap",children:[x(y),v>0&&(0,e.jsx)("span",{className:"nav-badge",children:v>99?"99+":v})]}),(0,e.jsx)("span",{className:"nav-label",children:u})]},r)})})]})]})},ie=class extends n.Component{constructor(t){super(t),C(this,"handleReload",()=>{window.location.reload()}),C(this,"handleHome",()=>{window.location.href="/"}),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,a){console.error("UI ErrorBoundary caught:",t,a)}render(){return this.state.hasError?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC",padding:"1.5rem"},children:(0,e.jsxs)("div",{style:{background:"white",borderRadius:"1.25rem",boxShadow:"0 20px 50px rgba(0,0,0,0.08)",maxWidth:"460px",width:"100%",padding:"2rem",textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"64px",height:"64px",borderRadius:"50%",backgroundColor:"#FEE2E2",color:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",fontSize:"1.8rem",fontWeight:800},children:"!"}),(0,e.jsx)("h1",{style:{margin:"0 0 0.5rem",fontSize:"1.4rem",fontWeight:900,color:"#0F172A"},children:"Algo no fue bien"}),(0,e.jsxs)("p",{style:{margin:"0 0 1.5rem",color:"#475569",fontSize:"0.95rem",lineHeight:1.5},children:["Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a ",(0,e.jsx)("a",{href:"mailto:info@padelmedina.com",style:{color:"#2563EB"},children:"info@padelmedina.com"}),"."]}),this.state.error?.message&&(0,e.jsx)("pre",{style:{background:"#F1F5F9",color:"#475569",padding:"0.6rem 0.75rem",borderRadius:"0.5rem",fontSize:"0.75rem",textAlign:"left",overflowX:"auto",marginBottom:"1.25rem"},children:String(this.state.error.message).slice(0,280)}),(0,e.jsxs)("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"},children:[(0,e.jsx)("button",{onClick:this.handleReload,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"none",background:"#0F172A",color:"white",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Recargar página"}),(0,e.jsx)("button",{onClick:this.handleHome,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"1.5px solid #CBD5E1",background:"white",color:"#475569",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Volver al inicio"})]})]})}):this.props.children}},se=(0,n.lazy)(()=>h(()=>import("./BookingDashboard-bXQG-7Yf.js"),__vite__mapDeps([0,1,2,3,4,5,6,7]))),le=(0,n.lazy)(()=>h(()=>import("./MyBookings-C-zg7uwE.js"),__vite__mapDeps([8,1,2,3,4,6,7]))),ce=(0,n.lazy)(()=>h(()=>import("./Profile-BXFFhK_4.js"),__vite__mapDeps([9,1,2,3,4,6]))),de=(0,n.lazy)(()=>h(()=>import("./AdminDashboard-CSc0Uwl9.js"),__vite__mapDeps([10,1,2,11,3,4,5,6,12,7]))),ue=(0,n.lazy)(()=>h(()=>import("./Login-Ds7yzX3f.js"),__vite__mapDeps([13,1,2,3,14,4,6]))),pe=(0,n.lazy)(()=>h(()=>import("./PaymentGateway-Hu8lbwbk.js"),__vite__mapDeps([15,1,2,3,4,6,7]))),he=(0,n.lazy)(()=>h(()=>import("./TournamentRegistration-DAHoUV1p.js"),__vite__mapDeps([16,1,2,3,4,6,12,7]))),me=(0,n.lazy)(()=>h(()=>import("./TournamentBracket-DvQ-hACj.js"),__vite__mapDeps([17,1,2,3,4,6]))),xe=(0,n.lazy)(()=>h(()=>import("./Cart-BGZW9FeW.js"),__vite__mapDeps([18,1,2,4]))),ge=(0,n.lazy)(()=>h(()=>import("./SharedPayment-CFxo6JZ-.js"),__vite__mapDeps([19,1,2,3,4,6,7]))),fe=(0,n.lazy)(()=>h(()=>import("./PrivacyPolicy-DqRiR-Cw.js"),__vite__mapDeps([20,1,2,4]))),ve=(0,n.lazy)(()=>h(()=>import("./Tournaments-CpXSRJuf.js"),__vite__mapDeps([21,1,2,3,4,6]))),ye=(0,n.lazy)(()=>h(()=>import("./ResetPassword-CNfUPP_n.js"),__vite__mapDeps([22,1,2,3,4,6]))),be=(0,n.lazy)(()=>h(()=>import("./ShopLayout-pnmh0Ayb.js"),__vite__mapDeps([23,1,2,4]))),je=(0,n.lazy)(()=>h(()=>import("./Tienda-5seIDC7I.js"),__vite__mapDeps([24,1,2,3,4,6,25]))),_e=(0,n.lazy)(()=>h(()=>import("./ProductoDetalle-BYFEfTSp.js"),__vite__mapDeps([26,1,2,3,4,6,7,25]))),we=(0,n.lazy)(()=>h(()=>import("./ShopCart-BDpVDVNt.js"),__vite__mapDeps([27,1,2,3,4,6,25]))),ke=(0,n.lazy)(()=>h(()=>import("./ShopCheckout-W7WaOb3q.js"),__vite__mapDeps([28,1,2,3,4,6,7,25]))),Ee=(0,n.lazy)(()=>h(()=>import("./ShopOrderResult-C7lV7k7r.js"),__vite__mapDeps([29,1,2,3,4,6,25]))),Se=()=>(0,e.jsxs)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid var(--color-bg-elevated)",borderTopColor:"var(--color-primary)",borderRadius:"50%",animation:"spin 1s linear infinite"}}),(0,e.jsx)("style",{children:"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"})]});function Ae(){const{user:t,loading:a}=Q(),[s,d]=(0,n.useState)(""),[r,u]=(0,n.useState)(!1),[x,v]=(0,n.useState)(!1),[y,w]=(0,n.useState)(!1);return(0,n.useEffect)(()=>{if(t?.role!=="admin")return;re(f,t.id);const i=async(o,l)=>{await f.functions.invoke("send-push",{body:{title:o,body:l,url:"/admin"},headers:{apikey:"sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ"}})},c=f.channel("admin-push-channel").on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings"},()=>{i("Nueva reserva","Se ha realizado una nueva reserva")}).subscribe();return()=>{f.removeChannel(c)}},[t]),a?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:(0,e.jsx)("p",{style:{color:"var(--color-text-secondary)"},children:"Cargando..."})}):(0,e.jsx)("div",{className:"app-container",children:(0,e.jsx)(ie,{children:(0,e.jsx)(n.Suspense,{fallback:(0,e.jsx)(Se,{}),children:(0,e.jsxs)(q,{children:[(0,e.jsx)(p,{path:"/login",element:t?(0,e.jsx)(k,{to:"/",replace:!0}):(0,e.jsx)(ue,{})}),(0,e.jsx)(p,{path:"/torneos/:id",element:(0,e.jsx)(he,{})}),(0,e.jsx)(p,{path:"/torneos/:id/cuadro",element:(0,e.jsx)(me,{})}),(0,e.jsx)(p,{path:"/pago-compartido",element:(0,e.jsx)(ge,{})}),(0,e.jsx)(p,{path:"/privacidad",element:(0,e.jsx)(fe,{})}),(0,e.jsx)(p,{path:"/reset-password",element:(0,e.jsx)(ye,{})}),(0,e.jsxs)(p,{element:(0,e.jsx)(be,{}),children:[(0,e.jsx)(p,{path:"/tienda",element:(0,e.jsx)(je,{})}),(0,e.jsx)(p,{path:"/tienda/carrito",element:(0,e.jsx)(we,{})}),(0,e.jsx)(p,{path:"/tienda/checkout",element:(0,e.jsx)(ke,{})}),(0,e.jsx)(p,{path:"/tienda/pedido/:numero",element:(0,e.jsx)(Ee,{})}),(0,e.jsx)(p,{path:"/tienda/:slug",element:(0,e.jsx)(_e,{})})]}),t?.role==="admin"&&(0,e.jsx)(p,{path:"/*",element:(0,e.jsx)(de,{})}),t?.role==="client"&&(0,e.jsx)(p,{path:"/checkout",element:(0,e.jsx)(pe,{})}),t?.role==="client"&&(0,e.jsxs)(p,{element:(0,e.jsx)(oe,{}),children:[(0,e.jsx)(p,{path:"/",element:(0,e.jsx)(se,{})}),(0,e.jsx)(p,{path:"/torneos",element:(0,e.jsx)(ve,{})}),(0,e.jsx)(p,{path:"/carrito",element:(0,e.jsx)(xe,{})}),(0,e.jsx)(p,{path:"/mis-reservas",element:(0,e.jsx)(le,{})}),(0,e.jsx)(p,{path:"/perfil",element:(0,e.jsx)(ce,{})}),(0,e.jsx)(p,{path:"*",element:(0,e.jsx)(k,{to:"/",replace:!0})})]}),!t&&(0,e.jsx)(p,{path:"*",element:(0,e.jsx)(k,{to:"/login",replace:!0})})]})})})})}var L="padelmedina_shop_cart",N=(0,n.createContext)(null),Ce=(t,a)=>`${t}:${a||"-"}`;function Ie({children:t}){const[a,s]=(0,n.useState)(()=>{try{const i=localStorage.getItem(L),c=i?JSON.parse(i):[];return Array.isArray(c)?c.filter(o=>o&&o.productId):[]}catch{return[]}});(0,n.useEffect)(()=>{try{localStorage.setItem(L,JSON.stringify(a))}catch{}},[a]);const d=(0,n.useCallback)((i,c=1)=>{const o=Ce(i.productId,i.variantId);s(l=>{const m=l.find(g=>g.key===o),j=i.stock??1/0;if(m){const g=Math.min(j,m.cantidad+c);return l.map(b=>b.key===o?{...b,...i,key:o,cantidad:g}:b)}return[...l,{...i,key:o,cantidad:Math.min(j,Math.max(1,c))}]})},[]),r=(0,n.useCallback)((i,c)=>{s(o=>o.flatMap(l=>{if(l.key!==i)return[l];const m=l.stock??1/0,j=Math.min(m,Math.max(0,c));return j<=0?[]:[{...l,cantidad:j}]}))},[]),u=(0,n.useCallback)(i=>s(c=>c.filter(o=>o.key!==i)),[]),x=(0,n.useCallback)(()=>s([]),[]),v=(0,n.useMemo)(()=>a.reduce((i,c)=>i+c.cantidad,0),[a]),y=(0,n.useMemo)(()=>a.reduce((i,c)=>i+(c.precioCentimos||0)*c.cantidad,0),[a]),w=(0,n.useMemo)(()=>({items:a,addItem:d,setQty:r,removeItem:u,clear:x,count:v,subtotalCentimos:y}),[a,d,r,u,x,v,y]);return(0,e.jsx)(N.Provider,{value:w,children:t})}function Ne(){const t=(0,n.useContext)(N);if(!t)throw new Error("useProductCart debe usarse dentro de ProductCartProvider");return t}var Pe="https://iquibawtbpamhaottlbr.supabase.co",Te="sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ",A=0,V=!1,S=new Set,R=async()=>{try{const t=Date.now(),a=await fetch(`${Pe}/rest/v1/`,{method:"HEAD",headers:{apikey:Te}}),s=Date.now(),d=a.headers.get("Date");if(!d)return;const r=new Date(d).getTime();if(!Number.isFinite(r))return;A=r-(t+s)/2,V=!0,S.forEach(u=>{try{u()}catch{}})}catch(t){console.warn("syncServerTime failed:",t?.message||t)}},D=null,Le=()=>{D||(R(),D=setInterval(R,1800*1e3))},M=()=>new Date(Date.now()+A),Ve=()=>Date.now()+A,Be=()=>V,We=(t=3e4)=>{const[a,s]=(0,n.useState)(()=>M());return(0,n.useEffect)(()=>{const d=()=>s(M()),r=setInterval(d,t);return S.add(d),()=>{clearInterval(r),S.delete(d)}},[t]),a},Fe=t=>{const a=t instanceof Date?t:new Date(t),s=["dom","lun","mar","mié","jue","vie","sáb"],d=String(a.getDate()).padStart(2,"0"),r=String(a.getMonth()+1).padStart(2,"0"),u=String(a.getHours()).padStart(2,"0"),x=String(a.getMinutes()).padStart(2,"0");return`${s[a.getDay()]} ${d}/${r} · ${u}:${x}`};Le();if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js").then(a=>{document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&a.update().catch(()=>{})})}).catch(console.warn);let t=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{t||(t=!0,window.location.reload())})}(0,X.createRoot)(document.getElementById("root")).render((0,e.jsx)(n.StrictMode,{children:(0,e.jsx)(U,{children:(0,e.jsx)(Z,{children:(0,e.jsx)(ae,{children:(0,e.jsx)(Ie,{children:(0,e.jsx)(Ae,{})})})})})}));requestAnimationFrame(()=>{requestAnimationFrame(()=>{const t=document.getElementById("initial-loader");t&&(t.style.transition="opacity 0.15s",t.style.opacity="0",setTimeout(()=>t.remove(),150))})});export{Ne as a,We as i,Be as n,ne as o,Ve as r,Q as s,Fe as t};
