import { handleMotion } from '../server/motion.mjs';

// Hosted execution remains disabled until authentication and shared durable limits exist.
export default function handler(req, res) { return handleMotion(req, res); }
