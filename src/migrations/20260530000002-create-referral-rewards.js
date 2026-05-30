'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('referral_rewards', {
      id: {
        allowNull:     false,
        autoIncrement: true,
        primaryKey:    true,
        type:          Sequelize.INTEGER,
      },
      referrer_shopify_id: {
        type:      Sequelize.STRING,
        allowNull: false,
      },
      referred_shopify_id: {
        type:      Sequelize.STRING,
        allowNull: false,
        unique:    true, // one reward row per referred customer — prevents duplicates
      },
      referred_phone: {
        type:      Sequelize.STRING,
        allowNull: true,
      },
      coupon_assigned: {
        type:         Sequelize.BOOLEAN,
        allowNull:    false,
        defaultValue: false,
      },
      coupon_code: {
        type:      Sequelize.STRING,
        allowNull: true,
      },
      points_awarded: {
        type:      Sequelize.INTEGER,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type:      Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type:      Sequelize.DATE,
      },
    });

    // Fast lookup: given a creditDay's customer IDs, find pending rewards
    await queryInterface.addIndex('referral_rewards', ['referred_shopify_id'], {
      name: 'idx_rr_referred_shopify_id',
    });

    // Fast aggregation per referrer
    await queryInterface.addIndex('referral_rewards', ['referrer_shopify_id'], {
      name: 'idx_rr_referrer_shopify_id',
    });

    // Partial index — only unassigned rows; keeps this small & fast at scale
    await queryInterface.addIndex('referral_rewards', ['coupon_assigned'], {
      name:  'idx_rr_coupon_assigned_false',
      where: { coupon_assigned: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('referral_rewards');
  },
};
