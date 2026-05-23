import { useState, memo } from 'react';
import './Tabs.css';
import { VscClose } from 'react-icons/vsc';

export default memo(function Tabs({ tabs, activeId, onSelect, onClose }) {
  return (
    <div className="tabs-bar">
      {tabs.map(tab => (
        <div
          key={tab._id}
          className={`tab ${tab._id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(tab)}
          onMouseDown={(e) => {
            // middle-click to close
            if (e.button === 1) { e.preventDefault(); onClose(tab); }
          }}
        >
          <span className="tab-name">{tab.name}</span>
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); onClose(tab); }}
          >
            <VscClose />
          </button>
        </div>
      ))}
      {tabs.length === 0 && (
        <div className="tabs-empty">No open files</div>
      )}
    </div>
  );
});
