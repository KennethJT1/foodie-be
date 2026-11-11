const { TABLE_OPTIONS, id, timestamps, uuid } = require('../migrationHelpers.cjs');
const { v7: uuidv7 } = require('uuid');

// Every primary key is a UUID: the tables that were keyed by a slug or code get a UUID `id`, and the
// slug / code stays as a unique column.
//   permissions             id 'dashboard.view'   → id UUID, key 'dashboard.view'
//   admin_roles             id 'super_admin'      → id UUID, slug 'super_admin'
//   admin_role_permissions  slug pair             → UUID pair
//   banks                   PK code               → id UUID, code unique
//   settings                PK key                → id UUID, key unique
//   notification_templates  PK key                → id UUID, key unique
// users.admin_role keeps the slug (the API's adminRole) and now references admin_roles.slug.
//
// Each table is rebuilt (new table, copy, drop, rename) rather than altered: TiDB cannot change a
// clustered primary key in place. Existing rows, custom role permissions included, are kept.

const USERS_ROLE_FK = 'users_admin_role_fk';
const TEMPLATE_CHANNELS = ['email', 'sms', 'inapp'];

const select = (queryInterface, sql) =>
  queryInterface.sequelize.query(sql, { type: queryInterface.sequelize.QueryTypes.SELECT });

const rebuild = async (queryInterface, table, columns, rows) => {
  const tmp = `${table}__rebuild`;
  await queryInterface.createTable(tmp, columns, TABLE_OPTIONS);
  if (rows.length) await queryInterface.bulkInsert(tmp, rows);
  await queryInterface.dropTable(table);
  await queryInterface.renameTable(tmp, table);
};

const stamps = (row) => ({ created_at: row.created_at, updated_at: row.updated_at });

// mysql2 parses JSON columns (a stored "escalate" comes back as escalate); bulkInsert needs the text
const json = (value) => JSON.stringify(value);

// DDL is not transactional: a run that stopped part way is finished by running again, skipping the
// tables that already have their UUID key
const hasUuidId = async (queryInterface, table) => {
  const columns = await queryInterface.describeTable(table);
  return columns.id?.type === 'CHAR(36)';
};

const columns = (Sequelize, keyed) => ({
  permissions: {
    ...keyed('key', Sequelize.STRING(64)),
    ...timestamps(Sequelize),
  },
  admin_roles: {
    ...keyed('slug', Sequelize.STRING(32)),
    name: { type: Sequelize.STRING(60), allowNull: false },
    is_locked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    ...timestamps(Sequelize),
  },
  banks: {
    ...keyed('code', Sequelize.STRING(20)),
    name: { type: Sequelize.STRING(120), allowNull: false },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    ...timestamps(Sequelize),
  },
  settings: {
    ...keyed('key', Sequelize.STRING(64)),
    value: { type: Sequelize.JSON, allowNull: false },
    ...timestamps(Sequelize),
  },
  notification_templates: {
    ...keyed('key', Sequelize.STRING(64)),
    channel: { type: Sequelize.ENUM(...TEMPLATE_CHANNELS), allowNull: false },
    subject: { type: Sequelize.STRING(120), allowNull: false, defaultValue: '' },
    body: { type: Sequelize.STRING(1000), allowNull: false },
    sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    ...timestamps(Sequelize),
  },
});

