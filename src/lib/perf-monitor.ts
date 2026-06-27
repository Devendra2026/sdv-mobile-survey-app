/** Lightweight screen timing — enable with EXPO_PUBLIC_PERF_MONITOR=1 */
const enabled = process.env.EXPO_PUBLIC_PERF_MONITOR === '1';

export function markScreenStart(screen: string): void {
  if (!enabled) return;
  console.info(`[perf] screen:start ${screen}`);
}

export function markScreenReady(screen: string, startedAt: number): void {
  if (!enabled) return;
  const ms = Math.round(performance.now() - startedAt);
  console.info(`[perf] screen:ready ${screen} ${ms}ms`);
}

export function initMobileMonitoring(): void {
  if (process.env.EXPO_PUBLIC_PERF_MONITOR === '1') {
    console.info('[perf] Mobile performance monitor enabled');
  }
}
