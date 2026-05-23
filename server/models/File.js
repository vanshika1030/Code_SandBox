import mongoose from 'mongoose';

const EXT_TO_LANG = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  html: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  sh: 'shell',
  txt: 'plaintext',
};

function detectLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_TO_LANG[ext] || 'plaintext';
}

const fileSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    path: { type: String, required: true },
    type: { type: String, enum: ['file', 'folder'], required: true },
    content: { type: String, default: '' },
    language: { type: String, default: 'plaintext' },
  },
  { timestamps: true }
);

// optimized indexes for common queries
fileSchema.index({ projectId: 1, path: 1 }, { unique: true });
fileSchema.index({ projectId: 1, type: 1 }); // for filtering by type
fileSchema.index({ projectId: 1, name: 1 }); // for finding by name

// auto-detect language from extension before saving
fileSchema.pre('save', function (next) {
  if (this.type === 'file') {
    this.language = detectLanguage(this.name);
  }
  next();
});

const File = mongoose.model('File', fileSchema);

export default File;
