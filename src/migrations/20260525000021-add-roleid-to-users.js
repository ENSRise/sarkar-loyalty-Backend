'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'roleId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Assign existing 'admin' role users to the built-in Admin role
    await queryInterface.sequelize.query(`
      UPDATE users
      SET "roleId" = (SELECT id FROM roles WHERE name = 'Admin' LIMIT 1)
      WHERE role = 'admin'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'roleId');
  },
};
