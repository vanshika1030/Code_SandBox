import { Router } from 'express';
import { startProjectPreview, stopProjectPreview } from '../controllers/previewController.js';

const router = Router();

router.post('/:projectId/start', startProjectPreview);
router.post('/:projectId/stop', stopProjectPreview);

export default router;
