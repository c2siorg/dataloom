import type { ComponentType } from "react";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";

/**
 * Props every registered tab component receives. `tab` carries the tab metadata
 * (including its `props` bag), and the bag is also spread on directly for
 * convenience.
 */
export interface TabComponentProps {
  tab: WorkspaceTab;
  [key: string]: unknown;
}

const registry = new Map<string, ComponentType<TabComponentProps>>();

/**
 * Register a component to render tabs of a given `type`. This is the extension
 * point for new tab kinds (e.g. moving a form or a profiling view into a tab):
 * register the component under a type, then `openTab({ type, ... })`.
 */
export function registerTabType(type: string, component: ComponentType<TabComponentProps>): void {
  registry.set(type, component);
}

/** Look up the component for a tab `type`, or `undefined` if none is registered. */
export function getTabComponent(type: string): ComponentType<TabComponentProps> | undefined {
  return registry.get(type);
}
