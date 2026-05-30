export default (sequelize, DataTypes) => {
  const ReferralReward = sequelize.define('ReferralReward', {
    referrerShopifyId: {
      type:      DataTypes.STRING,
      allowNull: false,
    },
    referredShopifyId: {
      type:      DataTypes.STRING,
      allowNull: false,
      unique:    true, // one row per referred customer — prevents double-rewarding
    },
    referredPhone: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    couponAssigned: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    couponCode: {
      type:      DataTypes.STRING,
      allowNull: true,
    },
    pointsAwarded: {
      type:      DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName:  'referral_rewards',
    timestamps: true,
    underscored: true, // maps camelCase fields → snake_case columns (referrerShopifyId → referrer_shopify_id)
    indexes: [
      { fields: ['referred_shopify_id'] },
      { fields: ['referrer_shopify_id'] },
      { fields: ['coupon_assigned'] },
    ],
  });

  return ReferralReward;
};
