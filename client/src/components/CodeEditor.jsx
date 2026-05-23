import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
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
  const editorRef = useRef(null);
  const timerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const latestValueRef = useRef('');
  const dirtyRef = useRef(false);
  const fileKey = useMemo(() => file?._id || file?.path || file?.name || '', [file]);
  const [localValue, setLocalValue] = useState(file?.content || '');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const nextValue = file?.content || '';
    setLocalValue(nextValue);
    latestValueRef.current = nextValue;
    dirtyRef.current = false;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    requestAnimationFrame(() => editorRef.current?.layout());
  }, [fileKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) onChangeRef.current?.(latestValueRef.current);
    };
  }, []);

  const handleChange = useCallback((value) => {
    const nextValue = value ?? '';
    setLocalValue(nextValue);
    latestValueRef.current = nextValue;
    dirtyRef.current = true;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      onChangeRef.current?.(latestValueRef.current);
    }, 120);
  }, []);

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;
    requestAnimationFrame(() => editor.layout());
  }, []);

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
        value={localValue}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleMount}
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
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
});
