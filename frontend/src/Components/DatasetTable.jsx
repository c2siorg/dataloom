import React from 'react';
import { format } from 'date-fns';

const DatasetTable = ({ 
  data, 
  onRowClick,
  onCreateNew 
}) => {
  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
      <div className="min-w-full divide-y divide-gray-300">
        <div className="bg-gray-50 flex justify-between items-center px-6 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Datasets</h2>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white rounded-md"
          >
            Create New Dataset
          </button>
        </div>
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Description</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Modified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((dataset) => (
              <tr 
                key={dataset.dataset_id}
                onClick={() => onRowClick(dataset.dataset_id)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 text-sm text-gray-900">{dataset.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{dataset.description}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {format(new Date(dataset.last_modified), 'PPp')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DatasetTable;