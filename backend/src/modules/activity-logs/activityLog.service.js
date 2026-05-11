const ActivityLog = require('./activityLog.model');

const PAGE_LIMITS = [25, 50, 100];
const DELETE_OLDEST_COUNT = 100;

function normalizePagination({ page = 1, limit = 25 } = {}) {
  const normalizedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Number.parseInt(limit, 10) || 25;
  const normalizedLimit = PAGE_LIMITS.includes(parsedLimit) ? parsedLimit : 25;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}

function parseDate(value, { endOfDay = false } = {}) {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function buildLogQuery({ actorEmail, entity, dateFrom, dateTo } = {}) {
  const query = {};

  if (actorEmail?.trim()) {
    query.actorEmail = actorEmail.trim();
  }

  if (entity?.trim()) {
    query.entity = entity.trim();
  }

  const startDate = parseDate(dateFrom);
  const endDate = parseDate(dateTo, { endOfDay: true });

  if (startDate || endDate) {
    query.createdAt = {};

    if (startDate) {
      query.createdAt.$gte = startDate;
    }

    if (endDate) {
      query.createdAt.$lte = endDate;
    }
  }

  return query;
}

function toLogObject(log) {
  return {
    id: log._id.toString(),
    actorId: log.actor?._id?.toString?.() || log.actor?.toString?.() || null,
    actorName: log.actor?.name || 'System',
    actorEmail: log.actorEmail,
    actorRole: log.actor?.role || null,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    requestMethod: log.requestMethod,
    requestPath: log.requestPath,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
}

async function writeActivityLog({
  user = null,
  action,
  entity = 'System',
  entityId = null,
  metadata = {},
  req = null,
}) {
  try {
    const log = await ActivityLog.create({
      actor: user?._id || null,
      actorEmail: user?.email || metadata.actorEmail || 'system',
      action,
      entity,
      entityId,
      metadata,
      ipAddress: req?.ip || null,
      requestMethod: req?.method || null,
      requestPath: req?.originalUrl || req?.url || null,
      userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
    });

    if (req) {
      req.activityLogged = true;
    }

    return log;
  } catch (error) {
    console.error('Activity log failed:', error.message);
  }

  return null;
}

async function getActivityLogFilterOptions() {
  const [actors, entities] = await Promise.all([
    ActivityLog.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$actorEmail',
          actorEmail: { $first: '$actorEmail' },
          actor: { $first: '$actor' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'actor',
          foreignField: '_id',
          as: 'actorDoc',
        },
      },
      {
        $project: {
          _id: 0,
          email: '$actorEmail',
          name: { $ifNull: [{ $arrayElemAt: ['$actorDoc.name', 0] }, 'System'] },
          role: { $arrayElemAt: ['$actorDoc.role', 0] },
        },
      },
      { $sort: { email: 1 } },
    ]),
    ActivityLog.distinct('entity'),
  ]);

  return {
    actors,
    entities: entities.filter(Boolean).sort((first, second) => first.localeCompare(second)),
  };
}

async function listActivityLogs(filters = {}) {
  const { page, limit } = normalizePagination(filters);
  const query = buildLogQuery(filters);

  const [total, filterOptions] = await Promise.all([
    ActivityLog.countDocuments(query),
    getActivityLogFilterOptions(),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;
  const logs = await ActivityLog.find(query)
    .populate('actor', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    logs: logs.map(toLogObject),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    filterOptions,
  };
}

async function deleteOldestActivityLogs({ actor, req }) {
  const logs = await ActivityLog.find()
    .sort({ createdAt: 1 })
    .limit(DELETE_OLDEST_COUNT)
    .select('_id');
  const ids = logs.map((log) => log._id);

  if (!ids.length) {
    return { deletedCount: 0 };
  }

  const result = await ActivityLog.deleteMany({ _id: { $in: ids } });

  await writeActivityLog({
    user: actor,
    action: 'ACTIVITY_LOGS_OLDEST_DELETED',
    entity: 'ActivityLog',
    metadata: {
      deletedCount: result.deletedCount,
      requestedCount: DELETE_OLDEST_COUNT,
    },
    req,
  });

  return {
    deletedCount: result.deletedCount,
  };
}

module.exports = {
  deleteOldestActivityLogs,
  listActivityLogs,
  writeActivityLog,
};
