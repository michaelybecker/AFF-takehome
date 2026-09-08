import { loadEnv } from 'vite';
import { mkdir, cp, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { migrateWorkspace, readSnapshot } from '../server/workspace-store.mjs';
import { accessCode } from '../server/workspace.mjs';
const env=loadEnv('development',process.cwd(),'');
if(!env.BLOB_READ_WRITE_TOKEN)throw Error('Configure BLOB_READ_WRITE_TOKEN first.');
const root=path.resolve('.local-data');
await mkdir(root,{recursive:true});
for(const folder of ['stills','motion','deliveries'])await mkdir(path.join(root,folder),{recursive:true});
for(const [file,value]of [['stills/jobs.json',{jobs:[]}],['motion/jobs.json',{jobs:[]}],['explorations.json',{entries:[],removed:[]}]]){
  try{await access(path.join(root,file));}catch{await writeFile(path.join(root,file),JSON.stringify(value),{flag:'wx'});}
}
const existing=await readSnapshot(env);
if(existing){await writeFile(path.join(root,'workspace-access.txt'),accessCode(env)+'\n',{mode:0o600}); console.log('Shared workspace verified:',{records:Object.keys(existing.value.records).length,media:Object.keys(existing.value.files).length,removed:existing.value.records['explorations.json']?.removed.length});process.exit(0);}
const backup=path.join(root,'migration-backup-'+Date.now());await mkdir(backup,{recursive:true});
for(const name of ['stills/jobs.json','motion/jobs.json','explorations.json','deliveries'])await cp(path.join(root,name),path.join(backup,name),{recursive:true});
const result=await migrateWorkspace(env,root);
const verified=await readSnapshot(env);
if(!verified || Object.keys(verified.value.files).length!==result.media)throw Error('Migration verification failed');
await writeFile(path.join(root,'workspace-access.txt'),accessCode(env)+'\n',{mode:0o600});
await writeFile(path.join(root,'migration-report.json'),JSON.stringify({at:new Date().toISOString(),...result,removed:verified.value.records['explorations.json']?.removed||[]},null,2));
console.log('Migration verified:',result,'Access code saved privately to .local-data/workspace-access.txt.');
