import express from 'express';
import sponsorRoutes from './sponsors/index.js';

const router = express.Router();

// Mount all sponsor routes
router.use('/', sponsorRoutes);

export default router;