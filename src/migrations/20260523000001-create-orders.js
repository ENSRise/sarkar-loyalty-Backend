'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('orders', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      orderId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      shopName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      customerName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerEmail: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerPhone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      totalPrice: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      totalTax: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      totalDiscounts: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      orderItems: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Simplified array: [{name, quantity, price}]'
      },
      shippingLines: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      lineItems: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      orderStatus: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Hold'
      },
      returnWindow: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10
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

    await queryInterface.addIndex('orders', ['orderId']);
    await queryInterface.addIndex('orders', ['shopName']);
    await queryInterface.addIndex('orders', ['orderStatus']);
    await queryInterface.addIndex('orders', ['customerEmail']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('orders');
  }
};
