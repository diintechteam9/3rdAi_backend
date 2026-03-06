import express from 'express';
import Client from '../models/Client.js';

const router = express.Router();

// GET /api/public/clients/:code - All active clients for login/register dropdown (no auth needed, secured by code)
router.get('/clients/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Security check
    if (code !== '778205') {
      return res.status(403).json({ success: false, message: 'Access Denied: Invalid security code' });
    }

    const clients = await Client.find({ isActive: true })
      .select('clientId organizationName state city address contactNumber alternateContact cityBoundary isActive loginApproved')
      .sort({ organizationName: 1 });

    res.json({
      success: true,
      data: clients.map(c => {
        const clientObj = c.toObject();
        // Keep label for frontend dropdowns to work without UI changes
        clientObj.label = c.organizationName && c.city ? `${c.city} - ${c.organizationName}` : (c.city || c.organizationName || c.clientId);
        return clientObj;
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch clients' });
  }
});

export default router;