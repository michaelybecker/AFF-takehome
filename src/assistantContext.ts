type Message = { role: 'user' | 'assistant'; content: string };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const pick = (value: RecordValue, fields: string[]) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export function assistantPayload(raw: RecordValue, history: Message[], attachedId?: string) {
  const context = structuredClone(raw);
  const identity = record(context.identity);
  const sources = record(identity.sourceCollection);
  identity.sourceCollection = { ...pick(sources, ['version', 'trigger', 'scope', 'holdouts', 'portability']), imageCount: list(sources.items).length };
  identity.canonicalCoverage = { frames: list(record(identity.canonicalCoverage).frames).length, passes: list(record(identity.canonicalCoverage).passes).length };
  identity.sampleResults = list(identity.sampleResults).map(item => pick(item, ['id', 'title', 'kind', 'selectedForShowcase']));
  context.identity = identity;
  const assets = list(context.availableAssets);
  const selected = new Set([attachedId, ...Object.values(record(context.selectedMasterIds))].filter(Boolean));
  context.focusedAssets = assets.filter(asset => selected.has(asset.id as string)).map(asset => pick(asset, ['id', 'title', 'kind', 'prompt', 'reviewNotes', 'lineage']));
  context.availableAssets = assets.map(asset => pick(asset, ['id', 'title', 'kind', 'prepared']));
  const capabilities = record(context.capabilities);
  for (const kind of ['still', 'motion']) {
    const value = record(capabilities[kind]);
    capabilities[kind] = { ...pick(value, ['available', 'authorized', 'message', 'activeJob', 'methods', 'maxDuration', 'maxReferenceImages']), curatedReferences: list(value.curatedReferences).map(ref => pick(ref, ['id', 'title', 'group'])) };
  }
  context.capabilities = capabilities;
  // Preserve the newest request. Bound older turns to the server's per-message limit.
  const messages = history.slice(-24).map(message => ({ ...message, content: message.content.slice(0, 6000) }));
  const limit = 60 * 1024;
  const payload = { context, messages };
  while (bytes(payload) > limit && messages.length > 1) messages.shift();
  // Very large libraries are summarized, prioritizing the explicitly focused assets.
  if (bytes(payload) > limit) {
    context.catalogNotice = 'Background catalogs shortened to fit context. Focused assets and latest request retained.';
    identity.sourceCollection = pick(sources, ['version', 'trigger']);
    delete identity.stillTrainingRuns;
    for (const key of ['expression', 'creativeCanon', 'sampleResults']) identity[key] = list(identity[key]).slice(0, 12);
    context.availableAssets = list(context.availableAssets).filter(asset => selected.has(asset.id as string)).concat(list(context.availableAssets).filter(asset => !selected.has(asset.id as string)).slice(0, 20));
    context.pendingProposals = list(context.pendingProposals).slice(-2);
    context.executionReceipts = list(context.executionReceipts).slice(-3);
    context.missions = list(context.missions).slice(0, 10);
    for (const kind of ['still', 'motion']) record(capabilities[kind]).curatedReferences = list(record(capabilities[kind]).curatedReferences).slice(0, 12);
  }
  // Unbounded provenance is not needed to identify or reason about a focused shot.
  if (bytes(payload) > limit) context.focusedAssets = list(context.focusedAssets).map(asset => ({...pick(asset, ['id', 'title', 'kind']), prompt: String(asset.prompt || '').slice(0, 1500), reviewNotes: String(asset.reviewNotes || '').slice(0, 1000)}));
  return payload;
}
