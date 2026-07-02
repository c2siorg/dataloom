import type { ComponentType } from "react";
import type { IconType } from "react-icons";
import type { WorkspaceTab } from "../../context/WorkspaceTabsContext";
import { registerTabType, type TabComponentProps } from "./TabRegistry";

/**
 * Workspace Feature registry — the single seam for adding a workspace feature.
 *
 * A feature is a cohesive contributor of tabs, docked side panels, and ribbon
 * menu items. It registers once (at import time, like registerTabType); the
 * readers — DataScreen's tab area, RightPanel, and MenuNavbar — resolve against
 * this registry instead of hardcoded lists. Adding a feature is then one adapter
 * file plus its import, not edits smeared across four modules.
 */

/** Props every docked panel component receives from RightPanel. */
export interface PanelProps {
  projectId: string;
  onClose: () => void;
}

/** A docked side-panel contribution (e.g. a transform form, the chart builder). */
export interface FeaturePanel {
  /** Stable key opened via PanelContext (e.g. "FilterForm"). */
  name: string;
  title: string;
  component: ComponentType<PanelProps>;
}

/**
 * What a menu item does when clicked. Declarative because the registry can't call
 * hooks; MenuNavbar interprets it against useWorkspaceTabs / usePanel. Fields
 * compose — e.g. Charts opens its tab and docks the builder panel together.
 */
export interface MenuAction {
  /** Open (or focus) this workspace tab. */
  openTab?: WorkspaceTab;
  /** Dock this side panel open. */
  openPanel?: string;
  /** Toggle this side panel (open if closed, close if open). */
  togglePanel?: string;
}

/** A ribbon menu item contributed by a feature. */
export interface FeatureMenuItem {
  /** Top ribbon tab, e.g. "File" | "Data" | "Profiling". */
  ribbon: string;
  /** Group within the ribbon tab, e.g. "Transform". */
  group: string;
  /** Sort order within the group. */
  order: number;
  label: string;
  icon: IconType;
  action: MenuAction;
  /** Disable while a transform preview is pending. */
  disabledInPreview?: boolean;
  /** Highlight the item while this panel is the active one. */
  activePanel?: string;
  /** Tooltip text to show on hover. */
  hover?: string;
}

/** A tab contribution: a tab type mapped to the component that renders it. */
export interface FeatureTab {
  type: string;
  component: ComponentType<TabComponentProps>;
}

export interface WorkspaceFeature {
  id: string;
  tabs?: FeatureTab[];
  panels?: FeaturePanel[];
  menu?: FeatureMenuItem[];
}

const panels = new Map<string, FeaturePanel>();
const menuItems: FeatureMenuItem[] = [];

/**
 * Register a workspace feature. Tabs are delegated to the existing TabRegistry so
 * tab rendering is unchanged; panels and menu items are stored for the readers.
 */
export function registerFeature(feature: WorkspaceFeature): void {
  feature.tabs?.forEach((tab) => registerTabType(tab.type, tab.component));
  feature.panels?.forEach((panel) => panels.set(panel.name, panel));
  feature.menu?.forEach((item) => menuItems.push(item));
}

/** Resolve the docked panel registered under `name`, or undefined. */
export function getPanel(name: string): FeaturePanel | undefined {
  return panels.get(name);
}

/** All feature-contributed menu items (unsorted; MenuNavbar buckets and sorts). */
export function getFeatureMenu(): FeatureMenuItem[] {
  return menuItems;
}
