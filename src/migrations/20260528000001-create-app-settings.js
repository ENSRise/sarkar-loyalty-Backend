'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('app_settings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Seed default values from environment
    await queryInterface.bulkInsert('app_settings', [
      { key: 'shopName',             value: process.env.SHOP_NAME || '',  createdAt: new Date(), updatedAt: new Date() },
      { key: 'accessToken',          value: process.env.ACCESS_TOKEN || '', createdAt: new Date(), updatedAt: new Date() },
      { key: 'silverReferralPoint',  value: process.env.SilverRefralPoint || '100', createdAt: new Date(), updatedAt: new Date() },
      { key: 'goldReferralPoint',    value: process.env.GoldRefralPoint   || '150', createdAt: new Date(), updatedAt: new Date() },
      { key: 'platinumReferralPoint',value: process.env.PlatinumRefralPoint || '200', createdAt: new Date(), updatedAt: new Date() },
      { key: 'resetCycle',           value: '6months', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('app_settings');
  },
};
