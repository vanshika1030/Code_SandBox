import axios from 'axios';

function getSessionId() {
  const key = 'sandbox.sessionId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  config.headers['X-Sandbox-Session'] = getSessionId();
  return config;
});

// projects
export const getProjects = () => api.get('/projects').then(r => r.data);
export const createProject = (data) => api.post('/projects', data).then(r => r.data);
export const getProject = (id) => api.get(`/projects/${id}`).then(r => r.data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data).then(r => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`).then(r => r.data);

// files — note: backend routes are /files/:projectId, not nested under /projects
export const getFiles = (pid) => api.get(`/files/${pid}`).then(r => r.data);
export const getAllFilesWithContent = (pid) => api.get(`/files/${pid}/all/content`).then(r => r.data); // bulk fetch
export const createFile = (pid, data) => api.post(`/files/${pid}`, data).then(r => r.data);
export const getFile = (pid, fid) => api.get(`/files/${pid}/${fid}`).then(r => r.data);
export const updateFile = (pid, fid, data) => api.put(`/files/${pid}/${fid}`, data).then(r => r.data);
export const deleteFile = (pid, fid) => api.delete(`/files/${pid}/${fid}`).then(r => r.data);

// execution & packages
export const executeCode = (data) => api.post('/execute', data).then(r => r.data);
export const executeTerminalCommand = (projectId, data) => api.post(`/terminal/${projectId}`, data).then(r => r.data);
export const installPackage = (data) => api.post('/packages/install', data).then(r => r.data);
export const getPackages = (pid) => api.get(`/packages/${pid}`).then(r => r.data);
export const startProjectPreview = (pid) => api.post(`/preview/${pid}/start`).then(r => r.data);
export const stopProjectPreview = (pid) => api.post(`/preview/${pid}/stop`).then(r => r.data);

export default api;
