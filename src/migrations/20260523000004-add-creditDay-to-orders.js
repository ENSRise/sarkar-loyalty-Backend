'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'creditDay', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('orders', 'creditDay');
  }
};
