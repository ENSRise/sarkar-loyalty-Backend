'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'referralCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await queryInterface.addColumn('customers', 'customerReferralPart', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: true,
    });
    await queryInterface.addColumn('customers', 'wallet', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0.00,
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('customers', 'wallet');
    await queryInterface.removeColumn('customers', 'customerReferralPart');
    await queryInterface.removeColumn('customers', 'referralCount');
  },
};
