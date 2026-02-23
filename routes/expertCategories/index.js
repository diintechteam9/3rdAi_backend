import express from 'express';
const router = express.Router();

import {
  createExpertCategory,
  getAllExpertCategories,
  getExpertCategoryById,
  updateExpertCategory,
  deleteExpertCategory,
  toggleExpertCategoryStatus
} from './crud.js';

import {
  upload,
  uploadCategoryImage
} from './upload.js';

import { authenticate } from '../../middleware/auth.js';

// Apply authentication to all routes
router.use(authenticate);

// CRUD Routes
router.post('/', createExpertCategory);
router.get('/', getAllExpertCategories);
router.get('/:id', getExpertCategoryById);
router.put('/:id', updateExpertCategory);
router.delete('/:id', deleteExpertCategory);
router.patch('/:id/toggle-status', toggleExpertCategoryStatus);

// Upload Routes
router.post('/:categoryId/upload-image', upload.single('image'), uploadCategoryImage);

export default router;