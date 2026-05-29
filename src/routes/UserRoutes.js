import express from 'express';
import * as UserController from '../controllers/UserController';

const router = express.Router();

router.get('/', UserController.getAllUsers);
router.post('/', UserController.createUser);

export default router;
