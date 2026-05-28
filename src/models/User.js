export default (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { isEmail: true }
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin'),
      allowNull: false,
      defaultValue: 'admin'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    resetOtp: {
      type: DataTypes.STRING(6),
      allowNull: true
    },
    resetOtpExpiry: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['phone'] }
    ]
  });

  User.associate = (db) => {
    User.belongsTo(db.Role, { foreignKey: 'roleId', as: 'userRole' });
  };

  return User;
};
