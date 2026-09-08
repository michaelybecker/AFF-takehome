import { handleAssistant } from '../server/assistant.mjs';

// Hosted execution fails closed until hosted authentication and shared limits exist.
export default function handler(req, res) { return handleAssistant(req, res); }
