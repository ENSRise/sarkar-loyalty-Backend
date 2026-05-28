'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'orderName', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'orderName');
  }
};
