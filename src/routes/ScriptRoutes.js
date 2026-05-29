import express from 'express';
import path from 'path';

const router = express.Router();

router.get('/script.js', (req, res) => {
  const filePath = path.resolve('public/script.js');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(filePath);
});

export default router;
