'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('settlement_coupons', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      shopifyCustomerId: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      couponCode: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      couponValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
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

    await queryInterface.addIndex('settlement_coupons', ['shopifyCustomerId'], {
      name: 'idx_settlement_coupons_shopify_customer_id',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('settlement_coupons');
  },
};
