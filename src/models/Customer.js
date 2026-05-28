export default (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    shopifyCustomerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true
    },
    shopName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    totalSpent: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    ordersCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    currentTier: {
      type: DataTypes.STRING,
      defaultValue: 'silver'
    },
    tierBenefits: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    birthdayDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    anniversaryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    referralCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    customerReferralPart: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: true
    },
    wallet: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      allowNull: false
    }
  }, {
    tableName: 'customers',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['shopifyCustomerId']
      },
      {
        fields: ['shopName']
      },
      {
        fields: ['currentTier']
      },
      {
        fields: ['email']
      },
      {
        fields: ['phone']
      }
    ]
  });

  return Customer;
};
