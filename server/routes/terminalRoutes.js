import { Router } from 'express';
import { executeCommand } from '../controllers/terminalController.js';

const router = Router();

router.post('/:projectId', executeCommand);

export default router;
