export default (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    orderId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    shopName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    orderName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    shopifyCustomerId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    totalPrice: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    totalTax: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    totalDiscounts: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    // Simplified array: [{name, quantity, price}]
    orderItems: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    shippingLines: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    lineItems: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // Hold | Cancel | Credit
    orderStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Hold',
      validate: {
        isIn: [['Hold', 'Cancel', 'Credit']]
      }
    },
    returnWindow: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10
    },
    creditDay: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    couponCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    couponAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    }
  }, {
    tableName: 'orders',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['orderId'] },
      { fields: ['shopName'] },
      { fields: ['shopifyCustomerId'] },
      { fields: ['orderStatus'] },
      { fields: ['customerEmail'] }
    ]
  });

  return Order;
};
