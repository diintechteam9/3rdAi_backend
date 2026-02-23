import express from 'express';
import Client from '../models/Client.js';

const router = express.Router();

// GET /api/public/clients - All active clients for login/register dropdown (no auth needed)
router.get('/clients', async (req, res) => {
  try {
    const clients = await Client.find({ isActive: true })
      .select('clientId businessName fullName')
      .sort({ businessName: 1 });

    res.json({
      success: true,
      data: clients.map(c => ({
        clientId: c.clientId,
        label: c.businessName || c.fullName || c.clientId
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
});

export default router;