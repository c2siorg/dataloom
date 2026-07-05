import { LuFilePlus } from "react-icons/lu";
import AddFilePanel from "../../files/AddFilePanel";
import { registerFeature } from "../featureRegistry";

/**
 * Add File feature — append more files to the current project. The docked
 * panel previews column alignment before confirming and lists the project's
 * file inventory for re-appending files removed by revert/undo.
 */
registerFeature({
  id: "add-file",
  panels: [{ name: "AddFilePanel", title: "Add File", component: AddFilePanel }],
  menu: [
    {
      ribbon: "File",
      group: "Source",
      order: 0,
      label: "Add File",
      icon: LuFilePlus,
      action: { togglePanel: "AddFilePanel" },
      disabledInPreview: true,
      activePanel: "AddFilePanel",
    },
  ],
});
