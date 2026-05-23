import { useState, useEffect } from 'react';
import { installPackage, getPackages } from '../services/api';
import { VscPackage, VscClose } from 'react-icons/vsc';
import './PackageManager.css';

export default function PackageManager({ projectId, visible, onClose, onPackagesChanged }) {
  const [packages, setPackages] = useState({});
  const [pkgName, setPkgName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && projectId) {
      getPackages(projectId)
        .then(res => setPackages(res.data || {}))
        .catch(() => {});
    }
  }, [visible, projectId]);

  const handleInstall = async (e) => {
    e.preventDefault();
    if (!pkgName.trim()) return;

    setInstalling(true);
    setError('');
    try {
      await installPackage({ projectId, packageName: pkgName.trim() });
      const res = await getPackages(projectId);
      setPackages(res.data || {});
      onPackagesChanged?.();
      setPkgName('');
    } catch (err) {
      setError(err.response?.data?.message || 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  if (!visible) return null;

  const pkgEntries = Object.entries(packages);

  return (
    <div className="pkg-overlay" onClick={onClose}>
      <div className="pkg-modal" onClick={e => e.stopPropagation()}>
        <div className="pkg-header">
          <h3><VscPackage /> Package Manager</h3>
          <button className="pkg-close" onClick={onClose}><VscClose /></button>
        </div>

        <form className="pkg-form" onSubmit={handleInstall}>
          <input
            placeholder="Package name (e.g. lodash)"
            value={pkgName}
            onChange={e => setPkgName(e.target.value)}
            disabled={installing}
          />
          <button type="submit" disabled={installing || !pkgName.trim()}>
            {installing ? 'Installing…' : 'Install'}
          </button>
        </form>

        {error && <div className="pkg-error">{error}</div>}

        <div className="pkg-list">
          <h4>Installed ({pkgEntries.length})</h4>
          {pkgEntries.length === 0 ? (
            <p className="pkg-empty">No packages installed yet</p>
          ) : (
            <ul>
              {pkgEntries.map(([name, version]) => (
                <li key={name}>
                  <span className="pkg-name">{name}</span>
                  <span className="pkg-version">{version}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
