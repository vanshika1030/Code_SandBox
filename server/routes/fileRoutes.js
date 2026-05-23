import { Router } from 'express';
import {
  getFileTree,
  getAllFilesWithContent,
  createFile,
  getFile,
  updateFile,
  deleteFile,
} from '../controllers/fileController.js';

const router = Router();

router.route('/:projectId').get(getFileTree).post(createFile);
router.route('/:projectId/all/content').get(getAllFilesWithContent);
router.route('/:projectId/:fileId').get(getFile).put(updateFile).delete(deleteFile);

export default router;
