import { usePanel } from "../../context/PanelContext";
import SidePanel from "../common/SidePanel";
import { getPanel } from "./featureRegistry";

interface RightPanelProps {
  projectId: string;
}

/**
 * Right-docked panel that renders the active feature panel (transform forms, the
 * chart builder, …). The panel is resolved from the feature registry by the
 * active panel name; each panel component takes { projectId, onClose }.
 */
const RightPanel = ({ projectId }: RightPanelProps) => {
  const { activePanel, closePanel } = usePanel();

  const panel = activePanel ? getPanel(activePanel) : undefined;
  if (!panel) return null;

  const { title, component: Component, pinned } = panel;
  return (
    <SidePanel title={title} onClose={pinned ? undefined : closePanel}>
      <Component projectId={projectId} onClose={closePanel} />
    </SidePanel>
  );
};

export default RightPanel;
