// Phone number changes from the profile page: the code goes to the new number before it is saved.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('otp_codes', 'purpose', {
      type: Sequelize.ENUM('login', 'verify', 'reset', 'phone_change'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('otp_codes', { purpose: 'phone_change' });
    await queryInterface.changeColumn('otp_codes', 'purpose', {
      type: Sequelize.ENUM('login', 'verify', 'reset'),
      allowNull: false,
    });
  },
};
