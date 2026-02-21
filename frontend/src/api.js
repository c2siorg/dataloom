import axios from 'axios';
const API = axios.create({
    baseURL: "http://localhost:8000/",
});

export const uploadDataset = async (file, projectName, projectDescription) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectName", projectName);
    formData.append("projectDescription", projectDescription);

    console.log("formdata going to backend", formData);
    const response = await API.post('/datasets/upload', formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    return response.data;
};


export const getDatasetDetails = async (datasetId) => {
    try {
        const response = await API.get(`/datasets/get/${datasetId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching dataset details:", error);
        throw error;
    }
};


export const transformDataset = (datasetId, transformationInput) => {
    return API.post(`/datasets/${datasetId}/transform`, transformationInput);
};

export const complexTransformDataset = (datasetId, transformationInput) => {
    return API.post(`datasets/${datasetId}/Complextransform`, transformationInput);
};

export const saveDataset = (datasetId, commitMessage) => {
    return API.post(`/datasets/${datasetId}/save?commit_message=${encodeURIComponent(commitMessage)}`);
};

export const revertToCheckpoint = (datasetId, checkpointId) => {
    return API.post(`/datasets/${datasetId}/revert?checkpoint_id=${checkpointId}`);
};

export const getRecentProjects = () => {
    return API.get('/datasets/recent');
};

export const getAllDatasets = () => {
    return API.get('/datasets/all');
};


export const getLogs = (datasetId) => {
    return API.get(`/logs/${datasetId}`);
};

export const getCheckpoints = (datasetId) => {
    return API.get(`/logs/checkpoints/${datasetId}`);
};