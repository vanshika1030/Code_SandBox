import { useState, useMemo, memo } from 'react';
import {
  VscFolder, VscFolderOpened, VscFile, VscNewFile, VscNewFolder,
  VscEdit, VscTrash, VscChevronRight, VscChevronDown,
} from 'react-icons/vsc';
import {
  VscJson, VscSymbolNamespace, VscCode, VscMarkdown,
} from 'react-icons/vsc';
import './FileTree.css';

const EXT_ICONS = {
  js: <VscSymbolNamespace color="#f1e05a" />,
  jsx: <VscSymbolNamespace color="#61dafb" />,
  ts: <VscSymbolNamespace color="#3178c6" />,
  tsx: <VscSymbolNamespace color="#3178c6" />,
  json: <VscJson color="#d29922" />,
  html: <VscCode color="#e44d26" />,
  css: <VscCode color="#563d7c" />,
  md: <VscMarkdown color="#58a6ff" />,
};

function getIcon(name) {
  const ext = name.split('.').pop();
  return EXT_ICONS[ext] || <VscFile />;
}

// turns flat file list [{ _id, name, path, type }] into a nested tree
function buildTree(files) {
  const root = { children: {} };

  files.forEach(file => {
    const parts = file.path ? file.path.split('/').filter(Boolean) : [file.name];
    let current = root;
    parts.forEach((part, i) => {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: `/${parts.slice(0, i + 1).join('/')}`,
          children: {},
          isDir: i < parts.length - 1 || file.type === 'folder',
          file: i === parts.length - 1 ? file : null,
        };
      }
      if (i === parts.length - 1 && file.type !== 'folder') {
        current.children[part].file = file;
        current.children[part].isDir = false;
      }
      current = current.children[part];
    });
  });

  const toArray = (node) =>
    Object.values(node.children)
      .map(child => ({
        ...child,
        children: toArray(child),
      }))
      .sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
        return a.isDir ? -1 : 1;
      });

  return toArray(root);
}

function TreeNode({ node, depth, selectedPath, onFileClick, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = () => {
    if (node.isDir) {
      onAction('selectFolder', node);
      setExpanded(!expanded);
    } else if (node.file) {
      onFileClick(node.file);
    }
  };

  const handleContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const menuAction = (action) => {
    setShowMenu(false);
    onAction(action, node);
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${selectedPath === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onContextMenu={handleContext}
      >
        <span className="tree-arrow">
          {node.isDir ? (
            expanded ? <VscChevronDown /> : <VscChevronRight />
          ) : null}
        </span>
        <span className="tree-icon">
          {node.isDir
            ? expanded ? <VscFolderOpened color="#8b949e" /> : <VscFolder color="#8b949e" />
            : getIcon(node.name)}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>

      {showMenu && (
        <div className="tree-context-menu" style={{ left: depth * 16 + 24 }}>
          {node.isDir && (
            <>
              <button onClick={() => menuAction('newFile')}><VscNewFile /> New File</button>
              <button onClick={() => menuAction('newFolder')}><VscNewFolder /> New Folder</button>
            </>
          )}
          <button onClick={() => menuAction('rename')}><VscEdit /> Rename</button>
          <button onClick={() => menuAction('delete')} className="danger"><VscTrash /> Delete</button>
        </div>
      )}

      {node.isDir && expanded && (
        <div className="tree-children">
          {node.children.map(child => (
            <TreeNode
              key={child.name}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onFileClick={onFileClick}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(function FileTree({ files, onFileClick, onCreateFile, onCreateFolder, onRenameFile, onDeleteFile }) {
  const [showNewInput, setShowNewInput] = useState(null); // 'file' | 'folder' | null
  const [newItemParent, setNewItemParent] = useState(null);
  const [newName, setNewName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);

  const tree = useMemo(() => buildTree(files || []), [files]);

  const handleAction = (action, node) => {
    switch (action) {
      case 'selectFolder':
        setSelectedFolder(node.file || { name: node.name, path: node.path, type: 'folder' });
        break;
      case 'newFile':
        setShowNewInput('file');
        setNewItemParent(node.file || { name: node.name, path: node.path, type: 'folder' });
        break;
      case 'newFolder':
        setShowNewInput('folder');
        setNewItemParent(node.file || { name: node.name, path: node.path, type: 'folder' });
        break;
      case 'rename':
        if (node.file) {
          const name = prompt('Rename to:', node.name);
          if (name && name !== node.name) onRenameFile?.(node.file, name);
        }
        break;
      case 'delete':
        if (confirm(`Delete "${node.name}"?`)) onDeleteFile?.(node.file || node);
        break;
    }
  };

  const submitNew = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (showNewInput === 'file') onCreateFile?.(newName.trim(), newItemParent);
    else onCreateFolder?.(newName.trim(), newItemParent);
    setNewName('');
    setShowNewInput(null);
    setNewItemParent(null);
  };

  return (
    <div className="file-tree">
        <div className="file-tree-header">
        <span className="file-tree-title">Explorer</span>
        <div className="file-tree-actions">
          <button onClick={() => { setShowNewInput('file'); setNewItemParent(selectedFolder); }} title="New File"><VscNewFile /></button>
          <button onClick={() => { setShowNewInput('folder'); setNewItemParent(selectedFolder); }} title="New Folder"><VscNewFolder /></button>
        </div>
      </div>

      {showNewInput && (
        <form className="new-item-form" onSubmit={submitNew}>
          <input
            autoFocus
            placeholder={`${showNewInput === 'file' ? 'filename.js' : 'folder name'}${newItemParent?.path ? ` in ${newItemParent.path}` : ''}`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={() => { setShowNewInput(null); setNewName(''); setNewItemParent(null); }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowNewInput(null);
                setNewItemParent(null);
              }
            }}
          />
        </form>
      )}

      <div className="file-tree-list">
        {tree.map(node => (
          <TreeNode
            key={node.name}
            node={node}
            depth={0}
            selectedPath={selectedFolder?.path}
            onFileClick={onFileClick}
            onAction={handleAction}
          />
        ))}
        {tree.length === 0 && (
          <div className="tree-empty">No files yet</div>
        )}
      </div>
    </div>
  );
});
