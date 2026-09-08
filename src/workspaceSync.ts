const keys = ['content-studio-missions-v1', 'gik-custom-placements-v1'];
let revision = 0, ready = false, saving = false, timer: ReturnType<typeof setTimeout>;
let pending: Record<string,string> = {};
let conflict = false, localOnly = false;
let shared: Record<string,string> = {};
const status = (message: string) => window.dispatchEvent(new CustomEvent('workspace-sync', {detail: message}));
export async function initializeWorkspace() {
  const response = await fetch('/api/workspace', {cache:'no-store'});
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {mode:'local',revision:0,values:{}};
  if(!response.ok) throw Error(data.message || 'Shared workspace unavailable.');
  revision=data.revision;
  localOnly=data.mode==='local';
  shared={...data.values};
  const original: Record<string,string> = {};
  for(const key of keys) {const local=localStorage.getItem(key);if(local)original[key]=local;}
  // Keep an untouched browser backup before adopting the shared state.
  if(Object.keys(original).length&&!localStorage.getItem('gik-pre-cloud-backup'))localStorage.setItem('gik-pre-cloud-backup',JSON.stringify(original));
  for(const key of keys)if(typeof data.values[key]==='string')localStorage.setItem(key,data.values[key]);
  ready=true;
  if(!localOnly){pending=Object.fromEntries(Object.entries(original).filter(([key])=>!(key in data.values)));await flush();}
  status('Saved to shared workspace');
}
export function saveWorkspaceValue(key:string,value:string) {
  localStorage.setItem(key,value);
  if(!ready||!keys.includes(key)||localOnly||shared[key]===value)return;
  pending[key]=value;status('Saving to shared workspace…');clearTimeout(timer);timer=setTimeout(()=>void flush(),600);
}
async function flush() {
  if(saving||conflict||!Object.keys(pending).length)return;
  saving=true;const values={...pending};
  try {
    const response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Content-Studio':'1'},body:JSON.stringify({revision,values})});
    const data=await response.json();
    if(data.conflict){conflict=true;throw Error('Workspace changed elsewhere. Your edits remain on this device; reload to review the shared version.');}
    if(!response.ok)throw Error(data.message||'Shared save unavailable.');
    revision=data.revision;shared={...shared,...values};
    for(const [key,value]of Object.entries(values))if(pending[key]===value)delete pending[key];
    status('Saved to shared workspace');
  } catch(error) {status(error instanceof Error?error.message:'Shared save unavailable.');}
  finally{saving=false;if(!conflict&&Object.keys(pending).length)timer=setTimeout(()=>void flush(),4000);}
}
window.addEventListener('beforeunload',event=>{if(Object.keys(pending).length){event.preventDefault();}});
window.addEventListener('online',()=>void flush());
export function beginWorkspacePolling(){return setInterval(async()=>{
  if(localOnly||saving||Object.keys(pending).length||conflict)return;
  try{const r=await fetch('/api/workspace',{cache:'no-store'});if(!r.ok)return;const data=await r.json();if(data.revision!==revision){conflict=true;status('Workspace updated in another session. Reload to use the latest version.');}}catch{/* Next poll retries without overwriting local work. */}
},20000);}
