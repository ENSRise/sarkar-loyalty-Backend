export default (sequelize, DataTypes) => {
  const InterestedCustomer = sequelize.define('InterestedCustomer', {
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    birthdayDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    anniversaryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    shopName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'interested_customers',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['phone'] },
      { fields: ['createdAt'] },
    ],
  });

  return InterestedCustomer;
};
