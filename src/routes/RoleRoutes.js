import express from 'express';
import * as RoleController from '../controllers/RoleController';

const router = express.Router();

router.get('/',      RoleController.listRoles);
router.post('/',     RoleController.createRole);
router.patch('/:id', RoleController.updateRole);
router.delete('/:id',RoleController.deleteRole);

export default router;
