// Browser workspace choices never write to shared Blob storage.
// Existing project definitions can be read once for backward compatibility.
const keys = ['content-studio-missions-v1', 'gik-custom-placements-v1'];
export async function initializeWorkspace() {
  const response = await fetch('/api/workspace', {cache:'no-store'});
  const data = await response.json();
  if(!response.ok)throw Error(data.message || 'Shared workspace unavailable.');
  for(const key of keys) {
    if(!localStorage.getItem(key) && typeof data.values?.[key]==='string')localStorage.setItem(key,data.values[key]);
  }
}
// Used only by explicit Save brief / Create placement actions, on this device.
export function saveWorkspaceValue(key:string,value:string) {
  localStorage.setItem(key,value);
}
