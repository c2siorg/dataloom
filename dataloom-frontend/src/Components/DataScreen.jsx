import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDatasetContext } from "../context/DatasetContext";
import Menu_NavBar from "./MenuNavbar";
import Table from "./Table";

export default function DataScreen() {
  const { datasetId } = useParams();
  const { setDatasetInfo, refreshDataset } = useDatasetContext();
  const [tableData, setTableData] = useState(null);

  useEffect(() => {
    if (datasetId) {
      setDatasetInfo(Number(datasetId));
      refreshDataset(Number(datasetId));
    }
  }, [datasetId, setDatasetInfo, refreshDataset]);

  const handleTransform = (data) => {
    setTableData(data);
  };

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
