import { JevBrain } from '../core/router.js';
import { AgentWarden } from '../core/warden.js';

/**
 * Universal Express / Connect / Fastify Middleware
 * Triages incoming webhooks, agent inputs, or API payloads in < 1ms.
 *
 * Usage:
 *   import { jevMiddleware } from 'jev-brain';
 *   app.use(jevMiddleware({ preset: 'inbox', warden: true }));
 *
 * @param {object} options
 * @returns {function} Express/Connect middleware
 */
export function jevMiddleware(options = {}) {
  const brain = options.brain || new JevBrain(options);
  const warden = options.warden ? (options.wardenInstance || new AgentWarden(options)) : null;
  const extractText = options.extractText || (req => req.body?.text || req.body?.prompt || req.body?.message || '');
  const blockRisky = options.blockRisky !== false;

  return async function (req, res, next) {
    try {
      const text = extractText(req);

      // 1. Run local decision triage (<1ms)
      if (text && typeof text === 'string') {
        const triage = await brain.route(text, options.labels);
        req.jev = {
          action: triage.action,
          confidence: triage.confidence,
          label: triage.label,
          latencyMs: triage.latencyMs,
          triage
        };
      }

      // 2. Pre-flight Agent Warden firewall on incoming commands
      if (warden && req.body && typeof req.body === 'object') {
        const cmd = req.body.command || req.body.cmd || '';
        const path = req.body.path || req.body.filepath || '';
        if (cmd || path) {
          const evalRes = warden.evaluate({
            tool: req.body.tool || 'bash',
            command: cmd,
            filepath: path,
            args: req.body
          });
          req.jevWarden = evalRes;

          if (blockRisky && evalRes.decision === 'BLOCKED_RISKY') {
            if (typeof res.status === 'function') {
              const chained = res.status(403);
              if (chained && typeof chained.json === 'function') {
                return chained.json({
                  error: 'Blocked by Jev Agent Warden: Destructive command or protected file detected',
                  evaluation: evalRes
                });
              }
            }
            if (typeof res.writeHead === 'function') {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                error: 'Blocked by Jev Agent Warden: Destructive command or protected file detected',
                evaluation: evalRes
              }));
            }
            return;
          }
        }
      }

      if (typeof next === 'function') {
        return next();
      }
    } catch (err) {
      if (typeof next === 'function') return next(err);
    }
  };
}
