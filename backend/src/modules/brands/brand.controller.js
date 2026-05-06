const asyncHandler = require('../../app/utils/asyncHandler');
const brandService = require('./brand.service');

const getBrands = asyncHandler(async (req, res) => {
  const brands = await brandService.listBrands();
  res.json({ brands });
});

const createBrand = asyncHandler(async (req, res) => {
  const brand = await brandService.createBrand({
    name: req.body.name,
    color: req.body.color,
    actor: req.user,
    req,
  });

  res.status(201).json({ message: 'Brand created successfully', brand });
});

const updateBrand = asyncHandler(async (req, res) => {
  const brand = await brandService.updateBrand({
    brandId: req.params.id,
    name: req.body.name,
    color: req.body.color,
    actor: req.user,
    req,
  });

  res.json({ message: 'Brand updated successfully', brand });
});

const deleteBrand = asyncHandler(async (req, res) => {
  await brandService.deleteBrand({
    brandId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({ message: 'Brand deleted successfully' });
});

module.exports = {
  createBrand,
  deleteBrand,
  getBrands,
  updateBrand,
};
