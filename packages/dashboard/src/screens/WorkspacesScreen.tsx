import { ForwardDashboardScreen } from "./ForwardDashboardScreen.js";

/**
 * Screen wrapper for workspace list + detail routes.
 *
 * Currently delegates to ForwardDashboardScreen which handles workspace rendering
 * internally based on route.screen. The tasks-store Zustand store exists and
 * will absorb state management when ForwardDashboardScreen is decomposed in
 * Batch 8.
 */
export function WorkspacesScreen() {
  return <ForwardDashboardScreen />;
}
