import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    ownerId: { type: String, default: null, index: true },
    terminalCwd: { type: String, default: '' },
    lastOpenedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);

export default Project;
