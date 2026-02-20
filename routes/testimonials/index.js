import express from 'express';
import crudRoutes from './crud.js';
import statsRoutes from './stats.js';
import uploadRoutes from './upload.js';

const router = express.Router();

// Mount sub-routes
// IMPORTANT: More specific routes must be mounted first
router.use('/stats', statsRoutes);
router.use('/', uploadRoutes); // Upload routes (/:id/upload-image) - must be before crud routes
router.use('/', crudRoutes); // CRUD routes (/:id) - less specific, mounted last

export default router;