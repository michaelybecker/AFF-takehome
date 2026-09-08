import { handleAssistant } from '../server/assistant.mjs';
import { runWorkspace } from '../server/workspace.mjs';
export const config = { maxDuration: 300 };
export default function handler(req, res) { return runWorkspace(req, res, handleAssistant, {service:'assistant'}); }
