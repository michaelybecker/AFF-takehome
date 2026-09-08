import type { CampaignMaster } from './data';
import type { MotionReference } from './provider';

export function animationSources(assets: Pick<CampaignMaster, 'id' | 'title' | 'src' | 'kind' | 'lineage'>[], curated: MotionReference[]) {
  const live = assets.filter(asset => asset.kind === 'still' && asset.lineage?.execution === 'live' && asset.lineage.jobId === asset.id);
  return [...live.map(asset => ({ id: asset.id, title: asset.title, src: asset.src, group: 'Project stills' })), ...curated]
    .filter((asset, index, all) => all.findIndex(other => other.id === asset.id || other.src === asset.src) === index);
}
