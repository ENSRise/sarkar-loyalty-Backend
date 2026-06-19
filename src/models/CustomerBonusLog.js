export default (sequelize, DataTypes) => {
  const CustomerBonusLog = sequelize.define('CustomerBonusLog', {
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shopifyCustomerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // null = note-only entry, no points were granted
    points: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    couponCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    grantedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'customer_bonus_logs',
    timestamps: true,
    indexes: [
      { fields: ['customerId'] },
      { fields: ['grantedByUserId'] },
    ],
  });

  CustomerBonusLog.associate = (db) => {
    CustomerBonusLog.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });
    CustomerBonusLog.belongsTo(db.User, { foreignKey: 'grantedByUserId', as: 'grantedBy' });
  };

  return CustomerBonusLog;
};
