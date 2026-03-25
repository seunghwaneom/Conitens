/**
 * ActionDispatcherProvider.tsx — React context provider for action dispatch.
 *
 * Sub-AC 8b: Mount once at the App root to make the ActionDispatcher available
 * throughout the component tree via `useActionDispatcher()`.
 *
 * Usage:
 * ```tsx
 * // In App.tsx:
 * <ActionDispatcherProvider>
 *   <CommandCenterScene />
 *   <HUD />
 * </ActionDispatcherProvider>
 *
 * // In any child component:
 * const { handleAgentAction } = useActionDispatcher();
 * await handleAgentAction("researcher-1", "pause");
 * ```
 *
 * Design principles:
 * - Single instance of useActionDispatcherImpl() ensures one shared pendingActions map
 * - All user interactions that change orchestrator state flow through this provider
 * - Record transparency: every state change is serialized to a command file
 */

import type { ReactNode } from "react";
import {
  ActionDispatcherContext,
  useActionDispatcherImpl,
} from "../hooks/use-action-dispatcher.js";

export interface ActionDispatcherProviderProps {
  children: ReactNode;
}

/**
 * Provides the `ActionDispatcher` to all descendant components.
 *
 * Mount this at the root of the app (inside App.tsx) so every component can
 * access command dispatch without prop-drilling.
 */
export function ActionDispatcherProvider({
  children,
}: ActionDispatcherProviderProps) {
  const dispatcher = useActionDispatcherImpl();

  return (
    <ActionDispatcherContext.Provider value={dispatcher}>
      {children}
    </ActionDispatcherContext.Provider>
  );
}
