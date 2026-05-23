import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loader } from '@monaco-editor/react';
import {
  getProject, getFiles, getFile, createFile, updateFile, deleteFile, executeCode, getAllFilesWithContent, executeTerminalCommand,
} from '../services/api';
import FileTree from '../components/FileTree';
import CodeEditor from '../components/CodeEditor';
import Tabs from '../components/Tabs';
import Terminal from '../components/Terminal';
import Preview from '../components/Preview';
import PackageManager from '../components/PackageManager';
import { VscPlay, VscBrowser, VscPackage, VscArrowLeft } from 'react-icons/vsc';
import './Editor.css';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 520;
const PREVIEW_MIN = 260;
const PREVIEW_MAX = 720;

function readStoredWidth(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

export default function Editor() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [termCollapsed, setTermCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPkgManager, setShowPkgManager] = useState(false);
  const [allFileContents, setAllFileContents] = useState([]);
  const [savingFileIds, setSavingFileIds] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth('editor.sidebarWidth', 250));
  const [previewWidth, setPreviewWidth] = useState(() => readStoredWidth('editor.previewWidth', 380));
  const saveTimersRef = useRef(new Map());
  const workspaceRef = useRef(null);

  // load project and file tree on mount
  useEffect(() => {
    loadProject();
    loadFiles();
    loader.init().catch(err => console.error('Failed to preload editor:', err));
  }, [projectId]);

  useEffect(() => {
    return () => {
      saveTimersRef.current.forEach(timer => clearTimeout(timer));
      saveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('editor.sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('editor.previewWidth', String(previewWidth));
  }, [previewWidth]);

  const startSidebarResize = useCallback((event) => {
    event.preventDefault();
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const handleMove = (moveEvent) => {
      const nextWidth = moveEvent.clientX - bounds.left;
      setSidebarWidth(clamp(nextWidth, SIDEBAR_MIN, Math.min(SIDEBAR_MAX, bounds.width - 360)));
    };

    const handleUp = () => {
      document.body.classList.remove('is-resizing-pane');
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    document.body.classList.add('is-resizing-pane');
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, []);

  const startPreviewResize = useCallback((event) => {
    event.preventDefault();
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const handleMove = (moveEvent) => {
      const nextWidth = bounds.right - moveEvent.clientX;
      setPreviewWidth(clamp(nextWidth, PREVIEW_MIN, Math.min(PREVIEW_MAX, bounds.width - sidebarWidth - 360)));
    };

    const handleUp = () => {
      document.body.classList.remove('is-resizing-pane');
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    document.body.classList.add('is-resizing-pane');
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [sidebarWidth]);

  const loadProject = async () => {
    try {
      const res = await getProject(projectId);
      setProject(res.data);
    } catch (err) {
      console.error('Failed to load project:', err);
      navigate('/');
    }
  };

  const loadFiles = async () => {
    try {
      const res = await getFiles(projectId);
      setFiles(res.data || []);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  // when a file is clicked in the tree, open it in a tab
  const handleFileClick = async (file) => {
    if (file.type === 'folder') return;

    // already open? just switch
    const existing = openTabs.find(t => t._id === file._id);
    if (existing) {
      setActiveTab(existing);
      return;
    }

    const loadingFile = { ...file, content: '', isLoading: true };
    setOpenTabs(prev => [...prev, loadingFile]);
    setActiveTab(loadingFile);

    // fetch full content
    try {
      const res = await getFile(projectId, file._id);
      const fullFile = res.data;
      setOpenTabs(prev => prev.map(t => t._id === fullFile._id ? fullFile : t));
      setActiveTab(prev => prev?._id === fullFile._id ? fullFile : prev);
    } catch (err) {
      console.error('Failed to open file:', err);
      setOpenTabs(prev => prev.filter(t => t._id !== file._id));
      setActiveTab(prev => prev?._id === file._id ? null : prev);
    }
  };

  // save file content after local state has updated immediately
  const handleContentChange = useCallback(async (newContent) => {
    if (!activeTab || activeTab.isLoading) return;

    const fileId = activeTab._id;
    const nextContent = newContent ?? '';

    setOpenTabs(prev => prev.map(t => t._id === fileId ? { ...t, content: nextContent } : t));
    setActiveTab(prev => prev?._id === fileId ? { ...prev, content: nextContent } : prev);

    if (showPreview) {
      setAllFileContents(prev => {
        const exists = prev.some(f => f._id === fileId);
        const updated = prev.map(f => f._id === fileId ? { ...f, content: nextContent } : f);
        return exists ? updated : [...updated, { ...activeTab, content: nextContent }];
      });
    }

    const existingTimer = saveTimersRef.current.get(fileId);
    if (existingTimer) clearTimeout(existingTimer);

    setSavingFileIds(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
    const timer = setTimeout(async () => {
      saveTimersRef.current.delete(fileId);
      try {
        const res = await updateFile(projectId, fileId, { content: nextContent });
        const updated = res.data;
        setOpenTabs(prev => prev.map(t => t._id === updated._id ? { ...t, ...updated, content: nextContent } : t));
        setActiveTab(prev => prev?._id === updated._id ? { ...prev, ...updated, content: nextContent } : prev);
      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        setSavingFileIds(prev => prev.filter(id => id !== fileId));
      }
    }, 700);

    saveTimersRef.current.set(fileId, timer);
  }, [activeTab, projectId, showPreview]);

  // grab all file contents for the preview (optimized: single bulk request)
  const refreshPreviewFiles = useCallback(async () => {
    try {
      // use new bulk endpoint to fetch all files with content in one request
      const res = await getAllFilesWithContent(projectId);
      const fileList = res.data || [];
      
      // merge with open tabs content (open tabs take precedence)
      const merged = fileList.map(f => {
        const openVersion = openTabs.find(t => t._id === f._id && !t.isLoading);
        return openVersion || f;
      });
      
      setAllFileContents(merged);
    } catch (err) {
      console.error('Failed to load preview files:', err);
    }
  }, [projectId, openTabs]);

  // refresh preview when toggled on
  useEffect(() => {
    if (showPreview) {
      refreshPreviewFiles();
    }
  }, [showPreview, refreshPreviewFiles]);

  const buildChildPath = (name, parent) => {
    const cleanName = name.replace(/^\/+|\/+$/g, '');
    if (!parent?.path) return `/${cleanName}`;
    return `${parent.path.replace(/\/+$/g, '')}/${cleanName}`;
  };

  // create file/folder
  const handleCreateFile = async (name, parent = null) => {
    try {
      await createFile(projectId, {
        name, path: buildChildPath(name, parent), type: 'file', content: '',
      });
      await loadFiles();
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleCreateFolder = async (name, parent = null) => {
    try {
      await createFile(projectId, {
        name, path: buildChildPath(name, parent), type: 'folder',
      });
      await loadFiles();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const handleRenameFile = async (file, newName) => {
    try {
      const newPath = file.path.replace(/[^/]+$/, newName);
      await updateFile(projectId, file._id, { name: newName, path: newPath });
      await loadFiles();

      // update open tabs if renamed file is open
      setOpenTabs(prev => prev.map(t =>
        t._id === file._id ? { ...t, name: newName, path: newPath } : t
      ));
      if (activeTab?._id === file._id) {
        setActiveTab(prev => ({ ...prev, name: newName, path: newPath }));
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  const handleDeleteFile = async (fileOrNode) => {
    const file = fileOrNode.file || fileOrNode;
    if (!file?._id) return;

    try {
      await deleteFile(projectId, file._id);
      await loadFiles();

      // close tab if it was open
      setOpenTabs(prev => prev.filter(t => t._id !== file._id));
      if (activeTab?._id === file._id) {
        setActiveTab(openTabs.find(t => t._id !== file._id) || null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleTabClose = (tab) => {
    const remaining = openTabs.filter(t => t._id !== tab._id);
    setOpenTabs(remaining);
    if (activeTab?._id === tab._id) {
      setActiveTab(remaining[remaining.length - 1] || null);
    }
  };

  // run code
  const handleRun = async () => {
    if (!activeTab) return;
    setIsRunning(true);
    setTermCollapsed(false);
    setTerminalOutput('');

    const lang = activeTab.language || 'javascript';
    const start = performance.now();

    try {
      const res = await executeCode({
        code: activeTab.content || '',
        language: lang,
      });
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      const { stdout, stderr, exitCode } = res.data;
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n' : '') + stderr;
      output += `\n\n[Process exited with code ${exitCode} in ${elapsed}s]`;
      setTerminalOutput(output);
    } catch (err) {
      setTerminalOutput(`Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // handle terminal command execution
  const handleTerminalCommand = useCallback(async (command) => {
    setIsRunning(true);
    try {
      const res = await executeTerminalCommand(projectId, { command });
      const { stdout, stderr, exitCode } = res.data;
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n' : '') + stderr;
      output += `\n[Exit code: ${exitCode}]`;
      setTerminalOutput(output);
      await loadFiles();
      if (showPreview) {
        await refreshPreviewFiles();
      }
    } catch (err) {
      setTerminalOutput(`Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [projectId, showPreview, refreshPreviewFiles]);

  return (
    <div className="editor-page">
      {/* toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={() => navigate('/')} title="Back to Dashboard">
            <VscArrowLeft />
          </button>
          <span className="toolbar-project-name">{project?.name || 'Loading…'}</span>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn" onClick={() => setShowPkgManager(true)} title="Packages">
            <VscPackage />
          </button>
          <button
            className={`toolbar-btn preview-btn ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(!showPreview)}
            title="Toggle Live Preview"
          >
            <VscBrowser /> Live Preview
          </button>
          <button className="toolbar-btn run-btn" onClick={handleRun} disabled={!activeTab || isRunning} title="Run Code">
            <VscPlay /> Run
          </button>
        </div>
      </div>

      {/* main workspace */}
      <div className="editor-workspace" ref={workspaceRef}>
        {/* sidebar */}
        <div className="editor-sidebar" style={{ width: sidebarWidth }}>
          <FileTree
            files={files}
            onFileClick={handleFileClick}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
          />
        </div>
        <div
          className="pane-resizer pane-resizer-left"
          role="separator"
          aria-label="Resize Explorer"
          aria-orientation="vertical"
          onMouseDown={startSidebarResize}
        />

        {/* center: tabs + editor + terminal */}
        <div className="editor-center">
          <div className="editor-top">
            <Tabs
              tabs={openTabs}
              activeId={activeTab?._id}
              onSelect={setActiveTab}
              onClose={handleTabClose}
            />
            <div className="editor-content">
              <CodeEditor
                file={activeTab}
                onChange={handleContentChange}
                saving={savingFileIds.includes(activeTab?._id)}
              />
            </div>
          </div>

          <Terminal
            output={terminalOutput}
            isRunning={isRunning}
            collapsed={termCollapsed}
            onToggle={() => setTermCollapsed(!termCollapsed)}
            projectId={projectId}
            onCommand={handleTerminalCommand}
          />
        </div>

        {/* preview panel */}
        {showPreview && (
          <>
            <div
              className="pane-resizer pane-resizer-right"
              role="separator"
              aria-label="Resize Live Preview"
              aria-orientation="vertical"
              onMouseDown={startPreviewResize}
            />
            <div className="preview-resizable-pane" style={{ width: previewWidth }}>
              <Preview projectId={projectId} files={allFileContents} activeFile={activeTab} visible={showPreview} />
            </div>
          </>
        )}
      </div>

      {/* package manager modal */}
      <PackageManager
        projectId={projectId}
        visible={showPkgManager}
        onClose={() => setShowPkgManager(false)}
        onPackagesChanged={loadFiles}
      />
    </div>
  );
}
