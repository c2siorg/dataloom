import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRecentProjects, getDatasetDetails } from '../api';
import DatasetTable from './DatasetTable';
import Pagination from './Pagination';
import CreateProjectModal from './CreateProjectModal';

const HomeScreen = () => {
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  
  const { data: projectsData } = useQuery({
    queryKey: ['recentProjects', currentPage],
    queryFn: async () => {
      const response = await getRecentProjects(currentPage);
      return response.data;
    },
  });

  const handleRowClick = async (datasetId) => {
    try {
      const data = await getDatasetDetails(datasetId);
      navigate('/data', { state: { datasetId, apiData: data } });
    } catch (error) {
      toast.error('Error fetching project details');
    }
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="flex flex-col px-8 py-6 min-h-screen bg-white">
      <div className="mb-12 text-center">
        <h1 className="text-5xl">
          Welcome to{' '}
          <span className="text-blue-600 font-semibold">DataLoom</span>
        </h1>
        <h2 className="text-4xl mt-2">
          your one-stop for{' '}
          <span className="text-green-600 font-semibold">
            Dataset Transformations
          </span>
        </h2>
      </div>

      <div className="max-w-6xl mx-auto w-full">
        <DatasetTable
          data={projectsData?.data || []}
          onRowClick={handleRowClick}
          onCreateNew={() => setShowModal(true)}
        />
        
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil((projectsData?.total || 0) / (projectsData?.limit || 10))}
          hasMore={projectsData?.has_more}
          onPageChange={handlePageChange}
        />
      </div>

      {showModal && (
        <CreateProjectModal
          onClose={() => setShowModal(false)}
          isOpen={showModal}
        />
      )}
    </div>
  );
};

export default HomeScreen;