const roleLink = (Sequelize, type, table) => ({
  type,
  primaryKey: true,
  allowNull: false,
  references: { model: table, key: 'id' },
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

const rebuildRoles = async (queryInterface, Sequelize, cols, { permissions, roles, links }) => {
  await queryInterface.removeConstraint('users', USERS_ROLE_FK);
  await queryInterface.dropTable('admin_role_permissions');

  const permissionIds = new Map(permissions.map((p) => [p.id, uuidv7()]));
  const roleIds = new Map(roles.map((r) => [r.id, uuidv7()]));

  await rebuild(
    queryInterface,
    'permissions',
    cols.permissions,
    permissions.map((p) => ({ id: permissionIds.get(p.id), key: p.id, ...stamps(p) })),
  );
  await rebuild(
    queryInterface,
    'admin_roles',
    cols.admin_roles,
    roles.map((r) => ({ id: roleIds.get(r.id), slug: r.id, name: r.name, is_locked: r.is_locked, ...stamps(r) })),
  );
  await queryInterface.createTable(
    'admin_role_permissions',
    {
      role_id: roleLink(Sequelize, uuid(Sequelize), 'admin_roles'),
      permission_id: roleLink(Sequelize, uuid(Sequelize), 'permissions'),
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );
  const linkRows = links
    .filter((l) => roleIds.has(l.role_id) && permissionIds.has(l.permission_id))
    .map((l) => ({ role_id: roleIds.get(l.role_id), permission_id: permissionIds.get(l.permission_id), ...stamps(l) }));
  if (linkRows.length) await queryInterface.bulkInsert('admin_role_permissions', linkRows);

  await queryInterface.addConstraint('users', {
    type: 'foreign key',
    name: USERS_ROLE_FK,
    fields: ['admin_role'],
    references: { table: 'admin_roles', field: 'slug' },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    // UUID `id` plus the natural key as a unique column
    const cols = columns(Sequelize, (name, type) => ({
      ...id(Sequelize),
      [name]: { type, allowNull: false, unique: true },
    }));

    const [rolesDone, banksDone, settingsDone, templatesDone] = await Promise.all(
      ['admin_roles', 'banks', 'settings', 'notification_templates'].map((t) => hasUuidId(queryInterface, t)),
    );
    const [permissions, roles, links, banks, settings, templates] = await Promise.all(
      ['permissions', 'admin_roles', 'admin_role_permissions', 'banks', 'settings', 'notification_templates'].map(
        (table) => select(queryInterface, `SELECT * FROM \`${table}\``),
      ),
    );

    if (!rolesDone) await rebuildRoles(queryInterface, Sequelize, cols, { permissions, roles, links });
    if (!banksDone) {
      await rebuild(
        queryInterface,
        'banks',
        cols.banks,
        banks.map((b) => ({ id: uuidv7(), code: b.code, name: b.name, is_active: b.is_active, ...stamps(b) })),
      );
    }
    if (!settingsDone) {
      await rebuild(
        queryInterface,
        'settings',
        cols.settings,
        settings.map((s) => ({ id: uuidv7(), key: s.key, value: json(s.value), ...stamps(s) })),
      );
    }
    if (!templatesDone) {
      await rebuild(
        queryInterface,
        'notification_templates',
        cols.notification_templates,
        templates.map(({ key, channel, subject, body, sort_order, ...row }) => ({
          id: uuidv7(),
          key,
          channel,
          subject,
          body,
          sort_order,
          ...stamps(row),
        })),
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // The natural key back as the primary key (permissions / roles name it `id` again)
    const cols = columns(Sequelize, (name, type) => ({ [name]: { type, primaryKey: true, allowNull: false } }));
    const asId = ({ key, slug, ...rest }) => ({ id: key ?? slug, ...rest });

    const [permissions, roles, links, banks, settings, templates] = await Promise.all([
      select(queryInterface, 'SELECT * FROM `permissions`'),
      select(queryInterface, 'SELECT * FROM `admin_roles`'),
      select(
        queryInterface,
        `SELECT r.slug AS role_id, p.key AS permission_id, l.created_at, l.updated_at
         FROM admin_role_permissions l
         JOIN admin_roles r ON r.id = l.role_id
         JOIN permissions p ON p.id = l.permission_id`,
      ),
      select(queryInterface, 'SELECT * FROM `banks`'),
      select(queryInterface, 'SELECT * FROM `settings`'),
      select(queryInterface, 'SELECT * FROM `notification_templates`'),
    ]);

    await queryInterface.removeConstraint('users', USERS_ROLE_FK);
    await queryInterface.dropTable('admin_role_permissions');

    await rebuild(
      queryInterface,
      'permissions',
      asId(cols.permissions),
      permissions.map((p) => ({ id: p.key, ...stamps(p) })),
    );
    await rebuild(
      queryInterface,
      'admin_roles',
      asId(cols.admin_roles),
      roles.map((r) => ({ id: r.slug, name: r.name, is_locked: r.is_locked, ...stamps(r) })),
    );
    await queryInterface.createTable(
      'admin_role_permissions',
      {
        role_id: roleLink(Sequelize, Sequelize.STRING(32), 'admin_roles'),
        permission_id: roleLink(Sequelize, Sequelize.STRING(64), 'permissions'),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    if (links.length) await queryInterface.bulkInsert('admin_role_permissions', links);

    await queryInterface.addConstraint('users', {
      type: 'foreign key',
      name: USERS_ROLE_FK,
      fields: ['admin_role'],
      references: { table: 'admin_roles', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });

    await rebuild(
      queryInterface,
      'banks',
      cols.banks,
      banks.map((b) => ({ code: b.code, name: b.name, is_active: b.is_active, ...stamps(b) })),
    );
    await rebuild(
      queryInterface,
      'settings',
      cols.settings,
      settings.map((s) => ({ key: s.key, value: json(s.value), ...stamps(s) })),
    );
    await rebuild(
      queryInterface,
      'notification_templates',
      cols.notification_templates,
      templates.map(({ id: _id, ...row }) => row),
    );
  },
};
