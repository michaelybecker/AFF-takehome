import { handleStills } from '../server/stills.mjs';

// Vercel entry point: fail closed until a shared durable store/limiter is supplied.
export default function handler(req, res) { return handleStills(req, res); }
