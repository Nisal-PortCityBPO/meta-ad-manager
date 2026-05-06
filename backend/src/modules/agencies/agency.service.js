const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const Agency = require('./agency.model');

function validateAgency({ name }) {
  if (!name?.trim()) {
    throw new HttpError(400, 'Agency name is required');
  }
}

async function listAgencies() {
  const agencies = await Agency.find().sort({ name: 1 });
  return agencies.map((agency) => agency.toSafeObject());
}

async function createAgency({ name, actor, req }) {
  validateAgency({ name });

  const agency = await Agency.create({
    name: name.trim(),
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'AGENCY_CREATED',
    entity: 'Agency',
    entityId: agency._id.toString(),
    metadata: { name: agency.name },
    req,
  });

  return agency.toSafeObject();
}

async function updateAgency({ agencyId, name, actor, req }) {
  validateAgency({ name });

  const agency = await Agency.findById(agencyId);
  if (!agency) {
    throw new HttpError(404, 'Agency not found');
  }

  agency.name = name.trim();
  agency.updatedBy = actor._id;
  await agency.save();

  await writeActivityLog({
    user: actor,
    action: 'AGENCY_UPDATED',
    entity: 'Agency',
    entityId: agency._id.toString(),
    metadata: { name: agency.name },
    req,
  });

  return agency.toSafeObject();
}

async function deleteAgency({ agencyId, actor, req }) {
  const agency = await Agency.findById(agencyId);
  if (!agency) {
    throw new HttpError(404, 'Agency not found');
  }

  await agency.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'AGENCY_DELETED',
    entity: 'Agency',
    entityId: agency._id.toString(),
    metadata: { name: agency.name },
    req,
  });
}

module.exports = {
  createAgency,
  deleteAgency,
  listAgencies,
  updateAgency,
};
