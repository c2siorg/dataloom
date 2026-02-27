import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProjectContext } from "../context/ProjectContext";
import MenuNavbar from "./MenuNavbar";
import Table from "./Table";

export default function DataScreen() {
  const { projectId } = useParams();
  const { setProjectInfo, refreshProject } = useProjectContext();
  const [tableData, setTableData] = useState(null);

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
    <div className="flex flex-col min-h-screen">
      <MenuNavbar onTransform={handleTransform} projectId={projectId} />
      <Table projectId={projectId} data={tableData} />
    </div>
  );
}
