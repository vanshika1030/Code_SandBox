import { useRef, useEffect, useState, memo, useCallback } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './Terminal.css';
import { VscClearAll, VscChevronDown, VscChevronUp } from 'react-icons/vsc';

export default memo(function Terminal({ output, isRunning, collapsed, onToggle, projectId, onCommand }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const commandBufferRef = useRef('');

  useEffect(() => {
    const term = new XTerminal({
      fontFamily: "'Fira Code', Consolas, monospace",
      fontSize: 13,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#388bfd44',
      },
      cursorBlink: true,
      disableStdin: false, // Enable input
      scrollback: 1000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    // Handle user input
    term.onData((data) => {
      const char = data.charCodeAt(0);
      
      // Enter key - execute command
      if (char === 13) {
        term.writeln('');
        const cmd = commandBufferRef.current.trim();
        commandBufferRef.current = '';
        
        if (cmd) {
          term.write(`$ ${cmd}\n`);
          if (onCommand) {
            onCommand(cmd); // Send command to parent (Editor)
          }
        } else {
          term.write('$ ');
        }
      }
      // Backspace
      else if (char === 127) {
        if (commandBufferRef.current.length > 0) {
          commandBufferRef.current = commandBufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
      }
      // Ctrl+C - clear buffer
      else if (char === 3) {
        commandBufferRef.current = '';
        term.writeln('^C');
        term.write('$ ');
      }
      // Regular characters
      else if (char >= 32 && char <= 126) {
        commandBufferRef.current += data;
        term.write(data);
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);

    // Show initial prompt
    term.writeln('\x1b[36m Browser Terminal\x1b[0m');
    term.writeln('Supported commands: cd, pwd/cwd, ls/dir, touch, mkdir, cat, echo, npm, node, python');
    term.writeln('');
    term.write('$ ');

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [onCommand]);

  // push new output into the terminal
  useEffect(() => {
    if (!termRef.current || !output) return;
    
    // Write output without clearing previous content
    output.split('\n').forEach((line, idx) => {
      if (idx > 0) termRef.current.writeln('');
      termRef.current.write(line);
    });
    
    // Show prompt for next command
    termRef.current.writeln('');
    termRef.current.write('$ ');
    commandBufferRef.current = '';
  }, [output]);

  const handleClear = () => {
    termRef.current?.clear();
  };

  return (
    <div className={`terminal-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="terminal-header" onClick={onToggle}>
        <span className="terminal-title">
          Terminal
          {isRunning && <span className="terminal-running">Running…</span>}
        </span>
        <div className="terminal-actions">
          <button onClick={(e) => { e.stopPropagation(); handleClear(); }} title="Clear">
            <VscClearAll />
          </button>
          <button title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? <VscChevronUp /> : <VscChevronDown />}
          </button>
        </div>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  );
});
