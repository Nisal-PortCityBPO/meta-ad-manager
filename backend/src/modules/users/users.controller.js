const asyncHandler = require('../../app/utils/asyncHandler');
const usersService = require('./users.service');

const getUsers = asyncHandler(async (req, res) => {
  const users = await usersService.listUsers();
  res.json({ users });
});

const createAdmin = asyncHandler(async (req, res) => {
  const user = await usersService.createAdmin({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    actor: req.user,
    req,
  });

  res.status(201).json({
    message: 'Admin created successfully',
    user,
  });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await usersService.updateUserStatus({
    userId: req.params.id,
    status: req.body.status,
    actor: req.user,
    req,
  });

  res.json({
    message: 'User updated successfully',
    user,
  });
});

module.exports = {
  createAdmin,
  getUsers,
  updateUserStatus,
};
