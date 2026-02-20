import express from 'express';
import crudRoutes from './crud.js';
import uploadRoutes from './upload.js';

const router = express.Router();

// Mount CRUD routes
router.use('/', crudRoutes);

// Mount upload routes
router.use('/', uploadRoutes);

export default router;