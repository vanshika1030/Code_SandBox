import { useMemo, useState, memo } from 'react';
import { VscRefresh } from 'react-icons/vsc';
import { startProjectPreview } from '../services/api';
import './Preview.css';

// stitch together project files into a single HTML document
function buildPreviewDoc(files, activeFile) {
  const htmlFiles = files.filter(f => f.name?.endsWith('.html'));
  const cssFiles = files.filter(f => f.name?.endsWith('.css'));
  const jsFiles = files.filter(f => f.name?.endsWith('.js') || f.name?.endsWith('.jsx'));

  const activeHtml = activeFile?.name?.endsWith('.html')
    ? htmlFiles.find(f => f._id === activeFile._id || f.path === activeFile.path) || activeFile
    : null;

  // use the active HTML file as base, then index.html, then the first .html
  let htmlContent = '<!DOCTYPE html><html><head></head><body></body></html>';
  const baseHtml = activeHtml || htmlFiles.find(f => f.name === 'index.html') || htmlFiles[0];
  if (baseHtml?.content) {
    htmlContent = baseHtml.content;
  }

  // inject CSS before </head>
  const styleBlock = cssFiles
    .filter(f => f.content)
    .map(f => `<style>/* ${f.name} */\n${f.content}</style>`)
    .join('\n');

  // inject JS before </body>
  const scriptBlock = jsFiles
    .filter(f => f.content && f._id !== baseHtml?._id)
    .map(f => `<script>/* ${f.name} */\n${f.content}<\/script>`)
    .join('\n');

  // shove them in
  if (htmlContent.includes('</head>')) {
    htmlContent = htmlContent.replace('</head>', `${styleBlock}\n</head>`);
  } else {
    htmlContent = styleBlock + htmlContent;
  }

  if (htmlContent.includes('</body>')) {
    htmlContent = htmlContent.replace('</body>', `${scriptBlock}\n</body>`);
  } else {
    htmlContent += scriptBlock;
  }

  return htmlContent;
}

function getPackageJson(files) {
  const pkgFile = files.find(f => f.path === '/package.json' || f.name === 'package.json');
  if (!pkgFile?.content) return null;

  try {
    return JSON.parse(pkgFile.content);
  } catch {
    return null;
  }
}

export default memo(function Preview({ projectId, files, activeFile, visible }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectUrl, setProjectUrl] = useState('');
  const [startingProject, setStartingProject] = useState(false);
  const [projectError, setProjectError] = useState('');

  const srcDoc = useMemo(() => {
    return buildPreviewDoc(files || [], activeFile);
  }, [files, activeFile, refreshKey]);

  const packageJson = useMemo(() => getPackageJson(files || []), [files]);
  const canRunProjectPreview = Boolean(packageJson?.scripts?.dev);

  const handleProjectPreview = async () => {
    setStartingProject(true);
    setProjectError('');
    try {
      const res = await startProjectPreview(projectId);
      setProjectUrl(res.data.url);
    } catch (err) {
      setProjectError(err.response?.data?.message || 'Could not start project preview');
    } finally {
      setStartingProject(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <span className="preview-title">
          {projectUrl ? 'Project Preview' : `Preview${activeFile?.name?.endsWith('.html') ? `: ${activeFile.name}` : ''}`}
        </span>
        <div className="preview-actions">
          {canRunProjectPreview && (
            <button onClick={handleProjectPreview} disabled={startingProject} title="Run package.json dev script">
              {startingProject ? 'Starting...' : 'Run Project'}
            </button>
          )}
          <button onClick={() => {
            if (projectUrl) setProjectUrl(`${projectUrl}?t=${Date.now()}`);
            else setRefreshKey(k => k + 1);
          }} title="Refresh Preview">
            <VscRefresh />
          </button>
        </div>
      </div>
      {projectError && <div className="preview-error">{projectError}</div>}
      <div className="preview-content">
        <iframe
          key={refreshKey}
          title="Live Preview"
          sandbox="allow-scripts allow-modals"
          src={projectUrl || undefined}
          srcDoc={projectUrl ? undefined : srcDoc}
          className="preview-iframe"
        />
      </div>
    </div>
  );
});
