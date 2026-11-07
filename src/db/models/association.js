/**
 * Every association between models lives here. Called by the loader once all
 * models are defined, so each side can reference the other.
 */
export const defineAssociations = (models) => {
  const {
    Address,
    AdminRole,
    AdminRolePermission,
    BankChangeRequest,
    Category,
    ChatMessage,
    Comment,
    Delivery,
    DeliveryOffer,
    Follow,
    FoodItem,
    Like,
    Notification,
    Order,
    OrderItem,
    Payment,
    Permission,
    Plan,
    RefreshToken,
    Refund,
    Report,
    Review,
    Rider,
    RiderBankAccount,
    RiderDocument,
    RiderPayoutStatement,
    Subscription,
    SubscriptionInvoice,
    Upload,
    User,
    Vendor,
    VendorBankAccount,
    VendorDocument,
    VendorOpeningHour,
    VendorStaff,
  } = models;

  // Users and auth
  User.hasOne(Vendor, { as: 'vendor', foreignKey: 'ownerUserId' });
  User.hasOne(Rider, { as: 'rider', foreignKey: 'userId' });
  User.hasMany(Address, { as: 'addresses', foreignKey: 'userId' });
  User.hasMany(RefreshToken, { as: 'refreshTokens', foreignKey: 'userId' });
  User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId' });

  Address.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  RefreshToken.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Upload.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // Admin roles and permissions
  AdminRole.belongsToMany(Permission, {
    as: 'permissions',
    through: AdminRolePermission,
    foreignKey: 'roleId',
    otherKey: 'permissionId',
  });

  // Vendors
  Vendor.belongsTo(User, { as: 'owner', foreignKey: 'ownerUserId' });
  Vendor.belongsTo(Plan, { as: 'plan', foreignKey: 'planId' });
  Vendor.hasOne(Subscription, { as: 'subscription', foreignKey: 'vendorId' });
  Vendor.hasMany(VendorDocument, { as: 'documents', foreignKey: 'vendorId' });
  Vendor.hasMany(VendorOpeningHour, { as: 'openingHours', foreignKey: 'vendorId' });
  Vendor.hasMany(VendorBankAccount, { as: 'bankAccounts', foreignKey: 'vendorId' });
  Vendor.hasMany(BankChangeRequest, { as: 'bankChangeRequests', foreignKey: 'vendorId' });
  Vendor.hasMany(FoodItem, { as: 'foodItems', foreignKey: 'vendorId' });
  Vendor.hasMany(VendorStaff, { as: 'staff', foreignKey: 'vendorId' });

  VendorDocument.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  VendorDocument.belongsTo(Upload, { as: 'upload', foreignKey: 'uploadId' });
  VendorOpeningHour.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  VendorBankAccount.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  BankChangeRequest.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  VendorStaff.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });

  // Riders
  Rider.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Rider.hasMany(RiderDocument, { as: 'documents', foreignKey: 'riderId' });
  Rider.hasOne(RiderBankAccount, { as: 'bankAccount', foreignKey: 'riderId' });

  RiderDocument.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });
  RiderDocument.belongsTo(Upload, { as: 'upload', foreignKey: 'uploadId' });
  RiderBankAccount.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });

  // Plans and subscriptions
  Subscription.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  Subscription.belongsTo(Plan, { as: 'plan', foreignKey: 'planId' });
  Subscription.belongsTo(Plan, { as: 'scheduledPlan', foreignKey: 'scheduledPlanId' });

  SubscriptionInvoice.belongsTo(Plan, { as: 'plan', foreignKey: 'planId' });
  SubscriptionInvoice.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });

  // Catalogue
  FoodItem.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  FoodItem.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });

  // Social and moderation
  Comment.belongsTo(User, { as: 'author', foreignKey: 'userId' });
  Comment.belongsTo(FoodItem, { as: 'foodItem', foreignKey: 'foodItemId' });
  Comment.belongsTo(Comment, { as: 'parent', foreignKey: 'parentId' });
  Comment.hasMany(Comment, { as: 'replies', foreignKey: 'parentId' });

  Like.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Like.belongsTo(FoodItem, { as: 'foodItem', foreignKey: 'foodItemId' });

  Follow.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Follow.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });

  Report.belongsTo(User, { as: 'reporter', foreignKey: 'reporterId' });
  Report.belongsTo(User, { as: 'resolver', foreignKey: 'resolvedBy' });

  // Orders and payments
  Order.belongsTo(User, { as: 'customer', foreignKey: 'customerId' });
  Order.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  Order.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });
  Order.hasMany(OrderItem, { as: 'items', foreignKey: 'orderId' });
  Order.hasOne(Payment, { as: 'payment', foreignKey: 'orderId' });

  OrderItem.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });

  Payment.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  Payment.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Payment.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });

  // Dispatch, deliveries and chat
  Order.hasOne(Delivery, { as: 'delivery', foreignKey: 'orderId' });
  Order.hasMany(DeliveryOffer, { as: 'offers', foreignKey: 'orderId' });
  Order.hasMany(ChatMessage, { as: 'chatMessages', foreignKey: 'orderId' });
  Rider.hasMany(Delivery, { as: 'deliveries', foreignKey: 'riderId' });
  Rider.hasMany(DeliveryOffer, { as: 'offers', foreignKey: 'riderId' });

  Delivery.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
  Delivery.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });
  DeliveryOffer.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
  DeliveryOffer.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });
  ChatMessage.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
  ChatMessage.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });

  // Reviews and rider payouts
  Order.hasMany(Review, { as: 'reviews', foreignKey: 'orderId' });
  Review.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
  Review.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Rider.hasMany(RiderPayoutStatement, { as: 'payoutStatements', foreignKey: 'riderId' });
  RiderPayoutStatement.belongsTo(Rider, { as: 'rider', foreignKey: 'riderId' });
  RiderPayoutStatement.belongsTo(User, { as: 'approver', foreignKey: 'approvedBy' });

  // Refunds
  Order.hasOne(Refund, { as: 'refund', foreignKey: 'orderId' });
  Refund.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
  Refund.belongsTo(User, { as: 'customer', foreignKey: 'customerId' });
  Refund.belongsTo(Vendor, { as: 'vendor', foreignKey: 'vendorId' });
};
