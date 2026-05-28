'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('customers', 'birthdayDate', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
    await queryInterface.addColumn('customers', 'anniversaryDate', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('customers', 'birthdayDate');
    await queryInterface.removeColumn('customers', 'anniversaryDate');
  }
};
