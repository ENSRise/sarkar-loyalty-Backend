'use strict';

const DEFAULT_PERMISSIONS = {
  dashboard:     { read: true },
  transactions:  { read: true, export: true },
  analytics:     { read: true },
  customers:     { read: true, export: true },
  tier_settings: { read: true, update: true },
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('roles', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      isBuiltIn: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Seed the default built-in Admin role
    await queryInterface.bulkInsert('roles', [{
      name:        'Admin',
      description: 'Standard admin — can view and export all pages, edit tier settings',
      permissions: JSON.stringify(DEFAULT_PERMISSIONS),
      isBuiltIn:   true,
      createdAt:   new Date(),
      updatedAt:   new Date(),
    }]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('roles');
  },
};
