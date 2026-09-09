import { lazy, Suspense, useEffect, useState } from 'react';
import { initializeWorkspace } from './workspaceSync';
const App = lazy(() => import('./App'));
export default function WorkspaceGate(){
  const [ready,setReady]=useState(false),[message,setMessage]=useState('Connecting to shared workspace...');
  async function connect(){try{await initializeWorkspace();setReady(true);setMessage('Workspace ready');}catch(e){setMessage(e instanceof Error?e.message:'Workspace unavailable.');}}
  useEffect(()=>{void connect();},[]);
  if(!ready)return <main className="load-state"><h1>Generative Pipeline</h1><p>{message}</p><button className="button secondary" onClick={()=>void connect()}>Retry connection</button></main>;
  return <><Suspense fallback={<p>Opening workspace...</p>}><App/></Suspense><div role="status" style={{position:'fixed',bottom:4,left:12,zIndex:1000,fontSize:12,color:'#aaa',background:'#181818',padding:'3px 8px',maxWidth:'80vw'}}>{message}</div></>;
}
