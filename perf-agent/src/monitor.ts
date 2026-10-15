import type { Config } from './config.ts';
import type { Sample } from './metrics.ts';
export type AlertState = {
  deployment?: string;
  breachSince?: number;
  recoverySince?: number;
  cooldownUntil: number;
  latched: boolean;
  lastAt?: number;
};
export function evaluate(
  state: AlertState,
  m: Sample,
  c: Config
): { state: AlertState; action: 'incident' | 'recovered' | null } {
  let s = { ...state };
  if (s.deployment !== m.deployment)
    s = { deployment: m.deployment, latched: state.latched, cooldownUntil: state.cooldownUntil };
  if (s.lastAt !== undefined && m.at - s.lastAt > c.pollSeconds * 2500) {
    delete s.breachSince;
    delete s.recoverySince;
  }
  s.lastAt = m.at;
  if (m.quality === 'unavailable' || m.quality === 'insufficient') {
    delete s.breachSince;
    delete s.recoverySince;
    return { state: s, action: null };
  }
  if (m.p95Ms! > c.thresholdMs) {
    delete s.recoverySince;
    s.breachSince ??= m.at;
    if (!s.latched && m.at >= s.cooldownUntil && m.at - s.breachSince >= c.sustainSeconds * 1000) {
      s.latched = true;
      return { state: s, action: 'incident' };
    }
  } else {
    delete s.breachSince;
    if (s.latched && m.p95Ms! < c.thresholdMs * c.recoveryRatio) {
      s.recoverySince ??= m.at;
      if (m.at - s.recoverySince >= c.recoverySeconds * 1000) {
        s.latched = false;
        s.cooldownUntil = m.at + c.cooldownSeconds * 1000;
        return { state: s, action: 'recovered' };
      }
    } else delete s.recoverySince;
  }
  return { state: s, action: null };
}
