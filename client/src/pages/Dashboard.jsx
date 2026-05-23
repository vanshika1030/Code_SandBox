import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, createProject, deleteProject } from '../services/api';
import { VscAdd, VscTrash, VscFolder, VscCode } from 'react-icons/vsc';
import './Dashboard.css';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await createProject({ name: name.trim(), description: desc.trim() });
      navigate(`/editor/${res.data._id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its files?')) return;

    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p._id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-brand">
          <VscCode className="brand-icon" />
          <h1>CodeSandbox</h1>
        </div>
        <p className="dash-subtitle">Your browser-based coding environment</p>
      </header>

      <main className="dash-main">
        <div className="dash-toolbar">
          <h2>Projects</h2>
          <button className="btn-new" onClick={() => setShowForm(true)}>
            <VscAdd /> New Project
          </button>
        </div>

        {showForm && (
          <div className="new-project-overlay" onClick={() => setShowForm(false)}>
            <form className="new-project-form" onClick={e => e.stopPropagation()} onSubmit={handleCreate}>
              <h3>Create Project</h3>
              <input
                autoFocus
                placeholder="Project name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <input
                placeholder="Description (optional)"
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-create" disabled={!name.trim()}>
                  Create
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="dash-loading">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="dash-empty">
            <VscFolder className="empty-icon" />
            <p>No projects yet</p>
            <span>Create your first project to get started</span>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => (
              <div
                key={project._id}
                className="project-card"
                onClick={() => navigate(`/editor/${project._id}`)}
              >
                <div className="card-accent" />
                <div className="card-body">
                  <h3>{project.name}</h3>
                  {project.description && <p className="card-desc">{project.description}</p>}
                  <span className="card-time">Opened {formatDate(project.lastOpenedAt)}</span>
                </div>
                <button
                  className="card-delete"
                  onClick={(e) => handleDelete(e, project._id)}
                  title="Delete project"
                >
                  <VscTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
