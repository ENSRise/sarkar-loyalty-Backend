'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settlement_coupons', 'customerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'customers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('settlement_coupons', 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('settlement_coupons', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('settlement_coupons', 'couponUsed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('settlement_coupons', 'usedOrderId', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('settlement_coupons', 'usedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('settlement_coupons', 'shopifyDiscountNodeId', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // ── Backfill existing rows ──────────────────────────────────────────────
    // customerId/phone/email from the matching customer record
    await queryInterface.sequelize.query(`
      UPDATE settlement_coupons sc
      SET "customerId" = c.id,
          "phone"       = c.phone::text,
          "email"       = c.email
      FROM customers c
      WHERE c."shopifyCustomerId" = sc."shopifyCustomerId"
    `);

    // couponUsed/usedOrderId/usedAt inferred from existing orders that already
    // carried this coupon code for this customer (same heuristic the old
    // getSettlementStatus endpoint used at read-time)
    await queryInterface.sequelize.query(`
      UPDATE settlement_coupons sc
      SET "couponUsed"  = true,
          "usedOrderId" = o."orderId",
          "usedAt"      = o."createdAt"
      FROM orders o
      WHERE o."couponCode" = sc."couponCode"
        AND o."shopifyCustomerId" = sc."shopifyCustomerId"::text
    `);

    // ── Indexes ──────────────────────────────────────────────────────────
    // Coupon codes are our own randomly generated, globally-unique strings —
    // a unique index makes the webhook's "find coupon by code" lookup O(1)
    // and guards against a (vanishingly unlikely) generator collision.
    await queryInterface.addIndex('settlement_coupons', ['couponCode'], {
      name: 'idx_settlement_coupons_coupon_code_unique',
      unique: true,
    });

    await queryInterface.addIndex('settlement_coupons', ['customerId'], {
      name: 'idx_settlement_coupons_customer_id',
    });

    // Fast "does this customer have an unused coupon to merge into" lookup.
    // Not declared UNIQUE: legacy rows created before this migration could
    // already include more than one unused row per customer, and the
    // application layer (settlement.helper.js) always picks the most recent
    // one deterministically, so a hard DB constraint isn't required here.
    await queryInterface.addIndex('settlement_coupons', ['customerId', 'couponUsed'], {
      name: 'idx_settlement_coupons_customer_unused',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('settlement_coupons', 'idx_settlement_coupons_customer_unused');
    await queryInterface.removeIndex('settlement_coupons', 'idx_settlement_coupons_customer_id');
    await queryInterface.removeIndex('settlement_coupons', 'idx_settlement_coupons_coupon_code_unique');
    await queryInterface.removeColumn('settlement_coupons', 'shopifyDiscountNodeId');
    await queryInterface.removeColumn('settlement_coupons', 'usedAt');
    await queryInterface.removeColumn('settlement_coupons', 'usedOrderId');
    await queryInterface.removeColumn('settlement_coupons', 'couponUsed');
    await queryInterface.removeColumn('settlement_coupons', 'email');
    await queryInterface.removeColumn('settlement_coupons', 'phone');
    await queryInterface.removeColumn('settlement_coupons', 'customerId');
  },
};
