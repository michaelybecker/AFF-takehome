import { lazy, Suspense, useEffect, useState } from 'react';
import { initializeWorkspace, beginWorkspacePolling } from './workspaceSync';
const App = lazy(() => import('./App'));
export default function WorkspaceGate(){
  const [ready,setReady]=useState(false),[message,setMessage]=useState('Connecting to shared workspaceâ€¦'),[access,setAccess]=useState(false),[token,setToken]=useState('');
  async function connect(code?:string){try{await initializeWorkspace(code);setReady(true);setAccess(false);setMessage('Workspace ready');}catch(e){setMessage(e instanceof Error?e.message:'Workspace unavailable.');setAccess(!!(e as {authorizationRequired?:boolean}).authorizationRequired||code!==undefined);}}
  useEffect(()=>{void connect();},[]);
  useEffect(()=>{if(!ready)return;const timer=beginWorkspacePolling();const update=(e:Event)=>setMessage((e as CustomEvent<string>).detail);window.addEventListener('workspace-sync',update);return()=>{clearInterval(timer);window.removeEventListener('workspace-sync',update);};},[ready]);
  if(!ready)return <main className="load-state"><h1>Generative Identity Kit</h1><p>{message}</p>{access&&<form onSubmit={e=>{e.preventDefault();void connect(token);}}><label>Workspace access code <input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="current-password" /></label><button className="button primary">Open workspace</button></form>}{!access&&<button className="button secondary" onClick={()=>void connect()}>Retry connection</button>}</main>;
  return <><Suspense fallback={<p>Opening workspace…</p>}><App/></Suspense><div role="status" style={{position:'fixed',bottom:4,left:12,zIndex:1000,fontSize:12,color:'#aaa',background:'#181818',padding:'3px 8px',maxWidth:'80vw'}}>{message}</div></>;
}
