
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Menu_NavBar from "./MenuNavbar";
import Table from "./Table";

export default function DataScreen() {
  const location = useLocation();
  const [tableData, setTableData] = useState(null);
  const [datasetId, setDatasetId] = useState(null);

  useEffect(() => {
    console.log("Location state on mount:", location.state); 
    if (location.state?.datasetId) {
      const id = String(location.state.datasetId); // Convert to string
      setDatasetId(id);
      console.log("Set datasetId:", id); 
    } else {
      console.error("No datasetId found in location state.");
    }
  }, [location]);

  const handleTransform = (data) => {
    setTableData(data);
  };

  console.log("Rendering DataScreen with datasetId:", datasetId); 

  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-gray-900">
        <Menu_NavBar onTransform={handleTransform} datasetId={datasetId} />
      </div>
      <div>
        <Table datasetId={datasetId} data={tableData} />
      </div>
    </div>
  );
}