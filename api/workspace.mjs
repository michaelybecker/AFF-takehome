import { runWorkspace } from '../server/workspace.mjs';
export default function handler(req, res) { return runWorkspace(req, res, null); }
