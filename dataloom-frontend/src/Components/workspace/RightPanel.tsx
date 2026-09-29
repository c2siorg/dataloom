import { usePanel } from "../../context/PanelContext";
import SidePanel from "../common/SidePanel";
import { getPanel } from "./featureRegistry";
import { useProjectContext } from "../../context/ProjectContext";

interface RightPanelProps {
  projectId: string;
}

/**
 * Right-docked panel that renders the active feature panel (transform forms, the
 * chart builder, …). The panel is resolved from the feature registry by the
 * active panel name; each panel component takes { projectId, onClose }, where
 * onClose performs panel cleanup before closing the panel.
 */
const RightPanel = ({ projectId }: RightPanelProps) => {
  const { activePanel, closePanel } = usePanel();
  const { isPreviewMode, cancelPreview } = useProjectContext();

  const panel = activePanel ? getPanel(activePanel) : undefined;
  if (!panel) return null;

  const { title, component: Component, pinned } = panel;

  const handleClose = () => {
    if (isPreviewMode) {
      cancelPreview();
    }

    closePanel();
  };

  return (
    <SidePanel title={title} onClose={pinned ? undefined : handleClose}>
      <Component projectId={projectId} onClose={closePanel} />
    </SidePanel>
  );
};

export default RightPanel;
