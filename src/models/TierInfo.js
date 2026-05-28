export default (sequelize, DataTypes) => {
  const TierInfo = sequelize.define('TierInfo', {
    shopName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    silver: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        orderValue: 0,
        reward: '12%',
        additionReward: [
          'access to the member community',
          'get a chance to get featured on our social media'
        ]
      }
    },
    gold: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        orderValue: 1000,
        reward: '15%',
        additionReward: [
          'all silver benefits',
          '24 early access to sales and upcoming launches',
          'birthday month voucher',
          'premium customer support',
          'Exclusive gold only quarter collections'
        ]
      }
    },
    platinum: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        orderValue: 5000,
        reward: '20%',
        additionReward: [
          'all gold benefits',
          'live stream with bhuvan bam',
          'metallic pvc card',
          'first ride of refusel limited edition',
          'birthday hamper + tshirt + keychain'
        ]
      }
    }
  }, {
    tableName: 'tier_info',
    timestamps: true
  });

  return TierInfo;
};
