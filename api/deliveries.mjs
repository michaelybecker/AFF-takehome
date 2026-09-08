import { handleDeliveries } from '../server/deliveries.mjs';
import { runWorkspace } from '../server/workspace.mjs';
export const config = { maxDuration: 300 };
export default function handler(req, res) { return runWorkspace(req, res, handleDeliveries, {service:'deliveries'}); }
