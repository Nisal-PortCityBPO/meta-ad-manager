const HttpError = require('../../app/utils/httpError');
const { writeActivityLog } = require('../activity-logs/activityLog.service');
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
  const brands = await Brand.find().sort({ name: 1 });
  return brands.map((brand) => brand.toSafeObject());
}

async function createBrand({ name, color, actor, req }) {
  validateBrand({ name, color });

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
