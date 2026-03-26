import { Router } from 'express';
import { calculateSizing } from '../services/sizingEngine.js';

const router = Router();

router.post('/calculate', (req, res) => {
  try {
    const result = calculateSizing(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
