import { checkConnection } from '../../server/runcomfy.mjs';

export default function handler(req, res) {
  return checkConnection(req, res);
}
