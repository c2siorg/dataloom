import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProjectContext } from "../context/ProjectContext";
import MenuNavbar from "./MenuNavbar";
import Table from "./Table";

export default function DataScreen() {
  const { projectId } = useParams();
  const { setProjectInfo, refreshProject } = useProjectContext();
  const [tableData, setTableData] = useState(null);
  const [showColumnProfiles, setShowColumnProfiles] = useState(false);

  useEffect(() => {
    if (projectId) {
      setProjectInfo(projectId);
      refreshProject(projectId);
    }
  }, [projectId, setProjectInfo, refreshProject]);

  const handleTransform = (data) => {
    setTableData(data);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <MenuNavbar
        onTransform={handleTransform}
        projectId={projectId}
        columnProfilesActive={showColumnProfiles}
        onToggleColumnProfiles={() => setShowColumnProfiles((v) => !v)}
      />
      <Table projectId={projectId} data={tableData} showColumnProfiles={showColumnProfiles} />
    </div>
  );
}
