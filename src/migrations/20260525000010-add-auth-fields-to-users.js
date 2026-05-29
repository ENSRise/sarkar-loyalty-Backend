'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'phone', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('users', 'passwordHash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'role', {
      type: Sequelize.ENUM('super_admin', 'admin'),
      allowNull: false,
      defaultValue: 'admin',
    });
    await queryInterface.addColumn('users', 'isActive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn('users', 'resetOtp', {
      type: Sequelize.STRING(6),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'resetOtpExpiry', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('users', ['phone'], { unique: true, name: 'users_phone_unique' });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', 'users_phone_unique');
    await queryInterface.removeColumn('users', 'resetOtpExpiry');
    await queryInterface.removeColumn('users', 'resetOtp');
    await queryInterface.removeColumn('users', 'isActive');
    await queryInterface.removeColumn('users', 'role');
    await queryInterface.removeColumn('users', 'passwordHash');
    await queryInterface.removeColumn('users', 'phone');
  }
};
