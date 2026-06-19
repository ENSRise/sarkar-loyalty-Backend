'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customer_bonus_logs', {
      id: {
        allowNull:     false,
        autoIncrement: true,
        primaryKey:    true,
        type:          Sequelize.INTEGER,
      },
      customerId: {
        type:      Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onUpdate:  'CASCADE',
        onDelete:  'CASCADE',
      },
      shopifyCustomerId: {
        type:      Sequelize.BIGINT,
        allowNull: false,
      },
      // null when this row is a note-only entry (no points granted)
      points: {
        type:      Sequelize.INTEGER,
        allowNull: true,
      },
      // the BNS-prefixed Shopify discount code created for this grant, if points > 0
      couponCode: {
        type:      Sequelize.STRING,
        allowNull: true,
      },
      note: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      grantedByUserId: {
        type:      Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate:  'CASCADE',
        onDelete:  'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type:      Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type:      Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('customer_bonus_logs', ['customerId'], {
      name: 'idx_customer_bonus_logs_customer_id',
    });

    await queryInterface.addIndex('customer_bonus_logs', ['grantedByUserId'], {
      name: 'idx_customer_bonus_logs_granted_by',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('customer_bonus_logs');
  },
};
