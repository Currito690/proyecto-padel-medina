const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/BookingDashboard-BjXgWJya.js","assets/pdf-vendor-CcZKRWo-.js","assets/rolldown-runtime-km5iIlDX.js","assets/supabase-vendor-DzZbqjtm.js","assets/react-vendor-5-kJuc0W.js","assets/DateSelector-Bx9M1nrC.js","assets/CartContext-_wneAiMp.js","assets/supabase-BhMSj0Ru.js","assets/notify-l23V2ymZ.js","assets/MyBookings-OJun0ob3.js","assets/Profile-ov3Yp0PI.js","assets/AdminDashboard-BJGANqk3.js","assets/vendor-VW-dUZNH.js","assets/names-IBx_Uwol.js","assets/Login-Bk2gE69v.js","assets/utils-vendor-DP0mq0mv.js","assets/PaymentGateway--uxOgyTv.js","assets/TournamentRegistration-CrTQA0SB.js","assets/TournamentBracket-bVDV7KQT.js","assets/Cart-CzPAzQXL.js","assets/SharedPayment-B1aobzB0.js","assets/PrivacyPolicy-7aBprHkx.js","assets/Tournaments-Brwr4mWP.js","assets/ResetPassword-h68fgt3C.js","assets/ShopLayout-DRV57GpJ.js","assets/Tienda-C1VBzkBm.js","assets/shopFormat-Cmm6Evsg.js","assets/ProductoDetalle-BObsh7-y.js","assets/ShopCart-BfocZUrS.js","assets/ShopCheckout-BZ87V3bg.js","assets/ShopOrderResult-BKe4vIBG.js","assets/MonitorView-6w1LsBUk.js"])))=>i.map(i=>d[i]);
import{r as z}from"./rolldown-runtime-km5iIlDX.js";import{a as N,c as V,f as W,i as S,n as B,o as d,p as F,r as H,s as U,t as K}from"./react-vendor-5-kJuc0W.js";import{a as m,i as A}from"./pdf-vendor-CcZKRWo-.js";import"./supabase-vendor-DzZbqjtm.js";import{t as g}from"./supabase-BhMSj0Ru.js";import{n as $,t as q}from"./CartContext-_wneAiMp.js";(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const l of i)if(l.type==="childList")for(const x of l.addedNodes)x.tagName==="LINK"&&x.rel==="modulepreload"&&a(x)}).observe(document,{childList:!0,subtree:!0});function s(i){const l={};return i.integrity&&(l.integrity=i.integrity),i.referrerPolicy&&(l.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?l.credentials="include":i.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function a(i){if(i.ep)return;i.ep=!0;const l=s(i);fetch(i.href,l)}})();var X=W(),r=z(F(),1),e=K(),M=(0,r.createContext)(),Y=["admin@padelmedina.com"],G=["lolo@padelmedina.com"],C=(t,n)=>({id:t.id,email:t.email,name:t.user_metadata?.name||t.email.split("@")[0],role:G.includes(t.email)?"monitor":n||(Y.includes(t.email)?"admin":"client")}),Z=async t=>{try{const n=new AbortController,s=setTimeout(()=>n.abort(),2500),{data:a}=await g.from("profiles").select("role").eq("id",t).abortSignal(n.signal).maybeSingle();return clearTimeout(s),a?.role||null}catch{return null}};function J({children:t}){const[n,s]=(0,r.useState)(null),[a,i]=(0,r.useState)(!0);(0,r.useEffect)(()=>{let o=!1;const c=f=>{if(!f){o||s(null);return}o||s(C(f,null)),Z(f.id).then(y=>{o||!y||s(_=>_&&_.id===f.id?C(f,y):_)})},u=setTimeout(()=>{o||i(!1)},5e3);g.auth.getSession().then(({data:{session:f}})=>{clearTimeout(u);const y=f?.user;c(y?.email_confirmed_at?y:null),o||i(!1)}).catch(()=>{clearTimeout(u),o||(s(null),i(!1))});const{data:{subscription:b}}=g.auth.onAuthStateChange((f,y)=>{if(f==="INITIAL_SESSION")return;const _=y?.user;if(_&&!_.email_confirmed_at){o||s(null);return}c(_||null)});return()=>{o=!0,clearTimeout(u),b.unsubscribe()}},[]);const l=async()=>{await g.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}})},x=async(o,c)=>{const{error:u}=await g.auth.signInWithPassword({email:o,password:c});if(u)throw u},v=async(o,c,u,b)=>{const{error:f}=await g.auth.signUp({email:o,password:c,options:{data:{name:u||"",phone:b||""},emailRedirectTo:window.location.origin}});if(f)throw f},j=async(o,c)=>{const{error:u}=await g.auth.verifyOtp({email:o,token:c,type:"signup"});if(u)throw u},w=async o=>{const{error:c}=await g.auth.resetPasswordForEmail(o,{redirectTo:`${window.location.origin}/reset-password`});if(c)throw c},p=async o=>{const{error:c}=await g.auth.updateUser({password:o});if(c)throw c},h=async()=>{await g.auth.signOut(),s(null)};return a?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC"},children:(0,e.jsxs)("div",{style:{textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid #DCFCE7",borderTopColor:"#16A34A",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 1rem"}}),(0,e.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"}),(0,e.jsx)("p",{style:{color:"#94A3B8",fontWeight:600,margin:0},children:"Cargando..."})]})}):(0,e.jsx)(M.Provider,{value:{user:n,loginWithGoogle:l,loginWithPassword:x,signupWithEmail:v,verifySignupOtp:j,resetPassword:w,updatePassword:p,logout:h,loading:a},children:t})}var Q=()=>(0,r.useContext)(M),ee="BPkGxuT7mSIsUrU2X2rOuyRWZCSBZorYr5ZfIaMmrmdQrXTQRAEX15k9v3JQ4Zfcad5Oq13Q5ThPRkCVcgPKAgU";function te(t){const n=(t+"=".repeat((4-t.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/"),s=atob(n);return Uint8Array.from(s,a=>a.charCodeAt(0))}async function re(t,n){if(!("serviceWorker"in navigator)||!("PushManager"in window)||Notification.permission==="denied")return null;try{const s=await navigator.serviceWorker.register("/sw.js",{scope:"/"}),a=await s.pushManager.getSubscription();if(a&&await a.unsubscribe(),await Notification.requestPermission()!=="granted")return null;const i=await s.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:te(ee)}),l=i.toJSON();return await t.from("push_subscriptions").upsert({user_id:n,endpoint:l.endpoint,subscription:l},{onConflict:"endpoint"}),i}catch(s){return console.warn("Push subscription error:",s),null}}function ae(){const t=V(),{count:n}=$(),s=a=>a==="/tienda"?t.pathname.startsWith("/tienda"):t.pathname===a;return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsx)("nav",{className:"bottom-nav",children:[{path:"/",label:"Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),(0,e.jsx)("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),(0,e.jsx)("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),(0,e.jsx)("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]})},{path:"/torneos",label:"Torneos",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6"}),(0,e.jsx)("path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18"}),(0,e.jsx)("path",{d:"M4 22h16"}),(0,e.jsx)("path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"}),(0,e.jsx)("path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"}),(0,e.jsx)("path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2z"})]})},{path:"/carrito",label:"Carrito",badge:n,icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("circle",{cx:"9",cy:"21",r:"1"}),(0,e.jsx)("circle",{cx:"20",cy:"21",r:"1"}),(0,e.jsx)("path",{d:"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"})]})},{path:"/tienda",label:"Tienda",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M3 9l1.5-5h15L21 9"}),(0,e.jsx)("path",{d:"M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"}),(0,e.jsx)("path",{d:"M9 22V12h6v10"})]})},{path:"/mis-reservas",label:"Mis Reservas",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"}),(0,e.jsx)("polyline",{points:"14 2 14 8 20 8"}),(0,e.jsx)("line",{x1:"16",y1:"13",x2:"8",y2:"13"}),(0,e.jsx)("line",{x1:"16",y1:"17",x2:"8",y2:"17"})]})},{path:"/perfil",label:"Perfil",icon:a=>(0,e.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:a?2.5:2,strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"}),(0,e.jsx)("circle",{cx:"12",cy:"7",r:"4"})]})}].map(({path:a,label:i,icon:l,badge:x})=>{const v=s(a);return(0,e.jsxs)(H,{to:a,className:`nav-link ${v?"nav-link-active":"nav-link-inactive"}`,children:[v&&(0,e.jsx)("span",{className:"nav-active-pill"}),(0,e.jsxs)("span",{className:"nav-icon-wrap",children:[l(v),x>0&&(0,e.jsx)("span",{className:"nav-badge",children:x>99?"99+":x})]}),(0,e.jsx)("span",{className:"nav-label",children:i})]},a)})})]})}var ne=()=>(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
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
      `}),(0,e.jsxs)("div",{className:"main-layout",children:[(0,e.jsx)("header",{className:"top-header",children:(0,e.jsx)("img",{src:"/logo.png",alt:"Padel Medina",className:"top-header-logo-img"})}),(0,e.jsxs)("main",{className:"main-content",children:[(0,e.jsx)(N,{}),(0,e.jsxs)("footer",{style:{textAlign:"center",padding:"1rem 1rem 0.5rem",color:"var(--color-text-muted)",fontSize:"0.7rem",fontWeight:500},children:["© ",new Date().getFullYear()," Dimana STUDIO"]})]}),(0,e.jsx)(ae,{})]})]}),ie=class extends r.Component{constructor(t){super(t),A(this,"handleReload",()=>{window.location.reload()}),A(this,"handleHome",()=>{window.location.href="/"}),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,n){console.error("UI ErrorBoundary caught:",t,n)}render(){return this.state.hasError?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC",padding:"1.5rem"},children:(0,e.jsxs)("div",{style:{background:"white",borderRadius:"1.25rem",boxShadow:"0 20px 50px rgba(0,0,0,0.08)",maxWidth:"460px",width:"100%",padding:"2rem",textAlign:"center"},children:[(0,e.jsx)("div",{style:{width:"64px",height:"64px",borderRadius:"50%",backgroundColor:"#FEE2E2",color:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",fontSize:"1.8rem",fontWeight:800},children:"!"}),(0,e.jsx)("h1",{style:{margin:"0 0 0.5rem",fontSize:"1.4rem",fontWeight:900,color:"#0F172A"},children:"Algo no fue bien"}),(0,e.jsxs)("p",{style:{margin:"0 0 1.5rem",color:"#475569",fontSize:"0.95rem",lineHeight:1.5},children:["Hubo un error al mostrar esta pantalla. Recarga la página y vuelve a intentarlo. Si vuelve a pasar, escríbenos a ",(0,e.jsx)("a",{href:"mailto:info@padelmedina.com",style:{color:"#2563EB"},children:"info@padelmedina.com"}),"."]}),this.state.error?.message&&(0,e.jsx)("pre",{style:{background:"#F1F5F9",color:"#475569",padding:"0.6rem 0.75rem",borderRadius:"0.5rem",fontSize:"0.75rem",textAlign:"left",overflowX:"auto",marginBottom:"1.25rem"},children:String(this.state.error.message).slice(0,280)}),(0,e.jsxs)("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"},children:[(0,e.jsx)("button",{onClick:this.handleReload,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"none",background:"#0F172A",color:"white",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Recargar página"}),(0,e.jsx)("button",{onClick:this.handleHome,style:{padding:"0.7rem 1.25rem",borderRadius:"0.55rem",border:"1.5px solid #CBD5E1",background:"white",color:"#475569",fontWeight:800,fontSize:"0.9rem",cursor:"pointer"},children:"Volver al inicio"})]})]})}):this.props.children}},k="pwa_install_dismissed_at",oe=14;function se(){const[t,n]=(0,r.useState)(null),[s,a]=(0,r.useState)(!1),[i,l]=(0,r.useState)(!1);(0,r.useEffect)(()=>{if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===!0)return;const j=Number(localStorage.getItem(k)||0);if(j&&Date.now()-j<oe*864e5)return;const w=navigator.userAgent||"",p=/iphone|ipad|ipod/i.test(w)&&!/crios|fxios|edgios/i.test(w),h=/android/i.test(w);if(p){l(!0);const u=setTimeout(()=>a(!0),2500);return()=>clearTimeout(u)}const o=u=>{u.preventDefault(),n(u),h&&a(!0)},c=()=>{a(!1),localStorage.setItem(k,String(Date.now()))};return window.addEventListener("beforeinstallprompt",o),window.addEventListener("appinstalled",c),()=>{window.removeEventListener("beforeinstallprompt",o),window.removeEventListener("appinstalled",c)}},[]);const x=()=>{a(!1),localStorage.setItem(k,String(Date.now()))},v=async()=>{if(t){t.prompt();try{await t.userChoice}catch{}n(null),x()}};return s?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)("style",{children:`
        @keyframes a2hs-up { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}),(0,e.jsxs)("div",{role:"dialog","aria-label":"Instalar aplicación",style:{position:"fixed",left:"50%",transform:"translateX(-50%)",bottom:"calc(72px + env(safe-area-inset-bottom) + 12px)",width:"calc(100% - 24px)",maxWidth:460,background:"#fff",border:"1px solid #E2E8F0",borderRadius:"1rem",boxShadow:"0 12px 40px rgba(15,23,42,0.18)",padding:"0.9rem 1rem",zIndex:200,display:"flex",alignItems:"center",gap:"0.85rem",animation:"a2hs-up 0.35s ease",boxSizing:"border-box"},children:[(0,e.jsx)("img",{src:"/favicon-192.png",alt:"Padel Medina",style:{width:46,height:46,borderRadius:"0.7rem",flexShrink:0}}),(0,e.jsxs)("div",{style:{flex:1,minWidth:0},children:[(0,e.jsx)("p",{style:{margin:"0 0 2px",fontWeight:800,color:"#0F172A",fontSize:"0.92rem"},children:"Instala Padel Medina"}),i?(0,e.jsxs)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:["Pulsa ",(0,e.jsx)("span",{style:{display:"inline-flex",verticalAlign:"middle"},children:(0,e.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"#1B3A6E",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,e.jsx)("path",{d:"M12 16V4"}),(0,e.jsx)("polyline",{points:"8 8 12 4 16 8"}),(0,e.jsx)("path",{d:"M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"})]})})," Compartir y luego ",(0,e.jsx)("strong",{children:'"Añadir a pantalla de inicio"'}),"."]}):(0,e.jsx)("p",{style:{margin:0,fontSize:"0.78rem",color:"#475569",lineHeight:1.45},children:"Añádela a tu pantalla de inicio para abrirla como una app, sin navegador."})]}),!i&&(0,e.jsx)("button",{onClick:v,style:{flexShrink:0,background:"#16A34A",color:"#fff",border:"none",borderRadius:"0.6rem",fontWeight:700,fontSize:"0.85rem",padding:"0.6rem 0.95rem",cursor:"pointer",fontFamily:"inherit"},children:"Instalar"}),(0,e.jsx)("button",{onClick:x,"aria-label":"Cerrar",style:{flexShrink:0,background:"transparent",border:"none",color:"#94A3B8",cursor:"pointer",padding:4,lineHeight:0},children:(0,e.jsxs)("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",children:[(0,e.jsx)("line",{x1:"18",y1:"6",x2:"6",y2:"18"}),(0,e.jsx)("line",{x1:"6",y1:"6",x2:"18",y2:"18"})]})})]})]}):null}var le=(0,r.lazy)(()=>m(()=>import("./BookingDashboard-BjXgWJya.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8]))),ce=(0,r.lazy)(()=>m(()=>import("./MyBookings-OJun0ob3.js"),__vite__mapDeps([9,1,2,3,4,7,8]))),de=(0,r.lazy)(()=>m(()=>import("./Profile-ov3Yp0PI.js"),__vite__mapDeps([10,1,2,3,4,7]))),pe=(0,r.lazy)(()=>m(()=>import("./AdminDashboard-BJGANqk3.js"),__vite__mapDeps([11,1,2,12,3,4,5,7,13,8]))),ue=(0,r.lazy)(()=>m(()=>import("./Login-Bk2gE69v.js"),__vite__mapDeps([14,1,2,3,15,4,7]))),he=(0,r.lazy)(()=>m(()=>import("./PaymentGateway--uxOgyTv.js"),__vite__mapDeps([16,1,2,3,4,6,7,8]))),me=(0,r.lazy)(()=>m(()=>import("./TournamentRegistration-CrTQA0SB.js"),__vite__mapDeps([17,1,2,3,4,7,13,8]))),xe=(0,r.lazy)(()=>m(()=>import("./TournamentBracket-bVDV7KQT.js"),__vite__mapDeps([18,1,2,3,4,7]))),fe=(0,r.lazy)(()=>m(()=>import("./Cart-CzPAzQXL.js"),__vite__mapDeps([19,1,2,4,6]))),ge=(0,r.lazy)(()=>m(()=>import("./SharedPayment-B1aobzB0.js"),__vite__mapDeps([20,1,2,3,4,7,8]))),ve=(0,r.lazy)(()=>m(()=>import("./PrivacyPolicy-7aBprHkx.js"),__vite__mapDeps([21,1,2,4]))),ye=(0,r.lazy)(()=>m(()=>import("./Tournaments-Brwr4mWP.js"),__vite__mapDeps([22,1,2,3,4,7]))),be=(0,r.lazy)(()=>m(()=>import("./ResetPassword-h68fgt3C.js"),__vite__mapDeps([23,1,2,3,4,7]))),je=(0,r.lazy)(()=>m(()=>import("./ShopLayout-DRV57GpJ.js"),__vite__mapDeps([24,1,2,4,6]))),we=(0,r.lazy)(()=>m(()=>import("./Tienda-C1VBzkBm.js"),__vite__mapDeps([25,1,2,3,4,7,26]))),_e=(0,r.lazy)(()=>m(()=>import("./ProductoDetalle-BObsh7-y.js"),__vite__mapDeps([27,1,2,3,4,7,8,26]))),Se=(0,r.lazy)(()=>m(()=>import("./ShopCart-BfocZUrS.js"),__vite__mapDeps([28,1,2,3,4,7,26]))),ke=(0,r.lazy)(()=>m(()=>import("./ShopCheckout-BZ87V3bg.js"),__vite__mapDeps([29,1,2,3,4,7,8,26]))),Ee=(0,r.lazy)(()=>m(()=>import("./ShopOrderResult-BKe4vIBG.js"),__vite__mapDeps([30,1,2,3,4,7,26]))),Ie=(0,r.lazy)(()=>m(()=>import("./MonitorView-6w1LsBUk.js"),__vite__mapDeps([31,2,3,4,1,7]))),Ae=()=>(0,e.jsxs)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,e.jsx)("div",{style:{width:"40px",height:"40px",border:"3px solid var(--color-bg-elevated)",borderTopColor:"var(--color-primary)",borderRadius:"50%",animation:"spin 1s linear infinite"}}),(0,e.jsx)("style",{children:"@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }"})]});function Ce(){const{user:t,loading:n}=Q(),[s,a]=(0,r.useState)(""),[i,l]=(0,r.useState)(!1),[x,v]=(0,r.useState)(!1),[j,w]=(0,r.useState)(!1);return(0,r.useEffect)(()=>{if(t?.role!=="admin")return;re(g,t.id);const p=async(o,c)=>{await g.functions.invoke("send-push",{body:{title:o,body:c,url:"/admin"},headers:{apikey:"sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ"}})},h=g.channel("admin-push-channel").on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings"},()=>{p("Nueva reserva","Se ha realizado una nueva reserva")}).subscribe();return()=>{g.removeChannel(h)}},[t]),n?(0,e.jsx)("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"},children:(0,e.jsx)("p",{style:{color:"var(--color-text-secondary)"},children:"Cargando..."})}):(0,e.jsxs)("div",{className:"app-container",children:[(0,e.jsx)(ie,{children:(0,e.jsx)(r.Suspense,{fallback:(0,e.jsx)(Ae,{}),children:(0,e.jsxs)(U,{children:[(0,e.jsx)(d,{path:"/login",element:t?(0,e.jsx)(S,{to:"/",replace:!0}):(0,e.jsx)(ue,{})}),(0,e.jsx)(d,{path:"/torneos/:id",element:(0,e.jsx)(me,{})}),(0,e.jsx)(d,{path:"/torneos/:id/cuadro",element:(0,e.jsx)(xe,{})}),(0,e.jsx)(d,{path:"/pago-compartido",element:(0,e.jsx)(ge,{})}),(0,e.jsx)(d,{path:"/privacidad",element:(0,e.jsx)(ve,{})}),(0,e.jsx)(d,{path:"/reset-password",element:(0,e.jsx)(be,{})}),(0,e.jsxs)(d,{element:(0,e.jsx)(je,{}),children:[(0,e.jsx)(d,{path:"/tienda",element:(0,e.jsx)(we,{})}),(0,e.jsx)(d,{path:"/tienda/carrito",element:(0,e.jsx)(Se,{})}),(0,e.jsx)(d,{path:"/tienda/checkout",element:(0,e.jsx)(ke,{})}),(0,e.jsx)(d,{path:"/tienda/pedido/:numero",element:(0,e.jsx)(Ee,{})}),(0,e.jsx)(d,{path:"/tienda/:slug",element:(0,e.jsx)(_e,{})})]}),t?.role==="admin"&&(0,e.jsx)(d,{path:"/*",element:(0,e.jsx)(pe,{})}),t?.role==="monitor"&&(0,e.jsx)(d,{path:"/*",element:(0,e.jsx)(Ie,{})}),t?.role==="client"&&(0,e.jsx)(d,{path:"/checkout",element:(0,e.jsx)(he,{})}),t?.role==="client"&&(0,e.jsxs)(d,{element:(0,e.jsx)(ne,{}),children:[(0,e.jsx)(d,{path:"/",element:(0,e.jsx)(le,{})}),(0,e.jsx)(d,{path:"/torneos",element:(0,e.jsx)(ye,{})}),(0,e.jsx)(d,{path:"/carrito",element:(0,e.jsx)(fe,{})}),(0,e.jsx)(d,{path:"/mis-reservas",element:(0,e.jsx)(ce,{})}),(0,e.jsx)(d,{path:"/perfil",element:(0,e.jsx)(de,{})}),(0,e.jsx)(d,{path:"*",element:(0,e.jsx)(S,{to:"/",replace:!0})})]}),!t&&(0,e.jsx)(d,{path:"*",element:(0,e.jsx)(S,{to:"/login",replace:!0})})]})})}),(0,e.jsx)(se,{})]})}var P="padelmedina_shop_cart",R=(0,r.createContext)(null),Pe=(t,n)=>`${t}:${n||"-"}`;function Le({children:t}){const[n,s]=(0,r.useState)(()=>{try{const p=localStorage.getItem(P),h=p?JSON.parse(p):[];return Array.isArray(h)?h.filter(o=>o&&o.productId):[]}catch{return[]}});(0,r.useEffect)(()=>{try{localStorage.setItem(P,JSON.stringify(n))}catch{}},[n]);const a=(0,r.useCallback)((p,h=1)=>{const o=Pe(p.productId,p.variantId);s(c=>{const u=c.find(f=>f.key===o),b=p.stock??1/0;if(u){const f=Math.min(b,u.cantidad+h);return c.map(y=>y.key===o?{...y,...p,key:o,cantidad:f}:y)}return[...c,{...p,key:o,cantidad:Math.min(b,Math.max(1,h))}]})},[]),i=(0,r.useCallback)((p,h)=>{s(o=>o.flatMap(c=>{if(c.key!==p)return[c];const u=c.stock??1/0,b=Math.min(u,Math.max(0,h));return b<=0?[]:[{...c,cantidad:b}]}))},[]),l=(0,r.useCallback)(p=>s(h=>h.filter(o=>o.key!==p)),[]),x=(0,r.useCallback)(()=>s([]),[]),v=(0,r.useMemo)(()=>n.reduce((p,h)=>p+h.cantidad,0),[n]),j=(0,r.useMemo)(()=>n.reduce((p,h)=>p+(h.precioCentimos||0)*h.cantidad,0),[n]),w=(0,r.useMemo)(()=>({items:n,addItem:a,setQty:i,removeItem:l,clear:x,count:v,subtotalCentimos:j}),[n,a,i,l,x,v,j]);return(0,e.jsx)(R.Provider,{value:w,children:t})}function Be(){const t=(0,r.useContext)(R);if(!t)throw new Error("useProductCart debe usarse dentro de ProductCartProvider");return t}var Te="https://iquibawtbpamhaottlbr.supabase.co",De="sb_publishable_09M_gTKlTnc6z6ANBuK55w_Gry94doZ",I=0,O=!1,E=new Set,L=async()=>{try{const t=Date.now(),n=await fetch(`${Te}/rest/v1/`,{method:"HEAD",headers:{apikey:De}}),s=Date.now(),a=n.headers.get("Date");if(!a)return;const i=new Date(a).getTime();if(!Number.isFinite(i))return;I=i-(t+s)/2,O=!0,E.forEach(l=>{try{l()}catch{}})}catch(t){console.warn("syncServerTime failed:",t?.message||t)}},T=null,Me=()=>{T||(L(),T=setInterval(L,1800*1e3))},D=()=>new Date(Date.now()+I),Fe=()=>Date.now()+I,He=()=>O,Ue=(t=3e4)=>{const[n,s]=(0,r.useState)(()=>D());return(0,r.useEffect)(()=>{const a=()=>s(D()),i=setInterval(a,t);return E.add(a),()=>{clearInterval(i),E.delete(a)}},[t]),n},Ke=t=>{const n=t instanceof Date?t:new Date(t),s=["dom","lun","mar","mié","jue","vie","sáb"],a=String(n.getDate()).padStart(2,"0"),i=String(n.getMonth()+1).padStart(2,"0"),l=String(n.getHours()).padStart(2,"0"),x=String(n.getMinutes()).padStart(2,"0");return`${s[n.getDay()]} ${a}/${i} · ${l}:${x}`};Me();if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js").then(n=>{document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&n.update().catch(()=>{})})}).catch(console.warn);let t=!1;navigator.serviceWorker.addEventListener("controllerchange",()=>{t||(t=!0,window.location.reload())})}(0,X.createRoot)(document.getElementById("root")).render((0,e.jsx)(r.StrictMode,{children:(0,e.jsx)(B,{children:(0,e.jsx)(J,{children:(0,e.jsx)(q,{children:(0,e.jsx)(Le,{children:(0,e.jsx)(Ce,{})})})})})}));requestAnimationFrame(()=>{requestAnimationFrame(()=>{const t=document.getElementById("initial-loader");t&&(t.style.transition="opacity 0.15s",t.style.opacity="0",setTimeout(()=>t.remove(),150))})});export{Ue as a,Q as c,Fe as i,He as n,Be as o,D as r,ae as s,Ke as t};
