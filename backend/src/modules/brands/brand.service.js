const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
const { BusinessProfile } = require('../business-profiles/businessProfile.model');
const Brand = require('./brand.model');

function validateBrand({ name, color }) {
  if (!name?.trim()) {
    throw new HttpError(400, 'Brand name is required');
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) {
    throw new HttpError(400, 'Brand color must be a valid hex color');
  }
}

async function listBrands() {
  const [brands, agencyAssignments] = await Promise.all([
    Brand.find().sort({ name: 1 }),
    BusinessProfile.aggregate([
      {
        $match: {
          brand: { $ne: null },
          agency: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            brand: '$brand',
            agency: '$agency',
          },
          profileCount: { $sum: 1 },
          profiles: {
            $push: {
              id: '$_id',
              name: '$name',
              metaBusinessId: '$metaBusinessId',
              metaStatus: '$metaStatus',
              sourceTokenLabel: '$sourceTokenLabel',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'agencies',
          localField: '_id.agency',
          foreignField: '_id',
          as: 'agency',
        },
      },
      {
        $group: {
          _id: '$_id.brand',
          agencyCount: { $sum: 1 },
          agencies: {
            $push: {
              id: '$_id.agency',
              name: { $arrayElemAt: ['$agency.name', 0] },
              profileCount: '$profileCount',
              profiles: '$profiles',
            },
          },
        },
      },
    ]),
  ]);
  const countByBrand = new Map(
    agencyAssignments.map((item) => [item._id.toString(), item.agencyCount])
  );
  const agenciesByBrand = new Map(
    agencyAssignments.map((item) => [
      item._id.toString(),
      item.agencies
        .filter((agency) => agency.name)
        .map((agency) => ({
          id: agency.id.toString(),
          name: agency.name,
          profileCount: agency.profileCount || 0,
          businessProfiles: (agency.profiles || [])
            .map((profile) => ({
              id: profile.id.toString(),
              name: profile.name,
              metaBusinessId: profile.metaBusinessId,
              metaStatus: profile.metaStatus,
              sourceTokenLabel: profile.sourceTokenLabel,
            }))
            .sort((first, second) => first.name.localeCompare(second.name)),
        }))
        .sort((first, second) => first.name.localeCompare(second.name)),
    ])
  );

  return brands.map((brand) => ({
    ...brand.toSafeObject(),
    agencyCount: countByBrand.get(brand._id.toString()) || 0,
    assignedAgencies: agenciesByBrand.get(brand._id.toString()) || [],
  }));
}

async function createBrand({ name, color, actor, req }) {
  validateBrand({ name, color });

  const existingBrand = await Brand.findOne({ name: name.trim() });
  if (existingBrand) {
    throw new HttpError(409, 'A brand with this name already exists');
  }

  const brand = await Brand.create({
    name: name.trim(),
    color,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  await writeActivityLog({
    user: actor,
    action: 'BRAND_CREATED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });

  return brand.toSafeObject();
}

async function updateBrand({ brandId, name, color, actor, req }) {
  validateBrand({ name, color });

  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new HttpError(404, 'Brand not found');
  }

  const existingBrand = await Brand.findOne({ name: name.trim(), _id: { $ne: brand._id } });
  if (existingBrand) {
    throw new HttpError(409, 'A brand with this name already exists');
  }

  brand.name = name.trim();
  brand.color = color;
  brand.updatedBy = actor._id;
  await brand.save();

  await writeActivityLog({
    user: actor,
    action: 'BRAND_UPDATED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });

  return brand.toSafeObject();
}

async function deleteBrand({ brandId, actor, req }) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new HttpError(404, 'Brand not found');
  }

  await brand.deleteOne();

  await writeActivityLog({
    user: actor,
    action: 'BRAND_DELETED',
    entity: 'Brand',
    entityId: brand._id.toString(),
    metadata: { name: brand.name },
    req,
  });
}

module.exports = {
  createBrand,
  deleteBrand,
  listBrands,
  updateBrand,
};
