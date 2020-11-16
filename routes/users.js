const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.get('/current-user', async (req, res, next) => {
  const token = req.headers.authorization.split(' ')[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY
    );

    const user = await User.findById(decoded._id);

    res.status(200).json({
      result: 'ok',
      user,
    });
  } catch (err) {
    res.status(400).json({
      result: 'failure',
      message: 'bad request'
    });
  }
});

module.exports = router;
