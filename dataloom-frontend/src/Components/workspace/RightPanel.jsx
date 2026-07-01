import PropTypes from "prop-types";
import { usePanel } from "../../context/PanelContext";
import SidePanel from "../common/SidePanel";
import { getPanel } from "./featureRegistry";

/**
 * Right-docked panel that renders the active feature panel (transform forms, the
 * chart builder, …). The panel is resolved from the feature registry by the
 * active panel name; each panel component takes { projectId, onClose }.
 */
const RightPanel = ({ projectId }) => {
  const { activePanel, closePanel } = usePanel();

  const panel = activePanel ? getPanel(activePanel) : undefined;
  if (!panel) return null;

  const { title, component: Component } = panel;
  return (
    <SidePanel title={title} onClose={closePanel}>
      <Component projectId={projectId} onClose={closePanel} />
    </SidePanel>
  );
};

RightPanel.propTypes = {
  projectId: PropTypes.string,
};

export default RightPanel;
