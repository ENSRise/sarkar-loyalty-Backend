'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      shopifyCustomerId: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true
      },
      shopName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      firstName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      lastName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      totalSpent: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      ordersCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      currentTier: {
        type: Sequelize.STRING,
        defaultValue: 'silver'
      },
      tierBenefits: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes for high performance
    await queryInterface.addIndex('customers', ['shopifyCustomerId']);
    await queryInterface.addIndex('customers', ['shopName']);
    await queryInterface.addIndex('customers', ['currentTier']);
    await queryInterface.addIndex('customers', ['email']);
    await queryInterface.addIndex('customers', ['phone']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('customers');
  }
};
