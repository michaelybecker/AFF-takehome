import type { GenerationRequest } from './provider';
export const identityWorkspaceId = 'identity-iron-man-mark-iii';
export const anniversaryId = 'iron-man-20th-2028';
export const missionStorageKey = 'content-studio-missions-v1';
export const deletedProjectsKey = 'content-studio-deleted-projects-v1';
export const placements = [
  { id: 'A01', name: 'Theatrical anniversary poster', kind: 'still', ratio: '2:3', value: 2 / 3 },
  { id: 'A02', name: 'Social-feed still', kind: 'still', ratio: '4:5', value: 4 / 5 },
  { id: 'A03', name: 'Vertical motion poster', kind: 'motion', ratio: '9:16', value: 9 / 16 },
  { id: 'A04', name: 'Exhibitor-screen creative', kind: 'motion', ratio: '16:9', value: 16 / 9 },
] as const;
export type PlacementFraming = { fit: 'contain' | 'cover'; focalX: number; focalY: number };
export type Draft = {
  placementFraming?: Record<string, PlacementFraming>;
  version: 2; kind: 'still' | 'motion'; stillId: string; motionId: string; animationSourceId?: string; adaptSourceId?: string;
  stillDirection: string; motionDirection: string; duration: number; placementId: string;
  headline: string; supporting: string; cta: string; fit: 'contain' | 'cover'; focalX: number; focalY: number; graphics: boolean;
};
export type Mission = {
  id: string; title: string; occasion: string; summary: string; audience: string;
  objective: string; market: string; owner: string; message: string; constraints: string;
  draft: Draft; briefs?: GenerationRequest[];
};
export type MissionState = { version: 1; selectedId: string; missions: Mission[] };
export const defaults: Draft = {
  version: 2, kind: 'still', stillId: '', motionId: '', duration: 6, placementId: 'A01',
  stillDirection: 'Mark III armor portrait with sculptural studio lighting, faithful red and gold plates and a circular chest reactor. A confident, restrained pose on a dark neutral background. Compose in 16:9 with open negative space. No text or logos in the generated image.',
  motionDirection: 'One continuous shot with a restrained camera push toward the armor. Subtle movement and controlled metallic reflections. Preserve helmet shape, circular reactor and panel relationships. No suit transformation, cuts, text or logos.',
  headline: 'Back where it began.', supporting: 'Celebrating 20 years. Returning to theaters.', cta: 'Returning to theaters',
  fit: 'contain', focalX: 50, focalY: 50, graphics: true,
};
export const anniversary: Mission = {
  id: anniversaryId, title: 'Iron Man - 20th Anniversary', occasion: '2028 theatrical return',
  summary: 'New commemorative imagery for the return of Iron Man to the big screen.',
  audience: 'Returning fans and first-time theatrical audiences', objective: 'Celebrate 20 years. Renew theatrical interest.',
  market: 'United States / English', owner: 'Theatrical marketing / Marvel Studios creative and brand review',
  message: 'Return to where it began, on the big screen',
  constraints: 'Hypothetical limited theatrical return in 2028 of the 2008 film; not an announced rerelease. Primary audience: fans connected to the original film. Secondary: Marvel fans who have never experienced it theatrically. Objective: awareness and ticket consideration. Find showtimes only at the hypothetical booking stage. Do not invent a booking link, release date, restoration, premium format, bonus footage or measured results. New commemorative key art and a cinematic key shot, not new narrative footage. Logos, title, credits and anniversary typography remain separate reviewed layers. Additional markets and localization are expansion scope.',
  draft: defaults,
};
export function newMission(): Mission {
  return { id: `mission-${crypto.randomUUID()}`, title: '', occasion: '', summary: '', audience: '', objective: '', market: 'United States / English', owner: '', message: '', constraints: '',
    draft: { ...defaults, stillDirection: 'IMK3GIK Mark III armor, faithful red and gold plates and circular arc reactor. Clean image with no text or logos.', headline: '', supporting: '', cta: '' } };
}
function cleanDraft(value: unknown): Draft {
  const next = { ...defaults };
  if (!value || typeof value !== 'object') return next;
  const saved = value as Record<string, unknown>;
  // Restore explicit brief text only. Shot selection and framing are session-only.
  for (const key of ['stillDirection', 'motionDirection', 'headline', 'supporting', 'cta'] as const) {
    if (typeof saved[key] === 'string') next[key] = saved[key].slice(0, key.endsWith('Direction') ? 1500 : key.endsWith('Id') ? 200 : 100);
  }
  if (next.stillDirection === 'Commemorative Mark III armor portrait with sculptural studio lighting, faithful red and gold plates and a circular chest reactor. A confident, restrained pose on a dark neutral background. Compose in 16:9 with space for separate anniversary typography. No text or logos in the generated image.') next.stillDirection = defaults.stillDirection;
  return next;
}
export function initialMissions(): MissionState {
  const initial: MissionState = { version: 1, selectedId: anniversaryId, missions: [{ ...anniversary, draft: { ...defaults } }] };
  try {
    const deleted = new Set<string>(JSON.parse(localStorage.getItem(deletedProjectsKey) || '[]'));
    const saved = JSON.parse(localStorage.getItem(missionStorageKey) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.missions)) {
      const seen = new Set<string>();
      const missions: Mission[] = [];
      for (const item of saved.missions.slice(0, 50)) {
        if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || seen.has(item.id) || deleted.has(item.id)) continue;
        const mission = { ...anniversary, id: item.id, draft: cleanDraft(item.draft) };
        for (const key of ['title', 'occasion', 'summary', 'audience', 'objective', 'market', 'owner', 'message', 'constraints'] as const) {
          if (typeof item[key] === 'string') mission[key] = item[key].slice(0, key === 'constraints' ? 2000 : 500);
        }
        if (!mission.title.trim()) continue;
        if (Array.isArray(item.briefs)) mission.briefs = item.briefs.filter((brief: GenerationRequest) => brief && brief.campaignId === item.id && typeof brief.id === 'string' && typeof brief.direction === 'string' && typeof brief.createdAt === 'string' && ['still', 'motion'].includes(brief.outputKind) && ['create', 'animate', 'deliver', 'adapt'].includes(brief.mode)).slice(-50);
        seen.add(item.id); missions.push(mission);
      }
      if (!seen.has(anniversaryId) && !deleted.has(anniversaryId)) missions.unshift(initial.missions[0]);
      if (!missions.length) missions.push({ ...newMission(), title: 'Untitled project' });
      return { version: 1, selectedId: missions[0].id, missions };
    }
    const legacy = JSON.parse(localStorage.getItem('content-studio-anniversary-draft-v2') || 'null');
    if (legacy?.version === 2) initial.missions[0].draft = cleanDraft(legacy);
  } catch { /* Keep the intact anniversary brief when browser storage is unavailable. */ }
  return initial;
}

export function identityWorkspace(): Mission { return { ...anniversary, id: identityWorkspaceId, title: 'Iron Man / Mark III', occasion: '', summary: 'Explore stills and motion from the Mark III identity.', audience: '', objective: '', market: '', owner: '', message: '', constraints: 'Preserve the Mark III identity. Project-specific campaign direction applies only when explicitly requested.', draft: { ...defaults, headline: '', supporting: '', cta: '' } }; }
