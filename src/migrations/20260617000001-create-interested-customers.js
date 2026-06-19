'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('interested_customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      firstName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      lastName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      birthdayDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      anniversaryDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      shopName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('interested_customers', ['phone'], { unique: true });
    await queryInterface.addIndex('interested_customers', ['createdAt']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('interested_customers');
  },
};
