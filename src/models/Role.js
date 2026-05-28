export default (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: { len: [2, 100] },
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    isBuiltIn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'roles',
    timestamps: true,
  });

  Role.associate = (db) => {
    Role.hasMany(db.User, { foreignKey: 'roleId', as: 'users' });
  };

  return Role;
};
