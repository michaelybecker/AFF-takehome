import { handleMotion } from '../server/motion.mjs';
import { runWorkspace } from '../server/workspace.mjs';
export const config = { maxDuration: 300 };
export default function handler(req, res) { return runWorkspace(req, res, handleMotion, {service:'motion'}); }
