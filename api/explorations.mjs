import { handleExplorations } from '../server/explorations.mjs';
import { runWorkspace } from '../server/workspace.mjs';
export const config = { maxDuration: 300 };
export default function handler(req, res) { return runWorkspace(req, res, handleExplorations, {service:'explorations'}); }
