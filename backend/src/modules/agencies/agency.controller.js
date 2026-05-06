const asyncHandler = require('../../app/utils/asyncHandler');
const agencyService = require('./agency.service');

const getAgencies = asyncHandler(async (req, res) => {
  const agencies = await agencyService.listAgencies();
  res.json({ agencies });
});

const createAgency = asyncHandler(async (req, res) => {
  const agency = await agencyService.createAgency({
    name: req.body.name,
    actor: req.user,
    req,
  });

  res.status(201).json({ message: 'Agency created successfully', agency });
});

const updateAgency = asyncHandler(async (req, res) => {
  const agency = await agencyService.updateAgency({
    agencyId: req.params.id,
    name: req.body.name,
    actor: req.user,
    req,
  });

  res.json({ message: 'Agency updated successfully', agency });
});

const deleteAgency = asyncHandler(async (req, res) => {
  await agencyService.deleteAgency({
    agencyId: req.params.id,
    actor: req.user,
    req,
  });

  res.json({ message: 'Agency deleted successfully' });
});

module.exports = {
  createAgency,
  deleteAgency,
  getAgencies,
  updateAgency,
};
