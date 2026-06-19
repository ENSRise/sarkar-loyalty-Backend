export default (sequelize, DataTypes) => {
  const SettlementCoupon = sequelize.define('SettlementCoupon', {
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    shopifyCustomerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    couponCode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    couponValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    // false = active/redeemable; flipped to true once a matching discount
    // code shows up on a customer's order (see settlement.helper.js)
    couponUsed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Shopify order id (not internal PK) that consumed this coupon
    usedOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // codeDiscountNode.id from Shopify — needed to deactivate this code later
    // if it gets superseded by a merged coupon
    shopifyDiscountNodeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'settlement_coupons',
    timestamps: true,
    indexes: [
      { fields: ['shopifyCustomerId'] },
      { fields: ['customerId'] },
      { fields: ['customerId', 'couponUsed'] },
      { unique: true, fields: ['couponCode'] },
    ],
  });

  SettlementCoupon.associate = (db) => {
    SettlementCoupon.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });
  };

  return SettlementCoupon;
};
