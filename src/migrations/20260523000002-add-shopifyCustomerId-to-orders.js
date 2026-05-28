'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'shopifyCustomerId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addIndex('orders', ['shopifyCustomerId']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'shopifyCustomerId');
  }
};
