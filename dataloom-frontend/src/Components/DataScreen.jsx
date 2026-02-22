import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProjectContext } from "../context/ProjectContext";
import Menu_NavBar from "./MenuNavbar";
import Table from "./Table";
import ColumnDetailModal from "./ColumnDetailModal";

export default function DataScreen() {
  const { projectId } = useParams();
  const { setProjectInfo, refreshProject } = useProjectContext();
  const [tableData, setTableData] = useState(null);
  const [selectedColumnProfile, setSelectedColumnProfile] = useState(null);

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
      <Menu_NavBar
        onTransform={handleTransform}
        projectId={projectId}
        onColumnClick={(columnProfile) => setSelectedColumnProfile(columnProfile)}
      />
      <Table projectId={projectId} data={tableData} />
      <ColumnDetailModal
        columnProfile={selectedColumnProfile}
        onClose={() => setSelectedColumnProfile(null)}
      />
    </div>
  );
}
