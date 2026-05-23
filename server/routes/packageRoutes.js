import { Router } from 'express';
import { installPackage, getPackages } from '../controllers/packageController.js';

const router = Router();

router.post('/install', installPackage);
router.get('/:projectId', getPackages);

export default router;
