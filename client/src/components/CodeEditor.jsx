import { useCallback, memo } from 'react';
import MonacoEditor from '@monaco-editor/react';
import './CodeEditor.css';

const LANG_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  py: 'python',
  txt: 'plaintext',
};

function getLang(filename) {
  const ext = (filename || '').split('.').pop();
  return LANG_MAP[ext] || 'plaintext';
}

export default memo(function CodeEditor({ file, onChange, saving }) {
  const handleChange = useCallback((value) => {
    onChange?.(value ?? '');
  }, [onChange]);

  if (!file) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-icon">{'</>'}</div>
        <p>Select a file to start editing</p>
      </div>
    );
  }

  if (file.isLoading) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-icon">{'</>'}</div>
        <p>Opening {file.name}...</p>
      </div>
    );
  }

  return (
    <div className="code-editor">
      {saving && <div className="save-indicator">Saving...</div>}
      <MonacoEditor
        path={file._id || file.path || file.name}
        height="100%"
        language={getLang(file.name)}
        value={file.content || ''}
        theme="vs-dark"
        onChange={handleChange}
        options={{
          fontSize: 14,
          fontFamily: "'Fira Code', Consolas, monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          padding: { top: 12, bottom: 12 },
          lineNumbers: 'on',
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
        }}
      />
    </div>
  );
});
